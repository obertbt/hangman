-- ==========================================================
-- 自動生成: scripts/bundle-migrations.sh
-- 直接編集しない。直すのは supabase/migrations/ のほう。
-- 6 番目。中身: 0015_notification_insert.sql 0016_storage_ops.sql 0017_measurement_guards.sql 0018_role_guards.sql 0019_soft_delete_visibility.sql 
-- ==========================================================


-- ---------- 0015_notification_insert.sql ----------
-- =============================================================
-- 0015_notification_insert.sql
--
-- 見つかった問題:
--   notifications と notification_targets は RLS を有効にしてあるのに、
--   INSERT のポリシーが1つも無かった。
--   RLS は「ポリシーが無ければ拒否」なので、通知は**1件も作られていなかった**。
--
--   気付けなかったのは、アプリ側が通知の失敗を握りつぶしていたため。
--   supabase-js は例外を投げず { error } を返すので、
--   try/catch では拾えず、通知が無いことに誰も気付かない。
--
-- 対処:
--   INSERT のポリシーを足す。
--   通知は「自分のチームの人へ、自分の名前で送る」ものに限る。
--
-- なぜ service role にしないか:
--   通知はごく普通の書き込みで、RLS で表現できる（ADR-0003 の逆）。
--   RLS を迂回する経路は、本当に表現できないものだけに留めたい。
-- =============================================================

-- 自分のチームへ、自分の名前で。差出人を偽れないようにする。
create policy notifications_insert on public.notifications
  for insert to authenticated
  with check (
    app.is_team_member(team_id)
    and created_by = app.current_profile_id()
  );

-- 自分が作った通知か。
--
-- ポリシーの中から素朴に notifications を select すると、
-- **その select にも notifications の SELECT ポリシーが効く**。
-- notifications は「自分が宛先の通知だけ見える」ので、
-- 宛先を入れる前の通知は自分にも見えず、いつまでも条件を満たせない。
-- 判定は security definer の関数に逃がす（0002 の app.* と同じ理由）。
create or replace function app.owns_notification(p_notification_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.notifications n
    where n.id = p_notification_id
      and n.created_by = app.current_profile_id()
  );
$$;

revoke all on function app.owns_notification(uuid) from public;
grant execute on function app.owns_notification(uuid) to authenticated;

-- 宛先を足せるのは、その通知を自分が作った場合だけ。
-- 宛先は同じチームの在籍者に限る。
create policy notification_targets_insert on public.notification_targets
  for insert to authenticated
  with check (
    app.owns_notification(notification_id)
    and exists (
      select 1
      from public.team_members tm
      where tm.id = notification_targets.team_member_id
        and tm.status = 'active'
        and tm.deleted_at is null
        and app.is_team_member(tm.team_id)
    )
  );

-- 送った通知を後から書き換えたり消したりはさせない。
-- 「そんな通知は送っていない」と言えてしまうと、記録の意味がなくなる。
-- 宛先の update は既読の記録に使うので残す（notification_targets_update）。
revoke update, delete on public.notifications from authenticated;
revoke delete on public.notification_targets from authenticated;

-- スキルの通知にも種別が要る（0007 の CHECK に無かった）
alter table public.notifications
  drop constraint if exists notifications_notification_type_check;

alter table public.notifications
  add constraint notifications_notification_type_check
  check (notification_type in (
    'feedback_requested', 'feedback_assigned', 'feedback_answered',
    'feedback_follow_up', 'feedback_acknowledged', 'feedback_overdue',
    'share_approval_requested',
    'skill_applied', 'skill_application_updated',
    'report_missing', 'training_missing', 'general'));


