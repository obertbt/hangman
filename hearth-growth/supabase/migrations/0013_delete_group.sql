-- =============================================================================
-- Hearth Growth : グループの削除
-- =============================================================================
-- 削除で消えてよいのは「グループという入れ物」だけ。
-- メンバーが積み上げてきた記録は、誰のものであっても消さない。
--
-- 0012 で公開先を post_groups に移したので、グループを消すと
-- 公開先の行だけが消え、記録本体は残る。公開先が0件になった記録は
-- post_groups_normalize が「自分だけ」へ戻す。
--
-- 残る問題が1つある。グループのカテゴリーだ。
--   * categories.group_id は on delete cascade（グループと一緒に消える）
--   * activity_posts.category_id は on delete restrict（使われていると消せない）
-- そのままグループを消すと、外部キー違反で失敗する。
-- 使われているカテゴリーは、記録の持ち主の個人カテゴリーへ移してから消す。
-- =============================================================================

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
