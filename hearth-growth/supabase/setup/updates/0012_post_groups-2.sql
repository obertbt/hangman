-- Hearth Growth : 0012_post_groups.sql だけを実行する（2 / 2）
-- すでに動いている環境へ、この変更ぶんだけを足すためのファイルです。
-- まっさらな状態から作る場合は supabase/setup/ の 01 から順に実行してください。

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
