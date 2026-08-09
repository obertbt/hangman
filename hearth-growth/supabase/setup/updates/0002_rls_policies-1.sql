-- Hearth Growth : 0002_rls_policies.sql だけを実行する（1 / 2）
-- すでに動いている環境へ、この変更ぶんだけを足すためのファイルです。
-- まっさらな状態から作る場合は supabase/setup/ の 01 から順に実行してください。

create or replace function public.is_group_member(p_group_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = p_user_id
  );
$$;

create or replace function public.is_group_admin(p_group_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id
      and user_id = p_user_id
      and role in ('owner', 'admin')
  );
$$;

create or replace function public.shares_group_with(p_user_id uuid, p_viewer_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members viewer
    join public.group_members target on target.group_id = viewer.group_id
    where viewer.user_id = p_viewer_id and target.user_id = p_user_id
  );
$$;

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
        or (p.visibility = 'group' and public.is_group_member(p.group_id, p_user_id))
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

create or replace function public.is_post_owner(p_post_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.activity_posts
    where id = p_post_id and user_id = p_user_id
  );
$$;

revoke all on function public.is_group_member(uuid, uuid)   from public, anon;
revoke all on function public.is_group_admin(uuid, uuid)    from public, anon;
revoke all on function public.shares_group_with(uuid, uuid) from public, anon;
revoke all on function public.can_view_post(uuid, uuid)     from public, anon;
revoke all on function public.is_post_owner(uuid, uuid)     from public, anon;
grant execute on function public.is_group_member(uuid, uuid)   to authenticated;
grant execute on function public.is_group_admin(uuid, uuid)    to authenticated;
grant execute on function public.shares_group_with(uuid, uuid) to authenticated;
grant execute on function public.can_view_post(uuid, uuid)     to authenticated;
grant execute on function public.is_post_owner(uuid, uuid)     to authenticated;

alter table public.profiles           enable row level security;
alter table public.groups             enable row level security;
alter table public.group_members      enable row level security;
alter table public.group_invitations  enable row level security;
alter table public.categories         enable row level security;
alter table public.activity_sessions  enable row level security;
alter table public.activity_posts     enable row level security;
alter table public.post_allowed_users enable row level security;
alter table public.reactions          enable row level security;
alter table public.comments           enable row level security;
alter table public.daily_goals        enable row level security;
alter table public.weekly_goals       enable row level security;

create policy "profiles_select_self_or_group_peer" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.shares_group_with(id));

create policy "profiles_insert_self" on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

create policy "profiles_update_self" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "groups_select_member" on public.groups
  for select to authenticated
  using (public.is_group_member(id));

create policy "groups_insert_owner_is_self" on public.groups
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "groups_update_admin" on public.groups
  for update to authenticated
  using (public.is_group_admin(id))
  with check (public.is_group_admin(id));

create policy "groups_delete_owner" on public.groups
  for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy "group_members_select_member" on public.group_members
  for select to authenticated
  using (public.is_group_member(group_id));

create policy "group_members_insert_group_owner_self" on public.group_members
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.groups g
      where g.id = group_id and g.owner_id = (select auth.uid())
    )
  );

create policy "group_members_update_admin" on public.group_members
  for update to authenticated
  using (public.is_group_admin(group_id) and role <> 'owner')
  with check (public.is_group_admin(group_id) and role <> 'owner');

create policy "group_members_delete_self_or_admin" on public.group_members
  for delete to authenticated
  using (
    role <> 'owner'
    and (user_id = (select auth.uid()) or public.is_group_admin(group_id))
  );

create policy "group_invitations_select_admin" on public.group_invitations
  for select to authenticated
  using (public.is_group_admin(group_id));

create policy "group_invitations_insert_admin" on public.group_invitations
  for insert to authenticated
  with check (public.is_group_admin(group_id) and invited_by = (select auth.uid()));

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
