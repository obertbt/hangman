-- ==========================================================
-- 自動生成: scripts/bundle-migrations.sh
-- 直接編集しない。直すのは supabase/migrations/ のほう。
-- 5 番目。中身: 0009_master_data.sql 0010_grants.sql 0011_cross_team_reference_guard.sql 0012_video_visibility_fix.sql 0013_soft_delete_rpc.sql 0014_skill_guards.sql 
-- ==========================================================


-- ---------- 0009_master_data.sql ----------
-- =============================================================
-- 0009_master_data.sql
-- ロールと権限のマスタ（13章）。
-- これはアプリの動作に必須なので seed ではなく migration に置く。
-- =============================================================

insert into public.roles (code, label_ja, description, sort_order) values
  ('system_admin', '管理者',       'すべての操作ができる',                 10),
  ('coach',        'コーチ',       '指導・フィードバック・承認を行う',     20),
  ('manager',      'マネージャー', '予定や記録の管理を行う',               30),
  ('player',       '選手',         '自分の記録と質問を行う',               40)
on conflict (code) do update
  set label_ja = excluded.label_ja,
      description = excluded.description,
      sort_order = excluded.sort_order;

insert into public.permissions (code, label_ja, description) values
  ('video.upload',           '動画を投稿する',           '短編動画のアップロードと YouTube 動画の登録'),
  ('video.view_team',        'チームの動画を見る',       'チーム内で共有された動画の閲覧'),
  ('video.feedback_request', '動画で質問する',           'フィードバック依頼の作成'),
  ('video.feedback_answer',  '動画の質問に答える',       'フィードバック依頼への回答・担当割り当て'),
  ('skill.review',           'スキルを審査する',         'スキル申請の承認・却下とスキル定義の編集'),
  ('report.view_all',        '全員の日報を見る',         'staff 公開以上の日報・トレーニング記録の閲覧'),
  ('event.manage',           '予定を管理する',           'シーズン・週・イベントの作成と編集'),
  ('import.execute',         'データ移行を実行する',     'Import Center の利用'),
  ('storage.manage',         '保存容量を管理する',       '容量集計とファイルの物理削除')
on conflict (code) do update
  set label_ja = excluded.label_ja,
      description = excluded.description;

-- 役割ごとの既定権限 ------------------------------------------

-- 管理者: すべて
insert into public.role_permissions (role_code, permission_code)
select 'system_admin', code from public.permissions
on conflict do nothing;

-- コーチ: 指導に必要なものすべて。データ移行は既定では持たせない。
insert into public.role_permissions (role_code, permission_code) values
  ('coach', 'video.upload'),
  ('coach', 'video.view_team'),
  ('coach', 'video.feedback_request'),
  ('coach', 'video.feedback_answer'),
  ('coach', 'skill.review'),
  ('coach', 'report.view_all'),
  ('coach', 'event.manage')
on conflict do nothing;

-- マネージャー: 予定と記録の管理。回答や承認はしない。
insert into public.role_permissions (role_code, permission_code) values
  ('manager', 'video.upload'),
  ('manager', 'video.view_team'),
  ('manager', 'report.view_all'),
  ('manager', 'event.manage')
on conflict do nothing;

-- 選手: 自分の記録と質問
insert into public.role_permissions (role_code, permission_code) values
  ('player', 'video.upload'),
  ('player', 'video.view_team'),
  ('player', 'video.feedback_request')
on conflict do nothing;


-- ---------- 0010_grants.sql ----------
-- =============================================================
-- 0010_grants.sql
-- テーブル権限。
--
-- Supabase は既定で public スキーマの新規テーブルを anon / authenticated へ
-- 付与するが、環境差で挙動が変わると RLS の検証結果も変わってしまう。
-- ここで明示的に「ログイン済みだけ」に揃える。
--
-- 行の見え方は RLS が決める。ここで与えるのはテーブルへの到達可否だけ。
-- =============================================================

