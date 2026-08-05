-- Hearth Growth セットアップ 3 / 6
-- 番号順に、Supabase の SQL Editor へ貼り付けて実行してください。
-- 元になっているのは supabase/migrations/ の各ファイルです。

create policy "group_invitations_update_admin" on public.group_invitations
  for update to authenticated
  using (public.is_group_admin(group_id))
  with check (public.is_group_admin(group_id));

create policy "group_invitations_delete_admin" on public.group_invitations
  for delete to authenticated
  using (public.is_group_admin(group_id));

create policy "categories_select_own_or_group" on public.categories
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (group_id is not null and public.is_group_member(group_id))
  );

create policy "categories_insert_own_or_group_admin" on public.categories
  for insert to authenticated
  with check (
    (user_id = (select auth.uid()) and group_id is null)
    or (group_id is not null and user_id is null and public.is_group_admin(group_id))
  );

create policy "categories_update_own_or_group_admin" on public.categories
  for update to authenticated
  using (
    user_id = (select auth.uid())
    or (group_id is not null and public.is_group_admin(group_id))
  )
  with check (
    user_id = (select auth.uid())
    or (group_id is not null and public.is_group_admin(group_id))
  );

create policy "categories_delete_own_or_group_admin" on public.categories
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    or (group_id is not null and public.is_group_admin(group_id))
  );

create policy "activity_sessions_select_own" on public.activity_sessions
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "activity_sessions_insert_own" on public.activity_sessions
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "activity_sessions_update_own" on public.activity_sessions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "activity_sessions_delete_own" on public.activity_sessions
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "activity_posts_select_visible" on public.activity_posts
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      deleted_at is null
      and (
        (visibility = 'group' and public.is_group_member(group_id))
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
  with check (
    user_id = (select auth.uid())
    and (visibility <> 'group' or public.is_group_member(group_id))
  );

create policy "activity_posts_update_own" on public.activity_posts
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (visibility <> 'group' or public.is_group_member(group_id))
  );

create policy "activity_posts_delete_own" on public.activity_posts
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "post_allowed_users_select_owner_or_self" on public.post_allowed_users
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_post_owner(post_id));

create policy "post_allowed_users_insert_owner" on public.post_allowed_users
  for insert to authenticated
  with check (public.is_post_owner(post_id));

create policy "post_allowed_users_delete_owner" on public.post_allowed_users
  for delete to authenticated
  using (public.is_post_owner(post_id));

create policy "reactions_select_visible_post" on public.reactions
  for select to authenticated
  using (public.can_view_post(post_id));

create policy "reactions_insert_own" on public.reactions
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_view_post(post_id));

create policy "reactions_update_own" on public.reactions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.can_view_post(post_id));

create policy "reactions_delete_own" on public.reactions
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "comments_select_visible_post" on public.comments
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      deleted_at is null
      and public.can_view_post(post_id)
      and (not is_hidden or public.is_post_owner(post_id))
    )
  );

create policy "comments_insert_own" on public.comments
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_view_post(post_id));

create policy "comments_update_own" on public.comments
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "comments_delete_own_or_post_owner" on public.comments
  for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_post_owner(post_id));

create policy "daily_goals_all_own" on public.daily_goals
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "weekly_goals_all_own" on public.weekly_goals
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create or replace function public.create_group(p_name text, p_description text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id  uuid := auth.uid();
  v_group_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  insert into public.groups (name, description, owner_id)
  values (trim(p_name), nullif(trim(coalesce(p_description, '')), ''), v_user_id)
  returning id into v_group_id;

  insert into public.group_members (group_id, user_id, role)
  values (v_group_id, v_user_id, 'owner');

  return v_group_id;
end;
$$;

create or replace function public.get_invitation_preview(p_token text)
returns table (
  group_id     uuid,
  group_name   text,
  inviter_name text,
  member_count integer,
  is_valid     boolean,
  reason       text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv record;
begin
  select i.*, g.name as group_name, p.display_name as inviter_name
    into v_inv
  from public.group_invitations i
  join public.groups g   on g.id = i.group_id
  join public.profiles p on p.id = i.invited_by
  where i.token = p_token;

  if not found then
    return query select null::uuid, null::text, null::text, 0, false, 'not_found'::text;
    return;
  end if;

  return query
  select
    v_inv.group_id,
    v_inv.group_name,
    v_inv.inviter_name,
    (select count(*)::integer from public.group_members m where m.group_id = v_inv.group_id),
    case
      when v_inv.revoked_at is not null then false
      when v_inv.expires_at <= now() then false
      when v_inv.used_count >= v_inv.max_uses then false
      else true
    end,
    case
      when v_inv.revoked_at is not null then 'revoked'
      when v_inv.expires_at <= now() then 'expired'
      when v_inv.used_count >= v_inv.max_uses then 'exhausted'
      else 'ok'
    end;
end;
$$;

create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_inv     public.group_invitations;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- 同じトークンへの同時アクセスを直列化する
  select * into v_inv
  from public.group_invitations
  where token = p_token
  for update;

  if not found then
    raise exception 'invitation not found' using errcode = 'P0002';
  end if;

  if v_inv.revoked_at is not null then
    raise exception 'invitation revoked' using errcode = 'P0001';
  end if;

  if v_inv.expires_at <= now() then
    raise exception 'invitation expired' using errcode = 'P0001';
  end if;

  if v_inv.used_count >= v_inv.max_uses then
    raise exception 'invitation exhausted' using errcode = 'P0001';
  end if;

  -- 参加済みなら used_count を消費せずそのまま返す
  if exists (
    select 1 from public.group_members
    where group_id = v_inv.group_id and user_id = v_user_id
  ) then
    return v_inv.group_id;
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (v_inv.group_id, v_user_id, 'member');

  update public.group_invitations
  set used_count = used_count + 1
  where id = v_inv.id;

  return v_inv.group_id;
end;
$$;

create or replace function public.get_active_group_members()
returns table (
  user_id              uuid,
  display_name         text,
  avatar_url           text,
  category_name        text,
  category_icon        text,
  category_color       text,
  status               text,
  started_at           timestamptz,
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
    s.total_paused_seconds
  from public.activity_sessions s
  join public.profiles p   on p.id = s.user_id
  join public.categories c on c.id = s.category_id
  where s.status in ('running', 'paused')
    and (s.user_id = auth.uid() or public.shares_group_with(s.user_id, auth.uid()))
  order by s.started_at asc;
$$;
