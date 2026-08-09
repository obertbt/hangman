-- Hearth Growth : 0002_rls_policies.sql だけを実行する（2 / 2）
-- すでに動いている環境へ、この変更ぶんだけを足すためのファイルです。
-- まっさらな状態から作る場合は supabase/setup/ の 01 から順に実行してください。

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
