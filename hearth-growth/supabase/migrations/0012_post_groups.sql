-- =============================================================================
-- Hearth Growth : 1つの記録を複数のグループへ公開できるようにする
-- =============================================================================
-- これまで公開先は activity_posts.group_id の1つだけだった。
-- 「勉強仲間にも家族にも見せたい」が表せないので、中間テーブルに移す。
--
-- selected 公開の宛先（post_allowed_users）と同じ形にそろえる。
-- 公開先が0件の group 公開は作れない（誰にも届かない記録になるため）。
--
-- 書き込みは RPC（定義者権限）だけに任せる。
-- 利用者に insert を許すと、自分の記録を勝手なグループへ結び付けられてしまう。
-- =============================================================================

create table public.post_groups (
  post_id  uuid not null references public.activity_posts (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  primary key (post_id, group_id)
);

create index post_groups_group_id_idx on public.post_groups (group_id);

-- 既存の公開先を移す
insert into public.post_groups (post_id, group_id)
select id, group_id
from public.activity_posts
where visibility = 'group' and group_id is not null
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.post_groups enable row level security;

-- 読めるのは、投稿者本人か、公開先のグループにいる人
create policy "post_groups_select_visible" on public.post_groups
  for select to authenticated
  using (public.is_post_owner(post_id) or public.is_group_member(group_id));

-- -----------------------------------------------------------------------------
-- 公開先が0件になったら「自分だけ」に戻す
-- -----------------------------------------------------------------------------
/*
 * グループが削除されると、この表の行も一緒に消える。
 * そのとき visibility だけ 'group' のまま残ると、
 * 「グループ公開のはずなのに誰にも届かない」状態になる。
 * 実態に合わせて「自分だけ」へ戻す。
 */
create or replace function public.normalize_post_visibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.activity_posts p
  set visibility = 'private'
  where p.id = old.post_id
    and p.visibility = 'group'
    and not exists (select 1 from public.post_groups g where g.post_id = p.id);

  return null;
end;
$$;

create trigger post_groups_normalize
  after delete on public.post_groups
  for each row execute function public.normalize_post_visibility();

-- -----------------------------------------------------------------------------
-- 閲覧判定を中間テーブル経由にする
-- -----------------------------------------------------------------------------
create or replace function public.can_view_post(p_post_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.activity_posts p
    where p.id = p_post_id
      and p.deleted_at is null
      and (
        p.user_id = p_user_id
        or (
          p.visibility = 'group'
          and exists (
            select 1 from public.post_groups g
            where g.post_id = p.id and public.is_group_member(g.group_id, p_user_id)
          )
        )
        or (
          p.visibility = 'selected'
          and exists (
            select 1 from public.post_allowed_users a
            where a.post_id = p.id and a.user_id = p_user_id
          )
        )
      )
  );
$$;

-- -----------------------------------------------------------------------------
-- 投稿本体から group_id を外す
-- -----------------------------------------------------------------------------
-- 公開先の整合（group 公開なら1件以上）は RPC 側で見る。
alter table public.activity_posts drop constraint posts_group_visibility_check;

drop policy "activity_posts_select_visible" on public.activity_posts;
drop policy "activity_posts_insert_own" on public.activity_posts;
drop policy "activity_posts_update_own" on public.activity_posts;

/*
 * 投稿者は無条件に許可してから deleted_at を見る。順序を入れ替えてはいけない。
 * 逆にすると、deleted_at を立てた行が自分の SELECT ポリシーを満たさなくなり、
 * 論理削除の UPDATE 自体が弾かれる（supabase/policies/README.md）。
 */
create policy "activity_posts_select_visible" on public.activity_posts
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      deleted_at is null
      and (
        (
          visibility = 'group'
          and exists (
            select 1 from public.post_groups g
            where g.post_id = id and public.is_group_member(g.group_id)
          )
        )
        or (
          visibility = 'selected'
          and exists (
            select 1 from public.post_allowed_users a
            where a.post_id = id and a.user_id = (select auth.uid())
          )
        )
      )
    )
  );

create policy "activity_posts_insert_own" on public.activity_posts
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "activity_posts_update_own" on public.activity_posts
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter table public.activity_posts drop column group_id;