-- 未ログイン（anon）は public のデータに一切触れない。
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- 監査ログとマスタは読み取りだけにする（書き込みはサーバー経由）。
revoke insert, update, delete on public.audit_logs from authenticated;
revoke insert, update, delete on public.roles from authenticated;
revoke insert, update, delete on public.permissions from authenticated;
revoke insert, update, delete on public.role_permissions from authenticated;

-- 以後に追加されるテーブルにも同じ既定を適用する。
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;


-- ---------- 0011_cross_team_reference_guard.sql ----------
-- =============================================================
-- 0011_cross_team_reference_guard.sql
--
-- 別チームのレコードを参照する行を作れないようにする。
--
-- 見つかった問題:
--   video_clips の RLS は「作成者が自分」「team_id が自分のチーム」しか見ていなかった。
--   そのため、別チームの video_id を指すクリップを、自分のチームの行として
--   作れてしまった（動画のUUIDを知っていれば）。
--   同じことが feedback_requests でも起きる。
--
-- 対処:
--   RLS ではなくトリガで、参照先とチームが一致することを保証する。
--   これは権限の問題ではなくデータの整合性なので、
--   どの経路（service role を含む）から書いても守られるべき。
-- =============================================================

-- -------------------------------------------------------------
-- 仮想クリップ: 元動画と同じチームでなければならない
-- -------------------------------------------------------------
create or replace function app.validate_video_clip()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_duration numeric;
  v_team_id  uuid;
begin
  select duration_seconds, team_id into v_duration, v_team_id
  from public.videos
  where id = new.video_id;

  if v_team_id is null then
    raise exception '対象の動画が見つかりません';
  end if;

  -- 別チームの動画を参照させない（62章）
  if v_team_id <> new.team_id then
    raise exception '別のチームの動画は参照できません';
  end if;

  if v_duration is not null and new.end_seconds > v_duration then
    raise exception 'クリップの終了位置(%)が動画の長さ(%)を超えています', new.end_seconds, v_duration;
  end if;

  return new;
end;
$$;

-- -------------------------------------------------------------
-- フィードバック依頼: 参照する動画・クリップ・イベントも同じチーム
-- -------------------------------------------------------------
create or replace function app.validate_feedback_references()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team_id uuid;
begin
  if new.video_id is not null then
    select team_id into v_team_id from public.videos where id = new.video_id;
    if v_team_id is null or v_team_id <> new.team_id then
      raise exception '別のチームの動画は参照できません';
    end if;
  end if;

  if new.video_clip_id is not null then
    select team_id into v_team_id from public.video_clips where id = new.video_clip_id;
    if v_team_id is null or v_team_id <> new.team_id then
      raise exception '別のチームのクリップは参照できません';
    end if;
  end if;

  if new.event_id is not null then
    select team_id into v_team_id from public.events where id = new.event_id;
    if v_team_id is null or v_team_id <> new.team_id then
      raise exception '別のチームの予定は参照できません';
    end if;
  end if;

  if new.daily_report_id is not null then
    select team_id into v_team_id from public.daily_reports where id = new.daily_report_id;
    if v_team_id is null or v_team_id <> new.team_id then
      raise exception '別のチームの日報は参照できません';
    end if;
  end if;

  -- 依頼者が本当にそのチームの一員か
  select team_id into v_team_id from public.team_members where id = new.requester_id;
  if v_team_id is null or v_team_id <> new.team_id then
    raise exception '依頼者がこのチームの所属ではありません';
  end if;

  return new;
end;
$$;

drop trigger if exists feedback_requests_validate_references on public.feedback_requests;
create trigger feedback_requests_validate_references
  before insert or update on public.feedback_requests
  for each row execute function app.validate_feedback_references();

-- -------------------------------------------------------------
-- 動画: R2 のファイルを参照する場合も同じチームでなければならない
-- -------------------------------------------------------------
create or replace function app.validate_video_references()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team_id uuid;
begin
  if new.file_id is not null then
    select team_id into v_team_id from public.files where id = new.file_id;
    if v_team_id is null or v_team_id <> new.team_id then
      raise exception '別のチームのファイルは参照できません';
    end if;
  end if;

  if new.event_id is not null then
    select team_id into v_team_id from public.events where id = new.event_id;
    if v_team_id is null or v_team_id <> new.team_id then
      raise exception '別のチームの予定は参照できません';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists videos_validate_references on public.videos;