-- ---------- 0016_storage_ops.sql ----------
-- =============================================================
-- 0016_storage_ops.sql
-- 容量の集計と、たまったものの掃除（59章・60章）。
--
-- どれも「本人以外の行を触る」または「削除済みの行を触る」ため、
-- 素朴な UPDATE では通らない。理由は2つ。
--
--   1. upload_sessions の with check が created_by = 自分 になっている。
--      管理者でも他人のセッションは書き換えられない。
--   2. files の SELECT ポリシーが deleted_at is null なので、
--      論理削除済みの行を更新しようとすると弾かれる
--      （PostgreSQL は更新後の行にも SELECT ポリシーを適用する。0013 と同じ）。
--
-- どちらもポリシーの書き方の問題ではないので、
-- 0013 と同じく security definer の関数を通す。
-- 権限の確認は関数の中で自分で行う。
-- =============================================================

-- 権限確認を1か所に。書き忘れを防ぐ。
create or replace function app.require_storage_manage(p_team_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not app.has_permission(p_team_id, 'storage.manage') then
    raise exception '保存容量を管理する権限がありません';
  end if;
end;
$$;

revoke all on function app.require_storage_manage(uuid) from public;
grant execute on function app.require_storage_manage(uuid) to authenticated;

-- -------------------------------------------------------------
-- 容量の集計（59章）
--
-- 1日1件。同じ日に何度呼んでも上書きする。
-- 「削除待ち」を別に数えるのは、それがまだ R2 の容量を使っているため。
-- -------------------------------------------------------------
create or replace function public.capture_storage_usage(p_team_id uuid)
returns public.storage_usage_snapshots
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_row   public.storage_usage_snapshots;
begin
  perform app.require_storage_manage(p_team_id);

  insert into public.storage_usage_snapshots (
    team_id, captured_on, total_bytes, video_bytes, image_bytes, pdf_bytes,
    temp_bytes, deleted_bytes, file_count
  )
  select
    p_team_id,
    v_today,
    coalesce(sum(f.size_bytes), 0),
    coalesce(sum(f.size_bytes) filter (where f.media_type = 'video'), 0),
    coalesce(sum(f.size_bytes) filter (where f.media_type = 'image'), 0),
    coalesce(sum(f.size_bytes) filter (where f.media_type = 'pdf'), 0),
    -- 一時領域はまだ本置き場に移っていないもの
    coalesce(sum(f.size_bytes) filter (where f.storage_key like '%/tmp/%'), 0),
    -- 論理削除しただけで、実体がまだ残っているもの
    coalesce(sum(f.size_bytes) filter (where f.deleted_at is not null and f.upload_status <> 'deleted'), 0),
    count(*)
  from public.files f
  where f.team_id = p_team_id
    -- 実体を消したものは、もう容量を使っていない
    and f.upload_status <> 'deleted'
  on conflict (team_id, captured_on) do update
    set total_bytes   = excluded.total_bytes,
        video_bytes   = excluded.video_bytes,
        image_bytes   = excluded.image_bytes,
        pdf_bytes     = excluded.pdf_bytes,
        temp_bytes    = excluded.temp_bytes,
        deleted_bytes = excluded.deleted_bytes,
        file_count    = excluded.file_count
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.capture_storage_usage(uuid) from public;
grant execute on function public.capture_storage_usage(uuid) to authenticated;

-- -------------------------------------------------------------
-- 物理削除の後始末（60章・63章）
--
-- R2 から実体を消すのはアプリの仕事（DB からは R2 を触れない）。
-- この関数は「消し終わった」という記録だけを引き受ける。
--
-- 失敗したときも呼ぶ。理由を残して、次回また拾えるようにする。
-- -------------------------------------------------------------
create or replace function public.complete_file_deletion(p_job_id uuid, p_error text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job     public.file_deletion_jobs;
  v_key     text;
begin
  select * into v_job from public.file_deletion_jobs where id = p_job_id;
  if v_job.id is null then
    raise exception '対象の削除予約が見つかりません';
  end if;

  perform app.require_storage_manage(v_job.team_id);

  if p_error is not null then
    update public.file_deletion_jobs
      set status = 'failed', attempted_at = now(), error_message = left(p_error, 500)
      where id = p_job_id;
    return;
  end if;

  update public.file_deletion_jobs
    set status = 'done', attempted_at = now(), error_message = null
    where id = p_job_id;

  -- 実体が無くなったことを files 側にも残す。
  -- 行そのものは消さない。「いつ何があって、いつ消えたか」は記録として要る。
  update public.files
    set upload_status = 'deleted'
    where id = v_job.file_id
    returning storage_key into v_key;

  -- 63章: 物理削除は監査ログに残す。key は残すが氏名は入っていない。
  insert into public.audit_logs (team_id, actor_id, action, target_table, target_id, summary)
  values (v_job.team_id, app.current_profile_id(), 'file.hard_delete', 'files', v_job.file_id,
          coalesce(v_key, '(不明)'));
end;
$$;

revoke all on function public.complete_file_deletion(uuid, text) from public;
grant execute on function public.complete_file_deletion(uuid, text) to authenticated;

-- -------------------------------------------------------------
-- 途中でやめたアップロードの片付け（21章・60章）
--
-- 期限を過ぎても pending のままのセッションは、
-- ブラウザを閉じたなどで終わらなかったもの。
-- 放っておくと「1日の本数」を無駄に食う。
-- -------------------------------------------------------------
create or replace function public.expire_stale_uploads(p_team_id uuid)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count int;
begin
  perform app.require_storage_manage(p_team_id);

  update public.upload_sessions
    set status = 'failed', failure_reason = '期限切れ（自動整理）'
    where team_id = p_team_id
      and status in ('pending', 'uploading', 'uploaded', 'verifying')
      and expires_at < now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.expire_stale_uploads(uuid) from public;
grant execute on function public.expire_stale_uploads(uuid) to authenticated;

-- -------------------------------------------------------------
-- 集計の記録は、関数を通してだけ作る
--
-- 手で書き換えられると、容量の記録が当てにならなくなる。
-- -------------------------------------------------------------
revoke insert, update, delete on public.storage_usage_snapshots from authenticated;


-- ---------- 0017_measurement_guards.sql ----------
-- =============================================================
-- 0017_measurement_guards.sql
-- 測定（3章の6: 成長を確認できる）を書く前に確かめること。
--
-- 0011 の教訓をそのまま当てる。
-- measurement_results は3つの表を指しているのに、
-- RLS は自分の team_id しか見ていなかった。
-- 別チームの記録会・項目・部員を指す行を作れてしまう。
--
-- チームの一致は権限ではなくデータの整合性なので、トリガで守る。
-- =============================================================

create or replace function app.validate_measurement_result()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team uuid;
begin
  select team_id into v_team from public.measurement_events where id = new.measurement_event_id;
  if v_team is null then
    raise exception '対象の測定会が見つかりません';
  end if;
  if v_team <> new.team_id then
    raise exception '別のチームの測定会は参照できません';
  end if;

  select team_id into v_team from public.measurement_items where id = new.measurement_item_id;
  if v_team is distinct from new.team_id then
    raise exception '別のチームの測定項目は参照できません';
  end if;

  select team_id into v_team from public.team_members where id = new.team_member_id;
  if v_team is distinct from new.team_id then
    raise exception '別のチームの部員は参照できません';
  end if;

  -- 数値も文字も入っていない行は、記録として意味がない
  if new.value is null and (new.text_value is null or btrim(new.text_value) = '') then
    raise exception '測定の値が入っていません';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists measurement_results_validate on public.measurement_results;
create trigger measurement_results_validate
  before insert or update on public.measurement_results
  for each row execute function app.validate_measurement_result();

-- -------------------------------------------------------------
-- 測定会も、参照先のシーズン・予定が同じチームであること
-- -------------------------------------------------------------
create or replace function app.validate_measurement_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team uuid;
begin
  if new.season_id is not null then
    select team_id into v_team from public.seasons where id = new.season_id;
    if v_team is distinct from new.team_id then
      raise exception '別のチームのシーズンは参照できません';
    end if;
  end if;

  if new.event_id is not null then
    select team_id into v_team from public.events where id = new.event_id;
    if v_team is distinct from new.team_id then
      raise exception '別のチームの予定は参照できません';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists measurement_events_validate on public.measurement_events;
create trigger measurement_events_validate
  before insert or update on public.measurement_events
  for each row execute function app.validate_measurement_event();

-- -------------------------------------------------------------
-- 自分の記録は自分でも入れられるようにする
--
-- 0008 では書き込みをスタッフだけに限っていた。
-- 記録会でコーチが測るぶんにはそれでよいが、
-- 「自主的に測った」を残せないと、記録が続かない。
--
-- ただし**他人の記録には触らせない**。
-- 更新も自分の行だけに限る（スタッフは全員ぶん触れる）。
-- -------------------------------------------------------------
create policy measurement_results_own_write on public.measurement_results
  for insert to authenticated
  with check (app.is_own_member(team_member_id) and app.is_team_member(team_id));

create policy measurement_results_own_update on public.measurement_results
  for update to authenticated
  using (app.is_own_member(team_member_id))
  with check (app.is_own_member(team_member_id));


-- ---------- 0018_role_guards.sql ----------
-- =============================================================
-- 0018_role_guards.sql
--
-- 見つかった問題:
--   team_members の書き込みポリシーが
--     using (app.is_staff(team_id)) with check (app.is_staff(team_id))
--   だった。app.is_staff は system_admin / coach / manager を含むので、
--   **マネージャーが自分の role_code を system_admin に書き換えられた**。
--   権限の壁がそこで終わる。いちばん重い種類の穴。
--
--   加えて、最後の管理者を降格・退部させられた。
--   そうなると誰も役割を戻せず、チームが操作不能になる。
--
-- 対処:
--   スタッフが名簿（背番号・ポジションなど）を直せること自体は正しいので、
--   ポリシーごと締めずに「役割を変える操作」だけをトリガで守る。
--   これは権限の話でもありデータの整合性の話でもあるので、
--   どの経路（service role を含む）から書いても効くほうがよい。
-- =============================================================

create or replace function app.guard_member_role()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_membership uuid;
  v_admin_count      int;
  v_leaving_admin    boolean;
begin
  -- 役割が変わらないなら、ここで見ることは何もない
  -- （背番号やポジションの変更は今までどおり通す）
  if new.role_code is not distinct from old.role_code
     and new.status is not distinct from old.status
     and new.deleted_at is not distinct from old.deleted_at then
    return new;
  end if;

  select id into v_actor_membership
  from public.team_members
  where team_id = old.team_id
    and profile_id = app.current_profile_id()
    and deleted_at is null;

  if new.role_code is distinct from old.role_code then
    if app.role_in_team(old.team_id) <> 'system_admin' then
      raise exception '役割を変えられるのは管理者だけです';
    end if;

    -- 自分の役割は自分で変えない。
    -- 昇格を防ぐためであり、降格して自分を締め出す事故も防ぐ。
    if v_actor_membership = old.id then
      raise exception '自分の役割は変えられません。他の管理者に頼んでください';
    end if;
  end if;

  -- 最後の管理者がいなくなる変更を止める。
  -- 誰も役割を戻せなくなると、チームごと操作不能になる。
  v_leaving_admin :=
    old.role_code = 'system_admin'
    and old.status = 'active'
    and old.deleted_at is null
    and (
      new.role_code <> 'system_admin'
      or new.status <> 'active'
      or new.deleted_at is not null
    );

  if v_leaving_admin then
    select count(*) into v_admin_count
    from public.team_members
    where team_id = old.team_id
      and role_code = 'system_admin'
      and status = 'active'
      and deleted_at is null;

    if v_admin_count <= 1 then
      raise exception '最後の管理者です。先に別の管理者を決めてください';
    end if;
  end if;

  -- 63章: 役割の変更は監査ログに残す
  if new.role_code is distinct from old.role_code then
    insert into public.audit_logs
      (team_id, actor_id, action, target_table, target_id, summary, before_value, after_value)
    values (
      old.team_id, app.current_profile_id(), 'member.role_change', 'team_members', old.id,
      format('%s → %s', old.role_code, new.role_code),
      jsonb_build_object('role_code', old.role_code),
      jsonb_build_object('role_code', new.role_code)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists team_members_guard_role on public.team_members;
create trigger team_members_guard_role
  before update on public.team_members
  for each row execute function app.guard_member_role();

-- -------------------------------------------------------------
-- 個別権限の変更も記録に残す（63章）
--
-- 「なぜこの人がこれをできるのか」を後から追えるようにする。
-- 付け外しできるのが管理者だけなのは 0008 のポリシーのとおり。
-- -------------------------------------------------------------
create or replace function app.log_member_permission()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row     public.member_permissions;
  v_team_id uuid;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;

  select team_id into v_team_id from public.team_members where id = v_row.team_member_id;
  if v_team_id is null then
    return v_row;
  end if;

  insert into public.audit_logs
    (team_id, actor_id, action, target_table, target_id, summary)
  values (
    v_team_id, app.current_profile_id(),
    case when tg_op = 'DELETE' then 'member.permission_reset' else 'member.permission_change' end,
    'member_permissions', v_row.team_member_id,
    case
      when tg_op = 'DELETE' then format('%s を役割どおりに戻した', v_row.permission_code)
      when v_row.granted then format('%s を付与', v_row.permission_code)
      else format('%s を剥奪', v_row.permission_code)
    end
  );

  return v_row;
end;
$$;

drop trigger if exists member_permissions_log on public.member_permissions;
create trigger member_permissions_log
  after insert or update or delete on public.member_permissions
  for each row execute function app.log_member_permission();

-- -------------------------------------------------------------
-- スキル定義の並べ替えを楽にする
--
-- 画面から作るときに sort_order を人に決めさせたくない。
-- 末尾に足すのが既定になるよう、次の番号を返す関数を置く。
-- -------------------------------------------------------------
create or replace function app.next_skill_sort_order(p_team_id uuid, p_category_id uuid, p_parent_id uuid)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(max(sort_order), 0) + 1
  from public.skills
  where team_id = p_team_id
    and skill_category_id = p_category_id
    and parent_id is not distinct from p_parent_id
    and deleted_at is null;
$$;

revoke all on function app.next_skill_sort_order(uuid, uuid, uuid) from public;
grant execute on function app.next_skill_sort_order(uuid, uuid, uuid) to authenticated;


-- ---------- 0019_soft_delete_visibility.sql ----------
-- =============================================================
-- 0019_soft_delete_visibility.sql
--
-- 見つかった問題:
--   `for all` のポリシーは **SELECT にも効く**。
--   0008 では「見る条件」と「書く条件」を別のポリシーに分けたつもりだったが、
--
--     create policy xxx_select      for select using (deleted_at is null and ...)
--     create policy xxx_staff_write for all    using (...)          -- ← deleted_at を見ていない
--
--   の2つは **or** で足し合わされる。
--   結果、論理削除した行が、書ける立場の人にはそのまま見え続けていた。
--
--   実際に起きること:
--     * 選手が消した日報が、自分の一覧に残り続ける
--     * コーチが消した予定が、スタッフには見えたまま
--     * 消したスキル定義が、コーチの画面から消えない
--
--   17個のポリシーが同じ形だった。
--
-- 対処:
--   `using` に `deleted_at is null` を足す。
--   `with check` には足さない。足すと論理削除そのものが通らなくなる
--   （更新後の行は deleted_at が入っているため）。
--
--   これで「消したものは、消した人からも見えない」になる。
--   取り消したいときは復元の手立てを別に用意する
--   （動画は file_deletion_jobs の30日、他は今のところ管理者が SQL で戻す）。
-- =============================================================

-- 名簿 ---------------------------------------------------------
drop policy if exists team_members_staff_write on public.team_members;
create policy team_members_staff_write on public.team_members
  for all to authenticated
  using (deleted_at is null and app.is_staff(team_id))
  with check (app.is_staff(team_id));

-- 時間軸 -------------------------------------------------------
drop policy if exists seasons_staff_write on public.seasons;
create policy seasons_staff_write on public.seasons
  for all to authenticated
  using (deleted_at is null and app.has_permission(team_id, 'event.manage'))
  with check (app.has_permission(team_id, 'event.manage'));

drop policy if exists season_goals_staff_write on public.season_goals;
create policy season_goals_staff_write on public.season_goals
  for all to authenticated
  using (deleted_at is null and app.has_permission(team_id, 'event.manage'))
  with check (app.has_permission(team_id, 'event.manage'));

drop policy if exists milestones_staff_write on public.milestones;
create policy milestones_staff_write on public.milestones
  for all to authenticated
  using (deleted_at is null and app.has_permission(team_id, 'event.manage'))
  with check (app.has_permission(team_id, 'event.manage'));

drop policy if exists competitions_staff_write on public.competitions;
create policy competitions_staff_write on public.competitions
  for all to authenticated
  using (deleted_at is null and app.has_permission(team_id, 'event.manage'))
  with check (app.has_permission(team_id, 'event.manage'));

drop policy if exists weeks_staff_write on public.weeks;
create policy weeks_staff_write on public.weeks
  for all to authenticated
  using (deleted_at is null and app.has_permission(team_id, 'event.manage'))
  with check (app.has_permission(team_id, 'event.manage'));

drop policy if exists events_staff_write on public.events;
create policy events_staff_write on public.events
  for all to authenticated
  using (deleted_at is null and app.has_permission(team_id, 'event.manage'))
  with check (app.has_permission(team_id, 'event.manage'));

-- 日々の記録 ---------------------------------------------------
drop policy if exists daily_conditions_own on public.daily_conditions;
create policy daily_conditions_own on public.daily_conditions
  for all to authenticated
  using (deleted_at is null and app.is_own_member(team_member_id))
  with check (app.is_own_member(team_member_id));

drop policy if exists practice_goals_own on public.practice_goals;
create policy practice_goals_own on public.practice_goals
  for all to authenticated
  using (deleted_at is null and app.is_own_member(team_member_id))
  with check (app.is_own_member(team_member_id));

drop policy if exists daily_reports_own on public.daily_reports;
create policy daily_reports_own on public.daily_reports
  for all to authenticated
  using (deleted_at is null and app.is_own_member(team_member_id))
  with check (app.is_own_member(team_member_id));

drop policy if exists report_feedbacks_staff_write on public.report_feedbacks;
create policy report_feedbacks_staff_write on public.report_feedbacks
  for all to authenticated
  using (deleted_at is null and app.has_permission(team_id, 'report.view_all'))
  with check (app.has_permission(team_id, 'report.view_all'));

drop policy if exists training_records_own on public.training_records;
create policy training_records_own on public.training_records
  for all to authenticated
  using (deleted_at is null and app.is_own_member(team_member_id))
  with check (app.is_own_member(team_member_id));

-- 動画 ---------------------------------------------------------
drop policy if exists video_clips_write on public.video_clips;
create policy video_clips_write on public.video_clips
  for all to authenticated
  using (deleted_at is null and (created_by = app.current_profile_id() or app.is_staff(team_id)))
  with check (created_by = app.current_profile_id() and app.is_team_member(team_id));

-- スキル -------------------------------------------------------
drop policy if exists skill_categories_staff_write on public.skill_categories;
create policy skill_categories_staff_write on public.skill_categories
  for all to authenticated
  using (deleted_at is null and app.has_permission(team_id, 'skill.review'))
  with check (app.has_permission(team_id, 'skill.review'));

drop policy if exists skills_staff_write on public.skills;
create policy skills_staff_write on public.skills
  for all to authenticated
  using (deleted_at is null and app.has_permission(team_id, 'skill.review'))
  with check (app.has_permission(team_id, 'skill.review'));

drop policy if exists skill_applications_own_write on public.skill_applications;
create policy skill_applications_own_write on public.skill_applications
  for all to authenticated
  using (
    deleted_at is null
    and (app.is_own_member(team_member_id) or app.has_permission(team_id, 'skill.review'))
  )
  with check (app.is_own_member(team_member_id) or app.has_permission(team_id, 'skill.review'));

-- 測定 ---------------------------------------------------------
drop policy if exists measurement_events_staff_write on public.measurement_events;
create policy measurement_events_staff_write on public.measurement_events
  for all to authenticated
  using (deleted_at is null and app.is_staff(team_id))
  with check (app.is_staff(team_id));

-- =============================================================
-- 論理削除は関数を通す
--
-- 上の修正で、これらの表も 0013 の videos と同じ形になった。
-- 閲覧できる条件がすべて `deleted_at is null` になったため、
-- 素朴な `update ... set deleted_at = now()` は
-- 「更新後の行が見えなくなる」ので弾かれる。
--
-- 0013 と同じく security definer の関数に逃がす。
-- 権限の確認は関数の中で自分で行う。
-- =============================================================

/** 自分のトレーニング記録を消す（Phase 4 の deleteTrainingRecord から呼ぶ）。 */
create or replace function public.soft_delete_training_record(p_record_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.training_records;
begin
  select * into v_row from public.training_records where id = p_record_id and deleted_at is null;
  if v_row.id is null then
    raise exception '対象の記録が見つかりません';
  end if;

  -- 消せるのは本人だけ。コーチでも他人の記録は消さない。
  if not app.is_own_member(v_row.team_member_id) then
    raise exception 'この記録を削除する権限がありません';
  end if;

  update public.training_records set deleted_at = now() where id = p_record_id;
end;
$$;

revoke all on function public.soft_delete_training_record(uuid) from public;
grant execute on function public.soft_delete_training_record(uuid) to authenticated;

/**
 * スキル定義（中目標・小目標）を消す（30章）。
 *
 * すでに誰かが申請・到達している目標は消さない。
 * 記録が宙に浮くと、選手の積み上げが無かったことになる。
 */
create or replace function public.soft_delete_skill(p_skill_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.skills;
begin
  select * into v_row from public.skills where id = p_skill_id and deleted_at is null;
  if v_row.id is null then
    raise exception '対象の目標が見つかりません';
  end if;

  if not app.has_permission(v_row.team_id, 'skill.review') then
    raise exception 'スキル定義を変えられるのは審査担当だけです';
  end if;

  if exists (select 1 from public.player_skills where skill_id = p_skill_id and deleted_at is null) then
    raise exception 'すでに申請・承認のある目標は消せません';
  end if;

  if exists (select 1 from public.skills where parent_id = p_skill_id and deleted_at is null) then
    raise exception '下に小目標があります。先にそちらを消してください';
  end if;

  update public.skills set deleted_at = now() where id = p_skill_id;

  insert into public.audit_logs (team_id, actor_id, action, target_table, target_id, summary)
  values (v_row.team_id, app.current_profile_id(), 'skill.delete', 'skills', p_skill_id, v_row.name);
end;
$$;

revoke all on function public.soft_delete_skill(uuid) from public;
grant execute on function public.soft_delete_skill(uuid) to authenticated;

