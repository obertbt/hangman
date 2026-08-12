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
