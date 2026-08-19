-- Hearth Growth セットアップ 5 / 11
-- 番号順に、Supabase の SQL Editor へ貼り付けて実行してください。
-- 元になっているのは supabase/migrations/ の各ファイルです。

grant execute on function public.cancel_session(uuid)                to authenticated;

create or replace function public.user_today(p_user_id uuid default auth.uid())
returns date
language sql
stable
security definer
set search_path = public
as $$
  select (now() at time zone coalesce(
    (select timezone from public.profiles where id = p_user_id),
    'Asia/Tokyo'
  ))::date;
$$;

revoke all on function public.user_today(uuid) from public, anon;
grant execute on function public.user_today(uuid) to authenticated;

create or replace function public.assert_visibility_target(
  p_user_id          uuid,
  p_visibility       text,
  p_group_id         uuid,
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
    if p_group_id is null then
      raise exception 'group required' using errcode = 'P0001';
    end if;
    if not public.is_group_member(p_group_id, p_user_id) then
      raise exception 'not a group member' using errcode = '42501';
    end if;
  elsif p_group_id is not null then
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

revoke all on function public.assert_visibility_target(uuid, text, uuid, uuid[]) from public, anon;

create or replace function public.create_activity_post(
  p_category_id      uuid    default null,
  p_session_id       uuid    default null,
  p_title            text    default null,
  p_body             text    default null,
  p_duration_seconds integer default null,
  p_activity_date    date    default null,
  p_visibility       text    default 'private',
  p_group_id         uuid    default null,
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

  perform public.assert_visibility_target(v_user_id, p_visibility, p_group_id, p_allowed_user_ids);

  insert into public.activity_posts (
    user_id, session_id, category_id, title, body,
    duration_seconds, activity_date, visibility, group_id, started_at, ended_at
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
    case when p_visibility = 'group' then p_group_id else null end,
    v_started_at,
    v_ended_at
  )
  returning id into v_post_id;

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
  p_group_id         uuid    default null,
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

  perform public.assert_visibility_target(v_user_id, p_visibility, p_group_id, p_allowed_user_ids);

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
    group_id   = case when p_visibility = 'group' then p_group_id else null end,
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

  -- 宛先は毎回入れ替える
  delete from public.post_allowed_users where post_id = p_post_id;

  if p_visibility = 'selected' then
    foreach v_target in array p_allowed_user_ids loop
      insert into public.post_allowed_users (post_id, user_id)
      values (p_post_id, v_target)
      on conflict do nothing;
    end loop;
  end if;
end;
$$;

create or replace function public.delete_activity_post(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  update public.activity_posts
  set deleted_at = now()
  where id = p_post_id and user_id = v_user_id and deleted_at is null;

  if not found then
    raise exception 'post not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.create_activity_post(uuid, uuid, text, text, integer, date, text, uuid, uuid[])
  from public, anon;
revoke all on function public.update_activity_post(uuid, text, text, integer, date, text, uuid, uuid[])
  from public, anon;
