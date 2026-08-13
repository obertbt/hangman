-- ==========================================================
-- 自動生成: scripts/bundle-migrations.sh
-- 直接編集しない。直すのは supabase/migrations/ のほう。
-- 7 番目。中身: 0020_restore.sql 0021_invitations.sql 0022_report_feedback.sql 0023_submission_status.sql 
-- ==========================================================


-- ---------- 0020_restore.sql ----------
-- =============================================================
-- 0020_restore.sql
--
-- 消したものを戻せるようにする。
--
-- なぜ要るか:
--   0019 で「消したものは、消した人からも見えない」に直した。
--   守りとしては正しいが、そのままだと**間違えて消したものを取り戻せない**。
--   60章が動画に30日の猶予を置いているのと同じ考え方を、他の記録にも広げる。
--
--   記録は本人の努力の証拠なので、消えたら戻せないのは怖い。
--   「怖くて消せない」と、要らない記録が残り続けて画面が読みにくくなる。
--   気軽に消せて、間違えたら戻せるのがいちばんよい。
--
-- どう作るか:
--   閲覧できる条件がすべて `deleted_at is null` なので、
--   消したものは通常の SELECT では引けない。
--   一覧も復元も security definer の関数を通す。
--   **その人が戻せるものだけ**を返す（権限の確認は関数の中）。
-- =============================================================

/**
 * 消したもののうち、自分が戻せるものを並べる。
 *
 * 種別ごとに「誰が戻せるか」が違う。
 *   トレーニング記録 … 本人だけ
 *   動画・クリップ   … 投稿者本人か storage.manage
 *   スキル定義       … skill.review
 *
 * `restorable` が false のものは、実体がもう無い（物理削除済み）。
 * 一覧には出すが、押しても戻らないことを画面で伝える。
 */