create trigger videos_validate_references
  before insert or update on public.videos
  for each row execute function app.validate_video_references();


-- ---------- 0012_video_visibility_fix.sql ----------
-- =============================================================
-- 0012_video_visibility_fix.sql
--
-- 動画とファイルの公開範囲が効いていなかったのを直す。
--
-- 見つかった問題:
--   videos / files のポリシーが「video.view_team を持っていれば見える」
--   になっていた。しかし video.view_team は選手にも既定で付いている
--   （13章の「チームの動画を見る」）。
--   結果として、公開範囲を private_staff にしても、
--   同じチームの選手全員から見えてしまっていた。
--
--   選手が自分の失敗を全員に見られる前提だと、動画で質問しなくなる。
--   29章で「コーチが一方的に team 公開へ変えられない」ようにした意味も無くなる。
--
-- 直し方:
--   権限の意味を、名前のとおりに使い分ける。
--     video.view_team      … チームへ共有された動画を見る
--     video.feedback_answer … 回答するために、本人の非公開動画も見る
--
--   つまり private_staff は「本人 + 回答権限を持つスタッフ」になる
--   （docs/permissions.md の表と一致させる）。
-- =============================================================

drop policy if exists videos_select on public.videos;

create policy videos_select on public.videos
  for select to authenticated
  using (
    deleted_at is null
    and app.is_team_member(team_id)
    and (
      -- 自分が登録したもの
      created_by = app.current_profile_id()
      -- チームへ共有されたもの
      or (visibility = 'team' and app.has_permission(team_id, 'video.view_team'))
      -- 回答するために見る必要があるスタッフ
      or app.has_permission(team_id, 'video.feedback_answer')
      -- 容量管理のために全体を見る必要がある人
      or app.has_permission(team_id, 'storage.manage')
    )
  );

drop policy if exists files_select on public.files;

create policy files_select on public.files
  for select to authenticated
  using (
    deleted_at is null
    and app.is_team_member(team_id)
    and (
      uploaded_by = app.current_profile_id()
      or (visibility = 'team' and app.has_permission(team_id, 'video.view_team'))
      or app.has_permission(team_id, 'video.feedback_answer')
      or app.has_permission(team_id, 'storage.manage')
    )
  );

-- -------------------------------------------------------------
-- 仮想クリップも、元動画が見えるときだけ見えるようにする。
--
-- これまでは「videos に行があること」だけを見ていた。
-- 上のポリシーで videos 自体が絞られるため実害は無くなるが、
-- 意図をはっきりさせるために条件を書き直す。
-- -------------------------------------------------------------
drop policy if exists video_clips_select on public.video_clips;

create policy video_clips_select on public.video_clips
  for select to authenticated
  using (
    deleted_at is null
    and app.is_team_member(team_id)
    and exists (
      -- videos 側の RLS が効くので、見てよい動画のクリップだけが残る
      select 1 from public.videos v where v.id = video_clips.video_id
    )
  );


-- ---------- 0013_soft_delete_rpc.sql ----------
-- =============================================================
-- 0013_soft_delete_rpc.sql
--
-- 論理削除ができなくなっていたのを直す。
--
-- 見つかった問題:
--   PostgreSQL は UPDATE のとき、SELECT ポリシーを**更新後の行にも**適用する。
--   （検証済み: SELECT ポリシーを足すと同じ UPDATE が通るようになる）
--
--   files / videos の SELECT ポリシーには `deleted_at is null` が入っている。
--   そのため deleted_at を入れた瞬間に自分から見えない行になり、
--   「new row violates row-level security policy」で弾かれていた。
--   つまり**誰も論理削除できなかった**。
--
-- 直し方の選択:
--   (A) 所有者は削除済みも見える、という SELECT ポリシーを足す
--       → 62章「削除済みファイルを通常閲覧できない」が緩む。採らない。
--   (B) 論理削除だけを security definer の関数で行う
--       → SELECT ポリシーは厳しいまま保てる。
--         削除は「特別な操作」として、監査ログと物理削除の予約も同時に作れる。
--
--   (B) を採る。60章（30日後に物理削除）と63章（動画削除を監査ログに残す）も
--   同じ場所で満たせるため、結果的にこちらのほうが筋がよい。
-- =============================================================

