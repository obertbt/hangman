-- Hearth Growth : 0014_sleep.sql だけを実行する（1 / 2）
-- すでに動いている環境へ、この変更ぶんだけを足すためのファイルです。
-- まっさらな状態から作る場合は supabase/setup/ の 01 から順に実行してください。

alter table public.categories
  add column if not exists counts_toward_total boolean not null default true;

comment on column public.categories.counts_toward_total is
  '活動時間の合計に数えるか。睡眠のように、記録はしたいが努力量ではないものを false にする。';

create or replace function public.create_default_categories(p_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.categories (user_id, name, icon, color, sort_order, counts_toward_total)
  values
    (p_user_id, '勉強',     '📚', '#6B8E9F', 10, true),
    (p_user_id, '仕事',     '💼', '#7D7C84', 20, true),
    (p_user_id, '読書',     '📖', '#9C8455', 30, true),
    (p_user_id, '運動',     '🏃', '#7FA37F', 40, true),
    (p_user_id, 'ホッケー', '🏒', '#5F7FA3', 50, true),
    (p_user_id, '個人開発', '💻', '#8B7BA8', 60, true),
    (p_user_id, '趣味',     '🎨', '#B08968', 70, true),
    (p_user_id, '家事',     '🏠', '#A3907F', 80, true),
    (p_user_id, 'その他',   '📝', '#8B8B8B', 90, true),
    -- 集計には数えない。詳しくは 0014 の冒頭。
    (p_user_id, '睡眠',     '😴', '#7A7F9A', 95, false)
  on conflict (user_id, name) where user_id is not null do nothing;
$$;

insert into public.categories (user_id, name, icon, color, sort_order, counts_toward_total)
select id, '睡眠', '😴', '#7A7F9A', 95, false
from public.profiles
on conflict (user_id, name) where user_id is not null do nothing;

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
  join public.categories c on c.id = p.category_id
  where p.user_id = auth.uid()
    and p.deleted_at is null
    and c.counts_toward_total
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
  join public.categories c on c.id = p.category_id
  where p.user_id = auth.uid()
    and p.deleted_at is null
    and c.counts_toward_total
    and p.activity_date between p_from and p_to
  group by p.activity_date
  order by p.activity_date;
$$;

create or replace function public.get_category_summary(p_from date, p_to date)
returns table (
  category_id   uuid,
  category_name text,
  category_icon text,
  category_color text,
  total_seconds bigint,
  post_count    integer
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
    and c.counts_toward_total
    and p.activity_date between p_from and p_to
  group by c.id, c.name, c.icon, c.color
  order by 5 desc;
$$;

/*
 * 連続記録も睡眠では伸びない。
 * 寝ただけで「続いている」ことにすると、この数字の意味が無くなる。
 */
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
      select 1 from public.activity_posts p join public.categories c on c.id = p.category_id
      where p.user_id = p_user_id and p.deleted_at is null and c.counts_toward_total
        and p.activity_date = v_today
    ) then v_today
    when exists (
      select 1 from public.activity_posts p join public.categories c on c.id = p.category_id
      where p.user_id = p_user_id and p.deleted_at is null and c.counts_toward_total
        and p.activity_date = v_today - 1
    ) then v_today - 1
    else null
  end into v_anchor;

  if v_anchor is null then
    return 0;
  end if;

  -- 起点から1日ずつ遡り、途切れた時点で止める
  with days as (
    select distinct p.activity_date as day
    from public.activity_posts p
    join public.categories c on c.id = p.category_id
    where p.user_id = p_user_id and p.deleted_at is null and c.counts_toward_total
      and p.activity_date <= v_anchor
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
   and p.activity_date between v_start and v_start + 6
   and exists (
     select 1 from public.post_groups g
     where g.post_id = p.id and g.group_id = p_group_id
   )
   and exists (
     select 1 from public.categories c
     where c.id = p.category_id and c.counts_toward_total
   )
  where m.group_id = p_group_id
  group by m.user_id, pr.display_name, pr.avatar_url
  order by pr.display_name;
end;
$$;

/*
 * 就寝はタイマーの開始、起床はタイマーの終了と記録の作成にあたる。
 * 仕組みを増やさず、既にあるタイマーへ寄せる。
 * こうすると「今の睡眠時間」も途中で分かるし、
 * 端末の時計ではなくサーバーの時刻で測られる。
 *
 * 押す回数は1回ずつ。振り返りの入力は挟まない。
 * 眠いときと寝起きに文章を書かせない。
 */
create or replace function public.start_sleep()
returns public.activity_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id     uuid := auth.uid();
  v_category_id uuid;
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

  return public.start_session(v_category_id, null, null);
end;
$$;

/*
 * 起床。走っている睡眠のタイマーを終わらせ、そのまま記録にする。
 *
 * 公開範囲は、その人の既定（設定画面で選んだもの）に合わせる。
 * group を既定にしていて、どのグループにも入っていない場合は「自分だけ」。
 */
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

  select default_visibility into v_visibility from public.profiles where id = v_user_id;

  if v_visibility = 'group' then
    select array_agg(group_id) into v_group_ids
    from public.group_members where user_id = v_user_id;

    -- どこにも入っていなければ、公開しようがない
    if v_group_ids is null then
      v_visibility := 'private';
    end if;
  elsif v_visibility = 'selected' then
    -- 宛先を選ばせない導線なので、既定が selected でも「自分だけ」にする
    v_visibility := 'private';
  end if;

  return public.create_activity_post(
    p_session_id => v_session_id,
    p_visibility => v_visibility,
    p_group_ids  => v_group_ids
  );
end;
$$;
