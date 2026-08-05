-- =============================================================================
-- テスト専用: Supabase が提供する部分の最小スタブ
-- =============================================================================
-- 素の PostgreSQL で RLS テストを動かすためだけのものです。
-- 本番・ステージングでは絶対に実行しないでください。
--
-- Supabase 環境では auth / storage スキーマも auth.uid() も既に存在するため、
-- このファイルは不要です（supabase/tests/README.md 参照）。
-- =============================================================================

create extension if not exists "pgcrypto";

create schema if not exists auth;
create schema if not exists storage;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  instance_id        uuid,
  aud                text,
  role               text,
  email              text,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_app_meta_data  jsonb,
  raw_user_meta_data jsonb,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  id        uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name      text
);
alter table storage.objects enable row level security;

create or replace function storage.foldername(name text)
returns text[] language sql immutable as $$
  select string_to_array(name, '/');
$$;

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
end;
$$;

grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
