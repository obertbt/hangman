-- Hearth Growth : 0015_wake_alarm.sql だけを実行する
-- すでに動いている環境へ、この変更ぶんだけを足すためのファイルです。
-- まっさらな状態から作る場合は supabase/setup/ の 01 から順に実行してください。

create table public.app_config (
  key   text primary key,
  value text not null
);

alter table public.app_config enable row level security;

/*
 * 誰にも読ませない。ポリシーを書かないのではなく、
 * 「読めない」ことを目に見える形で残すために false のポリシーを置く。
 * 読めるのは定義者権限で動く関数だけ。
 */
create policy "app_config_no_access" on public.app_config
  for all to authenticated
  using (false)
  with check (false);

create table public.push_subscriptions (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references public.profiles (id) on delete cascade,
  endpoint   text        not null unique,
  p256dh     text        not null,
  auth       text        not null,
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions_select_own" on public.push_subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "push_subscriptions_insert_own" on public.push_subscriptions
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "push_subscriptions_update_own" on public.push_subscriptions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "push_subscriptions_delete_own" on public.push_subscriptions
  for delete to authenticated
  using (user_id = (select auth.uid()));

create table public.sleep_alarms (
  session_id  uuid        primary key references public.activity_sessions (id) on delete cascade,
  user_id     uuid        not null references public.profiles (id) on delete cascade,
  wake_at     timestamptz not null,
  notified_at timestamptz,
  created_at  timestamptz not null default now()
);

create index sleep_alarms_due_idx on public.sleep_alarms (wake_at) where notified_at is null;

alter table public.sleep_alarms enable row level security;

create policy "sleep_alarms_select_own" on public.sleep_alarms
  for select to authenticated
  using (user_id = (select auth.uid()));

/*
 * タイマーが終わったら（起床・取り消し・終了）、予定も一緒に消す。
 * 残しておくと、寝ていないのに「起きていますか？」が飛ぶ。
 */
create or replace function public.clear_sleep_alarm()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status not in ('running', 'paused') then
    delete from public.sleep_alarms where session_id = new.id;
  end if;
  return null;
end;
$$;

create trigger activity_sessions_clear_alarm
  after update of status on public.activity_sessions
  for each row execute function public.clear_sleep_alarm();

drop function if exists public.start_sleep();

create or replace function public.start_sleep(p_wake_at timestamptz default null)
returns public.activity_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id     uuid := auth.uid();
  v_category_id uuid;
  v_session     public.activity_sessions;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select id into v_category_id
  from public.categories
  where user_id = v_user_id and name = '睡眠'
  limit 1;

  -- 消してしまった人のために作り直す
  if v_category_id is null then
    insert into public.categories (user_id, name, icon, color, sort_order, counts_toward_total)
    values (v_user_id, '睡眠', '😴', '#7A7F9A', 95, false)
    returning id into v_category_id;
  end if;

  v_session := public.start_session(v_category_id, null, null);

  if p_wake_at is not null then
    if p_wake_at <= now() then
      raise exception 'wake_at in the past' using errcode = 'P0001';
    end if;
    -- 24時間より先は入力の間違いとみなす
    if p_wake_at > now() + interval '24 hours' then
      raise exception 'wake_at too far' using errcode = 'P0001';
    end if;

    insert into public.sleep_alarms (session_id, user_id, wake_at)
    values (v_session.id, v_user_id, p_wake_at);
  end if;

  return v_session;
end;
$$;

create or replace function public.wake_up()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id    uuid := auth.uid();
  v_session_id uuid;
  v_visibility text;
  v_group_ids  uuid[];
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select s.id into v_session_id
  from public.activity_sessions s
  join public.categories c on c.id = s.category_id
  where s.user_id = v_user_id
    and s.status in ('running', 'paused')
    and c.name = '睡眠'
  limit 1;

  if v_session_id is null then
    raise exception 'not sleeping' using errcode = 'P0002';
  end if;

  perform public.complete_session(v_session_id, null);
  delete from public.sleep_alarms where session_id = v_session_id;

  select default_visibility into v_visibility from public.profiles where id = v_user_id;

  if v_visibility = 'group' then
    select array_agg(group_id) into v_group_ids
    from public.group_members where user_id = v_user_id;

    if v_group_ids is null then
      v_visibility := 'private';
    end if;
  elsif v_visibility = 'selected' then
    v_visibility := 'private';
  end if;

  return public.create_activity_post(
    p_session_id => v_session_id,
    p_visibility => v_visibility,
    p_group_ids  => v_group_ids
  );
end;
$$;

/*
 * 合言葉が合ったときだけ答える。
 *
 * サービスロールキーを配らずに済ませるための入口。
 * ここが返すのは「通知の宛先」だけで、記録も本文も返さない。
 * 取り出した時点で notified_at を立てるので、同じ予定を二度送らない。
 */
create or replace function public.claim_due_wake_alarms(p_secret text)
returns table (endpoint text, p256dh text, auth text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected text;
begin
  select value into v_expected from public.app_config where key = 'cron_secret';

  -- 合言葉が未設定なら、誰にも答えない
  if v_expected is null or p_secret is null or p_secret <> v_expected then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  with due as (
    update public.sleep_alarms a
    set notified_at = now()
    where a.notified_at is null
      and a.wake_at <= now()
      and exists (
        select 1 from public.activity_sessions s
        where s.id = a.session_id and s.status in ('running', 'paused')
      )
    returning a.user_id
  )
  select p.endpoint, p.p256dh, p.auth
  from due
  join public.push_subscriptions p on p.user_id = due.user_id;
end;
$$;

/*
 * 合言葉が合っているかだけを確かめる。
 *
 * /setup-check から呼ぶ。claim_due_wake_alarms を確認に使うと、
 * 時刻の来た予定をそこで消費してしまい、通知が飛ばなくなる。
 */
create or replace function public.check_cron_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_config
    where key = 'cron_secret' and value = p_secret and p_secret is not null
  );
$$;

revoke all on function public.check_cron_secret(text) from public;
grant execute on function public.check_cron_secret(text) to anon, authenticated;

revoke all on function public.claim_due_wake_alarms(text) from public;
grant execute on function public.claim_due_wake_alarms(text) to anon, authenticated;

revoke all on function public.start_sleep(timestamptz) from public, anon;
grant execute on function public.start_sleep(timestamptz) to authenticated;