create or replace function public.list_deleted_items(p_team_id uuid)
returns table (
  kind        text,
  item_id     uuid,
  label       text,
  deleted_at  timestamptz,
  restorable  boolean,
  note        text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile uuid := app.current_profile_id();
begin
  if v_profile is null or not app.is_team_member(p_team_id) then
    return;
  end if;

  -- 動画
  return query
  select
    'video'::text,
    v.id,
    v.title,
    v.deleted_at,
    -- 実体を消したあとは戻せない（60章の30日を過ぎたもの）
    coalesce(f.upload_status, 'ready') <> 'deleted',
    case
      when coalesce(f.upload_status, 'ready') = 'deleted' then '実体が削除済みのため戻せません'
      else null
    end
  from public.videos v
  left join public.files f on f.id = v.file_id
  where v.team_id = p_team_id
    and v.deleted_at is not null
    and (v.created_by = v_profile or app.has_permission(p_team_id, 'storage.manage'));

  -- 場面（仮想クリップ）
  return query
  select
    'video_clip'::text,
    c.id,
    coalesce(c.title, '指定した場面'),
    c.deleted_at,
    true,
    null::text
  from public.video_clips c
  where c.team_id = p_team_id
    and c.deleted_at is not null
    and (c.created_by = v_profile or app.has_permission(p_team_id, 'storage.manage'));

  -- トレーニング記録（本人だけ）
  return query
  select
    'training_record'::text,
    t.id,
    to_char(t.performed_on, 'YYYY-MM-DD') || ' ' || coalesce(t.menu, t.training_type),
    t.deleted_at,
    true,
    null::text
  from public.training_records t
  where t.team_id = p_team_id
    and t.deleted_at is not null
    and app.is_own_member(t.team_member_id);

  -- スキル定義
  return query
  select
    'skill'::text,
    s.id,
    s.name,
    s.deleted_at,
    true,
    null::text
  from public.skills s
  where s.team_id = p_team_id
    and s.deleted_at is not null
    and app.has_permission(p_team_id, 'skill.review');
end;
$$;

revoke all on function public.list_deleted_items(uuid) from public;
grant execute on function public.list_deleted_items(uuid) to authenticated;

-- -------------------------------------------------------------
-- 復元
--
-- 消したときと同じ権限を要求する。
-- 戻したことも監査ログに残す（63章）。
-- -------------------------------------------------------------

/**
 * 動画を戻す。
 *
 * **物理削除の予約も取り消す。**
 * ここを忘れると、戻したはずの動画が30日後に実体だけ消えて、
 * 再生できない動画が残る。
 */
create or replace function public.restore_video(p_video_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_video   public.videos;
  v_status  text;
  v_profile uuid := app.current_profile_id();
begin
  select * into v_video from public.videos where id = p_video_id and deleted_at is not null;
  if v_video.id is null then
    raise exception '対象の動画が見つかりません';
  end if;

  if v_video.created_by <> v_profile and not app.has_permission(v_video.team_id, 'storage.manage') then
    raise exception 'この動画を戻す権限がありません';
  end if;

  if v_video.file_id is not null then
    select upload_status into v_status from public.files where id = v_video.file_id;
    if v_status = 'deleted' then
      raise exception '実体がすでに消えているため戻せません';
    end if;

    update public.files set deleted_at = null where id = v_video.file_id;

    -- 予約が残っていると、戻した動画が30日後に壊れる
    update public.file_deletion_jobs
      set status = 'failed', error_message = '復元されたため取り消し', attempted_at = now()
      where file_id = v_video.file_id and status = 'pending';
  end if;

  update public.videos set deleted_at = null where id = p_video_id;

  insert into public.audit_logs (team_id, actor_id, action, target_table, target_id, summary)
  values (v_video.team_id, v_profile, 'video.restore', 'videos', p_video_id, v_video.title);
end;
$$;

revoke all on function public.restore_video(uuid) from public;
grant execute on function public.restore_video(uuid) to authenticated;

/** 場面を戻す。元の動画が消えたままなら戻さない。 */
create or replace function public.restore_video_clip(p_clip_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clip    public.video_clips;
  v_video   public.videos;
  v_profile uuid := app.current_profile_id();
begin
  select * into v_clip from public.video_clips where id = p_clip_id and deleted_at is not null;
  if v_clip.id is null then
    raise exception '対象の場面が見つかりません';
  end if;

  if v_clip.created_by <> v_profile and not app.has_permission(v_clip.team_id, 'storage.manage') then
    raise exception 'この場面を戻す権限がありません';
  end if;

  select * into v_video from public.videos where id = v_clip.video_id;
  if v_video.id is null or v_video.deleted_at is not null then
    raise exception '元の動画が消えています。先に動画を戻してください';
  end if;

  update public.video_clips set deleted_at = null where id = p_clip_id;
end;
$$;

revoke all on function public.restore_video_clip(uuid) from public;
grant execute on function public.restore_video_clip(uuid) to authenticated;

/** 自分のトレーニング記録を戻す。 */
create or replace function public.restore_training_record(p_record_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.training_records;
begin
  select * into v_row from public.training_records where id = p_record_id and deleted_at is not null;
  if v_row.id is null then
    raise exception '対象の記録が見つかりません';
  end if;

  if not app.is_own_member(v_row.team_member_id) then
    raise exception 'この記録を戻す権限がありません';
  end if;

  update public.training_records set deleted_at = null where id = p_record_id;
end;
$$;

revoke all on function public.restore_training_record(uuid) from public;
grant execute on function public.restore_training_record(uuid) to authenticated;

/** スキル定義を戻す。親が消えたままなら戻さない（宙に浮くため）。 */
create or replace function public.restore_skill(p_skill_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row     public.skills;
  v_parent  public.skills;
  v_deleted timestamptz;
begin
  select * into v_row from public.skills where id = p_skill_id and deleted_at is not null;
  if v_row.id is null then
    raise exception '対象の目標が見つかりません';
  end if;

  if not app.has_permission(v_row.team_id, 'skill.review') then
    raise exception 'スキル定義を変えられるのは審査担当だけです';
  end if;

  select deleted_at into v_deleted from public.skill_categories where id = v_row.skill_category_id;
  if v_deleted is not null then
    raise exception '大分類が消えています。先に大分類を戻してください';
  end if;

  if v_row.parent_id is not null then
    select * into v_parent from public.skills where id = v_row.parent_id;
    if v_parent.id is null or v_parent.deleted_at is not null then
      raise exception '中目標が消えています。先に中目標を戻してください';
    end if;
  end if;

  update public.skills set deleted_at = null where id = p_skill_id;

  insert into public.audit_logs (team_id, actor_id, action, target_table, target_id, summary)
  values (v_row.team_id, app.current_profile_id(), 'skill.restore', 'skills', p_skill_id, v_row.name);
end;
$$;

revoke all on function public.restore_skill(uuid) from public;
grant execute on function public.restore_skill(uuid) to authenticated;

-- =============================================================
-- おまけで見つかった問題: 論理削除で upload_status を 'deleted' にしていた
--
-- 0013 の soft_delete_video は、論理削除の時点で
--   update public.files set deleted_at = now(), upload_status = 'deleted'
-- としていた。
--
-- しかし 'deleted' は「R2 から実体が消えた」という意味で、
-- 0016 の complete_file_deletion が実際に消したあとに立てるもの。
-- 論理削除の時点で立ててしまうと、意味が2つになる。
--
-- 実害:
--   capture_storage_usage は upload_status = 'deleted' を集計から外す。
--   そのため**アプリから動画を消すと、まだ R2 にあるのに容量から消えた**。
--   「削除待ち（deleted_bytes）」も常に 0 になり、
--   「片付ければこれだけ空く」が出てこない。59章の目的が崩れる。
--
--   さらに今回、復元の判定にも使えなくなっていた
--   （消した直後の動画が「実体が無い」と見えてしまう）。
--
-- 直し方:
--   論理削除では deleted_at だけを入れる。
--   'deleted' を立てるのは、実体を消し終えたときだけ。
-- =============================================================

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

  if v_video.created_by <> v_profile and not app.has_permission(v_video.team_id, 'storage.manage') then
    raise exception 'この動画を削除する権限がありません';
  end if;

  update public.videos set deleted_at = now() where id = p_video_id;

  if v_video.file_id is not null then
    select * into v_file from public.files where id = v_video.file_id;

    if v_file.id is not null and v_file.deleted_at is null then
      -- upload_status はそのまま。実体はまだ R2 にある。
      update public.files set deleted_at = now() where id = v_file.id;

      insert into public.file_deletion_jobs (team_id, file_id, scheduled_for)
      values (v_file.team_id, v_file.id, now() + make_interval(days => v_days));
    end if;
  end if;

  insert into public.audit_logs (team_id, actor_id, action, target_table, target_id, summary)
  values (
    v_video.team_id, v_profile, 'video.delete', 'videos', p_video_id,
    format('動画を削除: %s（%s日後に実体を削除）', v_video.title, v_days)
  );
end;
$$;

-- すでに 'deleted' になってしまった行を戻す。
-- 実体を本当に消したものには、done の予約が残っているので見分けられる。
update public.files f
set upload_status = 'ready'
where f.upload_status = 'deleted'
  and not exists (
    select 1 from public.file_deletion_jobs j
    where j.file_id = f.id and j.status = 'done'
  );


-- ---------- 0021_invitations.sql ----------
-- =============================================================
-- 0021_invitations.sql
-- 招待の入口（Phase 1 の積み残し）。
--
-- いまは最初の管理者以外も、Supabase の管理画面で利用者を作る必要がある。
-- 新入部員が入るたびに管理画面を開くのは、長く続かない（3章の11）。
--
-- 難しいのは「まだ部員でない人」を相手にすること。
-- RLS は「チームの一員かどうか」で守っているので、
-- 招待を受け取る側はどのポリシーにも当てはまらない。
-- 受け取り側の入口だけを security definer の関数で開ける。
-- =============================================================

-- -------------------------------------------------------------
-- 生のトークンを DB に残さない
--
-- 招待リンクは「持っているだけでアカウントを作れる」ものなので、
-- パスワードと同じ重さで扱う。
-- 残すのはハッシュだけ。DB が漏れても、そこから招待リンクは作れない。
-- （署名付き URL を保存しないのと同じ考え方。75章）
-- -------------------------------------------------------------
alter table public.team_invitations rename column token to token_hash;

comment on column public.team_invitations.token_hash is
  '招待トークンの sha256（16進）。生の値は発行時にリンクへ載せるだけで、ここには残さない。';

-- -------------------------------------------------------------
-- 招待できる役割の制限
--
-- 0018 で「役割を変えられるのは管理者だけ」にした。
-- 招待で役割を渡せてしまうと、そこが抜け道になる。
-- コーチやマネージャーは選手しか招待できない。
-- -------------------------------------------------------------
create or replace function app.guard_invitation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_member_team uuid;
begin
  if new.role_code <> 'player' and app.role_in_team(new.team_id) <> 'system_admin' then
    raise exception '選手以外を招待できるのは管理者だけです';
  end if;

  -- 既存の部員に結び付ける招待なら、同じチームであること（0011 の教訓）
  if new.team_member_id is not null then
    select team_id into v_member_team from public.team_members where id = new.team_member_id;
    if v_member_team is distinct from new.team_id then
      raise exception '別のチームの部員は招待できません';
    end if;
  end if;

  -- 作るときだけ見る。時間が経って期限切れになるのは当たり前なので、
  -- あとからの更新（accepted_at を入れるなど）を止めてはいけない。
  if tg_op = 'INSERT' and new.expires_at <= now() then
    raise exception '期限が過去になっています';
  end if;

  return new;
end;
$$;

drop trigger if exists team_invitations_guard on public.team_invitations;
create trigger team_invitations_guard
  before insert or update on public.team_invitations
  for each row execute function app.guard_invitation();

-- -------------------------------------------------------------
-- 受け取る側から見た招待
--
-- まだログインしていない人が呼ぶので anon にも実行を許す。
-- **トークンのハッシュを知っている人にだけ**答える。
-- 返すのは画面に出すぶんだけで、他の部員の情報は出さない。
-- -------------------------------------------------------------
create or replace function public.find_invitation(p_token_hash text)
returns table (
  team_name    text,
  invited_name text,
  email        text,
  role_code    text,
  expires_at   timestamptz,
  accepted_at  timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    t.display_name,
    p.full_name,
    i.email,
    i.role_code,
    i.expires_at,
    i.accepted_at
  from public.team_invitations i
  join public.teams t on t.id = i.team_id
  left join public.team_members tm on tm.id = i.team_member_id
  left join public.profiles p on p.id = tm.profile_id
  where i.token_hash = p_token_hash;
$$;

revoke all on function public.find_invitation(text) from public;
grant execute on function public.find_invitation(text) to anon, authenticated;

-- -------------------------------------------------------------
-- 招待を受ける
--
-- 認証利用者を作るのはアプリ側（Supabase Auth）。
-- ここは「その利用者を、この部員に結び付ける」だけを引き受ける。
--
-- 期限切れ・使用済みは必ずここで弾く。
-- 画面側でも見るが、最後に守るのはこちら。
-- -------------------------------------------------------------
create or replace function public.accept_invitation(p_token_hash text, p_user_id uuid, p_full_name text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inv        public.team_invitations;
  v_profile_id uuid;
  v_member_id  uuid;
begin
  select * into v_inv from public.team_invitations where token_hash = p_token_hash;
  if v_inv.id is null then
    raise exception '招待が見つかりません';
  end if;

  if v_inv.accepted_at is not null then
    raise exception 'この招待はすでに使われています';
  end if;

  if v_inv.expires_at <= now() then
    raise exception 'この招待は期限が切れています';
  end if;

  -- 1人の認証利用者が2つのプロフィールを持たないようにする
  if exists (select 1 from public.profiles where user_id = p_user_id) then
    raise exception 'この利用者はすでに登録されています';
  end if;

  if v_inv.team_member_id is not null then
    -- 移行で登録済みの部員に、ログインを結び付ける（ADR-0002）
    select tm.id, tm.profile_id into v_member_id, v_profile_id
    from public.team_members tm
    where tm.id = v_inv.team_member_id and tm.deleted_at is null;

    if v_member_id is null then
      raise exception '招待された部員が見つかりません';
    end if;

    update public.profiles
      set user_id = p_user_id,
          email = coalesce(email, v_inv.email)
      where id = v_profile_id and user_id is null;

    if not found then
      raise exception 'この部員にはすでにログインが結び付いています';
    end if;
  else
    -- 名簿に無い人を新しく迎える
    insert into public.profiles (user_id, full_name, email)
    values (p_user_id, coalesce(nullif(btrim(p_full_name), ''), v_inv.email), v_inv.email)
    returning id into v_profile_id;

    insert into public.team_members (team_id, profile_id, role_code, status)
    values (v_inv.team_id, v_profile_id, v_inv.role_code, 'active')
    returning id into v_member_id;
  end if;

  update public.team_invitations set accepted_at = now() where id = v_inv.id;

  -- 63章: 誰がいつ入ったかは残す
  insert into public.audit_logs (team_id, actor_id, action, target_table, target_id, summary)
  values (v_inv.team_id, v_profile_id, 'invitation.accept', 'team_members', v_member_id,
          format('%s として参加', v_inv.role_code));

  return v_member_id;
end;
$$;

revoke all on function public.accept_invitation(text, uuid, text) from public;
grant execute on function public.accept_invitation(text, uuid, text) to anon, authenticated;

-- -------------------------------------------------------------
-- 発行した招待は、生の値を持たない
--
-- スタッフが一覧で見られるのは「誰に・いつまで・使われたか」だけ。
-- リンクをもう一度見ることはできない。無くしたら作り直す。
-- -------------------------------------------------------------
comment on table public.team_invitations is
  '招待。リンクの生の値は保存しないため、再表示はできない。無くした場合は作り直す。';


-- ---------- 0022_report_feedback.sql ----------
-- =============================================================
-- 0022_report_feedback.sql
-- 日報へのコーチのコメント（16章）。
--
-- 見つかった問題:
--   report_feedbacks のポリシーが、**日報の公開範囲を見ていなかった**。
--
--     select: 本人 or report.view_all
--     write : report.view_all
--
--   日報側は visibility in ('staff','team') を見ているのに、
--   コメント側は権限だけで判定していた。
--   そのため「自分だけ」にした日報にも、コーチがコメントを書けた。
--
--   選手が公開範囲を private にするのは
--   「コーチにも見せたくない」という意思表示なので、
--   そこにコメントが付くのは、いちばんあってはならない壊れ方。
--   （Phase 7 の videos と同じ形。権限と公開範囲は別のもの）
--
-- 対処:
--   コメントの可否を、日報が見えるかどうかに合わせる。
--   判定を1か所にまとめて、select と write の両方から使う。
-- =============================================================

/**
 * その日報が、いまの利用者に見えるか。
 *
 * daily_reports のポリシーと同じ規則。
 * ここを直したら、あちらも直すこと。
 */
create or replace function app.can_see_report(p_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.daily_reports r
    where r.id = p_report_id
      and r.deleted_at is null
      and (
        app.is_own_member(r.team_member_id)
        or (r.visibility in ('staff', 'team') and app.has_permission(r.team_id, 'report.view_all'))
        or (r.visibility = 'team' and app.is_team_member(r.team_id))
      )
  );
$$;

revoke all on function app.can_see_report(uuid) from public;
grant execute on function app.can_see_report(uuid) to authenticated;

-- 見える日報のコメントだけが見える
drop policy if exists report_feedbacks_select on public.report_feedbacks;
create policy report_feedbacks_select on public.report_feedbacks
  for select to authenticated
  using (deleted_at is null and app.can_see_report(daily_report_id));

-- 書けるのは「見えていて、かつ全員の日報を見る権限がある」人。
-- 選手が他人の日報にコメントすることは考えない（16章）。
drop policy if exists report_feedbacks_staff_write on public.report_feedbacks;
create policy report_feedbacks_staff_write on public.report_feedbacks
  for all to authenticated
  using (
    deleted_at is null
    and app.has_permission(team_id, 'report.view_all')
    and app.can_see_report(daily_report_id)
  )
  with check (
    app.has_permission(team_id, 'report.view_all')
    and app.can_see_report(daily_report_id)
    -- 差出人を偽らせない（0015 の通知と同じ考え方）
    and author_id = app.current_profile_id()
  );

-- -------------------------------------------------------------
-- 参照先のチーム一致（0011 の教訓）
-- -------------------------------------------------------------
create or replace function app.validate_report_feedback()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team uuid;
begin
  select team_id into v_team from public.daily_reports where id = new.daily_report_id;
  if v_team is null then
    raise exception '対象の日報が見つかりません';
  end if;
  if v_team <> new.team_id then
    raise exception '別のチームの日報にはコメントできません';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists report_feedbacks_validate on public.report_feedbacks;
create trigger report_feedbacks_validate
  before insert or update on public.report_feedbacks
  for each row execute function app.validate_report_feedback();

-- -------------------------------------------------------------
-- コメントの取り消し
--
-- 0019 で閲覧の条件に deleted_at is null が入ったので、
-- 素朴な update では消せない。関数を通す（0013 と同じ形）。
--
-- 消せるのは書いた本人だけ。
-- 選手から見えたものが、他の人の判断で黙って消えるのは避ける。
-- -------------------------------------------------------------
create or replace function public.soft_delete_report_feedback(p_feedback_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.report_feedbacks;
begin
  select * into v_row from public.report_feedbacks where id = p_feedback_id and deleted_at is null;
  if v_row.id is null then
    raise exception '対象のコメントが見つかりません';
  end if;

  if v_row.author_id <> app.current_profile_id() then
    raise exception '自分が書いたコメントだけ消せます';
  end if;

  update public.report_feedbacks set deleted_at = now() where id = p_feedback_id;
end;
$$;

revoke all on function public.soft_delete_report_feedback(uuid) from public;
grant execute on function public.soft_delete_report_feedback(uuid) to authenticated;

-- -------------------------------------------------------------
-- 通知の種別を足す（0015 の CHECK に無かった）
-- -------------------------------------------------------------
alter table public.notifications
  drop constraint if exists notifications_notification_type_check;

alter table public.notifications
  add constraint notifications_notification_type_check
  check (notification_type in (
    'feedback_requested', 'feedback_assigned', 'feedback_answered',
    'feedback_follow_up', 'feedback_acknowledged', 'feedback_overdue',
    'share_approval_requested',
    'skill_applied', 'skill_application_updated',
    'report_commented',
    'report_missing', 'training_missing', 'general'));


-- ---------- 0023_submission_status.sql ----------
-- =============================================================
-- 0023_submission_status.sql
-- 「出したこと」と「中身」を分ける（12章・16章）。
--
-- 積み残していた問題:
--   公開範囲を「自分だけ」にした日報が、
--   コーチの提出状況では**未提出に見えていた**。
--
--   RLS は行が見えるか見えないかしか決められない。
--   「あることは見せるが、中身は見せない」が書けない。
--   そのため private の日報は行ごと消え、
--   ちゃんと書いて出した選手が「出していない人」として並んでいた。
--
--   これは提出状況という画面の目的（見落としを減らす）を裏切る。
--   出していない人を追いかけるための画面で、
--   出した人が未提出として名前を出されるのは、いちばん困る間違え方。
--
-- 直し方の考え:
--   * 選手が守りたいのは**中身**であって、出したという事実ではない。
--     「自分だけ」は「読まないでほしい」であって
--     「書いたことを隠したい」ではない（16章）。
--   * 事実だけを返す関数を作る。中身は1文字も返さない。
--   * 中身を読める日報だけ id を返す。
--     private の日報は id を返さないので、画面から開くこともできない。
--     （id を返しても RLS が止めるが、返さないほうが事故が起きない）
--   * ビューは使わない。ビューは所有者の権限で動くため、
--     何を返すかの線引きが定義の中に書かれない。
--     関数なら「何を返して、何を返さないか」がその場に残る。
--
--   選手にはこの扱いを画面で伝える。
--   「黙って伝わっている」が一番よくない。
-- =============================================================

/**
 * ある日の提出状況（12章）。
 *
 * **返すのは「出したかどうか」だけ。中身は返さない。**
 *
 * 読める日報だけ readable_report_id が入る。
 * 「自分だけ」の日報は submitted_report = true だが id は null。
 * つまりコーチは「出したことは分かるが、開けない」。
 *
 * ここを直したら daily_reports のポリシーと
 * app.can_see_report()（0022）も見ること。3つは同じ規則の上にある。
 */
create or replace function public.list_submission_status(p_team_id uuid, p_date date)
returns table (
  team_member_id uuid,
  submitted_condition boolean,
  submitted_report boolean,
  submitted_training boolean,
  readable_report_id uuid,
  report_is_private boolean,
  training_is_private boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  -- security definer は RLS を素通りする。権限は自分で確かめる。
  if not app.has_permission(p_team_id, 'report.view_all') then
    raise exception '提出状況を見る権限がありません';
  end if;

  return query
  select
    m.id,
    exists (
      select 1 from public.daily_conditions c
      where c.team_member_id = m.id and c.recorded_on = p_date and c.deleted_at is null
    ),
    exists (
      select 1 from public.daily_reports r
      where r.team_member_id = m.id and r.report_date = p_date
        and r.status = 'submitted' and r.deleted_at is null
    ),
    exists (
      select 1 from public.training_records t
      where t.team_member_id = m.id and t.performed_on = p_date and t.deleted_at is null
    ),
    -- 中身を読めるものだけ id を渡す
    (
      select r.id from public.daily_reports r
      where r.team_member_id = m.id and r.report_date = p_date
        and r.status = 'submitted' and r.deleted_at is null
        and r.visibility in ('staff', 'team')
      order by r.submitted_at desc nulls last
      limit 1
    ),
    exists (
      select 1 from public.daily_reports r
      where r.team_member_id = m.id and r.report_date = p_date
        and r.status = 'submitted' and r.deleted_at is null
        and r.visibility = 'private'
    ),
    exists (
      select 1 from public.training_records t
      where t.team_member_id = m.id and t.performed_on = p_date and t.deleted_at is null
        and t.visibility = 'private'
    )
  from public.team_members m
  where m.team_id = p_team_id
    and m.role_code = 'player'
    and m.status = 'active'
    and m.deleted_at is null;
end;
$$;

revoke all on function public.list_submission_status(uuid, date) from public;
grant execute on function public.list_submission_status(uuid, date) to authenticated;

-- 選手にこの扱いをどう伝えるかは、画面側の純粋な関数にまとめてある
-- （src/features/daily/lib/disclosure.ts）。
-- 公開範囲の選択肢のすぐ横に、そのとき何が伝わるかを出す。

