-- Hearth Growth : 0012_post_groups.sql だけを実行する（1 / 2）
-- すでに動いている環境へ、この変更ぶんだけを足すためのファイルです。
-- まっさらな状態から作る場合は supabase/setup/ の 01 から順に実行してください。

create table public.post_groups (
  post_id  uuid not null references public.activity_posts (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  primary key (post_id, group_id)
);

create index post_groups_group_id_idx on public.post_groups (group_id);

insert into public.post_groups (post_id, group_id)
select id, group_id
from public.activity_posts
where visibility = 'group' and group_id is not null
on conflict do nothing;

alter table public.post_groups enable row level security;

create policy "post_groups_select_visible" on public.post_groups
  for select to authenticated
  using (public.is_post_owner(post_id) or public.is_group_member(group_id));

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
