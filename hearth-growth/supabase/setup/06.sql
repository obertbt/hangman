-- Hearth Growth セットアップ 6 / 6
-- 番号順に、Supabase の SQL Editor へ貼り付けて実行してください。
-- 元になっているのは supabase/migrations/ の各ファイルです。

revoke all on function public.delete_activity_post(uuid) from public, anon;

grant execute on function public.create_activity_post(uuid, uuid, text, text, integer, date, text, uuid, uuid[])
  to authenticated;
grant execute on function public.update_activity_post(uuid, text, text, integer, date, text, uuid, uuid[])
  to authenticated;
grant execute on function public.delete_activity_post(uuid) to authenticated;
grant execute on function public.assert_visibility_target(uuid, text, uuid, uuid[]) to authenticated;

drop function if exists public.get_active_group_members();

create function public.get_active_group_members()
returns table (
  user_id              uuid,
  display_name         text,
  avatar_url           text,
  category_name        text,
  category_icon        text,
  category_color       text,
  status               text,
  started_at           timestamptz,
  paused_at            timestamptz,
  total_paused_seconds integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.user_id,
    p.display_name,
    p.avatar_url,
    c.name,
    c.icon,
    c.color,
    s.status,
    s.started_at,
    s.paused_at,
    s.total_paused_seconds
  from public.activity_sessions s
  join public.profiles p   on p.id = s.user_id
  join public.categories c on c.id = s.category_id
  where s.status in ('running', 'paused')
    and (s.user_id = auth.uid() or public.shares_group_with(s.user_id, auth.uid()))
  order by s.started_at asc;
$$;

revoke all on function public.get_active_group_members() from public, anon;
grant execute on function public.get_active_group_members() to authenticated;

create or replace function public.user_week_start(p_user_id uuid default auth.uid())
returns date
language sql
stable
security definer
set search_path = public
as $$
  select date_trunc('week', public.user_today(p_user_id)::timestamp)::date;
$$;

create or replace function public.get_period_summary(p_from date, p_to date)
returns table (total_seconds bigint, post_count integer, active_days integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(sum(p.duration_seconds), 0)::bigint,
    count(*)::integer,
    count(distinct p.activity_date)::integer
  from public.activity_posts p
  where p.user_id = auth.uid()
    and p.deleted_at is null
    and p.activity_date between p_from and p_to;
$$;

create or replace function public.get_daily_totals(p_from date, p_to date)
returns table (activity_date date, total_seconds bigint, post_count integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.activity_date,
    coalesce(sum(p.duration_seconds), 0)::bigint,
    count(*)::integer
  from public.activity_posts p
  where p.user_id = auth.uid()
    and p.deleted_at is null
    and p.activity_date between p_from and p_to
  group by p.activity_date
  order by p.activity_date;
$$;

create or replace function public.get_category_summary(p_from date, p_to date)
returns table (
  category_id    uuid,
  category_name  text,
  category_icon  text,
  category_color text,
  total_seconds  bigint,
  post_count     integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.name,
    c.icon,
    c.color,
    coalesce(sum(p.duration_seconds), 0)::bigint,
    count(*)::integer
  from public.activity_posts p
  join public.categories c on c.id = p.category_id
  where p.user_id = auth.uid()
    and p.deleted_at is null
    and p.activity_date between p_from and p_to
  group by c.id, c.name, c.icon, c.color
  order by 5 desc;
$$;

create or replace function public.get_current_streak(p_user_id uuid default auth.uid())
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today  date;
  v_anchor date;
  v_streak integer;
begin
  -- 他人の連続記録は返さない
  if p_user_id is distinct from auth.uid() then
    return 0;
  end if;

  v_today := public.user_today(p_user_id);

  select case
    when exists (
      select 1 from public.activity_posts
      where user_id = p_user_id and deleted_at is null and activity_date = v_today
    ) then v_today
    when exists (
      select 1 from public.activity_posts
      where user_id = p_user_id and deleted_at is null and activity_date = v_today - 1
    ) then v_today - 1
    else null
  end into v_anchor;

  if v_anchor is null then
    return 0;
  end if;

  -- 起点から1日ずつ遡り、途切れた時点で止める
  with days as (
    select distinct activity_date as day
    from public.activity_posts
    where user_id = p_user_id and deleted_at is null and activity_date <= v_anchor
  ),
  ordered as (
    select day, row_number() over (order by day desc) as rn
    from days
  ),
  expected as (
    select rn, day, (v_anchor - (rn - 1)::integer) as expected_day
    from ordered
  )
  select coalesce(
    (select min(rn) - 1 from expected where day <> expected_day),
    (select count(*) from expected)
  )::integer
  into v_streak;

  return coalesce(v_streak, 0);
end;
$$;

create or replace function public.get_group_week_summary(p_group_id uuid, p_week_start date default null)
returns table (
  user_id       uuid,
  display_name  text,
  avatar_url    text,
  total_seconds bigint,
  active_days   integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start date := coalesce(p_week_start, public.user_week_start());
begin
  if not public.is_group_member(p_group_id, auth.uid()) then
    raise exception 'not a group member' using errcode = '42501';
  end if;

  return query
  select
    m.user_id,
    pr.display_name,
    pr.avatar_url,
    coalesce(sum(p.duration_seconds), 0)::bigint,
    count(distinct p.activity_date)::integer
  from public.group_members m
  join public.profiles pr on pr.id = m.user_id
  left join public.activity_posts p
    on p.user_id = m.user_id
   and p.deleted_at is null
   and p.visibility = 'group'
   and p.group_id = p_group_id
   and p.activity_date between v_start and v_start + 6
  where m.group_id = p_group_id
  group by m.user_id, pr.display_name, pr.avatar_url
  order by pr.display_name;
end;
$$;

revoke all on function public.user_week_start(uuid)                  from public, anon;
revoke all on function public.get_period_summary(date, date)         from public, anon;
revoke all on function public.get_daily_totals(date, date)           from public, anon;
revoke all on function public.get_category_summary(date, date)       from public, anon;
revoke all on function public.get_current_streak(uuid)               from public, anon;
revoke all on function public.get_group_week_summary(uuid, date)     from public, anon;

grant execute on function public.user_week_start(uuid)              to authenticated;
grant execute on function public.get_period_summary(date, date)     to authenticated;
grant execute on function public.get_daily_totals(date, date)       to authenticated;
grant execute on function public.get_category_summary(date, date)   to authenticated;
grant execute on function public.get_current_streak(uuid)           to authenticated;
grant execute on function public.get_group_week_summary(uuid, date) to authenticated;
