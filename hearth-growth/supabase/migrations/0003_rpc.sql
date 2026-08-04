-- =============================================================================
-- Hearth Growth : RLS だけでは表現できない操作のための RPC
-- =============================================================================
-- ここに置くのは「行単位の許可では足りず、手続きとして原子的に実行したい処理」だけ。
-- すべて SECURITY DEFINER のため、関数内で必ず auth.uid() を検証する。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- create_group : グループ作成と owner メンバー登録を1トランザクションで行う
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- get_invitation_preview : 招待リンクを開いたときに見せる最小限の情報
--   トークンを知っている人にだけ、グループ名と招待者名を返す。
--   メンバー一覧や投稿は一切返さない。
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- accept_invitation : 招待トークンでグループに参加する
--   有効期限・失効・利用上限を関数内で検証し、used_count を原子的に加算する。
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- get_active_group_members : 「今、頑張っている人」
--   activity_sessions 自体は本人しか select できない。
--   ここでホーム画面に必要な列だけを、同じグループの相手に限って返す。
--   title / note は返さない（本人の意図しない共有を避けるため）。
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- set_comment_hidden : 投稿者が自分の投稿へのコメントを非表示にする（10.2）
--   本文の書き換えはできない。
-- -----------------------------------------------------------------------------
create or replace function public.set_comment_hidden(p_comment_id uuid, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_post_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select post_id into v_post_id from public.comments where id = p_comment_id;

  if not found then
    raise exception 'comment not found' using errcode = 'P0002';
  end if;

  if not public.is_post_owner(v_post_id, v_user_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  update public.comments set is_hidden = p_hidden where id = p_comment_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 実行権限
-- -----------------------------------------------------------------------------
revoke all on function public.create_group(text, text)              from public, anon;
revoke all on function public.accept_invitation(text)               from public, anon;
revoke all on function public.get_active_group_members()            from public, anon;
revoke all on function public.set_comment_hidden(uuid, boolean)     from public, anon;
revoke all on function public.get_invitation_preview(text)          from public;

grant execute on function public.create_group(text, text)          to authenticated;
grant execute on function public.accept_invitation(text)           to authenticated;
grant execute on function public.get_active_group_members()        to authenticated;
grant execute on function public.set_comment_hidden(uuid, boolean) to authenticated;
-- 招待リンクはログイン前にも内容を確認できるようにする
grant execute on function public.get_invitation_preview(text)      to anon, authenticated;