-- -----------------------------------------------------------------------------
-- 公開範囲の検証と、記録の作成・更新
-- -----------------------------------------------------------------------------
-- 引数の型が変わるので、置き換えではなく作り直す（残すと多重定義になる）
drop function if exists public.assert_visibility_target(uuid, text, uuid, uuid[]);
drop function if exists public.create_activity_post(uuid, uuid, text, text, integer, date, text, uuid, uuid[]);
drop function if exists public.update_activity_post(uuid, text, text, integer, date, text, uuid, uuid[]);

create or replace function public.assert_visibility_target(
  p_user_id          uuid,
  p_visibility       text,
  p_group_ids        uuid[],
  p_allowed_user_ids uuid[]
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_target uuid;
begin
  if p_visibility = 'group' then
    if p_group_ids is null or array_length(p_group_ids, 1) is null then
      raise exception 'group required' using errcode = 'P0001';
    end if;
    if array_length(p_group_ids, 1) > 20 then
      raise exception 'too many groups' using errcode = 'P0001';
    end if;
    foreach v_target in array p_group_ids loop
      if not public.is_group_member(v_target, p_user_id) then
        raise exception 'not a group member' using errcode = '42501';
      end if;
    end loop;
  elsif p_group_ids is not null and array_length(p_group_ids, 1) is not null then
    raise exception 'group not allowed' using errcode = 'P0001';
  end if;

  if p_visibility = 'selected' then
    if p_allowed_user_ids is null or array_length(p_allowed_user_ids, 1) is null then
      raise exception 'no allowed users' using errcode = 'P0001';
    end if;
    -- 宛先に選べるのは、同じグループにいる相手だけ
    foreach v_target in array p_allowed_user_ids loop
      if v_target <> p_user_id and not public.shares_group_with(v_target, p_user_id) then
        raise exception 'user not reachable' using errcode = '42501';
      end if;
    end loop;
  end if;
end;
$$;

create or replace function public.create_activity_post(
  p_category_id      uuid    default null,
  p_session_id       uuid    default null,
  p_title            text    default null,
  p_body             text    default null,
  p_duration_seconds integer default null,
  p_activity_date    date    default null,
  p_visibility       text    default 'private',
  p_group_ids        uuid[]  default null,
  p_allowed_user_ids uuid[]  default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id     uuid := auth.uid();
  v_session     public.activity_sessions;
  v_category_id uuid := p_category_id;
  v_duration    integer := p_duration_seconds;
  v_date        date := p_activity_date;
  v_started_at  timestamptz;
  v_ended_at    timestamptz;
  v_post_id     uuid;
  v_target      uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_visibility not in ('private', 'group', 'selected') then
    raise exception 'invalid visibility' using errcode = 'P0001';
  end if;

  if p_session_id is not null then
    select * into v_session
    from public.activity_sessions
    where id = p_session_id and user_id = v_user_id and status = 'completed'
    for update;

    if not found then
      raise exception 'session not completed' using errcode = 'P0002';
    end if;

    if exists (select 1 from public.activity_posts where session_id = p_session_id) then
      raise exception 'session already posted' using errcode = 'P0001';
    end if;

    -- タイマー由来の値はクライアントから受け取らない
    v_category_id := v_session.category_id;
    v_duration    := coalesce(v_session.duration_seconds, 0);
    v_started_at  := v_session.started_at;
    v_ended_at    := v_session.ended_at;
    v_date        := (v_session.ended_at at time zone coalesce(
                       (select timezone from public.profiles where id = v_user_id), 'Asia/Tokyo'))::date;
  else
    if v_category_id is null then
      raise exception 'category required' using errcode = 'P0001';
    end if;
    if v_duration is null then
      raise exception 'duration required' using errcode = 'P0001';
    end if;
    v_date := coalesce(v_date, public.user_today(v_user_id));

    if v_date > public.user_today(v_user_id) then
      raise exception 'activity_date in the future' using errcode = 'P0001';
    end if;
  end if;

  -- 自分が使えるカテゴリーか
  if not exists (
    select 1 from public.categories c
    where c.id = v_category_id
      and (
        c.user_id = v_user_id
        or (c.group_id is not null and public.is_group_member(c.group_id, v_user_id))
      )
  ) then
    raise exception 'category not available' using errcode = 'P0002';
  end if;

  if v_duration < 0 or v_duration > 86400 then
    raise exception 'duration out of range' using errcode = 'P0001';
  end if;

  perform public.assert_visibility_target(v_user_id, p_visibility, p_group_ids, p_allowed_user_ids);

  insert into public.activity_posts (
    user_id, session_id, category_id, title, body,
    duration_seconds, activity_date, visibility, started_at, ended_at
  )
  values (
    v_user_id,
    p_session_id,
    v_category_id,
    nullif(trim(coalesce(p_title, '')), ''),
    nullif(trim(coalesce(p_body, '')), ''),
    v_duration,
    v_date,
    p_visibility,
    v_started_at,
    v_ended_at
  )
  returning id into v_post_id;

  if p_visibility = 'group' then
    foreach v_target in array p_group_ids loop
      insert into public.post_groups (post_id, group_id)
      values (v_post_id, v_target)
      on conflict do nothing;
    end loop;
  end if;

  if p_visibility = 'selected' then
    foreach v_target in array p_allowed_user_ids loop
      insert into public.post_allowed_users (post_id, user_id)
      values (v_post_id, v_target)
      on conflict do nothing;
    end loop;
  end if;

  return v_post_id;
end;
$$;

create or replace function public.update_activity_post(
  p_post_id          uuid,
  p_title            text    default null,
  p_body             text    default null,
  p_duration_seconds integer default null,
  p_activity_date    date    default null,
  p_visibility       text    default 'private',
  p_group_ids        uuid[]  default null,
  p_allowed_user_ids uuid[]  default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_post    public.activity_posts;
  v_target  uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_post
  from public.activity_posts
  where id = p_post_id and user_id = v_user_id and deleted_at is null
  for update;

  if not found then
    raise exception 'post not found' using errcode = 'P0002';
  end if;

  if p_visibility not in ('private', 'group', 'selected') then
    raise exception 'invalid visibility' using errcode = 'P0001';
  end if;

  perform public.assert_visibility_target(v_user_id, p_visibility, p_group_ids, p_allowed_user_ids);

  if v_post.session_id is null then
    if p_duration_seconds is not null and (p_duration_seconds < 0 or p_duration_seconds > 86400) then
      raise exception 'duration out of range' using errcode = 'P0001';
    end if;
    if p_activity_date is not null and p_activity_date > public.user_today(v_user_id) then
      raise exception 'activity_date in the future' using errcode = 'P0001';
    end if;
  end if;

  update public.activity_posts
  set
    title      = nullif(trim(coalesce(p_title, '')), ''),
    body       = nullif(trim(coalesce(p_body, '')), ''),
    visibility = p_visibility,
    -- タイマー由来の記録では時間と日付を据え置く
    duration_seconds = case
      when v_post.session_id is not null then v_post.duration_seconds
      else coalesce(p_duration_seconds, v_post.duration_seconds)
    end,
    activity_date = case
      when v_post.session_id is not null then v_post.activity_date
      else coalesce(p_activity_date, v_post.activity_date)
    end
  where id = p_post_id;

  -- 公開先と宛先は毎回入れ替える。
  -- 先に本体の visibility を更新してあるので、
  -- 0件になった瞬間に「自分だけ」へ戻す引き金は引かれない。
  delete from public.post_allowed_users where post_id = p_post_id;
  delete from public.post_groups where post_id = p_post_id;

  if p_visibility = 'group' then
    foreach v_target in array p_group_ids loop
      insert into public.post_groups (post_id, group_id)
      values (p_post_id, v_target)
      on conflict do nothing;
    end loop;
  end if;

  if p_visibility = 'selected' then
    foreach v_target in array p_allowed_user_ids loop
      insert into public.post_allowed_users (post_id, user_id)
      values (p_post_id, v_target)
      on conflict do nothing;
    end loop;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 「自分だけ」の記録をまとめて公開する
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- グループの集計も中間テーブル経由にする
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

-- -----------------------------------------------------------------------------
-- 実行権限
-- -----------------------------------------------------------------------------
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