/**
 * 投稿した動画を削除する（論理削除）。
 *
 * できるのは、投稿した本人か storage.manage を持つ人だけ。
 * 実体は消さず、30日後に物理削除するための予約を作る（60章）。
 */
create or replace function public.soft_delete_video(p_video_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_video   public.videos;
  v_file    public.files;
  v_profile uuid;
  v_days    int := 30;
begin
  v_profile := app.current_profile_id();
  if v_profile is null then
    raise exception 'ログインしていません';
  end if;

  select * into v_video from public.videos where id = p_video_id and deleted_at is null;
  if v_video.id is null then
    raise exception '対象の動画が見つかりません';
  end if;

  -- 本人か、容量を管理する人だけ
  if v_video.created_by <> v_profile and not app.has_permission(v_video.team_id, 'storage.manage') then
    raise exception 'この動画を削除する権限がありません';
  end if;

  update public.videos set deleted_at = now() where id = p_video_id;

  -- R2 のファイルを持つ動画なら、ファイルも論理削除して物理削除を予約する
  if v_video.file_id is not null then
    select * into v_file from public.files where id = v_video.file_id;

    if v_file.id is not null and v_file.deleted_at is null then
      update public.files
      set deleted_at = now(), upload_status = 'deleted'
      where id = v_file.id;

      insert into public.file_deletion_jobs (team_id, file_id, scheduled_for)
      values (v_file.team_id, v_file.id, now() + make_interval(days => v_days));
    end if;
  end if;

  -- 63章: 動画削除は監査ログに残す。key や URL そのものは残さない。
  insert into public.audit_logs (team_id, actor_id, action, target_table, target_id, summary)
  values (
    v_video.team_id,
    v_profile,
    'video.delete',
    'videos',
    p_video_id,
    format('動画を削除: %s（%s日後に実体を削除）', v_video.title, v_days)
  );
end;
$$;

revoke all on function public.soft_delete_video(uuid) from public;
grant execute on function public.soft_delete_video(uuid) to authenticated;

/**
 * 同じ理由で、仮想クリップも関数で消す。
 * こちらは実体を持たないので、履歴だけ残す。
 */
create or replace function public.soft_delete_video_clip(p_clip_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clip    public.video_clips;
  v_profile uuid;
begin
  v_profile := app.current_profile_id();
  if v_profile is null then
    raise exception 'ログインしていません';
  end if;

  select * into v_clip from public.video_clips where id = p_clip_id and deleted_at is null;
  if v_clip.id is null then
    raise exception '対象の場面が見つかりません';
  end if;

  if v_clip.created_by <> v_profile and not app.is_staff(v_clip.team_id) then
    raise exception 'この場面を削除する権限がありません';
  end if;

  -- 質問に使われている場面は消さない（質問の中身が読めなくなるため）
  if exists (
    select 1 from public.feedback_requests
    where video_clip_id = p_clip_id and deleted_at is null
  ) then
    raise exception 'この場面は質問に使われているため削除できません';
  end if;

  update public.video_clips set deleted_at = now() where id = p_clip_id;
end;
$$;

revoke all on function public.soft_delete_video_clip(uuid) from public;
grant execute on function public.soft_delete_video_clip(uuid) to authenticated;


-- ---------- 0014_skill_guards.sql ----------
-- =============================================================
-- 0014_skill_guards.sql
--
-- スキル（30〜32章）を書く前に確かめること。
--
-- 見つかった問題:
--   player_skills の更新ポリシーが
--     using (skill.review を持つ or 本人)
--   になっていた。つまり**選手が自分の到達状況を approved にできた**。
--   スキル承認はこのシステムで唯一「他人に認めてもらう」記録なので、
--   自分で書き換えられるなら意味がない。
--   skill_applications も同じで、本人が自分の申請を approved にできた。
--
-- 対処:
--   0011 と同じ考え方で、RLS ではなくトリガで守る。
--   これは権限だけの話ではなく「その行が正しいか」の話なので、
--   service role を含めどの経路から書いても守られるべき。
--
--   ついでに、参照先のチーム一致（0011 の教訓）と
--   到達状況の履歴（75章）もここでまとめて面倒を見る。
-- =============================================================

-- -------------------------------------------------------------
-- 到達状況: 承認できるのは審査できる人だけ
-- -------------------------------------------------------------
create or replace function app.validate_player_skill()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_skill_team  uuid;
  v_member_team uuid;
  v_was_approved boolean := false;
begin
  -- 参照先のチーム一致（0011 の教訓）
  select team_id into v_skill_team from public.skills where id = new.skill_id;
  if v_skill_team is null then
    raise exception '対象のスキルが見つかりません';
  end if;
  if v_skill_team <> new.team_id then
    raise exception '別のチームのスキルは参照できません';
  end if;

  select team_id into v_member_team from public.team_members where id = new.team_member_id;
  if v_member_team is null then
    raise exception '対象の部員が見つかりません';
  end if;
  if v_member_team <> new.team_id then
    raise exception '別のチームの部員は参照できません';
  end if;

  if tg_op = 'UPDATE' then
    v_was_approved := old.status = 'approved';
  end if;

  -- 承認へ入るときと、承認から出るときは skill.review が要る
  if new.status = 'approved' and not v_was_approved then
    if not app.has_permission(new.team_id, 'skill.review') then
      raise exception 'スキルを承認できるのは審査担当だけです';
    end if;
    new.approved_at := now();
    new.approved_by := app.current_profile_id();
  elsif v_was_approved and new.status <> 'approved' then
    if not app.has_permission(new.team_id, 'skill.review') then
      raise exception '承認済みのスキルを取り消せるのは審査担当だけです';
    end if;
    new.approved_at := null;
    new.approved_by := null;
  elsif new.status <> 'approved' then
    -- 承認していないのに承認の跡だけ残す、を防ぐ
    new.approved_at := null;
    new.approved_by := null;
  end if;

  return new;
end;
$$;

drop trigger if exists player_skills_validate on public.player_skills;
create trigger player_skills_validate
  before insert or update on public.player_skills
  for each row execute function app.validate_player_skill();

-- -------------------------------------------------------------
-- 到達状況の履歴（75章）
--
-- 画面から書き忘れることがあるので、DB 側で自動的に残す。
-- 「いつ承認されたか」は選手にとって一番大事な記録なので、
-- アプリの実装漏れで欠けてはいけない。
-- -------------------------------------------------------------
create or replace function app.log_player_skill_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- 何も起きていない 'not_started' での作成は履歴に残さない（読むときの雑音になる）
  if tg_op = 'INSERT' then
    if new.status <> 'not_started' then
      insert into public.skill_status_histories (team_id, player_skill_id, from_status, to_status, changed_by)
      values (new.team_id, new.id, null, new.status, app.current_profile_id());
    end if;
  elsif new.status is distinct from old.status then
    insert into public.skill_status_histories (team_id, player_skill_id, from_status, to_status, changed_by)
    values (new.team_id, new.id, old.status, new.status, app.current_profile_id());
  end if;

  return new;
end;
$$;

drop trigger if exists player_skills_log_status on public.player_skills;
create trigger player_skills_log_status
  after insert or update on public.player_skills
  for each row execute function app.log_player_skill_status();

-- -------------------------------------------------------------
-- 申請: 審査結果を本人が書き込めないようにする
-- -------------------------------------------------------------
create or replace function app.validate_skill_application()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_skill_team  uuid;
  v_member_team uuid;
  v_old_status  text;
begin
  select team_id into v_skill_team from public.skills where id = new.skill_id;
  if v_skill_team is null then
    raise exception '対象のスキルが見つかりません';
  end if;
  if v_skill_team <> new.team_id then
    raise exception '別のチームのスキルは参照できません';
  end if;

  select team_id into v_member_team from public.team_members where id = new.team_member_id;
  if v_member_team is null then
    raise exception '対象の部員が見つかりません';
  end if;
  if v_member_team <> new.team_id then
    raise exception '別のチームの部員は参照できません';
  end if;

  v_old_status := case when tg_op = 'UPDATE' then old.status else null end;

  -- 審査の結果にあたる状態は、審査担当しか付けられない
  if new.status in ('reviewing', 'approved', 'rejected') and new.status is distinct from v_old_status then
    if not app.has_permission(new.team_id, 'skill.review') then
      raise exception '申請を審査できるのは審査担当だけです';
    end if;
    new.reviewed_at := now();
  end if;

  if new.status = 'submitted' and new.status is distinct from v_old_status then
    new.submitted_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists skill_applications_validate on public.skill_applications;
create trigger skill_applications_validate
  before insert or update on public.skill_applications
  for each row execute function app.validate_skill_application();

-- -------------------------------------------------------------
-- 申請の根拠: 別チームの動画・質問を添えられないようにする（0011 の教訓）
-- -------------------------------------------------------------
create or replace function app.validate_skill_application_item()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team uuid;
begin
  select team_id into v_team from public.skill_applications where id = new.skill_application_id;
  if v_team is null then
    raise exception '対象の申請が見つかりません';
  end if;
  if v_team <> new.team_id then
    raise exception '別のチームの申請には根拠を足せません';
  end if;

  if new.video_id is not null then
    select team_id into v_team from public.videos where id = new.video_id;
    if v_team is distinct from new.team_id then
      raise exception '別のチームの動画は参照できません';
    end if;
  end if;

  if new.video_clip_id is not null then
    select team_id into v_team from public.video_clips where id = new.video_clip_id;
    if v_team is distinct from new.team_id then
      raise exception '別のチームのクリップは参照できません';
    end if;
  end if;

  if new.feedback_request_id is not null then
    select team_id into v_team from public.feedback_requests where id = new.feedback_request_id;
    if v_team is distinct from new.team_id then
      raise exception '別のチームの質問は参照できません';
    end if;
  end if;

  if new.file_id is not null then
    select team_id into v_team from public.files where id = new.file_id;
    if v_team is distinct from new.team_id then
      raise exception '別のチームのファイルは参照できません';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists skill_application_items_validate on public.skill_application_items;
create trigger skill_application_items_validate
  before insert or update on public.skill_application_items
  for each row execute function app.validate_skill_application_item();

-- -------------------------------------------------------------
-- 審査結果: 対象の申請と同じチームであること
-- -------------------------------------------------------------
create or replace function app.validate_skill_review()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team uuid;
begin
  select team_id into v_team from public.skill_applications where id = new.skill_application_id;
  if v_team is null then
    raise exception '対象の申請が見つかりません';
  end if;
  if v_team <> new.team_id then
    raise exception '別のチームの申請は審査できません';
  end if;

  return new;
end;
$$;

drop trigger if exists skill_reviews_validate on public.skill_reviews;
create trigger skill_reviews_validate
  before insert or update on public.skill_reviews
  for each row execute function app.validate_skill_review();

-- -------------------------------------------------------------
-- 履歴は消させない・書き換えさせない
--
-- 「いつ承認されたか」を後から書き換えられると、記録の意味がなくなる。
-- 追加はトリガ（security definer）が行うので、
-- 利用者から直接 insert できる必要はない。
-- -------------------------------------------------------------
revoke insert, update, delete on public.skill_status_histories from authenticated;
revoke update, delete on public.skill_reviews from authenticated;

