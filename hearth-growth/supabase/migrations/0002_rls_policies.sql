-- =============================================================================
-- Hearth Growth : Row Level Security
-- =============================================================================
-- 原則
--   * すべての公開テーブルで RLS を有効化する（12.3）。
--   * 公開範囲の判定はフロントエンドに依存せず、必ずここで保証する（9章）。
--   * group_members を参照するポリシーは再帰を起こすため、
--     SECURITY DEFINER 関数を経由して判定する。
--   * SECURITY DEFINER 関数は search_path を固定し、実行権限を authenticated に限定する。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 判定用ヘルパー関数
-- -----------------------------------------------------------------------------

-- 指定グループのメンバーか
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

-- 指定グループの管理者（owner / admin）か
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

-- 自分と相手が同じグループに所属しているか
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

-- 投稿を閲覧できるか（private / group / selected の判定を1か所に集約する）
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

-- 投稿の所有者か
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

-- -----------------------------------------------------------------------------
-- RLS 有効化
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- profiles
--   閲覧: 自分 + 同じグループのメンバーのみ（グループ外へは一切返さない）
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- groups
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- group_members
--   参加は招待経由（accept_invitation）に限定する。
--   直接 insert できるのは「グループ作成者が自分を owner として登録する」場合のみ。
-- -----------------------------------------------------------------------------
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

-- 権限変更は管理者のみ。owner 行は変更させない。
create policy "group_members_update_admin" on public.group_members
  for update to authenticated
  using (public.is_group_admin(group_id) and role <> 'owner')
  with check (public.is_group_admin(group_id) and role <> 'owner');

-- 退会（自分）または管理者による削除。owner は削除できない。
create policy "group_members_delete_self_or_admin" on public.group_members
  for delete to authenticated
  using (
    role <> 'owner'
    and (user_id = (select auth.uid()) or public.is_group_admin(group_id))
  );

-- -----------------------------------------------------------------------------
-- group_invitations
--   トークンからの参照は accept_invitation / get_invitation_preview 経由に限る。
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- categories
--   個人カテゴリー: 本人のみ / グループカテゴリー: メンバーは閲覧、管理者が編集
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- activity_sessions
--   本人のみ。「今活動している人」は get_active_group_members() で
--   必要な列だけを返す（タイトルやメモを他人に晒さないため）。
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- activity_posts
-- -----------------------------------------------------------------------------
-- 投稿者は自分の投稿を常に読める（論理削除したものも含む）。
-- ここで `deleted_at is null` を投稿者にも掛けると、deleted_at を立てた瞬間に
-- 新しい行が SELECT ポリシーを満たさなくなり、論理削除の UPDATE 自体が
-- 「new row violates row-level security policy」で失敗する。
-- 他人からは、論理削除した投稿は見えない。
-- 一覧を出す側は `deleted_at is null` で絞ること。
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

-- group 公開は「自分が所属するグループ」にしか出せない
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

-- -----------------------------------------------------------------------------
-- post_allowed_users
-- -----------------------------------------------------------------------------
create policy "post_allowed_users_select_owner_or_self" on public.post_allowed_users
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_post_owner(post_id));

create policy "post_allowed_users_insert_owner" on public.post_allowed_users
  for insert to authenticated
  with check (public.is_post_owner(post_id));

create policy "post_allowed_users_delete_owner" on public.post_allowed_users
  for delete to authenticated
  using (public.is_post_owner(post_id));

-- -----------------------------------------------------------------------------
-- reactions : 元投稿の閲覧権限に従う
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- comments : 元投稿の閲覧権限に従う
--   非表示コメントは、コメント本人と投稿者にだけ見える。
--   投稿者による非表示化は set_comment_hidden() で行う（本文は変更できない）。
-- -----------------------------------------------------------------------------
-- コメントも同じ理由で、本人には常に見えるようにしておく
-- （そうしないと本人が deleted_at を立てられない）。
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

-- -----------------------------------------------------------------------------
-- daily_goals / weekly_goals : 本人のみ
-- -----------------------------------------------------------------------------
create policy "daily_goals_all_own" on public.daily_goals
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "weekly_goals_all_own" on public.weekly_goals
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
