-- =============================================================
-- テスト専用: Supabase が提供する部分の最小スタブ
--
-- 素の PostgreSQL で migration と RLS テストを動かすためだけのもの。
-- 本番・ステージングでは絶対に実行しない。
-- Supabase 環境では auth スキーマも auth.uid() も既に存在する。
-- =============================================================

create extension if not exists "pgcrypto";

create schema if not exists auth;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

-- テスト中に「今どのユーザーとして操作しているか」を切り替えられるようにする。
-- 本物の Supabase では JWT から取得される。
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role bypassrls;
  end if;
end;
$$;

grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
