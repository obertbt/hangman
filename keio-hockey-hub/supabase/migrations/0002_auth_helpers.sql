-- =============================================================
-- 0002_auth_helpers.sql
-- RLS から呼ぶ補助関数。
--
-- 重要:
--   これらは security definer にする。
--   team_members のポリシーの中で team_members を読むと無限再帰になるため、
--   RLS を迂回できる関数側で判定する。
--   search_path を固定して、呼び出し側のスキーマ差し替えを防ぐ。
-- =============================================================

-- ログイン中のユーザーに対応する profiles.id
create or replace function app.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id
  from public.profiles p
  where p.user_id = auth.uid()
    and p.deleted_at is null
  limit 1;
$$;

-- 指定チームでの在籍中の所属（1行）
create or replace function app.current_membership(p_team_id uuid)
returns public.team_members
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select tm.*
  from public.team_members tm
  where tm.team_id = p_team_id
    and tm.profile_id = app.current_profile_id()
    and tm.status = 'active'
    and tm.deleted_at is null
  limit 1;
$$;

-- 在籍中のチームかどうか
create or replace function app.is_team_member(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.team_members tm
    where tm.team_id = p_team_id
      and tm.profile_id = app.current_profile_id()
      and tm.status = 'active'
      and tm.deleted_at is null
  );
$$;

-- 指定チームでの役割コード
create or replace function app.role_in_team(p_team_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select tm.role_code
  from public.team_members tm
  where tm.team_id = p_team_id
    and tm.profile_id = app.current_profile_id()
    and tm.status = 'active'
    and tm.deleted_at is null
  limit 1;
$$;

-- system_admin かどうか（どこかのチームで system_admin なら真）
create or replace function app.is_system_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.team_members tm
    where tm.profile_id = app.current_profile_id()
      and tm.role_code = 'system_admin'
      and tm.status = 'active'
      and tm.deleted_at is null
  );
$$;

-- 指導側（コーチ・マネージャー・管理者）かどうか
create or replace function app.is_staff(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app.role_in_team(p_team_id) in ('system_admin', 'coach', 'manager');
$$;

-- -------------------------------------------------------------
-- 権限判定（13章）
--   1. member_permissions に明示があれば、それが最優先（granted=false は剥奪）
--   2. 無ければ role_permissions
-- -------------------------------------------------------------
create or replace function app.has_permission(p_team_id uuid, p_permission text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_member    public.team_members;
  v_override  boolean;
begin
  select * into v_member from app.current_membership(p_team_id);
  if v_member.id is null then
    return false;
  end if;

  select mp.granted into v_override
  from public.member_permissions mp
  where mp.team_member_id = v_member.id
    and mp.permission_code = p_permission;

  if found then
    return v_override;
  end if;

  return exists (
    select 1
    from public.role_permissions rp
    where rp.role_code = v_member.role_code
      and rp.permission_code = p_permission
  );
end;
$$;

-- 自分自身の team_member 行かどうか（日報などの所有者判定に使う）
create or replace function app.owns_membership(p_team_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.team_members tm
    where tm.id = p_team_member_id
      and tm.profile_id = app.current_profile_id()
  );
$$;

-- anon には実行させない
revoke all on function app.current_profile_id() from public;
revoke all on function app.current_membership(uuid) from public;
revoke all on function app.is_team_member(uuid) from public;
revoke all on function app.role_in_team(uuid) from public;
revoke all on function app.is_system_admin() from public;
revoke all on function app.is_staff(uuid) from public;
revoke all on function app.has_permission(uuid, text) from public;
revoke all on function app.owns_membership(uuid) from public;

grant usage on schema app to authenticated;
grant execute on function app.current_profile_id() to authenticated;
grant execute on function app.current_membership(uuid) to authenticated;
grant execute on function app.is_team_member(uuid) to authenticated;
grant execute on function app.role_in_team(uuid) to authenticated;
grant execute on function app.is_system_admin() to authenticated;
grant execute on function app.is_staff(uuid) to authenticated;
grant execute on function app.has_permission(uuid, text) to authenticated;
grant execute on function app.owns_membership(uuid) to authenticated;
