-- Hearth Growth セットアップ 9 / 11
-- 番号順に、Supabase の SQL Editor へ貼り付けて実行してください。
-- 元になっているのは supabase/migrations/ の各ファイルです。

/*
 * 本体と公開先の2か所を触るので、まとめて1つの手続きにする。
 * 画面から2回に分けて呼ぶと、途中で失敗したときに
 * 「group 公開なのに公開先が無い」記録が残る。
 */
create or replace function public.share_private_posts(p_group_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_ids     uuid[];
  v_group   uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  perform public.assert_visibility_target(v_user_id, 'group', p_group_ids, null);

  select array_agg(id) into v_ids
  from public.activity_posts
  where user_id = v_user_id and visibility = 'private' and deleted_at is null;

  if v_ids is null then
    return 0;
  end if;

  update public.activity_posts
  set visibility = 'group'
  where id = any (v_ids);

  foreach v_group in array p_group_ids loop
    insert into public.post_groups (post_id, group_id)
    select unnest(v_ids), v_group
    on conflict do nothing;
  end loop;

  return array_length(v_ids, 1);
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
  where m.group_id = p_group_id
  group by m.user_id, pr.display_name, pr.avatar_url
  order by pr.display_name;
end;
$$;

revoke all on function public.assert_visibility_target(uuid, text, uuid[], uuid[]) from public, anon;
revoke all on function public.create_activity_post(uuid, uuid, text, text, integer, date, text, uuid[], uuid[])
  from public, anon;
revoke all on function public.update_activity_post(uuid, text, text, integer, date, text, uuid[], uuid[])
  from public, anon;
revoke all on function public.share_private_posts(uuid[]) from public, anon;

grant execute on function public.assert_visibility_target(uuid, text, uuid[], uuid[]) to authenticated;
grant execute on function public.create_activity_post(uuid, uuid, text, text, integer, date, text, uuid[], uuid[])
  to authenticated;
grant execute on function public.update_activity_post(uuid, text, text, integer, date, text, uuid[], uuid[])
  to authenticated;
grant execute on function public.share_private_posts(uuid[]) to authenticated;

create or replace function public.delete_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_owner   uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select owner_id into v_owner from public.groups where id = p_group_id for update;

  if not found then
    raise exception 'group not found' using errcode = 'P0002';
  end if;

  -- 消せるのは作成者だけ（管理者でも消せない）
  if v_owner <> v_user_id then
    raise exception 'not the group owner' using errcode = '42501';
  end if;

  /*
   * グループのカテゴリーを使っている記録を、持ち主の個人カテゴリーへ移す。
   *
   * 同じ名前の個人カテゴリーがあればそこへ、無ければ作る。
   * 「その他」へ丸めると何の記録だったか分からなくなるため、名前を引き継ぐ。
   */
  insert into public.categories (user_id, name, icon, color, sort_order)
  select distinct p.user_id, c.name, c.icon, c.color, c.sort_order
  from public.activity_posts p
  join public.categories c on c.id = p.category_id
  where c.group_id = p_group_id
  on conflict (user_id, name) where user_id is not null do nothing;

  update public.activity_posts p
  set category_id = mine.id
  from public.categories c
  join public.categories mine on mine.name = c.name
  where p.category_id = c.id
    and c.group_id = p_group_id
    and mine.user_id = p.user_id;

  -- 走っているタイマーも同じように移す
  update public.activity_sessions s
  set category_id = mine.id
  from public.categories c
  join public.categories mine on mine.name = c.name
  where s.category_id = c.id
    and c.group_id = p_group_id
    and mine.user_id = s.user_id;

  -- ここまで来れば、あとはカスケードで片付く
  --   group_members / group_invitations / categories / post_groups
  -- 記録本体は post_groups だけが消え、公開先が無くなれば「自分だけ」に戻る。
  delete from public.groups where id = p_group_id;
end;
$$;

revoke all on function public.delete_group(uuid) from public, anon;
grant execute on function public.delete_group(uuid) to authenticated;

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
