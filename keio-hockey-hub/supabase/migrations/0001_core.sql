-- =============================================================
-- 0001_core.sql
-- チーム / プロフィール / 所属 / ロール / 権限 / 設定 / 監査ログ
--
-- 設計上の要点:
--   * profiles.id は auth.users.id と一致させない。
--     過去データ移行（Phase 2）では、まだログインしていない選手を
--     先に登録する必要があるため、user_id を後から結び付ける。
--     → docs/decisions/0002-profile-identity.md
--   * 権限は role だけに依存させない（13章）。
--     role_permissions（役割の既定）＋ member_permissions（個別の上書き）。
-- =============================================================

create extension if not exists "pgcrypto";

-- 補助関数を置くスキーマ。RLS から呼ぶため public とは分ける。
create schema if not exists app;

-- -------------------------------------------------------------
-- 共通トリガ: updated_at
-- -------------------------------------------------------------
create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -------------------------------------------------------------
-- teams
-- -------------------------------------------------------------
create table if not exists public.teams (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  display_name  text not null,
  slug          text not null unique,
  description   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create trigger teams_set_updated_at
  before update on public.teams
  for each row execute function app.set_updated_at();

-- -------------------------------------------------------------
-- profiles
--   user_id が null の行 = 移行で作られただけで、まだログインしていない選手
-- -------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid unique references auth.users(id) on delete set null,
  full_name     text not null,
  display_name  text,
  furigana      text,
  email         text,
  avatar_url    text,
  bio           text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

-- メールは「あれば一意」。移行時にメール未記入の選手が複数いても弾かれないようにする。
create unique index if not exists profiles_email_unique
  on public.profiles (lower(email))
  where email is not null and deleted_at is null;

create index if not exists profiles_full_name_idx on public.profiles (full_name);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function app.set_updated_at();

-- -------------------------------------------------------------
-- roles / permissions
-- -------------------------------------------------------------
create table if not exists public.roles (
  code         text primary key,
  label_ja     text not null,
  description  text,
  sort_order   int not null default 0
);

create table if not exists public.permissions (
  code         text primary key,
  label_ja     text not null,
  description  text
);

create table if not exists public.role_permissions (
  role_code        text not null references public.roles(code) on delete cascade,
  permission_code  text not null references public.permissions(code) on delete cascade,
  primary key (role_code, permission_code)
);

-- -------------------------------------------------------------
-- team_members
--   チーム内での役割・在籍状態・選手情報はここに持つ。
-- -------------------------------------------------------------
create table if not exists public.team_members (
  id               uuid primary key default gen_random_uuid(),
  team_id          uuid not null references public.teams(id) on delete cascade,
  profile_id       uuid not null references public.profiles(id) on delete cascade,
  role_code        text not null references public.roles(code),
  status           text not null default 'active'
                     check (status in ('active', 'inactive', 'graduated', 'leave')),
  position         text check (position in ('GK', 'DF', 'MF', 'FW', 'STAFF')),
  sub_position     text check (sub_position in ('GK', 'DF', 'MF', 'FW', 'STAFF')),
  jersey_number    int check (jersey_number >= 0 and jersey_number <= 999),
  grade            int check (grade >= 1 and grade <= 6),
  admission_year   int check (admission_year >= 1900 and admission_year <= 2200),
  personal_goal    text,
  -- 過去データ移行の照合キー（43章）
  external_source  text,
  external_id      text,
  joined_at        date,
  left_at          date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  unique (team_id, profile_id)
);

-- 同じチーム内で背番号は重複させない（在籍中のみ）。
create unique index if not exists team_members_jersey_unique
  on public.team_members (team_id, jersey_number)
  where jersey_number is not null and status = 'active' and deleted_at is null;

-- 移行元 ID は「同じ移行元の中で」一意（42章の照合に使う）。
create unique index if not exists team_members_external_unique
  on public.team_members (team_id, external_source, external_id)
  where external_source is not null and external_id is not null;

create index if not exists team_members_team_idx on public.team_members (team_id, status);
create index if not exists team_members_profile_idx on public.team_members (profile_id);

create trigger team_members_set_updated_at
  before update on public.team_members
  for each row execute function app.set_updated_at();

-- -------------------------------------------------------------
-- member_permissions
--   role の既定に対する個別の上書き。granted=false で剥奪もできる。
-- -------------------------------------------------------------
create table if not exists public.member_permissions (
  id               uuid primary key default gen_random_uuid(),
  team_member_id   uuid not null references public.team_members(id) on delete cascade,
  permission_code  text not null references public.permissions(code) on delete cascade,
  granted          boolean not null default true,
  granted_by       uuid references public.profiles(id),
  created_at       timestamptz not null default now(),
  unique (team_member_id, permission_code)
);

-- -------------------------------------------------------------
-- team_invitations
--   招待制ログイン（Phase 1）。既存の team_member に結び付けて招待できる。
-- -------------------------------------------------------------
create table if not exists public.team_invitations (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null references public.teams(id) on delete cascade,
  team_member_id  uuid references public.team_members(id) on delete cascade,
  email           text not null,
  role_code       text not null references public.roles(code),
  token           text not null unique,
  invited_by      uuid references public.profiles(id),
  expires_at      timestamptz not null,
  accepted_at     timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists team_invitations_team_idx on public.team_invitations (team_id);

-- -------------------------------------------------------------
-- app_settings
--   容量などチーム毎の設定（58章）。team_id が null の行は全体既定。
-- -------------------------------------------------------------
create table if not exists public.app_settings (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid references public.teams(id) on delete cascade,
  key         text not null,
  value       jsonb not null,
  updated_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists app_settings_scope_key_unique
  on public.app_settings (coalesce(team_id, '00000000-0000-0000-0000-000000000000'::uuid), key);

create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute function app.set_updated_at();

-- -------------------------------------------------------------
-- audit_logs（63章）
--   秘密鍵や署名付き URL そのものは絶対に入れない。
-- -------------------------------------------------------------
create table if not exists public.audit_logs (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid references public.teams(id) on delete set null,
  actor_id      uuid references public.profiles(id) on delete set null,
  action        text not null,
  target_table  text,
  target_id     uuid,
  summary       text,
  before_value  jsonb,
  after_value   jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists audit_logs_team_created_idx on public.audit_logs (team_id, created_at desc);
create index if not exists audit_logs_target_idx on public.audit_logs (target_table, target_id);
