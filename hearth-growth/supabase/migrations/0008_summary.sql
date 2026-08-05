-- =============================================================================
-- Hearth Growth : 集計（15章）
-- =============================================================================
-- 集計をアプリ側でやると、全件を引いてから足すことになる。
-- 「今日」「今週」の境目もユーザーのタイムゾーン次第なので、まとめて DB に置く。
--
--   * 週の始まりは月曜日（Postgres の date_trunc('week') と同じ）
--   * 論理削除した記録は数えない
--   * 個人の集計は必ず auth.uid() の分だけを返す
-- =============================================================================

-- -----------------------------------------------------------------------------
-- user_week_start : そのユーザーのタイムゾーンでの「今週の月曜日」
-- -----------------------------------------------------------------------------
create or replace function public.user_week_start(p_user_id uuid default auth.uid())
returns date
language sql
stable
security definer
set search_path = public
as $$
  select date_trunc('week', public.user_today(p_user_id)::timestamp)::date;
$$;

-- -----------------------------------------------------------------------------
-- get_period_summary : 期間の合計（両端を含む）
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- get_daily_totals : 日ごとの合計（グラフ用）
--   記録が無い日は返らない。呼び出し側で 0 として扱う。
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- get_category_summary : カテゴリー別の合計（15.3）
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- get_current_streak : 連続記録日数（15.4）
--
--   1日1件以上の記録がある日を記録日とする。
--   今日まだ記録が無くても、昨日まで続いていれば途切れた扱いにしない。
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- get_group_week_summary : グループの今週（7.7, 15.5）
--
--   順位を競わせないため、返すのは活動時間と記録した日数だけ。
--   数えるのは「そのグループへ公開された記録」に限る。
--   非公開や別グループ向けの記録を、集計経由で漏らさないため。
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 実行権限
-- -----------------------------------------------------------------------------
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
