-- ==========================================================
-- 自動生成: scripts/bundle-migrations.sh
-- 直接編集しない。直すのは supabase/migrations/ のほう。
-- 2026-08-13 時点の migration をすべてまとめたもの。
-- ==========================================================


-- ---------- 0001_core.sql ----------
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


-- ---------- 0002_auth_helpers.sql ----------
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


-- ---------- 0003_timeline.sql ----------
-- =============================================================
-- 0003_timeline.sql
-- シーズン → 週 → イベント（6〜9章）
-- システムで最も重要なデータ構造。
-- =============================================================

-- -------------------------------------------------------------
-- seasons（7章）
-- -------------------------------------------------------------
create table if not exists public.seasons (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references public.teams(id) on delete cascade,
  name         text not null,
  fiscal_year  int not null,
  start_date   date not null,
  end_date     date not null,
  goal         text,
  theme        text,
  status       text not null default 'planning'
                 check (status in ('planning', 'active', 'completed', 'archived')),
  is_published boolean not null default false,
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  check (end_date >= start_date)
);

create index if not exists seasons_team_idx on public.seasons (team_id, start_date desc);

create trigger seasons_set_updated_at
  before update on public.seasons
  for each row execute function app.set_updated_at();

-- シーズン目標（複数持てるようにする）
create table if not exists public.season_goals (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  season_id   uuid not null references public.seasons(id) on delete cascade,
  title       text not null,
  description text,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index if not exists season_goals_season_idx on public.season_goals (season_id);

-- マイルストーン
create table if not exists public.milestones (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  season_id   uuid not null references public.seasons(id) on delete cascade,
  title       text not null,
  description text,
  target_date date,
  achieved_at date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index if not exists milestones_season_idx on public.milestones (season_id, target_date);

-- 大会日程
create table if not exists public.competitions (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  season_id   uuid not null references public.seasons(id) on delete cascade,
  name        text not null,
  start_date  date,
  end_date    date,
  venue       text,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index if not exists competitions_season_idx on public.competitions (season_id, start_date);

-- -------------------------------------------------------------
-- weeks（8章）
-- -------------------------------------------------------------
create table if not exists public.weeks (
  id                 uuid primary key default gen_random_uuid(),
  team_id            uuid not null references public.teams(id) on delete cascade,
  season_id          uuid not null references public.seasons(id) on delete cascade,
  start_date         date not null,
  end_date           date not null,
  theme              text,
  focus_task         text,
  key_skill          text,
  tactical_theme     text,
  weekly_message     text,
  carried_over_task  text,
  is_published       boolean not null default false,
  created_by         uuid references public.profiles(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  check (end_date >= start_date)
);

-- 同じシーズンで週の開始日は重複させない
create unique index if not exists weeks_season_start_unique
  on public.weeks (season_id, start_date)
  where deleted_at is null;

create index if not exists weeks_team_range_idx on public.weeks (team_id, start_date, end_date);

create trigger weeks_set_updated_at
  before update on public.weeks
  for each row execute function app.set_updated_at();

-- -------------------------------------------------------------
-- events（9章）
-- -------------------------------------------------------------
create table if not exists public.events (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references public.teams(id) on delete cascade,
  season_id     uuid references public.seasons(id) on delete set null,
  week_id       uuid references public.weeks(id) on delete set null,
  title         text not null,
  event_date    date not null,
  start_time    time,
  end_time      time,
  location      text,
  event_type    text not null default 'practice'
                  check (event_type in ('practice', 'match', 'meeting', 'measurement', 'training', 'rest', 'other')),
  purpose       text,
  theme         text,
  menu          text,
  items_to_bring text,
  notes         text,
  target_scope  text not null default 'team'
                  check (target_scope in ('team', 'selected', 'staff')),
  is_published  boolean not null default false,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create index if not exists events_team_date_idx on public.events (team_id, event_date);
create index if not exists events_week_idx on public.events (week_id);

create trigger events_set_updated_at
  before update on public.events
  for each row execute function app.set_updated_at();

-- 対象者を絞る場合の参加者
create table if not exists public.event_participants (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null references public.teams(id) on delete cascade,
  event_id        uuid not null references public.events(id) on delete cascade,
  team_member_id  uuid not null references public.team_members(id) on delete cascade,
  attendance      text not null default 'unknown'
                    check (attendance in ('unknown', 'attending', 'absent', 'late', 'observing')),
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (event_id, team_member_id)
);

create index if not exists event_participants_member_idx on public.event_participants (team_member_id);

-- -------------------------------------------------------------
-- 週とイベントの整合を保つ補助
--   イベント日から該当する週を引く。
-- -------------------------------------------------------------
create or replace function app.week_for_date(p_team_id uuid, p_date date)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select w.id
  from public.weeks w
  where w.team_id = p_team_id
    and p_date between w.start_date and w.end_date
    and w.deleted_at is null
  order by w.start_date desc
  limit 1;
$$;

grant execute on function app.week_for_date(uuid, date) to authenticated;


-- ---------- 0004_daily.sql ----------
-- =============================================================
-- 0004_daily.sql
-- 練習前コンディション / 個人目標 / 日報 / トレーニング記録
-- （15〜17章。UI は Phase 4 だが、時間軸と地続きなのでここで定義する）
-- =============================================================

-- -------------------------------------------------------------
-- daily_conditions（15章）練習前の状態
-- -------------------------------------------------------------
create table if not exists public.daily_conditions (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null references public.teams(id) on delete cascade,
  team_member_id  uuid not null references public.team_members(id) on delete cascade,
  event_id        uuid references public.events(id) on delete set null,
  recorded_on     date not null,
  condition_level int check (condition_level between 1 and 5),
  fatigue_level   int check (fatigue_level between 1 and 5),
  sleep_hours     numeric(4, 1) check (sleep_hours >= 0 and sleep_hours <= 24),
  has_pain        boolean not null default false,
  pain_note       text,
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  -- 1日1イベントにつき1件
  unique (team_member_id, recorded_on, event_id)
);

create index if not exists daily_conditions_team_date_idx
  on public.daily_conditions (team_id, recorded_on desc);

create trigger daily_conditions_set_updated_at
  before update on public.daily_conditions
  for each row execute function app.set_updated_at();

-- -------------------------------------------------------------
-- practice_goals（15章）今日の個人目標
-- -------------------------------------------------------------
create table if not exists public.practice_goals (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null references public.teams(id) on delete cascade,
  team_member_id  uuid not null references public.team_members(id) on delete cascade,
  event_id        uuid references public.events(id) on delete set null,
  target_date     date not null,
  goal            text not null,
  -- 前回のフィードバックから引き継いだ課題（フィードバック → 次回課題の循環）
  source_feedback_id uuid,
  achieved        boolean,
  reflection      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create index if not exists practice_goals_member_date_idx
  on public.practice_goals (team_member_id, target_date desc);

create trigger practice_goals_set_updated_at
  before update on public.practice_goals
  for each row execute function app.set_updated_at();

-- -------------------------------------------------------------
-- daily_reports（16章）
-- -------------------------------------------------------------
create table if not exists public.daily_reports (
  id                uuid primary key default gen_random_uuid(),
  team_id           uuid not null references public.teams(id) on delete cascade,
  team_member_id    uuid not null references public.team_members(id) on delete cascade,
  event_id          uuid references public.events(id) on delete set null,
  report_date       date not null,
  personal_goal     text,
  what_happened     text,
  what_went_well    text,
  what_went_wrong   text,
  cause             text,
  improvement       text,
  prevention        text,
  response_taken    text,
  next_action       text,
  self_rating       int check (self_rating between 1 and 5),
  intensity         int check (intensity between 1 and 5),
  fatigue_level     int check (fatigue_level between 1 and 5),
  mood              int check (mood between 1 and 5),
  condition_level   int check (condition_level between 1 and 5),
  free_note         text,
  -- 16章: 初期値は staff
  visibility        text not null default 'staff'
                      check (visibility in ('private', 'staff', 'team')),
  status            text not null default 'draft'
                      check (status in ('draft', 'submitted')),
  submitted_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  -- 1イベント1選手1件
  unique (team_member_id, report_date, event_id)
);

create index if not exists daily_reports_team_date_idx
  on public.daily_reports (team_id, report_date desc);
create index if not exists daily_reports_member_idx
  on public.daily_reports (team_member_id, report_date desc);

create trigger daily_reports_set_updated_at
  before update on public.daily_reports
  for each row execute function app.set_updated_at();

-- 日報へのコーチコメント
create table if not exists public.report_feedbacks (
  id               uuid primary key default gen_random_uuid(),
  team_id          uuid not null references public.teams(id) on delete cascade,
  daily_report_id  uuid not null references public.daily_reports(id) on delete cascade,
  author_id        uuid not null references public.profiles(id) on delete cascade,
  body             text not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

create index if not exists report_feedbacks_report_idx on public.report_feedbacks (daily_report_id);

-- -------------------------------------------------------------
-- training_records（17章）
-- -------------------------------------------------------------
create table if not exists public.training_records (
  id                uuid primary key default gen_random_uuid(),
  team_id           uuid not null references public.teams(id) on delete cascade,
  team_member_id    uuid not null references public.team_members(id) on delete cascade,
  event_id          uuid references public.events(id) on delete set null,
  performed_on      date not null,
  training_type     text not null
                      check (training_type in ('running', 'weight', 'self_practice', 'recovery', 'stretch', 'agility', 'other')),
  menu              text,
  started_at        time,
  ended_at          time,
  duration_minutes  int check (duration_minutes >= 0),
  intensity         int check (intensity between 1 and 5),
  fatigue_level     int check (fatigue_level between 1 and 5),
  comment           text,
  -- ランニング
  distance_km       numeric(6, 2) check (distance_km >= 0),
  pace_seconds_per_km int check (pace_seconds_per_km >= 0),
  heart_rate_avg    int check (heart_rate_avg between 0 and 300),
  rep_count         int check (rep_count >= 0),
  -- 自主練
  skill_theme       text,
  outcome           text,
  visibility        text not null default 'staff'
                      check (visibility in ('private', 'staff', 'team')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

create index if not exists training_records_member_date_idx
  on public.training_records (team_member_id, performed_on desc);
create index if not exists training_records_team_date_idx
  on public.training_records (team_id, performed_on desc);

create trigger training_records_set_updated_at
  before update on public.training_records
  for each row execute function app.set_updated_at();

-- ウェイトの種目とセット
create table if not exists public.training_exercises (
  id                  uuid primary key default gen_random_uuid(),
  team_id             uuid not null references public.teams(id) on delete cascade,
  training_record_id  uuid not null references public.training_records(id) on delete cascade,
  name                text not null,
  sort_order          int not null default 0,
  created_at          timestamptz not null default now()
);

create index if not exists training_exercises_record_idx
  on public.training_exercises (training_record_id);

create table if not exists public.training_sets (
  id                    uuid primary key default gen_random_uuid(),
  team_id               uuid not null references public.teams(id) on delete cascade,
  training_exercise_id  uuid not null references public.training_exercises(id) on delete cascade,
  set_number            int not null check (set_number >= 1),
  weight_kg             numeric(6, 2) check (weight_kg >= 0),
  reps                  int check (reps >= 0),
  created_at            timestamptz not null default now(),
  unique (training_exercise_id, set_number)
);


-- ---------- 0005_files_videos.sql ----------
-- =============================================================
-- 0005_files_videos.sql
-- ファイル / アップロードセッション / 動画 / 仮想クリップ
-- （18〜24章, 51〜53章）
--
-- 原則:
--   * ファイル本体は DB に入れない。保存先は R2 か YouTube。
--   * 署名付き URL や恒久公開 URL を DB に保存しない（75章）。
--   * storage_key に氏名を入れない（75章）。
-- =============================================================

-- -------------------------------------------------------------
-- files（51章）
-- -------------------------------------------------------------
create table if not exists public.files (
  id                  uuid primary key default gen_random_uuid(),
  team_id             uuid not null references public.teams(id) on delete cascade,
  uploaded_by         uuid not null references public.profiles(id) on delete cascade,

  storage_provider    text not null default 'r2'
                        check (storage_provider in ('r2', 's3', 'local')),
  bucket              text not null,
  storage_key         text not null,

  original_filename   text,
  normalized_filename text,
  mime_type           text not null,
  size_bytes          bigint not null check (size_bytes >= 0),
  checksum            text,

  media_type          text not null default 'other'
                        check (media_type in ('video', 'image', 'pdf', 'other')),
  width               int,
  height              int,
  duration_seconds    numeric(8, 2) check (duration_seconds >= 0),
  video_codec         text,
  audio_codec         text,
  frame_rate          numeric(5, 2),

  upload_status       text not null default 'pending'
                        check (upload_status in ('pending', 'uploading', 'uploaded', 'verifying', 'ready', 'failed', 'quarantined', 'deleted')),
  visibility          text not null default 'private_staff'
                        check (visibility in ('private_staff', 'selected_members', 'team')),

  retention_policy    text not null default 'keep'
                        check (retention_policy in ('keep', 'temporary')),
  expires_at          timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,

  unique (bucket, storage_key)
);

create index if not exists files_team_idx on public.files (team_id, created_at desc);
create index if not exists files_uploader_idx on public.files (uploaded_by, created_at desc);
-- 論理削除の物理削除待ちを拾う
create index if not exists files_deleted_idx on public.files (deleted_at) where deleted_at is not null;

create trigger files_set_updated_at
  before update on public.files
  for each row execute function app.set_updated_at();

-- -------------------------------------------------------------
-- upload_sessions（21章）
-- -------------------------------------------------------------
create table if not exists public.upload_sessions (
  id                uuid primary key default gen_random_uuid(),
  team_id           uuid not null references public.teams(id) on delete cascade,
  created_by        uuid not null references public.profiles(id) on delete cascade,
  file_id           uuid references public.files(id) on delete set null,

  bucket            text not null,
  storage_key       text not null,
  declared_mime     text not null,
  declared_size     bigint not null check (declared_size >= 0),
  media_type        text not null default 'video'
                      check (media_type in ('video', 'image', 'pdf', 'other')),

  status            text not null default 'pending'
                      check (status in ('pending', 'uploading', 'uploaded', 'verifying', 'ready', 'failed', 'quarantined', 'deleted')),
  failure_reason    text,

  expires_at        timestamptz not null,
  completed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists upload_sessions_creator_idx
  on public.upload_sessions (created_by, created_at desc);
create index if not exists upload_sessions_expiry_idx
  on public.upload_sessions (expires_at) where status not in ('ready', 'deleted');

create trigger upload_sessions_set_updated_at
  before update on public.upload_sessions
  for each row execute function app.set_updated_at();

-- 1日あたりのアップロード本数を数える（19章）
create or replace function app.daily_upload_count(p_profile_id uuid, p_day date)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::int
  from public.upload_sessions us
  where us.created_by = p_profile_id
    and us.media_type = 'video'
    and us.status in ('uploaded', 'verifying', 'ready')
    and (us.created_at at time zone 'Asia/Tokyo')::date = p_day;
$$;

grant execute on function app.daily_upload_count(uuid, date) to authenticated;

-- -------------------------------------------------------------
-- videos（52章）
-- -------------------------------------------------------------
create table if not exists public.videos (
  id                 uuid primary key default gen_random_uuid(),
  team_id            uuid not null references public.teams(id) on delete cascade,

  provider           text not null
                       check (provider in ('youtube', 'r2', 'cloudflare_stream', 'external')),
  provider_video_id  text,
  file_id            uuid references public.files(id) on delete set null,

  title              text not null,
  description        text,
  thumbnail_url      text,
  duration_seconds   numeric(9, 2) check (duration_seconds >= 0),

  recorded_at        timestamptz,
  uploaded_at        timestamptz,

  event_id           uuid references public.events(id) on delete set null,

  visibility         text not null default 'team'
                       check (visibility in ('private_staff', 'selected_members', 'team')),
  created_by         uuid not null references public.profiles(id) on delete cascade,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,

  -- provider ごとに、どちらの参照を持つべきかを決める
  check (
    (provider = 'youtube' and provider_video_id is not null)
    or (provider = 'r2' and file_id is not null)
    or provider in ('cloudflare_stream', 'external')
  )
);

create index if not exists videos_team_idx on public.videos (team_id, created_at desc);
create index if not exists videos_event_idx on public.videos (event_id);

create trigger videos_set_updated_at
  before update on public.videos
  for each row execute function app.set_updated_at();

-- -------------------------------------------------------------
-- video_clips（53章）仮想クリップ。実ファイルは切り出さない。
-- -------------------------------------------------------------
create table if not exists public.video_clips (
  id             uuid primary key default gen_random_uuid(),
  team_id        uuid not null references public.teams(id) on delete cascade,
  video_id       uuid not null references public.videos(id) on delete cascade,
  created_by     uuid not null references public.profiles(id) on delete cascade,

  start_seconds  numeric(9, 2) not null check (start_seconds >= 0),
  end_seconds    numeric(9, 2) not null,

  title          text,
  description    text,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,

  check (end_seconds > start_seconds)
);

create index if not exists video_clips_video_idx on public.video_clips (video_id);

create trigger video_clips_set_updated_at
  before update on public.video_clips
  for each row execute function app.set_updated_at();

-- クリップが元動画の長さを超えないことを保証する（53章の制約）。
-- CHECK では他テーブルを参照できないためトリガで行う。
create or replace function app.validate_video_clip()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_duration numeric;
begin
  select duration_seconds into v_duration
  from public.videos
  where id = new.video_id;

  if v_duration is not null and new.end_seconds > v_duration then
    raise exception 'クリップの終了位置(%)が動画の長さ(%)を超えています', new.end_seconds, v_duration;
  end if;

  return new;
end;
$$;

create trigger video_clips_validate
  before insert or update on public.video_clips
  for each row execute function app.validate_video_clip();

-- 動画に紐づくタグ
create table if not exists public.video_tags (
  id       uuid primary key default gen_random_uuid(),
  team_id  uuid not null references public.teams(id) on delete cascade,
  name     text not null,
  unique (team_id, name)
);

create table if not exists public.video_tag_relations (
  video_id      uuid not null references public.videos(id) on delete cascade,
  video_tag_id  uuid not null references public.video_tags(id) on delete cascade,
  primary key (video_id, video_tag_id)
);

-- ファイルと他レコードの関連（日報添付など）
create table if not exists public.file_relations (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references public.teams(id) on delete cascade,
  file_id       uuid not null references public.files(id) on delete cascade,
  relation_type text not null
                  check (relation_type in ('daily_report', 'feedback_request', 'feedback_response', 'profile_avatar', 'training_record', 'skill_application')),
  target_id     uuid not null,
  created_at    timestamptz not null default now(),
  unique (file_id, relation_type, target_id)
);

create index if not exists file_relations_target_idx
  on public.file_relations (relation_type, target_id);

-- 物理削除の予約（60章: 論理削除30日）
create table if not exists public.file_deletion_jobs (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references public.teams(id) on delete cascade,
  file_id       uuid not null references public.files(id) on delete cascade,
  scheduled_for timestamptz not null,
  status        text not null default 'pending'
                  check (status in ('pending', 'done', 'failed')),
  attempted_at  timestamptz,
  error_message text,
  created_at    timestamptz not null default now()
);

create index if not exists file_deletion_jobs_due_idx
  on public.file_deletion_jobs (scheduled_for) where status = 'pending';

-- 容量集計のスナップショット（59章）
create table if not exists public.storage_usage_snapshots (
  id             uuid primary key default gen_random_uuid(),
  team_id        uuid not null references public.teams(id) on delete cascade,
  captured_on    date not null,
  total_bytes    bigint not null default 0,
  video_bytes    bigint not null default 0,
  image_bytes    bigint not null default 0,
  pdf_bytes      bigint not null default 0,
  temp_bytes     bigint not null default 0,
  deleted_bytes  bigint not null default 0,
  file_count     int not null default 0,
  created_at     timestamptz not null default now(),
  unique (team_id, captured_on)
);


-- ---------- 0006_feedback_skills.sql ----------
-- =============================================================
-- 0006_feedback_skills.sql
-- 動画フィードバック（25〜29章, 54〜56章）とスキル（30〜32章）
--
-- 要点:
--   * 不正な状態遷移を DB 側で禁止する（27章）。
--   * 過去の回答を上書きしない（55章）。回答は追記のみ。
--   * コーチが一方的に team 公開へ変更できない（29章）。
-- =============================================================

-- -------------------------------------------------------------
-- スキル階層（30章）大分類 → 中目標 → 小目標
-- -------------------------------------------------------------
create table if not exists public.skill_categories (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  name        text not null,
  description text,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  unique (team_id, name)
);

create table if not exists public.skills (
  id                 uuid primary key default gen_random_uuid(),
  team_id            uuid not null references public.teams(id) on delete cascade,
  skill_category_id  uuid not null references public.skill_categories(id) on delete cascade,
  -- 自己参照で「中目標 → 小目標」を表す。parent_id が null なら中目標。
  parent_id          uuid references public.skills(id) on delete cascade,
  name               text not null,
  description        text,
  criteria           text,
  level              int not null default 1 check (level between 1 and 3),
  sort_order         int not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);

create index if not exists skills_category_idx on public.skills (skill_category_id, sort_order);
create index if not exists skills_parent_idx on public.skills (parent_id);

-- 選手ごとの到達状況（31章）
create table if not exists public.player_skills (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null references public.teams(id) on delete cascade,
  team_member_id  uuid not null references public.team_members(id) on delete cascade,
  skill_id        uuid not null references public.skills(id) on delete cascade,
  status          text not null default 'not_started'
                    check (status in ('not_started', 'applied', 'feedback', 'approved')),
  approved_at     timestamptz,
  approved_by     uuid references public.profiles(id),
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (team_member_id, skill_id)
);

create index if not exists player_skills_member_idx on public.player_skills (team_member_id, status);

create trigger player_skills_set_updated_at
  before update on public.player_skills
  for each row execute function app.set_updated_at();

-- スキル申請
create table if not exists public.skill_applications (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null references public.teams(id) on delete cascade,
  team_member_id  uuid not null references public.team_members(id) on delete cascade,
  skill_id        uuid not null references public.skills(id) on delete cascade,
  comment         text,
  status          text not null default 'submitted'
                    check (status in ('draft', 'submitted', 'reviewing', 'approved', 'rejected', 'withdrawn')),
  submitted_at    timestamptz,
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create index if not exists skill_applications_team_status_idx
  on public.skill_applications (team_id, status);

create trigger skill_applications_set_updated_at
  before update on public.skill_applications
  for each row execute function app.set_updated_at();

-- 申請の根拠（32章）動画・クリップ・フィードバックを添える
create table if not exists public.skill_application_items (
  id                    uuid primary key default gen_random_uuid(),
  team_id               uuid not null references public.teams(id) on delete cascade,
  skill_application_id  uuid not null references public.skill_applications(id) on delete cascade,
  item_type             text not null
                          check (item_type in ('video', 'video_clip', 'feedback_request', 'file', 'note')),
  video_id              uuid references public.videos(id) on delete set null,
  video_clip_id         uuid references public.video_clips(id) on delete set null,
  feedback_request_id   uuid,
  file_id               uuid references public.files(id) on delete set null,
  note                  text,
  created_at            timestamptz not null default now()
);

create index if not exists skill_application_items_application_idx
  on public.skill_application_items (skill_application_id);

-- 審査結果
create table if not exists public.skill_reviews (
  id                    uuid primary key default gen_random_uuid(),
  team_id               uuid not null references public.teams(id) on delete cascade,
  skill_application_id  uuid not null references public.skill_applications(id) on delete cascade,
  reviewer_id           uuid not null references public.profiles(id) on delete cascade,
  decision              text not null check (decision in ('approved', 'rejected', 'needs_more')),
  comment               text,
  created_at            timestamptz not null default now()
);

create index if not exists skill_reviews_application_idx
  on public.skill_reviews (skill_application_id, created_at desc);

-- 状態履歴（75章: 重要状態変更は History を残す）
create table if not exists public.skill_status_histories (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null references public.teams(id) on delete cascade,
  player_skill_id uuid not null references public.player_skills(id) on delete cascade,
  from_status     text,
  to_status       text not null,
  changed_by      uuid references public.profiles(id),
  reason          text,
  created_at      timestamptz not null default now()
);

create index if not exists skill_status_histories_skill_idx
  on public.skill_status_histories (player_skill_id, created_at desc);

-- -------------------------------------------------------------
-- feedback_requests（54章）
-- -------------------------------------------------------------
create table if not exists public.feedback_requests (
  id                    uuid primary key default gen_random_uuid(),
  team_id               uuid not null references public.teams(id) on delete cascade,

  requester_id          uuid not null references public.team_members(id) on delete cascade,
  assigned_coach_id     uuid references public.team_members(id) on delete set null,

  video_id              uuid references public.videos(id) on delete set null,
  video_clip_id         uuid references public.video_clips(id) on delete set null,

  event_id              uuid references public.events(id) on delete set null,
  daily_report_id       uuid references public.daily_reports(id) on delete set null,
  skill_id              uuid references public.skills(id) on delete set null,
  skill_application_id  uuid references public.skill_applications(id) on delete set null,

  question_type         text not null default 'other'
                          check (question_type in (
                            'judgement', 'play_choice', 'technique', 'positioning',
                            'defense_priority', 'attack_positioning', 'skill_application', 'other')),
  question              text not null,

  status                text not null default 'draft'
                          check (status in ('draft', 'submitted', 'assigned', 'reviewing',
                                            'answered', 'acknowledged', 'follow_up', 'closed', 'withdrawn')),
  -- 29章: 初期値は private_staff
  visibility            text not null default 'private_staff'
                          check (visibility in ('private_staff', 'selected_members', 'team')),

  submitted_at          timestamptz,
  assigned_at           timestamptz,
  answered_at           timestamptz,
  acknowledged_at       timestamptz,
  closed_at             timestamptz,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz,

  -- 動画かクリップのどちらかは必要（下書きを除く）
  check (status = 'draft' or video_id is not null or video_clip_id is not null)
);

create index if not exists feedback_requests_team_status_idx
  on public.feedback_requests (team_id, status, submitted_at desc);
create index if not exists feedback_requests_requester_idx
  on public.feedback_requests (requester_id, created_at desc);
create index if not exists feedback_requests_coach_idx
  on public.feedback_requests (assigned_coach_id, status);

create trigger feedback_requests_set_updated_at
  before update on public.feedback_requests
  for each row execute function app.set_updated_at();

-- 状態履歴
create table if not exists public.feedback_status_histories (
  id                   uuid primary key default gen_random_uuid(),
  team_id              uuid not null references public.teams(id) on delete cascade,
  feedback_request_id  uuid not null references public.feedback_requests(id) on delete cascade,
  from_status          text,
  to_status            text not null,
  changed_by           uuid references public.profiles(id),
  note                 text,
  created_at           timestamptz not null default now()
);

create index if not exists feedback_status_histories_request_idx
  on public.feedback_status_histories (feedback_request_id, created_at desc);

-- 27章: 不正な状態遷移を禁止する。
create or replace function app.is_valid_feedback_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select case p_from
    when 'draft'        then p_to in ('submitted', 'withdrawn')
    when 'submitted'    then p_to in ('assigned', 'reviewing', 'withdrawn')
    when 'assigned'     then p_to in ('reviewing', 'answered', 'withdrawn')
    when 'reviewing'    then p_to in ('answered', 'assigned', 'withdrawn')
    when 'answered'     then p_to in ('acknowledged', 'follow_up', 'closed')
    when 'acknowledged' then p_to in ('follow_up', 'closed')
    when 'follow_up'    then p_to in ('reviewing', 'answered', 'closed')
    when 'closed'       then false
    when 'withdrawn'    then false
    else false
  end;
$$;

create or replace function app.guard_feedback_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from old.status then
    if not app.is_valid_feedback_transition(old.status, new.status) then
      raise exception '不正な状態遷移です: % → %', old.status, new.status;
    end if;

    insert into public.feedback_status_histories (team_id, feedback_request_id, from_status, to_status, changed_by)
    values (new.team_id, new.id, old.status, new.status, app.current_profile_id());
  end if;

  return new;
end;
$$;

create trigger feedback_requests_guard_status
  before update on public.feedback_requests
  for each row execute function app.guard_feedback_status();

-- -------------------------------------------------------------
-- feedback_responses（55章）追記のみ。過去の回答を上書きしない。
-- -------------------------------------------------------------
create table if not exists public.feedback_responses (
  id                       uuid primary key default gen_random_uuid(),
  team_id                  uuid not null references public.teams(id) on delete cascade,
  feedback_request_id      uuid not null references public.feedback_requests(id) on delete cascade,
  responder_id             uuid not null references public.team_members(id) on delete cascade,

  conclusion               text not null,
  positive_points          text,
  improvement_points       text,
  recommended_action       text,
  technical_correction     text,
  next_task                text,

  related_skill_id         uuid references public.skills(id) on delete set null,
  reference_video_id       uuid references public.videos(id) on delete set null,

  requires_in_person_review boolean not null default false,
  suggests_team_share       boolean not null default false,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  deleted_at               timestamptz
);

create index if not exists feedback_responses_request_idx
  on public.feedback_responses (feedback_request_id, created_at desc);

-- 再質問（56章）
create table if not exists public.feedback_messages (
  id                   uuid primary key default gen_random_uuid(),
  team_id              uuid not null references public.teams(id) on delete cascade,
  feedback_request_id  uuid not null references public.feedback_requests(id) on delete cascade,
  sender_id            uuid not null references public.team_members(id) on delete cascade,
  message_type         text not null default 'comment'
                         check (message_type in ('comment', 'follow_up_question', 'system')),
  body                 text not null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz
);

create index if not exists feedback_messages_request_idx
  on public.feedback_messages (feedback_request_id, created_at);

-- 29章: team 公開は選手の承認が要る
create table if not exists public.feedback_share_requests (
  id                   uuid primary key default gen_random_uuid(),
  team_id              uuid not null references public.teams(id) on delete cascade,
  feedback_request_id  uuid not null references public.feedback_requests(id) on delete cascade,
  requested_by         uuid not null references public.team_members(id) on delete cascade,
  target_visibility    text not null
                         check (target_visibility in ('selected_members', 'team')),
  status               text not null default 'pending'
                         check (status in ('pending', 'approved', 'rejected')),
  responded_at         timestamptz,
  reason               text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists feedback_share_requests_request_idx
  on public.feedback_share_requests (feedback_request_id, status);

-- スキル申請の根拠として指す先を、テーブル定義後に結び付ける
alter table public.skill_application_items
  drop constraint if exists skill_application_items_feedback_fk;
alter table public.skill_application_items
  add constraint skill_application_items_feedback_fk
  foreign key (feedback_request_id) references public.feedback_requests(id) on delete set null;

-- 練習目標が参照するフィードバック（フィードバック → 次回課題）
alter table public.practice_goals
  drop constraint if exists practice_goals_source_feedback_fk;
alter table public.practice_goals
  add constraint practice_goals_source_feedback_fk
  foreign key (source_feedback_id) references public.feedback_requests(id) on delete set null;


-- ---------- 0007_import_notifications.sql ----------
-- =============================================================
-- 0007_import_notifications.sql
-- Import Center（33〜50章）/ 通知（57章）/ 測定（64章）
--
-- 要点:
--   * プレビュー前に本体テーブルを書き換えない（39章）。
--     解析結果は import_rows に貯め、確定時に初めて本体へ書く。
--   * このセッションで「新規作成した」レコードを追跡し、取り消せるようにする（48章）。
--   * CSV 内の team_id を信用しない（50章）。team_id はサーバーが入れる。
-- =============================================================

-- -------------------------------------------------------------
-- import_sessions（47章）
-- -------------------------------------------------------------
create table if not exists public.import_sessions (
  id             uuid primary key default gen_random_uuid(),
  team_id        uuid not null references public.teams(id) on delete cascade,
  created_by     uuid not null references public.profiles(id) on delete cascade,

  import_type    text not null
                   check (import_type in ('player', 'season', 'week', 'event', 'weekly_theme',
                                          'daily_report', 'training_record', 'skill_progress',
                                          'skill_application', 'measurement')),
  source_type    text not null
                   check (source_type in ('paste', 'csv', 'template_csv', 'google_sheets_future')),

  status         text not null default 'analyzing'
                   check (status in ('analyzing', 'mapping', 'previewed', 'importing',
                                     'completed', 'failed', 'rolled_back', 'cancelled')),
  -- 46章: 既定は安全側（新規追加のみ）
  upsert_mode    text not null default 'insert_only'
                   check (upsert_mode in ('insert_only', 'update_existing', 'skip_existing')),

  total_rows     int not null default 0,
  valid_rows     int not null default 0,
  warning_rows   int not null default 0,
  error_rows     int not null default 0,
  imported_rows  int not null default 0,
  skipped_rows   int not null default 0,

  file_name      text,
  note           text,

  created_at     timestamptz not null default now(),
  started_at     timestamptz,
  completed_at   timestamptz,
  rolled_back_at timestamptz
);

create index if not exists import_sessions_team_idx
  on public.import_sessions (team_id, created_at desc);

-- -------------------------------------------------------------
-- import_mappings（40章）列マッピング
-- -------------------------------------------------------------
create table if not exists public.import_mappings (
  id                 uuid primary key default gen_random_uuid(),
  import_session_id  uuid not null references public.import_sessions(id) on delete cascade,
  source_column      text not null,
  source_index       int not null,
  target_field       text,
  -- 自動推測なのか、利用者が直したのか
  is_auto_detected   boolean not null default true,
  confidence         numeric(3, 2),
  created_at         timestamptz not null default now(),
  unique (import_session_id, source_index)
);

-- -------------------------------------------------------------
-- import_rows（44章）1行ごとの解析結果
-- -------------------------------------------------------------
create table if not exists public.import_rows (
  id                 uuid primary key default gen_random_uuid(),
  import_session_id  uuid not null references public.import_sessions(id) on delete cascade,
  row_number         int not null,

  raw_values         jsonb not null,
  normalized_values  jsonb,

  status             text not null default 'valid'
                       check (status in ('valid', 'warning', 'error', 'skipped', 'imported')),
  -- 既存と照合した結果
  action             text not null default 'insert'
                       check (action in ('insert', 'update', 'skip')),
  matched_record_id  uuid,
  match_reason       text,
  -- 一意に決められない場合の候補（42章）
  match_candidates   jsonb,

  messages           jsonb not null default '[]'::jsonb,

  created_at         timestamptz not null default now(),
  unique (import_session_id, row_number)
);

create index if not exists import_rows_session_status_idx
  on public.import_rows (import_session_id, status);

-- -------------------------------------------------------------
-- import_record_links（48章）ロールバックの根拠
--   このセッションで新規作成した行だけを追跡する。
--   更新した行は before_value を監査ログに残す。
-- -------------------------------------------------------------
create table if not exists public.import_record_links (
  id                 uuid primary key default gen_random_uuid(),
  import_session_id  uuid not null references public.import_sessions(id) on delete cascade,
  import_row_id      uuid references public.import_rows(id) on delete set null,
  target_table       text not null,
  target_id          uuid not null,
  operation          text not null check (operation in ('insert', 'update')),
  before_value       jsonb,
  rolled_back_at     timestamptz,
  created_at         timestamptz not null default now()
);

create index if not exists import_record_links_session_idx
  on public.import_record_links (import_session_id, operation);
create index if not exists import_record_links_target_idx
  on public.import_record_links (target_table, target_id);

-- -------------------------------------------------------------
-- notifications（57章）MVP はアプリ内通知のみ
-- -------------------------------------------------------------
create table if not exists public.notifications (
  id             uuid primary key default gen_random_uuid(),
  team_id        uuid not null references public.teams(id) on delete cascade,
  notification_type text not null
                   check (notification_type in (
                     'feedback_requested', 'feedback_assigned', 'feedback_answered',
                     'feedback_follow_up', 'feedback_acknowledged', 'feedback_overdue',
                     'share_approval_requested', 'skill_application_updated',
                     'report_missing', 'training_missing', 'general')),
  title          text not null,
  body           text,
  link_path      text,
  related_table  text,
  related_id     uuid,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists notifications_team_idx on public.notifications (team_id, created_at desc);

-- 誰宛か
create table if not exists public.notification_targets (
  id              uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  team_member_id  uuid not null references public.team_members(id) on delete cascade,
  read_at         timestamptz,
  created_at      timestamptz not null default now(),
  unique (notification_id, team_member_id)
);

create index if not exists notification_targets_member_idx
  on public.notification_targets (team_member_id, read_at);

-- -------------------------------------------------------------
-- 測定（64章）
-- -------------------------------------------------------------
create table if not exists public.measurement_events (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  season_id   uuid references public.seasons(id) on delete set null,
  event_id    uuid references public.events(id) on delete set null,
  name        text not null,
  measured_on date not null,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index if not exists measurement_events_team_idx
  on public.measurement_events (team_id, measured_on desc);

create table if not exists public.measurement_items (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  name        text not null,
  unit        text,
  -- 値が大きいほど良いのか小さいほど良いのか
  better      text not null default 'higher' check (better in ('higher', 'lower')),
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  unique (team_id, name)
);

create table if not exists public.measurement_results (
  id                    uuid primary key default gen_random_uuid(),
  team_id               uuid not null references public.teams(id) on delete cascade,
  measurement_event_id  uuid not null references public.measurement_events(id) on delete cascade,
  measurement_item_id   uuid not null references public.measurement_items(id) on delete cascade,
  team_member_id        uuid not null references public.team_members(id) on delete cascade,
  value                 numeric(10, 3),
  text_value            text,
  note                  text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (measurement_event_id, measurement_item_id, team_member_id)
);

create index if not exists measurement_results_member_idx
  on public.measurement_results (team_member_id);


-- ---------- 0008_rls.sql ----------
-- =============================================================
-- 0008_rls.sql
-- Row Level Security（62章）
--
-- 保証すること:
--   * 他選手の非公開日報を見られない
--   * 他選手の非公開動画・フィードバックを見られない
--   * 別チームの情報を一切見られない
--   * URL 直打ちでも迂回できない（RLS はクエリ単位で効く）
--   * 削除済み（deleted_at）は通常閲覧に出さない
--
-- 方針:
--   * まず全テーブルで RLS を有効にする。
--   * 「チーム内で共有してよい情報」と「本人と指導側だけの情報」を分ける。
--   * アプリ側でも権限を確認する（75章: RLS と Application 側の両方で守る）。
-- =============================================================

-- 追加の補助関数 ------------------------------------------------

-- 同じチームに所属している profile か
create or replace function app.shares_team_with(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.team_members me
    join public.team_members other on other.team_id = me.team_id
    where me.profile_id = app.current_profile_id()
      and me.status = 'active'
      and me.deleted_at is null
      and other.profile_id = p_profile_id
      and other.deleted_at is null
  );
$$;

grant execute on function app.shares_team_with(uuid) to authenticated;

-- 本人の team_member かどうか（team_member_id 指定）
create or replace function app.is_own_member(p_team_member_id uuid)
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

grant execute on function app.is_own_member(uuid) to authenticated;

-- =============================================================
-- RLS 有効化
-- =============================================================
alter table public.teams               enable row level security;
alter table public.profiles            enable row level security;
alter table public.team_members        enable row level security;
alter table public.roles               enable row level security;
alter table public.permissions         enable row level security;
alter table public.role_permissions    enable row level security;
alter table public.member_permissions  enable row level security;
alter table public.team_invitations    enable row level security;
alter table public.app_settings        enable row level security;
alter table public.audit_logs          enable row level security;

alter table public.seasons             enable row level security;
alter table public.season_goals        enable row level security;
alter table public.milestones          enable row level security;
alter table public.competitions        enable row level security;
alter table public.weeks               enable row level security;
alter table public.events              enable row level security;
alter table public.event_participants  enable row level security;

alter table public.daily_conditions    enable row level security;
alter table public.practice_goals      enable row level security;
alter table public.daily_reports       enable row level security;
alter table public.report_feedbacks    enable row level security;
alter table public.training_records    enable row level security;
alter table public.training_exercises  enable row level security;
alter table public.training_sets       enable row level security;

alter table public.files                   enable row level security;
alter table public.file_relations          enable row level security;
alter table public.upload_sessions         enable row level security;
alter table public.file_deletion_jobs      enable row level security;
alter table public.storage_usage_snapshots enable row level security;
alter table public.videos                  enable row level security;
alter table public.video_clips             enable row level security;
alter table public.video_tags              enable row level security;
alter table public.video_tag_relations     enable row level security;

alter table public.skill_categories        enable row level security;
alter table public.skills                  enable row level security;
alter table public.player_skills           enable row level security;
alter table public.skill_applications      enable row level security;
alter table public.skill_application_items enable row level security;
alter table public.skill_reviews           enable row level security;
alter table public.skill_status_histories  enable row level security;

alter table public.feedback_requests         enable row level security;
alter table public.feedback_responses        enable row level security;
alter table public.feedback_messages         enable row level security;
alter table public.feedback_status_histories enable row level security;
alter table public.feedback_share_requests   enable row level security;

alter table public.notifications        enable row level security;
alter table public.notification_targets enable row level security;

alter table public.measurement_events   enable row level security;
alter table public.measurement_items    enable row level security;
alter table public.measurement_results  enable row level security;

alter table public.import_sessions      enable row level security;
alter table public.import_rows          enable row level security;
alter table public.import_mappings      enable row level security;
alter table public.import_record_links  enable row level security;

-- =============================================================
-- マスタ（読み取りのみ）
-- =============================================================
create policy roles_select on public.roles
  for select to authenticated using (true);

create policy permissions_select on public.permissions
  for select to authenticated using (true);

create policy role_permissions_select on public.role_permissions
  for select to authenticated using (true);

-- =============================================================
-- teams / profiles / team_members
-- =============================================================
create policy teams_select on public.teams
  for select to authenticated
  using (deleted_at is null and app.is_team_member(id));

create policy teams_update on public.teams
  for update to authenticated
  using (app.role_in_team(id) = 'system_admin')
  with check (app.role_in_team(id) = 'system_admin');

-- 自分のプロフィール、または同じチームの人のプロフィール
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    deleted_at is null
    and (user_id = auth.uid() or app.shares_team_with(id))
  );

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 同じチームの所属は互いに見える（名簿として必要）
create policy team_members_select on public.team_members
  for select to authenticated
  using (deleted_at is null and app.is_team_member(team_id));

create policy team_members_staff_write on public.team_members
  for all to authenticated
  using (app.is_staff(team_id))
  with check (app.is_staff(team_id));

-- 個別権限はスタッフのみ
create policy member_permissions_select on public.member_permissions
  for select to authenticated
  using (
    exists (
      select 1 from public.team_members tm
      where tm.id = member_permissions.team_member_id
        and (app.is_staff(tm.team_id) or app.is_own_member(tm.id))
    )
  );

create policy member_permissions_admin_write on public.member_permissions
  for all to authenticated
  using (
    exists (
      select 1 from public.team_members tm
      where tm.id = member_permissions.team_member_id
        and app.role_in_team(tm.team_id) = 'system_admin'
    )
  )
  with check (
    exists (
      select 1 from public.team_members tm
      where tm.id = member_permissions.team_member_id
        and app.role_in_team(tm.team_id) = 'system_admin'
    )
  );

-- 招待はスタッフのみが扱う
create policy team_invitations_staff on public.team_invitations
  for all to authenticated
  using (app.is_staff(team_id))
  with check (app.is_staff(team_id));

-- 設定
create policy app_settings_select on public.app_settings
  for select to authenticated
  using (team_id is null or app.is_team_member(team_id));

create policy app_settings_admin_write on public.app_settings
  for all to authenticated
  using (team_id is not null and app.role_in_team(team_id) = 'system_admin')
  with check (team_id is not null and app.role_in_team(team_id) = 'system_admin');

-- 監査ログは読み取りのみ（書き込みはサーバー経由）
create policy audit_logs_admin_select on public.audit_logs
  for select to authenticated
  using (team_id is not null and app.is_staff(team_id));

-- =============================================================
-- 時間軸: シーズン / 週 / イベント
--   公開前（is_published=false）はスタッフだけが見られる。
-- =============================================================
create policy seasons_select on public.seasons
  for select to authenticated
  using (deleted_at is null and app.is_team_member(team_id) and (is_published or app.is_staff(team_id)));

create policy seasons_staff_write on public.seasons
  for all to authenticated
  using (app.has_permission(team_id, 'event.manage'))
  with check (app.has_permission(team_id, 'event.manage'));

create policy season_goals_select on public.season_goals
  for select to authenticated
  using (deleted_at is null and app.is_team_member(team_id));

create policy season_goals_staff_write on public.season_goals
  for all to authenticated
  using (app.has_permission(team_id, 'event.manage'))
  with check (app.has_permission(team_id, 'event.manage'));

create policy milestones_select on public.milestones
  for select to authenticated
  using (deleted_at is null and app.is_team_member(team_id));

create policy milestones_staff_write on public.milestones
  for all to authenticated
  using (app.has_permission(team_id, 'event.manage'))
  with check (app.has_permission(team_id, 'event.manage'));

create policy competitions_select on public.competitions
  for select to authenticated
  using (deleted_at is null and app.is_team_member(team_id));

create policy competitions_staff_write on public.competitions
  for all to authenticated
  using (app.has_permission(team_id, 'event.manage'))
  with check (app.has_permission(team_id, 'event.manage'));

create policy weeks_select on public.weeks
  for select to authenticated
  using (deleted_at is null and app.is_team_member(team_id) and (is_published or app.is_staff(team_id)));

create policy weeks_staff_write on public.weeks
  for all to authenticated
  using (app.has_permission(team_id, 'event.manage'))
  with check (app.has_permission(team_id, 'event.manage'));

create policy events_select on public.events
  for select to authenticated
  using (
    deleted_at is null
    and app.is_team_member(team_id)
    and (
      app.is_staff(team_id)
      or (
        is_published
        and (
          target_scope = 'team'
          or (target_scope = 'selected' and exists (
                select 1 from public.event_participants ep
                where ep.event_id = events.id and app.is_own_member(ep.team_member_id)
              ))
        )
      )
    )
  );

create policy events_staff_write on public.events
  for all to authenticated
  using (app.has_permission(team_id, 'event.manage'))
  with check (app.has_permission(team_id, 'event.manage'));

create policy event_participants_select on public.event_participants
  for select to authenticated
  using (app.is_team_member(team_id));

-- 出欠は本人が更新できる。名簿の増減はスタッフ。
create policy event_participants_self_update on public.event_participants
  for update to authenticated
  using (app.is_own_member(team_member_id))
  with check (app.is_own_member(team_member_id));

create policy event_participants_staff_write on public.event_participants
  for all to authenticated
  using (app.has_permission(team_id, 'event.manage'))
  with check (app.has_permission(team_id, 'event.manage'));

-- =============================================================
-- 日報・コンディション・トレーニング
--   本人は常に自分の記録を扱える。
--   スタッフは report.view_all を持つ場合に限り、private 以外を読める。
--   他の選手は visibility='team' のものだけ。
-- =============================================================
create policy daily_conditions_own on public.daily_conditions
  for all to authenticated
  using (app.is_own_member(team_member_id))
  with check (app.is_own_member(team_member_id));

-- コンディションは安全管理のため、スタッフは読める（15章・12章の「注意選手」）
create policy daily_conditions_staff_select on public.daily_conditions
  for select to authenticated
  using (deleted_at is null and app.has_permission(team_id, 'report.view_all'));

create policy practice_goals_own on public.practice_goals
  for all to authenticated
  using (app.is_own_member(team_member_id))
  with check (app.is_own_member(team_member_id));

create policy practice_goals_staff_select on public.practice_goals
  for select to authenticated
  using (deleted_at is null and app.has_permission(team_id, 'report.view_all'));

create policy daily_reports_own on public.daily_reports
  for all to authenticated
  using (app.is_own_member(team_member_id))
  with check (app.is_own_member(team_member_id));

create policy daily_reports_staff_select on public.daily_reports
  for select to authenticated
  using (
    deleted_at is null
    and visibility in ('staff', 'team')
    and app.has_permission(team_id, 'report.view_all')
  );

create policy daily_reports_team_select on public.daily_reports
  for select to authenticated
  using (deleted_at is null and visibility = 'team' and app.is_team_member(team_id));

create policy report_feedbacks_select on public.report_feedbacks
  for select to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from public.daily_reports r
      where r.id = report_feedbacks.daily_report_id
        and (app.is_own_member(r.team_member_id) or app.has_permission(r.team_id, 'report.view_all'))
    )
  );

create policy report_feedbacks_staff_write on public.report_feedbacks
  for all to authenticated
  using (app.has_permission(team_id, 'report.view_all'))
  with check (app.has_permission(team_id, 'report.view_all'));

create policy training_records_own on public.training_records
  for all to authenticated
  using (app.is_own_member(team_member_id))
  with check (app.is_own_member(team_member_id));

create policy training_records_staff_select on public.training_records
  for select to authenticated
  using (
    deleted_at is null
    and visibility in ('staff', 'team')
    and app.has_permission(team_id, 'report.view_all')
  );

create policy training_records_team_select on public.training_records
  for select to authenticated
  using (deleted_at is null and visibility = 'team' and app.is_team_member(team_id));

-- 種目・セットは親のトレーニング記録に従う
create policy training_exercises_via_parent on public.training_exercises
  for all to authenticated
  using (
    exists (
      select 1 from public.training_records tr
      where tr.id = training_exercises.training_record_id
        and (app.is_own_member(tr.team_member_id) or app.has_permission(tr.team_id, 'report.view_all'))
    )
  )
  with check (
    exists (
      select 1 from public.training_records tr
      where tr.id = training_exercises.training_record_id
        and app.is_own_member(tr.team_member_id)
    )
  );

create policy training_sets_via_parent on public.training_sets
  for all to authenticated
  using (
    exists (
      select 1
      from public.training_exercises te
      join public.training_records tr on tr.id = te.training_record_id
      where te.id = training_sets.training_exercise_id
        and (app.is_own_member(tr.team_member_id) or app.has_permission(tr.team_id, 'report.view_all'))
    )
  )
  with check (
    exists (
      select 1
      from public.training_exercises te
      join public.training_records tr on tr.id = te.training_record_id
      where te.id = training_sets.training_exercise_id
        and app.is_own_member(tr.team_member_id)
    )
  );

-- =============================================================
-- ファイル・動画
--   自分がアップロードしたもの、スタッフ、または team 公開のもの。
-- =============================================================
create policy files_select on public.files
  for select to authenticated
  using (
    deleted_at is null
    and app.is_team_member(team_id)
    and (
      uploaded_by = app.current_profile_id()
      or visibility = 'team'
      or app.has_permission(team_id, 'video.view_team')
    )
  );

create policy files_insert_own on public.files
  for insert to authenticated
  with check (app.is_team_member(team_id) and uploaded_by = app.current_profile_id());

create policy files_update_own on public.files
  for update to authenticated
  using (uploaded_by = app.current_profile_id() or app.has_permission(team_id, 'storage.manage'))
  with check (uploaded_by = app.current_profile_id() or app.has_permission(team_id, 'storage.manage'));

create policy file_relations_select on public.file_relations
  for select to authenticated
  using (app.is_team_member(team_id));

create policy file_relations_write on public.file_relations
  for all to authenticated
  using (app.is_team_member(team_id))
  with check (app.is_team_member(team_id));

create policy upload_sessions_own on public.upload_sessions
  for all to authenticated
  using (created_by = app.current_profile_id() or app.has_permission(team_id, 'storage.manage'))
  with check (created_by = app.current_profile_id() and app.is_team_member(team_id));

create policy file_deletion_jobs_admin on public.file_deletion_jobs
  for all to authenticated
  using (app.has_permission(team_id, 'storage.manage'))
  with check (app.has_permission(team_id, 'storage.manage'));

create policy storage_usage_admin on public.storage_usage_snapshots
  for select to authenticated
  using (app.has_permission(team_id, 'storage.manage'));

create policy videos_select on public.videos
  for select to authenticated
  using (
    deleted_at is null
    and app.is_team_member(team_id)
    and (
      created_by = app.current_profile_id()
      or visibility = 'team'
      or app.has_permission(team_id, 'video.view_team')
    )
  );

create policy videos_insert on public.videos
  for insert to authenticated
  with check (app.has_permission(team_id, 'video.upload') and created_by = app.current_profile_id());

create policy videos_update on public.videos
  for update to authenticated
  using (created_by = app.current_profile_id() or app.is_staff(team_id))
  with check (created_by = app.current_profile_id() or app.is_staff(team_id));

create policy video_clips_select on public.video_clips
  for select to authenticated
  using (
    deleted_at is null
    and exists (select 1 from public.videos v where v.id = video_clips.video_id)
  );

create policy video_clips_write on public.video_clips
  for all to authenticated
  using (created_by = app.current_profile_id() or app.is_staff(team_id))
  with check (created_by = app.current_profile_id() and app.is_team_member(team_id));

create policy video_tags_select on public.video_tags
  for select to authenticated using (app.is_team_member(team_id));

create policy video_tags_staff_write on public.video_tags
  for all to authenticated
  using (app.is_staff(team_id)) with check (app.is_staff(team_id));

create policy video_tag_relations_select on public.video_tag_relations
  for select to authenticated
  using (exists (select 1 from public.videos v where v.id = video_tag_relations.video_id));

create policy video_tag_relations_staff_write on public.video_tag_relations
  for all to authenticated
  using (exists (select 1 from public.videos v where v.id = video_tag_relations.video_id and app.is_staff(v.team_id)))
  with check (exists (select 1 from public.videos v where v.id = video_tag_relations.video_id and app.is_staff(v.team_id)));

-- =============================================================
-- スキル
-- =============================================================
create policy skill_categories_select on public.skill_categories
  for select to authenticated using (deleted_at is null and app.is_team_member(team_id));

create policy skill_categories_staff_write on public.skill_categories
  for all to authenticated
  using (app.has_permission(team_id, 'skill.review')) with check (app.has_permission(team_id, 'skill.review'));

create policy skills_select on public.skills
  for select to authenticated using (deleted_at is null and app.is_team_member(team_id));

create policy skills_staff_write on public.skills
  for all to authenticated
  using (app.has_permission(team_id, 'skill.review')) with check (app.has_permission(team_id, 'skill.review'));

-- 自分の到達状況は本人とスタッフが見られる
create policy player_skills_select on public.player_skills
  for select to authenticated
  using (deleted_at is null and (app.is_own_member(team_member_id) or app.is_staff(team_id)));

create policy player_skills_own_write on public.player_skills
  for insert to authenticated with check (app.is_own_member(team_member_id));

-- 承認できるのは skill.review を持つ人だけ
create policy player_skills_staff_write on public.player_skills
  for update to authenticated
  using (app.has_permission(team_id, 'skill.review') or app.is_own_member(team_member_id))
  with check (app.has_permission(team_id, 'skill.review') or app.is_own_member(team_member_id));

create policy skill_applications_select on public.skill_applications
  for select to authenticated
  using (deleted_at is null and (app.is_own_member(team_member_id) or app.is_staff(team_id)));

create policy skill_applications_own_write on public.skill_applications
  for all to authenticated
  using (app.is_own_member(team_member_id) or app.has_permission(team_id, 'skill.review'))
  with check (app.is_own_member(team_member_id) or app.has_permission(team_id, 'skill.review'));

create policy skill_application_items_via_parent on public.skill_application_items
  for all to authenticated
  using (
    exists (
      select 1 from public.skill_applications sa
      where sa.id = skill_application_items.skill_application_id
        and (app.is_own_member(sa.team_member_id) or app.is_staff(sa.team_id))
    )
  )
  with check (
    exists (
      select 1 from public.skill_applications sa
      where sa.id = skill_application_items.skill_application_id
        and app.is_own_member(sa.team_member_id)
    )
  );

create policy skill_reviews_select on public.skill_reviews
  for select to authenticated
  using (
    exists (
      select 1 from public.skill_applications sa
      where sa.id = skill_reviews.skill_application_id
        and (app.is_own_member(sa.team_member_id) or app.is_staff(sa.team_id))
    )
  );

create policy skill_reviews_staff_write on public.skill_reviews
  for insert to authenticated
  with check (app.has_permission(team_id, 'skill.review'));

create policy skill_status_histories_select on public.skill_status_histories
  for select to authenticated
  using (
    exists (
      select 1 from public.player_skills ps
      where ps.id = skill_status_histories.player_skill_id
        and (app.is_own_member(ps.team_member_id) or app.is_staff(ps.team_id))
    )
  );

-- =============================================================
-- 動画フィードバック
--   private_staff: 本人 + 回答権限を持つスタッフ
--   selected_members: 上記 + 明示的に選ばれた人（MVP では未使用）
--   team: チーム全員（ただし選手の承認を経た場合のみこの値になる）
-- =============================================================
create policy feedback_requests_select on public.feedback_requests
  for select to authenticated
  using (
    deleted_at is null
    and app.is_team_member(team_id)
    and (
      app.is_own_member(requester_id)
      or app.has_permission(team_id, 'video.feedback_answer')
      or visibility = 'team'
    )
  );

create policy feedback_requests_own_write on public.feedback_requests
  for insert to authenticated
  with check (app.is_own_member(requester_id) and app.has_permission(team_id, 'video.feedback_request'));

create policy feedback_requests_update on public.feedback_requests
  for update to authenticated
  using (app.is_own_member(requester_id) or app.has_permission(team_id, 'video.feedback_answer'))
  with check (app.is_own_member(requester_id) or app.has_permission(team_id, 'video.feedback_answer'));

create policy feedback_responses_select on public.feedback_responses
  for select to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from public.feedback_requests fr
      where fr.id = feedback_responses.feedback_request_id
    )
  );

create policy feedback_responses_coach_write on public.feedback_responses
  for insert to authenticated
  with check (app.has_permission(team_id, 'video.feedback_answer') and app.is_own_member(responder_id));

create policy feedback_messages_select on public.feedback_messages
  for select to authenticated
  using (
    deleted_at is null
    and exists (select 1 from public.feedback_requests fr where fr.id = feedback_messages.feedback_request_id)
  );

create policy feedback_messages_insert on public.feedback_messages
  for insert to authenticated
  with check (app.is_own_member(sender_id) and app.is_team_member(team_id));

create policy feedback_status_histories_select on public.feedback_status_histories
  for select to authenticated
  using (exists (select 1 from public.feedback_requests fr where fr.id = feedback_status_histories.feedback_request_id));

create policy feedback_share_requests_select on public.feedback_share_requests
  for select to authenticated
  using (exists (select 1 from public.feedback_requests fr where fr.id = feedback_share_requests.feedback_request_id));

create policy feedback_share_requests_coach_insert on public.feedback_share_requests
  for insert to authenticated
  with check (app.has_permission(team_id, 'video.feedback_answer') and app.is_own_member(requested_by));

-- 承認・却下できるのは、依頼した本人（選手）だけ（29章）
create policy feedback_share_requests_player_update on public.feedback_share_requests
  for update to authenticated
  using (
    exists (
      select 1 from public.feedback_requests fr
      where fr.id = feedback_share_requests.feedback_request_id
        and app.is_own_member(fr.requester_id)
    )
  )
  with check (
    exists (
      select 1 from public.feedback_requests fr
      where fr.id = feedback_share_requests.feedback_request_id
        and app.is_own_member(fr.requester_id)
    )
  );

-- =============================================================
-- 通知
-- =============================================================
create policy notifications_select on public.notifications
  for select to authenticated
  using (
    app.is_team_member(team_id)
    and exists (
      select 1 from public.notification_targets nt
      where nt.notification_id = notifications.id and app.is_own_member(nt.team_member_id)
    )
  );

create policy notification_targets_select on public.notification_targets
  for select to authenticated
  using (app.is_own_member(team_member_id));

create policy notification_targets_update on public.notification_targets
  for update to authenticated
  using (app.is_own_member(team_member_id))
  with check (app.is_own_member(team_member_id));

-- =============================================================
-- 測定
-- =============================================================
create policy measurement_events_select on public.measurement_events
  for select to authenticated using (deleted_at is null and app.is_team_member(team_id));

create policy measurement_events_staff_write on public.measurement_events
  for all to authenticated
  using (app.is_staff(team_id)) with check (app.is_staff(team_id));

create policy measurement_items_select on public.measurement_items
  for select to authenticated using (app.is_team_member(team_id));

create policy measurement_items_staff_write on public.measurement_items
  for all to authenticated
  using (app.is_staff(team_id)) with check (app.is_staff(team_id));

-- 測定結果は本人とスタッフ
create policy measurement_results_select on public.measurement_results
  for select to authenticated
  using (app.is_own_member(team_member_id) or app.is_staff(team_id));

create policy measurement_results_staff_write on public.measurement_results
  for all to authenticated
  using (app.is_staff(team_id)) with check (app.is_staff(team_id));

-- =============================================================
-- Import（50章）
--   import.execute を持つ人だけ。CSV 内の team_id は使わない。
-- =============================================================
create policy import_sessions_select on public.import_sessions
  for select to authenticated
  using (app.has_permission(team_id, 'import.execute'));

create policy import_sessions_write on public.import_sessions
  for all to authenticated
  using (app.has_permission(team_id, 'import.execute'))
  with check (app.has_permission(team_id, 'import.execute') and created_by = app.current_profile_id());

create policy import_rows_via_session on public.import_rows
  for all to authenticated
  using (
    exists (
      select 1 from public.import_sessions s
      where s.id = import_rows.import_session_id and app.has_permission(s.team_id, 'import.execute')
    )
  )
  with check (
    exists (
      select 1 from public.import_sessions s
      where s.id = import_rows.import_session_id and app.has_permission(s.team_id, 'import.execute')
    )
  );

create policy import_mappings_via_session on public.import_mappings
  for all to authenticated
  using (
    exists (
      select 1 from public.import_sessions s
      where s.id = import_mappings.import_session_id and app.has_permission(s.team_id, 'import.execute')
    )
  )
  with check (
    exists (
      select 1 from public.import_sessions s
      where s.id = import_mappings.import_session_id and app.has_permission(s.team_id, 'import.execute')
    )
  );

create policy import_record_links_via_session on public.import_record_links
  for all to authenticated
  using (
    exists (
      select 1 from public.import_sessions s
      where s.id = import_record_links.import_session_id and app.has_permission(s.team_id, 'import.execute')
    )
  )
  with check (
    exists (
      select 1 from public.import_sessions s
      where s.id = import_record_links.import_session_id and app.has_permission(s.team_id, 'import.execute')
    )
  );


-- ---------- 0009_master_data.sql ----------
-- =============================================================
-- 0009_master_data.sql
-- ロールと権限のマスタ（13章）。
-- これはアプリの動作に必須なので seed ではなく migration に置く。
-- =============================================================

insert into public.roles (code, label_ja, description, sort_order) values
  ('system_admin', '管理者',       'すべての操作ができる',                 10),
  ('coach',        'コーチ',       '指導・フィードバック・承認を行う',     20),
  ('manager',      'マネージャー', '予定や記録の管理を行う',               30),
  ('player',       '選手',         '自分の記録と質問を行う',               40)
on conflict (code) do update
  set label_ja = excluded.label_ja,
      description = excluded.description,
      sort_order = excluded.sort_order;

insert into public.permissions (code, label_ja, description) values
  ('video.upload',           '動画を投稿する',           '短編動画のアップロードと YouTube 動画の登録'),
  ('video.view_team',        'チームの動画を見る',       'チーム内で共有された動画の閲覧'),
  ('video.feedback_request', '動画で質問する',           'フィードバック依頼の作成'),
  ('video.feedback_answer',  '動画の質問に答える',       'フィードバック依頼への回答・担当割り当て'),
  ('skill.review',           'スキルを審査する',         'スキル申請の承認・却下とスキル定義の編集'),
  ('report.view_all',        '全員の日報を見る',         'staff 公開以上の日報・トレーニング記録の閲覧'),
  ('event.manage',           '予定を管理する',           'シーズン・週・イベントの作成と編集'),
  ('import.execute',         'データ移行を実行する',     'Import Center の利用'),
  ('storage.manage',         '保存容量を管理する',       '容量集計とファイルの物理削除')
on conflict (code) do update
  set label_ja = excluded.label_ja,
      description = excluded.description;

-- 役割ごとの既定権限 ------------------------------------------

-- 管理者: すべて
insert into public.role_permissions (role_code, permission_code)
select 'system_admin', code from public.permissions
on conflict do nothing;

-- コーチ: 指導に必要なものすべて。データ移行は既定では持たせない。
insert into public.role_permissions (role_code, permission_code) values
  ('coach', 'video.upload'),
  ('coach', 'video.view_team'),
  ('coach', 'video.feedback_request'),
  ('coach', 'video.feedback_answer'),
  ('coach', 'skill.review'),
  ('coach', 'report.view_all'),
  ('coach', 'event.manage')
on conflict do nothing;

-- マネージャー: 予定と記録の管理。回答や承認はしない。
insert into public.role_permissions (role_code, permission_code) values
  ('manager', 'video.upload'),
  ('manager', 'video.view_team'),
  ('manager', 'report.view_all'),
  ('manager', 'event.manage')
on conflict do nothing;

-- 選手: 自分の記録と質問
insert into public.role_permissions (role_code, permission_code) values
  ('player', 'video.upload'),
  ('player', 'video.view_team'),
  ('player', 'video.feedback_request')
on conflict do nothing;


-- ---------- 0010_grants.sql ----------
-- =============================================================
-- 0010_grants.sql
-- テーブル権限。
--
-- Supabase は既定で public スキーマの新規テーブルを anon / authenticated へ
-- 付与するが、環境差で挙動が変わると RLS の検証結果も変わってしまう。
-- ここで明示的に「ログイン済みだけ」に揃える。
--
-- 行の見え方は RLS が決める。ここで与えるのはテーブルへの到達可否だけ。
-- =============================================================

-- 未ログイン（anon）は public のデータに一切触れない。
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- 監査ログとマスタは読み取りだけにする（書き込みはサーバー経由）。
revoke insert, update, delete on public.audit_logs from authenticated;
revoke insert, update, delete on public.roles from authenticated;
revoke insert, update, delete on public.permissions from authenticated;
revoke insert, update, delete on public.role_permissions from authenticated;

-- 以後に追加されるテーブルにも同じ既定を適用する。
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;


-- ---------- 0011_cross_team_reference_guard.sql ----------
-- =============================================================
-- 0011_cross_team_reference_guard.sql
--
-- 別チームのレコードを参照する行を作れないようにする。
--
-- 見つかった問題:
--   video_clips の RLS は「作成者が自分」「team_id が自分のチーム」しか見ていなかった。
--   そのため、別チームの video_id を指すクリップを、自分のチームの行として
--   作れてしまった（動画のUUIDを知っていれば）。
--   同じことが feedback_requests でも起きる。
--
-- 対処:
--   RLS ではなくトリガで、参照先とチームが一致することを保証する。
--   これは権限の問題ではなくデータの整合性なので、
--   どの経路（service role を含む）から書いても守られるべき。
-- =============================================================

-- -------------------------------------------------------------
-- 仮想クリップ: 元動画と同じチームでなければならない
-- -------------------------------------------------------------
create or replace function app.validate_video_clip()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_duration numeric;
  v_team_id  uuid;
begin
  select duration_seconds, team_id into v_duration, v_team_id
  from public.videos
  where id = new.video_id;

  if v_team_id is null then
    raise exception '対象の動画が見つかりません';
  end if;

  -- 別チームの動画を参照させない（62章）
  if v_team_id <> new.team_id then
    raise exception '別のチームの動画は参照できません';
  end if;

  if v_duration is not null and new.end_seconds > v_duration then
    raise exception 'クリップの終了位置(%)が動画の長さ(%)を超えています', new.end_seconds, v_duration;
  end if;

  return new;
end;
$$;

-- -------------------------------------------------------------
-- フィードバック依頼: 参照する動画・クリップ・イベントも同じチーム
-- -------------------------------------------------------------
create or replace function app.validate_feedback_references()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team_id uuid;
begin
  if new.video_id is not null then
    select team_id into v_team_id from public.videos where id = new.video_id;
    if v_team_id is null or v_team_id <> new.team_id then
      raise exception '別のチームの動画は参照できません';
    end if;
  end if;

  if new.video_clip_id is not null then
    select team_id into v_team_id from public.video_clips where id = new.video_clip_id;
    if v_team_id is null or v_team_id <> new.team_id then
      raise exception '別のチームのクリップは参照できません';
    end if;
  end if;

  if new.event_id is not null then
    select team_id into v_team_id from public.events where id = new.event_id;
    if v_team_id is null or v_team_id <> new.team_id then
      raise exception '別のチームの予定は参照できません';
    end if;
  end if;

  if new.daily_report_id is not null then
    select team_id into v_team_id from public.daily_reports where id = new.daily_report_id;
    if v_team_id is null or v_team_id <> new.team_id then
      raise exception '別のチームの日報は参照できません';
    end if;
  end if;

  -- 依頼者が本当にそのチームの一員か
  select team_id into v_team_id from public.team_members where id = new.requester_id;
  if v_team_id is null or v_team_id <> new.team_id then
    raise exception '依頼者がこのチームの所属ではありません';
  end if;

  return new;
end;
$$;

drop trigger if exists feedback_requests_validate_references on public.feedback_requests;
create trigger feedback_requests_validate_references
  before insert or update on public.feedback_requests
  for each row execute function app.validate_feedback_references();

-- -------------------------------------------------------------
-- 動画: R2 のファイルを参照する場合も同じチームでなければならない
-- -------------------------------------------------------------
create or replace function app.validate_video_references()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team_id uuid;
begin
  if new.file_id is not null then
    select team_id into v_team_id from public.files where id = new.file_id;
    if v_team_id is null or v_team_id <> new.team_id then
      raise exception '別のチームのファイルは参照できません';
    end if;
  end if;

  if new.event_id is not null then
    select team_id into v_team_id from public.events where id = new.event_id;
    if v_team_id is null or v_team_id <> new.team_id then
      raise exception '別のチームの予定は参照できません';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists videos_validate_references on public.videos;
create trigger videos_validate_references
  before insert or update on public.videos
  for each row execute function app.validate_video_references();


-- ---------- 0012_video_visibility_fix.sql ----------
-- =============================================================
-- 0012_video_visibility_fix.sql
--
-- 動画とファイルの公開範囲が効いていなかったのを直す。
--
-- 見つかった問題:
--   videos / files のポリシーが「video.view_team を持っていれば見える」
--   になっていた。しかし video.view_team は選手にも既定で付いている
--   （13章の「チームの動画を見る」）。
--   結果として、公開範囲を private_staff にしても、
--   同じチームの選手全員から見えてしまっていた。
--
--   選手が自分の失敗を全員に見られる前提だと、動画で質問しなくなる。
--   29章で「コーチが一方的に team 公開へ変えられない」ようにした意味も無くなる。
--
-- 直し方:
--   権限の意味を、名前のとおりに使い分ける。
--     video.view_team      … チームへ共有された動画を見る
--     video.feedback_answer … 回答するために、本人の非公開動画も見る
--
--   つまり private_staff は「本人 + 回答権限を持つスタッフ」になる
--   （docs/permissions.md の表と一致させる）。
-- =============================================================

drop policy if exists videos_select on public.videos;

create policy videos_select on public.videos
  for select to authenticated
  using (
    deleted_at is null
    and app.is_team_member(team_id)
    and (
      -- 自分が登録したもの
      created_by = app.current_profile_id()
      -- チームへ共有されたもの
      or (visibility = 'team' and app.has_permission(team_id, 'video.view_team'))
      -- 回答するために見る必要があるスタッフ
      or app.has_permission(team_id, 'video.feedback_answer')
      -- 容量管理のために全体を見る必要がある人
      or app.has_permission(team_id, 'storage.manage')
    )
  );

drop policy if exists files_select on public.files;

create policy files_select on public.files
  for select to authenticated
  using (
    deleted_at is null
    and app.is_team_member(team_id)
    and (
      uploaded_by = app.current_profile_id()
      or (visibility = 'team' and app.has_permission(team_id, 'video.view_team'))
      or app.has_permission(team_id, 'video.feedback_answer')
      or app.has_permission(team_id, 'storage.manage')
    )
  );

-- -------------------------------------------------------------
-- 仮想クリップも、元動画が見えるときだけ見えるようにする。
--
-- これまでは「videos に行があること」だけを見ていた。
-- 上のポリシーで videos 自体が絞られるため実害は無くなるが、
-- 意図をはっきりさせるために条件を書き直す。
-- -------------------------------------------------------------
drop policy if exists video_clips_select on public.video_clips;

create policy video_clips_select on public.video_clips
  for select to authenticated
  using (
    deleted_at is null
    and app.is_team_member(team_id)
    and exists (
      -- videos 側の RLS が効くので、見てよい動画のクリップだけが残る
      select 1 from public.videos v where v.id = video_clips.video_id
    )
  );


-- ---------- 0013_soft_delete_rpc.sql ----------
-- =============================================================
-- 0013_soft_delete_rpc.sql
--
-- 論理削除ができなくなっていたのを直す。
--
-- 見つかった問題:
--   PostgreSQL は UPDATE のとき、SELECT ポリシーを**更新後の行にも**適用する。
--   （検証済み: SELECT ポリシーを足すと同じ UPDATE が通るようになる）
--
--   files / videos の SELECT ポリシーには `deleted_at is null` が入っている。
--   そのため deleted_at を入れた瞬間に自分から見えない行になり、
--   「new row violates row-level security policy」で弾かれていた。
--   つまり**誰も論理削除できなかった**。
--
-- 直し方の選択:
--   (A) 所有者は削除済みも見える、という SELECT ポリシーを足す
--       → 62章「削除済みファイルを通常閲覧できない」が緩む。採らない。
--   (B) 論理削除だけを security definer の関数で行う
--       → SELECT ポリシーは厳しいまま保てる。
--         削除は「特別な操作」として、監査ログと物理削除の予約も同時に作れる。
--
--   (B) を採る。60章（30日後に物理削除）と63章（動画削除を監査ログに残す）も
--   同じ場所で満たせるため、結果的にこちらのほうが筋がよい。
-- =============================================================

/**
 * 投稿した動画を削除する（論理削除）。
 *
 * できるのは、投稿した本人か storage.manage を持つ人だけ。
 * 実体は消さず、30日後に物理削除するための予約を作る（60章）。
 */
create or replace function public.soft_delete_video(p_video_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_video   public.videos;
  v_file    public.files;
  v_profile uuid;
  v_days    int := 30;
begin
  v_profile := app.current_profile_id();
  if v_profile is null then
    raise exception 'ログインしていません';
  end if;

  select * into v_video from public.videos where id = p_video_id and deleted_at is null;
  if v_video.id is null then
    raise exception '対象の動画が見つかりません';
  end if;

  -- 本人か、容量を管理する人だけ
  if v_video.created_by <> v_profile and not app.has_permission(v_video.team_id, 'storage.manage') then
    raise exception 'この動画を削除する権限がありません';
  end if;

  update public.videos set deleted_at = now() where id = p_video_id;

  -- R2 のファイルを持つ動画なら、ファイルも論理削除して物理削除を予約する
  if v_video.file_id is not null then
    select * into v_file from public.files where id = v_video.file_id;

    if v_file.id is not null and v_file.deleted_at is null then
      update public.files
      set deleted_at = now(), upload_status = 'deleted'
      where id = v_file.id;

      insert into public.file_deletion_jobs (team_id, file_id, scheduled_for)
      values (v_file.team_id, v_file.id, now() + make_interval(days => v_days));
    end if;
  end if;

  -- 63章: 動画削除は監査ログに残す。key や URL そのものは残さない。
  insert into public.audit_logs (team_id, actor_id, action, target_table, target_id, summary)
  values (
    v_video.team_id,
    v_profile,
    'video.delete',
    'videos',
    p_video_id,
    format('動画を削除: %s（%s日後に実体を削除）', v_video.title, v_days)
  );
end;
$$;

revoke all on function public.soft_delete_video(uuid) from public;
grant execute on function public.soft_delete_video(uuid) to authenticated;

/**
 * 同じ理由で、仮想クリップも関数で消す。
 * こちらは実体を持たないので、履歴だけ残す。
 */
create or replace function public.soft_delete_video_clip(p_clip_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clip    public.video_clips;
  v_profile uuid;
begin
  v_profile := app.current_profile_id();
  if v_profile is null then
    raise exception 'ログインしていません';
  end if;

  select * into v_clip from public.video_clips where id = p_clip_id and deleted_at is null;
  if v_clip.id is null then
    raise exception '対象の場面が見つかりません';
  end if;

  if v_clip.created_by <> v_profile and not app.is_staff(v_clip.team_id) then
    raise exception 'この場面を削除する権限がありません';
  end if;

  -- 質問に使われている場面は消さない（質問の中身が読めなくなるため）
  if exists (
    select 1 from public.feedback_requests
    where video_clip_id = p_clip_id and deleted_at is null
  ) then
    raise exception 'この場面は質問に使われているため削除できません';
  end if;

  update public.video_clips set deleted_at = now() where id = p_clip_id;
end;
$$;

revoke all on function public.soft_delete_video_clip(uuid) from public;
grant execute on function public.soft_delete_video_clip(uuid) to authenticated;


-- ---------- 0014_skill_guards.sql ----------
-- =============================================================
-- 0014_skill_guards.sql
--
-- スキル（30〜32章）を書く前に確かめること。
--
-- 見つかった問題:
--   player_skills の更新ポリシーが
--     using (skill.review を持つ or 本人)
--   になっていた。つまり**選手が自分の到達状況を approved にできた**。
--   スキル承認はこのシステムで唯一「他人に認めてもらう」記録なので、
--   自分で書き換えられるなら意味がない。
--   skill_applications も同じで、本人が自分の申請を approved にできた。
--
-- 対処:
--   0011 と同じ考え方で、RLS ではなくトリガで守る。
--   これは権限だけの話ではなく「その行が正しいか」の話なので、
--   service role を含めどの経路から書いても守られるべき。
--
--   ついでに、参照先のチーム一致（0011 の教訓）と
--   到達状況の履歴（75章）もここでまとめて面倒を見る。
-- =============================================================

-- -------------------------------------------------------------
-- 到達状況: 承認できるのは審査できる人だけ
-- -------------------------------------------------------------
create or replace function app.validate_player_skill()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_skill_team  uuid;
  v_member_team uuid;
  v_was_approved boolean := false;
begin
  -- 参照先のチーム一致（0011 の教訓）
  select team_id into v_skill_team from public.skills where id = new.skill_id;
  if v_skill_team is null then
    raise exception '対象のスキルが見つかりません';
  end if;
  if v_skill_team <> new.team_id then
    raise exception '別のチームのスキルは参照できません';
  end if;

  select team_id into v_member_team from public.team_members where id = new.team_member_id;
  if v_member_team is null then
    raise exception '対象の部員が見つかりません';
  end if;
  if v_member_team <> new.team_id then
    raise exception '別のチームの部員は参照できません';
  end if;

  if tg_op = 'UPDATE' then
    v_was_approved := old.status = 'approved';
  end if;

  -- 承認へ入るときと、承認から出るときは skill.review が要る
  if new.status = 'approved' and not v_was_approved then
    if not app.has_permission(new.team_id, 'skill.review') then
      raise exception 'スキルを承認できるのは審査担当だけです';
    end if;
    new.approved_at := now();
    new.approved_by := app.current_profile_id();
  elsif v_was_approved and new.status <> 'approved' then
    if not app.has_permission(new.team_id, 'skill.review') then
      raise exception '承認済みのスキルを取り消せるのは審査担当だけです';
    end if;
    new.approved_at := null;
    new.approved_by := null;
  elsif new.status <> 'approved' then
    -- 承認していないのに承認の跡だけ残す、を防ぐ
    new.approved_at := null;
    new.approved_by := null;
  end if;

  return new;
end;
$$;

drop trigger if exists player_skills_validate on public.player_skills;
create trigger player_skills_validate
  before insert or update on public.player_skills
  for each row execute function app.validate_player_skill();

-- -------------------------------------------------------------
-- 到達状況の履歴（75章）
--
-- 画面から書き忘れることがあるので、DB 側で自動的に残す。
-- 「いつ承認されたか」は選手にとって一番大事な記録なので、
-- アプリの実装漏れで欠けてはいけない。
-- -------------------------------------------------------------
create or replace function app.log_player_skill_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- 何も起きていない 'not_started' での作成は履歴に残さない（読むときの雑音になる）
  if tg_op = 'INSERT' then
    if new.status <> 'not_started' then
      insert into public.skill_status_histories (team_id, player_skill_id, from_status, to_status, changed_by)
      values (new.team_id, new.id, null, new.status, app.current_profile_id());
    end if;
  elsif new.status is distinct from old.status then
    insert into public.skill_status_histories (team_id, player_skill_id, from_status, to_status, changed_by)
    values (new.team_id, new.id, old.status, new.status, app.current_profile_id());
  end if;

  return new;
end;
$$;

drop trigger if exists player_skills_log_status on public.player_skills;
create trigger player_skills_log_status
  after insert or update on public.player_skills
  for each row execute function app.log_player_skill_status();

-- -------------------------------------------------------------
-- 申請: 審査結果を本人が書き込めないようにする
-- -------------------------------------------------------------
create or replace function app.validate_skill_application()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_skill_team  uuid;
  v_member_team uuid;
  v_old_status  text;
begin
  select team_id into v_skill_team from public.skills where id = new.skill_id;
  if v_skill_team is null then
    raise exception '対象のスキルが見つかりません';
  end if;
  if v_skill_team <> new.team_id then
    raise exception '別のチームのスキルは参照できません';
  end if;

  select team_id into v_member_team from public.team_members where id = new.team_member_id;
  if v_member_team is null then
    raise exception '対象の部員が見つかりません';
  end if;
  if v_member_team <> new.team_id then
    raise exception '別のチームの部員は参照できません';
  end if;

  v_old_status := case when tg_op = 'UPDATE' then old.status else null end;

  -- 審査の結果にあたる状態は、審査担当しか付けられない
  if new.status in ('reviewing', 'approved', 'rejected') and new.status is distinct from v_old_status then
    if not app.has_permission(new.team_id, 'skill.review') then
      raise exception '申請を審査できるのは審査担当だけです';
    end if;
    new.reviewed_at := now();
  end if;

  if new.status = 'submitted' and new.status is distinct from v_old_status then
    new.submitted_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists skill_applications_validate on public.skill_applications;
create trigger skill_applications_validate
  before insert or update on public.skill_applications
  for each row execute function app.validate_skill_application();

-- -------------------------------------------------------------
-- 申請の根拠: 別チームの動画・質問を添えられないようにする（0011 の教訓）
-- -------------------------------------------------------------
create or replace function app.validate_skill_application_item()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team uuid;
begin
  select team_id into v_team from public.skill_applications where id = new.skill_application_id;
  if v_team is null then
    raise exception '対象の申請が見つかりません';
  end if;
  if v_team <> new.team_id then
    raise exception '別のチームの申請には根拠を足せません';
  end if;

  if new.video_id is not null then
    select team_id into v_team from public.videos where id = new.video_id;
    if v_team is distinct from new.team_id then
      raise exception '別のチームの動画は参照できません';
    end if;
  end if;

  if new.video_clip_id is not null then
    select team_id into v_team from public.video_clips where id = new.video_clip_id;
    if v_team is distinct from new.team_id then
      raise exception '別のチームのクリップは参照できません';
    end if;
  end if;

  if new.feedback_request_id is not null then
    select team_id into v_team from public.feedback_requests where id = new.feedback_request_id;
    if v_team is distinct from new.team_id then
      raise exception '別のチームの質問は参照できません';
    end if;
  end if;

  if new.file_id is not null then
    select team_id into v_team from public.files where id = new.file_id;
    if v_team is distinct from new.team_id then
      raise exception '別のチームのファイルは参照できません';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists skill_application_items_validate on public.skill_application_items;
create trigger skill_application_items_validate
  before insert or update on public.skill_application_items
  for each row execute function app.validate_skill_application_item();

-- -------------------------------------------------------------
-- 審査結果: 対象の申請と同じチームであること
-- -------------------------------------------------------------
create or replace function app.validate_skill_review()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team uuid;
begin
  select team_id into v_team from public.skill_applications where id = new.skill_application_id;
  if v_team is null then
    raise exception '対象の申請が見つかりません';
  end if;
  if v_team <> new.team_id then
    raise exception '別のチームの申請は審査できません';
  end if;

  return new;
end;
$$;

drop trigger if exists skill_reviews_validate on public.skill_reviews;
create trigger skill_reviews_validate
  before insert or update on public.skill_reviews
  for each row execute function app.validate_skill_review();

-- -------------------------------------------------------------
-- 履歴は消させない・書き換えさせない
--
-- 「いつ承認されたか」を後から書き換えられると、記録の意味がなくなる。
-- 追加はトリガ（security definer）が行うので、
-- 利用者から直接 insert できる必要はない。
-- -------------------------------------------------------------
revoke insert, update, delete on public.skill_status_histories from authenticated;
revoke update, delete on public.skill_reviews from authenticated;


-- ---------- 0015_notification_insert.sql ----------
-- =============================================================
-- 0015_notification_insert.sql
--
-- 見つかった問題:
--   notifications と notification_targets は RLS を有効にしてあるのに、
--   INSERT のポリシーが1つも無かった。
--   RLS は「ポリシーが無ければ拒否」なので、通知は**1件も作られていなかった**。
--
--   気付けなかったのは、アプリ側が通知の失敗を握りつぶしていたため。
--   supabase-js は例外を投げず { error } を返すので、
--   try/catch では拾えず、通知が無いことに誰も気付かない。
--
-- 対処:
--   INSERT のポリシーを足す。
--   通知は「自分のチームの人へ、自分の名前で送る」ものに限る。
--
-- なぜ service role にしないか:
--   通知はごく普通の書き込みで、RLS で表現できる（ADR-0003 の逆）。
--   RLS を迂回する経路は、本当に表現できないものだけに留めたい。
-- =============================================================

-- 自分のチームへ、自分の名前で。差出人を偽れないようにする。
create policy notifications_insert on public.notifications
  for insert to authenticated
  with check (
    app.is_team_member(team_id)
    and created_by = app.current_profile_id()
  );

-- 自分が作った通知か。
--
-- ポリシーの中から素朴に notifications を select すると、
-- **その select にも notifications の SELECT ポリシーが効く**。
-- notifications は「自分が宛先の通知だけ見える」ので、
-- 宛先を入れる前の通知は自分にも見えず、いつまでも条件を満たせない。
-- 判定は security definer の関数に逃がす（0002 の app.* と同じ理由）。
create or replace function app.owns_notification(p_notification_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.notifications n
    where n.id = p_notification_id
      and n.created_by = app.current_profile_id()
  );
$$;

revoke all on function app.owns_notification(uuid) from public;
grant execute on function app.owns_notification(uuid) to authenticated;

-- 宛先を足せるのは、その通知を自分が作った場合だけ。
-- 宛先は同じチームの在籍者に限る。
create policy notification_targets_insert on public.notification_targets
  for insert to authenticated
  with check (
    app.owns_notification(notification_id)
    and exists (
      select 1
      from public.team_members tm
      where tm.id = notification_targets.team_member_id
        and tm.status = 'active'
        and tm.deleted_at is null
        and app.is_team_member(tm.team_id)
    )
  );

-- 送った通知を後から書き換えたり消したりはさせない。
-- 「そんな通知は送っていない」と言えてしまうと、記録の意味がなくなる。
-- 宛先の update は既読の記録に使うので残す（notification_targets_update）。
revoke update, delete on public.notifications from authenticated;
revoke delete on public.notification_targets from authenticated;

-- スキルの通知にも種別が要る（0007 の CHECK に無かった）
alter table public.notifications
  drop constraint if exists notifications_notification_type_check;

alter table public.notifications
  add constraint notifications_notification_type_check
  check (notification_type in (
    'feedback_requested', 'feedback_assigned', 'feedback_answered',
    'feedback_follow_up', 'feedback_acknowledged', 'feedback_overdue',
    'share_approval_requested',
    'skill_applied', 'skill_application_updated',
    'report_missing', 'training_missing', 'general'));


-- ---------- 0016_storage_ops.sql ----------
-- =============================================================
-- 0016_storage_ops.sql
-- 容量の集計と、たまったものの掃除（59章・60章）。
--
-- どれも「本人以外の行を触る」または「削除済みの行を触る」ため、
-- 素朴な UPDATE では通らない。理由は2つ。
--
--   1. upload_sessions の with check が created_by = 自分 になっている。
--      管理者でも他人のセッションは書き換えられない。
--   2. files の SELECT ポリシーが deleted_at is null なので、
--      論理削除済みの行を更新しようとすると弾かれる
--      （PostgreSQL は更新後の行にも SELECT ポリシーを適用する。0013 と同じ）。
--
-- どちらもポリシーの書き方の問題ではないので、
-- 0013 と同じく security definer の関数を通す。
-- 権限の確認は関数の中で自分で行う。
-- =============================================================

-- 権限確認を1か所に。書き忘れを防ぐ。
create or replace function app.require_storage_manage(p_team_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not app.has_permission(p_team_id, 'storage.manage') then
    raise exception '保存容量を管理する権限がありません';
  end if;
end;
$$;

revoke all on function app.require_storage_manage(uuid) from public;
grant execute on function app.require_storage_manage(uuid) to authenticated;

-- -------------------------------------------------------------
-- 容量の集計（59章）
--
-- 1日1件。同じ日に何度呼んでも上書きする。
-- 「削除待ち」を別に数えるのは、それがまだ R2 の容量を使っているため。
-- -------------------------------------------------------------
create or replace function public.capture_storage_usage(p_team_id uuid)
returns public.storage_usage_snapshots
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_row   public.storage_usage_snapshots;
begin
  perform app.require_storage_manage(p_team_id);

  insert into public.storage_usage_snapshots (
    team_id, captured_on, total_bytes, video_bytes, image_bytes, pdf_bytes,
    temp_bytes, deleted_bytes, file_count
  )
  select
    p_team_id,
    v_today,
    coalesce(sum(f.size_bytes), 0),
    coalesce(sum(f.size_bytes) filter (where f.media_type = 'video'), 0),
    coalesce(sum(f.size_bytes) filter (where f.media_type = 'image'), 0),
    coalesce(sum(f.size_bytes) filter (where f.media_type = 'pdf'), 0),
    -- 一時領域はまだ本置き場に移っていないもの
    coalesce(sum(f.size_bytes) filter (where f.storage_key like '%/tmp/%'), 0),
    -- 論理削除しただけで、実体がまだ残っているもの
    coalesce(sum(f.size_bytes) filter (where f.deleted_at is not null and f.upload_status <> 'deleted'), 0),
    count(*)
  from public.files f
  where f.team_id = p_team_id
    -- 実体を消したものは、もう容量を使っていない
    and f.upload_status <> 'deleted'
  on conflict (team_id, captured_on) do update
    set total_bytes   = excluded.total_bytes,
        video_bytes   = excluded.video_bytes,
        image_bytes   = excluded.image_bytes,
        pdf_bytes     = excluded.pdf_bytes,
        temp_bytes    = excluded.temp_bytes,
        deleted_bytes = excluded.deleted_bytes,
        file_count    = excluded.file_count
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.capture_storage_usage(uuid) from public;
grant execute on function public.capture_storage_usage(uuid) to authenticated;

-- -------------------------------------------------------------
-- 物理削除の後始末（60章・63章）
--
-- R2 から実体を消すのはアプリの仕事（DB からは R2 を触れない）。
-- この関数は「消し終わった」という記録だけを引き受ける。
--
-- 失敗したときも呼ぶ。理由を残して、次回また拾えるようにする。
-- -------------------------------------------------------------
create or replace function public.complete_file_deletion(p_job_id uuid, p_error text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job     public.file_deletion_jobs;
  v_key     text;
begin
  select * into v_job from public.file_deletion_jobs where id = p_job_id;
  if v_job.id is null then
    raise exception '対象の削除予約が見つかりません';
  end if;

  perform app.require_storage_manage(v_job.team_id);

  if p_error is not null then
    update public.file_deletion_jobs
      set status = 'failed', attempted_at = now(), error_message = left(p_error, 500)
      where id = p_job_id;
    return;
  end if;

  update public.file_deletion_jobs
    set status = 'done', attempted_at = now(), error_message = null
    where id = p_job_id;

  -- 実体が無くなったことを files 側にも残す。
  -- 行そのものは消さない。「いつ何があって、いつ消えたか」は記録として要る。
  update public.files
    set upload_status = 'deleted'
    where id = v_job.file_id
    returning storage_key into v_key;

  -- 63章: 物理削除は監査ログに残す。key は残すが氏名は入っていない。
  insert into public.audit_logs (team_id, actor_id, action, target_table, target_id, summary)
  values (v_job.team_id, app.current_profile_id(), 'file.hard_delete', 'files', v_job.file_id,
          coalesce(v_key, '(不明)'));
end;
$$;

revoke all on function public.complete_file_deletion(uuid, text) from public;
grant execute on function public.complete_file_deletion(uuid, text) to authenticated;

-- -------------------------------------------------------------
-- 途中でやめたアップロードの片付け（21章・60章）
--
-- 期限を過ぎても pending のままのセッションは、
-- ブラウザを閉じたなどで終わらなかったもの。
-- 放っておくと「1日の本数」を無駄に食う。
-- -------------------------------------------------------------
create or replace function public.expire_stale_uploads(p_team_id uuid)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count int;
begin
  perform app.require_storage_manage(p_team_id);

  update public.upload_sessions
    set status = 'failed', failure_reason = '期限切れ（自動整理）'
    where team_id = p_team_id
      and status in ('pending', 'uploading', 'uploaded', 'verifying')
      and expires_at < now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.expire_stale_uploads(uuid) from public;
grant execute on function public.expire_stale_uploads(uuid) to authenticated;

-- -------------------------------------------------------------
-- 集計の記録は、関数を通してだけ作る
--
-- 手で書き換えられると、容量の記録が当てにならなくなる。
-- -------------------------------------------------------------
revoke insert, update, delete on public.storage_usage_snapshots from authenticated;


-- ---------- 0017_measurement_guards.sql ----------
-- =============================================================
-- 0017_measurement_guards.sql
-- 測定（3章の6: 成長を確認できる）を書く前に確かめること。
--
-- 0011 の教訓をそのまま当てる。
-- measurement_results は3つの表を指しているのに、
-- RLS は自分の team_id しか見ていなかった。
-- 別チームの記録会・項目・部員を指す行を作れてしまう。
--
-- チームの一致は権限ではなくデータの整合性なので、トリガで守る。
-- =============================================================

create or replace function app.validate_measurement_result()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team uuid;
begin
  select team_id into v_team from public.measurement_events where id = new.measurement_event_id;
  if v_team is null then
    raise exception '対象の測定会が見つかりません';
  end if;
  if v_team <> new.team_id then
    raise exception '別のチームの測定会は参照できません';
  end if;

  select team_id into v_team from public.measurement_items where id = new.measurement_item_id;
  if v_team is distinct from new.team_id then
    raise exception '別のチームの測定項目は参照できません';
  end if;

  select team_id into v_team from public.team_members where id = new.team_member_id;
  if v_team is distinct from new.team_id then
    raise exception '別のチームの部員は参照できません';
  end if;

  -- 数値も文字も入っていない行は、記録として意味がない
  if new.value is null and (new.text_value is null or btrim(new.text_value) = '') then
    raise exception '測定の値が入っていません';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists measurement_results_validate on public.measurement_results;
create trigger measurement_results_validate
  before insert or update on public.measurement_results
  for each row execute function app.validate_measurement_result();

-- -------------------------------------------------------------
-- 測定会も、参照先のシーズン・予定が同じチームであること
-- -------------------------------------------------------------
create or replace function app.validate_measurement_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team uuid;
begin
  if new.season_id is not null then
    select team_id into v_team from public.seasons where id = new.season_id;
    if v_team is distinct from new.team_id then
      raise exception '別のチームのシーズンは参照できません';
    end if;
  end if;

  if new.event_id is not null then
    select team_id into v_team from public.events where id = new.event_id;
    if v_team is distinct from new.team_id then
      raise exception '別のチームの予定は参照できません';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists measurement_events_validate on public.measurement_events;
create trigger measurement_events_validate
  before insert or update on public.measurement_events
  for each row execute function app.validate_measurement_event();

-- -------------------------------------------------------------
-- 自分の記録は自分でも入れられるようにする
--
-- 0008 では書き込みをスタッフだけに限っていた。
-- 記録会でコーチが測るぶんにはそれでよいが、
-- 「自主的に測った」を残せないと、記録が続かない。
--
-- ただし**他人の記録には触らせない**。
-- 更新も自分の行だけに限る（スタッフは全員ぶん触れる）。
-- -------------------------------------------------------------
create policy measurement_results_own_write on public.measurement_results
  for insert to authenticated
  with check (app.is_own_member(team_member_id) and app.is_team_member(team_id));

create policy measurement_results_own_update on public.measurement_results
  for update to authenticated
  using (app.is_own_member(team_member_id))
  with check (app.is_own_member(team_member_id));


-- ---------- 0018_role_guards.sql ----------
-- =============================================================
-- 0018_role_guards.sql
--
-- 見つかった問題:
--   team_members の書き込みポリシーが
--     using (app.is_staff(team_id)) with check (app.is_staff(team_id))
--   だった。app.is_staff は system_admin / coach / manager を含むので、
--   **マネージャーが自分の role_code を system_admin に書き換えられた**。
--   権限の壁がそこで終わる。いちばん重い種類の穴。
--
--   加えて、最後の管理者を降格・退部させられた。
--   そうなると誰も役割を戻せず、チームが操作不能になる。
--
-- 対処:
--   スタッフが名簿（背番号・ポジションなど）を直せること自体は正しいので、
--   ポリシーごと締めずに「役割を変える操作」だけをトリガで守る。
--   これは権限の話でもありデータの整合性の話でもあるので、
--   どの経路（service role を含む）から書いても効くほうがよい。
-- =============================================================

create or replace function app.guard_member_role()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_membership uuid;
  v_admin_count      int;
  v_leaving_admin    boolean;
begin
  -- 役割が変わらないなら、ここで見ることは何もない
  -- （背番号やポジションの変更は今までどおり通す）
  if new.role_code is not distinct from old.role_code
     and new.status is not distinct from old.status
     and new.deleted_at is not distinct from old.deleted_at then
    return new;
  end if;

  select id into v_actor_membership
  from public.team_members
  where team_id = old.team_id
    and profile_id = app.current_profile_id()
    and deleted_at is null;

  if new.role_code is distinct from old.role_code then
    if app.role_in_team(old.team_id) <> 'system_admin' then
      raise exception '役割を変えられるのは管理者だけです';
    end if;

    -- 自分の役割は自分で変えない。
    -- 昇格を防ぐためであり、降格して自分を締め出す事故も防ぐ。
    if v_actor_membership = old.id then
      raise exception '自分の役割は変えられません。他の管理者に頼んでください';
    end if;
  end if;

  -- 最後の管理者がいなくなる変更を止める。
  -- 誰も役割を戻せなくなると、チームごと操作不能になる。
  v_leaving_admin :=
    old.role_code = 'system_admin'
    and old.status = 'active'
    and old.deleted_at is null
    and (
      new.role_code <> 'system_admin'
      or new.status <> 'active'
      or new.deleted_at is not null
    );

  if v_leaving_admin then
    select count(*) into v_admin_count
    from public.team_members
    where team_id = old.team_id
      and role_code = 'system_admin'
      and status = 'active'
      and deleted_at is null;

    if v_admin_count <= 1 then
      raise exception '最後の管理者です。先に別の管理者を決めてください';
    end if;
  end if;

  -- 63章: 役割の変更は監査ログに残す
  if new.role_code is distinct from old.role_code then
    insert into public.audit_logs
      (team_id, actor_id, action, target_table, target_id, summary, before_value, after_value)
    values (
      old.team_id, app.current_profile_id(), 'member.role_change', 'team_members', old.id,
      format('%s → %s', old.role_code, new.role_code),
      jsonb_build_object('role_code', old.role_code),
      jsonb_build_object('role_code', new.role_code)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists team_members_guard_role on public.team_members;
create trigger team_members_guard_role
  before update on public.team_members
  for each row execute function app.guard_member_role();

-- -------------------------------------------------------------
-- 個別権限の変更も記録に残す（63章）
--
-- 「なぜこの人がこれをできるのか」を後から追えるようにする。
-- 付け外しできるのが管理者だけなのは 0008 のポリシーのとおり。
-- -------------------------------------------------------------
create or replace function app.log_member_permission()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row     public.member_permissions;
  v_team_id uuid;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;

  select team_id into v_team_id from public.team_members where id = v_row.team_member_id;
  if v_team_id is null then
    return v_row;
  end if;

  insert into public.audit_logs
    (team_id, actor_id, action, target_table, target_id, summary)
  values (
    v_team_id, app.current_profile_id(),
    case when tg_op = 'DELETE' then 'member.permission_reset' else 'member.permission_change' end,
    'member_permissions', v_row.team_member_id,
    case
      when tg_op = 'DELETE' then format('%s を役割どおりに戻した', v_row.permission_code)
      when v_row.granted then format('%s を付与', v_row.permission_code)
      else format('%s を剥奪', v_row.permission_code)
    end
  );

  return v_row;
end;
$$;

drop trigger if exists member_permissions_log on public.member_permissions;
create trigger member_permissions_log
  after insert or update or delete on public.member_permissions
  for each row execute function app.log_member_permission();

-- -------------------------------------------------------------
-- スキル定義の並べ替えを楽にする
--
-- 画面から作るときに sort_order を人に決めさせたくない。
-- 末尾に足すのが既定になるよう、次の番号を返す関数を置く。
-- -------------------------------------------------------------
create or replace function app.next_skill_sort_order(p_team_id uuid, p_category_id uuid, p_parent_id uuid)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(max(sort_order), 0) + 1
  from public.skills
  where team_id = p_team_id
    and skill_category_id = p_category_id
    and parent_id is not distinct from p_parent_id
    and deleted_at is null;
$$;

revoke all on function app.next_skill_sort_order(uuid, uuid, uuid) from public;
grant execute on function app.next_skill_sort_order(uuid, uuid, uuid) to authenticated;


-- ---------- 0019_soft_delete_visibility.sql ----------
-- =============================================================
-- 0019_soft_delete_visibility.sql
--
-- 見つかった問題:
--   `for all` のポリシーは **SELECT にも効く**。
--   0008 では「見る条件」と「書く条件」を別のポリシーに分けたつもりだったが、
--
--     create policy xxx_select      for select using (deleted_at is null and ...)
--     create policy xxx_staff_write for all    using (...)          -- ← deleted_at を見ていない
--
--   の2つは **or** で足し合わされる。
--   結果、論理削除した行が、書ける立場の人にはそのまま見え続けていた。
--
--   実際に起きること:
--     * 選手が消した日報が、自分の一覧に残り続ける
--     * コーチが消した予定が、スタッフには見えたまま
--     * 消したスキル定義が、コーチの画面から消えない
--
--   17個のポリシーが同じ形だった。
--
-- 対処:
--   `using` に `deleted_at is null` を足す。
--   `with check` には足さない。足すと論理削除そのものが通らなくなる
--   （更新後の行は deleted_at が入っているため）。
--
--   これで「消したものは、消した人からも見えない」になる。
--   取り消したいときは復元の手立てを別に用意する
--   （動画は file_deletion_jobs の30日、他は今のところ管理者が SQL で戻す）。
-- =============================================================

-- 名簿 ---------------------------------------------------------
drop policy if exists team_members_staff_write on public.team_members;
create policy team_members_staff_write on public.team_members
  for all to authenticated
  using (deleted_at is null and app.is_staff(team_id))
  with check (app.is_staff(team_id));

-- 時間軸 -------------------------------------------------------
drop policy if exists seasons_staff_write on public.seasons;
create policy seasons_staff_write on public.seasons
  for all to authenticated
  using (deleted_at is null and app.has_permission(team_id, 'event.manage'))
  with check (app.has_permission(team_id, 'event.manage'));

drop policy if exists season_goals_staff_write on public.season_goals;
create policy season_goals_staff_write on public.season_goals
  for all to authenticated
  using (deleted_at is null and app.has_permission(team_id, 'event.manage'))
  with check (app.has_permission(team_id, 'event.manage'));

drop policy if exists milestones_staff_write on public.milestones;
create policy milestones_staff_write on public.milestones
  for all to authenticated
  using (deleted_at is null and app.has_permission(team_id, 'event.manage'))
  with check (app.has_permission(team_id, 'event.manage'));

drop policy if exists competitions_staff_write on public.competitions;
create policy competitions_staff_write on public.competitions
  for all to authenticated
  using (deleted_at is null and app.has_permission(team_id, 'event.manage'))
  with check (app.has_permission(team_id, 'event.manage'));

drop policy if exists weeks_staff_write on public.weeks;
create policy weeks_staff_write on public.weeks
  for all to authenticated
  using (deleted_at is null and app.has_permission(team_id, 'event.manage'))
  with check (app.has_permission(team_id, 'event.manage'));

drop policy if exists events_staff_write on public.events;
create policy events_staff_write on public.events
  for all to authenticated
  using (deleted_at is null and app.has_permission(team_id, 'event.manage'))
  with check (app.has_permission(team_id, 'event.manage'));

-- 日々の記録 ---------------------------------------------------
drop policy if exists daily_conditions_own on public.daily_conditions;
create policy daily_conditions_own on public.daily_conditions
  for all to authenticated
  using (deleted_at is null and app.is_own_member(team_member_id))
  with check (app.is_own_member(team_member_id));

drop policy if exists practice_goals_own on public.practice_goals;
create policy practice_goals_own on public.practice_goals
  for all to authenticated
  using (deleted_at is null and app.is_own_member(team_member_id))
  with check (app.is_own_member(team_member_id));

drop policy if exists daily_reports_own on public.daily_reports;
create policy daily_reports_own on public.daily_reports
  for all to authenticated
  using (deleted_at is null and app.is_own_member(team_member_id))
  with check (app.is_own_member(team_member_id));

drop policy if exists report_feedbacks_staff_write on public.report_feedbacks;
create policy report_feedbacks_staff_write on public.report_feedbacks
  for all to authenticated
  using (deleted_at is null and app.has_permission(team_id, 'report.view_all'))
  with check (app.has_permission(team_id, 'report.view_all'));

drop policy if exists training_records_own on public.training_records;
create policy training_records_own on public.training_records
  for all to authenticated
  using (deleted_at is null and app.is_own_member(team_member_id))
  with check (app.is_own_member(team_member_id));

-- 動画 ---------------------------------------------------------
drop policy if exists video_clips_write on public.video_clips;
create policy video_clips_write on public.video_clips
  for all to authenticated
  using (deleted_at is null and (created_by = app.current_profile_id() or app.is_staff(team_id)))
  with check (created_by = app.current_profile_id() and app.is_team_member(team_id));

-- スキル -------------------------------------------------------
drop policy if exists skill_categories_staff_write on public.skill_categories;
create policy skill_categories_staff_write on public.skill_categories
  for all to authenticated
  using (deleted_at is null and app.has_permission(team_id, 'skill.review'))
  with check (app.has_permission(team_id, 'skill.review'));

drop policy if exists skills_staff_write on public.skills;
create policy skills_staff_write on public.skills
  for all to authenticated
  using (deleted_at is null and app.has_permission(team_id, 'skill.review'))
  with check (app.has_permission(team_id, 'skill.review'));

drop policy if exists skill_applications_own_write on public.skill_applications;
create policy skill_applications_own_write on public.skill_applications
  for all to authenticated
  using (
    deleted_at is null
    and (app.is_own_member(team_member_id) or app.has_permission(team_id, 'skill.review'))
  )
  with check (app.is_own_member(team_member_id) or app.has_permission(team_id, 'skill.review'));

-- 測定 ---------------------------------------------------------
drop policy if exists measurement_events_staff_write on public.measurement_events;
create policy measurement_events_staff_write on public.measurement_events
  for all to authenticated
  using (deleted_at is null and app.is_staff(team_id))
  with check (app.is_staff(team_id));

-- =============================================================
-- 論理削除は関数を通す
--
-- 上の修正で、これらの表も 0013 の videos と同じ形になった。
-- 閲覧できる条件がすべて `deleted_at is null` になったため、
-- 素朴な `update ... set deleted_at = now()` は
-- 「更新後の行が見えなくなる」ので弾かれる。
--
-- 0013 と同じく security definer の関数に逃がす。
-- 権限の確認は関数の中で自分で行う。
-- =============================================================

/** 自分のトレーニング記録を消す（Phase 4 の deleteTrainingRecord から呼ぶ）。 */
create or replace function public.soft_delete_training_record(p_record_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.training_records;
begin
  select * into v_row from public.training_records where id = p_record_id and deleted_at is null;
  if v_row.id is null then
    raise exception '対象の記録が見つかりません';
  end if;

  -- 消せるのは本人だけ。コーチでも他人の記録は消さない。
  if not app.is_own_member(v_row.team_member_id) then
    raise exception 'この記録を削除する権限がありません';
  end if;

  update public.training_records set deleted_at = now() where id = p_record_id;
end;
$$;

revoke all on function public.soft_delete_training_record(uuid) from public;
grant execute on function public.soft_delete_training_record(uuid) to authenticated;

/**
 * スキル定義（中目標・小目標）を消す（30章）。
 *
 * すでに誰かが申請・到達している目標は消さない。
 * 記録が宙に浮くと、選手の積み上げが無かったことになる。
 */
create or replace function public.soft_delete_skill(p_skill_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.skills;
begin
  select * into v_row from public.skills where id = p_skill_id and deleted_at is null;
  if v_row.id is null then
    raise exception '対象の目標が見つかりません';
  end if;

  if not app.has_permission(v_row.team_id, 'skill.review') then
    raise exception 'スキル定義を変えられるのは審査担当だけです';
  end if;

  if exists (select 1 from public.player_skills where skill_id = p_skill_id and deleted_at is null) then
    raise exception 'すでに申請・承認のある目標は消せません';
  end if;

  if exists (select 1 from public.skills where parent_id = p_skill_id and deleted_at is null) then
    raise exception '下に小目標があります。先にそちらを消してください';
  end if;

  update public.skills set deleted_at = now() where id = p_skill_id;

  insert into public.audit_logs (team_id, actor_id, action, target_table, target_id, summary)
  values (v_row.team_id, app.current_profile_id(), 'skill.delete', 'skills', p_skill_id, v_row.name);
end;
$$;

revoke all on function public.soft_delete_skill(uuid) from public;
grant execute on function public.soft_delete_skill(uuid) to authenticated;


-- ---------- 0020_restore.sql ----------
-- =============================================================
-- 0020_restore.sql
--
-- 消したものを戻せるようにする。
--
-- なぜ要るか:
--   0019 で「消したものは、消した人からも見えない」に直した。
--   守りとしては正しいが、そのままだと**間違えて消したものを取り戻せない**。
--   60章が動画に30日の猶予を置いているのと同じ考え方を、他の記録にも広げる。
--
--   記録は本人の努力の証拠なので、消えたら戻せないのは怖い。
--   「怖くて消せない」と、要らない記録が残り続けて画面が読みにくくなる。
--   気軽に消せて、間違えたら戻せるのがいちばんよい。
--
-- どう作るか:
--   閲覧できる条件がすべて `deleted_at is null` なので、
--   消したものは通常の SELECT では引けない。
--   一覧も復元も security definer の関数を通す。
--   **その人が戻せるものだけ**を返す（権限の確認は関数の中）。
-- =============================================================

/**
 * 消したもののうち、自分が戻せるものを並べる。
 *
 * 種別ごとに「誰が戻せるか」が違う。
 *   トレーニング記録 … 本人だけ
 *   動画・クリップ   … 投稿者本人か storage.manage
 *   スキル定義       … skill.review
 *
 * `restorable` が false のものは、実体がもう無い（物理削除済み）。
 * 一覧には出すが、押しても戻らないことを画面で伝える。
 */
create or replace function public.list_deleted_items(p_team_id uuid)
returns table (
  kind        text,
  item_id     uuid,
  label       text,
  deleted_at  timestamptz,
  restorable  boolean,
  note        text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile uuid := app.current_profile_id();
begin
  if v_profile is null or not app.is_team_member(p_team_id) then
    return;
  end if;

  -- 動画
  return query
  select
    'video'::text,
    v.id,
    v.title,
    v.deleted_at,
    -- 実体を消したあとは戻せない（60章の30日を過ぎたもの）
    coalesce(f.upload_status, 'ready') <> 'deleted',
    case
      when coalesce(f.upload_status, 'ready') = 'deleted' then '実体が削除済みのため戻せません'
      else null
    end
  from public.videos v
  left join public.files f on f.id = v.file_id
  where v.team_id = p_team_id
    and v.deleted_at is not null
    and (v.created_by = v_profile or app.has_permission(p_team_id, 'storage.manage'));

  -- 場面（仮想クリップ）
  return query
  select
    'video_clip'::text,
    c.id,
    coalesce(c.title, '指定した場面'),
    c.deleted_at,
    true,
    null::text
  from public.video_clips c
  where c.team_id = p_team_id
    and c.deleted_at is not null
    and (c.created_by = v_profile or app.has_permission(p_team_id, 'storage.manage'));

  -- トレーニング記録（本人だけ）
  return query
  select
    'training_record'::text,
    t.id,
    to_char(t.performed_on, 'YYYY-MM-DD') || ' ' || coalesce(t.menu, t.training_type),
    t.deleted_at,
    true,
    null::text
  from public.training_records t
  where t.team_id = p_team_id
    and t.deleted_at is not null
    and app.is_own_member(t.team_member_id);

  -- スキル定義
  return query
  select
    'skill'::text,
    s.id,
    s.name,
    s.deleted_at,
    true,
    null::text
  from public.skills s
  where s.team_id = p_team_id
    and s.deleted_at is not null
    and app.has_permission(p_team_id, 'skill.review');
end;
$$;

revoke all on function public.list_deleted_items(uuid) from public;
grant execute on function public.list_deleted_items(uuid) to authenticated;

-- -------------------------------------------------------------
-- 復元
--
-- 消したときと同じ権限を要求する。
-- 戻したことも監査ログに残す（63章）。
-- -------------------------------------------------------------

/**
 * 動画を戻す。
 *
 * **物理削除の予約も取り消す。**
 * ここを忘れると、戻したはずの動画が30日後に実体だけ消えて、
 * 再生できない動画が残る。
 */
create or replace function public.restore_video(p_video_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_video   public.videos;
  v_status  text;
  v_profile uuid := app.current_profile_id();
begin
  select * into v_video from public.videos where id = p_video_id and deleted_at is not null;
  if v_video.id is null then
    raise exception '対象の動画が見つかりません';
  end if;

  if v_video.created_by <> v_profile and not app.has_permission(v_video.team_id, 'storage.manage') then
    raise exception 'この動画を戻す権限がありません';
  end if;

  if v_video.file_id is not null then
    select upload_status into v_status from public.files where id = v_video.file_id;
    if v_status = 'deleted' then
      raise exception '実体がすでに消えているため戻せません';
    end if;

    update public.files set deleted_at = null where id = v_video.file_id;

    -- 予約が残っていると、戻した動画が30日後に壊れる
    update public.file_deletion_jobs
      set status = 'failed', error_message = '復元されたため取り消し', attempted_at = now()
      where file_id = v_video.file_id and status = 'pending';
  end if;

  update public.videos set deleted_at = null where id = p_video_id;

  insert into public.audit_logs (team_id, actor_id, action, target_table, target_id, summary)
  values (v_video.team_id, v_profile, 'video.restore', 'videos', p_video_id, v_video.title);
end;
$$;

revoke all on function public.restore_video(uuid) from public;
grant execute on function public.restore_video(uuid) to authenticated;

/** 場面を戻す。元の動画が消えたままなら戻さない。 */
create or replace function public.restore_video_clip(p_clip_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clip    public.video_clips;
  v_video   public.videos;
  v_profile uuid := app.current_profile_id();
begin
  select * into v_clip from public.video_clips where id = p_clip_id and deleted_at is not null;
  if v_clip.id is null then
    raise exception '対象の場面が見つかりません';
  end if;

  if v_clip.created_by <> v_profile and not app.has_permission(v_clip.team_id, 'storage.manage') then
    raise exception 'この場面を戻す権限がありません';
  end if;

  select * into v_video from public.videos where id = v_clip.video_id;
  if v_video.id is null or v_video.deleted_at is not null then
    raise exception '元の動画が消えています。先に動画を戻してください';
  end if;

  update public.video_clips set deleted_at = null where id = p_clip_id;
end;
$$;

revoke all on function public.restore_video_clip(uuid) from public;
grant execute on function public.restore_video_clip(uuid) to authenticated;

/** 自分のトレーニング記録を戻す。 */
create or replace function public.restore_training_record(p_record_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.training_records;
begin
  select * into v_row from public.training_records where id = p_record_id and deleted_at is not null;
  if v_row.id is null then
    raise exception '対象の記録が見つかりません';
  end if;

  if not app.is_own_member(v_row.team_member_id) then
    raise exception 'この記録を戻す権限がありません';
  end if;

  update public.training_records set deleted_at = null where id = p_record_id;
end;
$$;

revoke all on function public.restore_training_record(uuid) from public;
grant execute on function public.restore_training_record(uuid) to authenticated;

/** スキル定義を戻す。親が消えたままなら戻さない（宙に浮くため）。 */
create or replace function public.restore_skill(p_skill_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row     public.skills;
  v_parent  public.skills;
  v_deleted timestamptz;
begin
  select * into v_row from public.skills where id = p_skill_id and deleted_at is not null;
  if v_row.id is null then
    raise exception '対象の目標が見つかりません';
  end if;

  if not app.has_permission(v_row.team_id, 'skill.review') then
    raise exception 'スキル定義を変えられるのは審査担当だけです';
  end if;

  select deleted_at into v_deleted from public.skill_categories where id = v_row.skill_category_id;
  if v_deleted is not null then
    raise exception '大分類が消えています。先に大分類を戻してください';
  end if;

  if v_row.parent_id is not null then
    select * into v_parent from public.skills where id = v_row.parent_id;
    if v_parent.id is null or v_parent.deleted_at is not null then
      raise exception '中目標が消えています。先に中目標を戻してください';
    end if;
  end if;

  update public.skills set deleted_at = null where id = p_skill_id;

  insert into public.audit_logs (team_id, actor_id, action, target_table, target_id, summary)
  values (v_row.team_id, app.current_profile_id(), 'skill.restore', 'skills', p_skill_id, v_row.name);
end;
$$;

revoke all on function public.restore_skill(uuid) from public;
grant execute on function public.restore_skill(uuid) to authenticated;

-- =============================================================
-- おまけで見つかった問題: 論理削除で upload_status を 'deleted' にしていた
--
-- 0013 の soft_delete_video は、論理削除の時点で
--   update public.files set deleted_at = now(), upload_status = 'deleted'
-- としていた。
--
-- しかし 'deleted' は「R2 から実体が消えた」という意味で、
-- 0016 の complete_file_deletion が実際に消したあとに立てるもの。
-- 論理削除の時点で立ててしまうと、意味が2つになる。
--
-- 実害:
--   capture_storage_usage は upload_status = 'deleted' を集計から外す。
--   そのため**アプリから動画を消すと、まだ R2 にあるのに容量から消えた**。
--   「削除待ち（deleted_bytes）」も常に 0 になり、
--   「片付ければこれだけ空く」が出てこない。59章の目的が崩れる。
--
--   さらに今回、復元の判定にも使えなくなっていた
--   （消した直後の動画が「実体が無い」と見えてしまう）。
--
-- 直し方:
--   論理削除では deleted_at だけを入れる。
--   'deleted' を立てるのは、実体を消し終えたときだけ。
-- =============================================================

create or replace function public.soft_delete_video(p_video_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_video   public.videos;
  v_file    public.files;
  v_profile uuid;
  v_days    int := 30;
begin
  v_profile := app.current_profile_id();
  if v_profile is null then
    raise exception 'ログインしていません';
  end if;

  select * into v_video from public.videos where id = p_video_id and deleted_at is null;
  if v_video.id is null then
    raise exception '対象の動画が見つかりません';
  end if;

  if v_video.created_by <> v_profile and not app.has_permission(v_video.team_id, 'storage.manage') then
    raise exception 'この動画を削除する権限がありません';
  end if;

  update public.videos set deleted_at = now() where id = p_video_id;

  if v_video.file_id is not null then
    select * into v_file from public.files where id = v_video.file_id;

    if v_file.id is not null and v_file.deleted_at is null then
      -- upload_status はそのまま。実体はまだ R2 にある。
      update public.files set deleted_at = now() where id = v_file.id;

      insert into public.file_deletion_jobs (team_id, file_id, scheduled_for)
      values (v_file.team_id, v_file.id, now() + make_interval(days => v_days));
    end if;
  end if;

  insert into public.audit_logs (team_id, actor_id, action, target_table, target_id, summary)
  values (
    v_video.team_id, v_profile, 'video.delete', 'videos', p_video_id,
    format('動画を削除: %s（%s日後に実体を削除）', v_video.title, v_days)
  );
end;
$$;

-- すでに 'deleted' になってしまった行を戻す。
-- 実体を本当に消したものには、done の予約が残っているので見分けられる。
update public.files f
set upload_status = 'ready'
where f.upload_status = 'deleted'
  and not exists (
    select 1 from public.file_deletion_jobs j
    where j.file_id = f.id and j.status = 'done'
  );


-- ---------- 0021_invitations.sql ----------
-- =============================================================
-- 0021_invitations.sql
-- 招待の入口（Phase 1 の積み残し）。
--
-- いまは最初の管理者以外も、Supabase の管理画面で利用者を作る必要がある。
-- 新入部員が入るたびに管理画面を開くのは、長く続かない（3章の11）。
--
-- 難しいのは「まだ部員でない人」を相手にすること。
-- RLS は「チームの一員かどうか」で守っているので、
-- 招待を受け取る側はどのポリシーにも当てはまらない。
-- 受け取り側の入口だけを security definer の関数で開ける。
-- =============================================================

-- -------------------------------------------------------------
-- 生のトークンを DB に残さない
--
-- 招待リンクは「持っているだけでアカウントを作れる」ものなので、
-- パスワードと同じ重さで扱う。
-- 残すのはハッシュだけ。DB が漏れても、そこから招待リンクは作れない。
-- （署名付き URL を保存しないのと同じ考え方。75章）
-- -------------------------------------------------------------
alter table public.team_invitations rename column token to token_hash;

comment on column public.team_invitations.token_hash is
  '招待トークンの sha256（16進）。生の値は発行時にリンクへ載せるだけで、ここには残さない。';

-- -------------------------------------------------------------
-- 招待できる役割の制限
--
-- 0018 で「役割を変えられるのは管理者だけ」にした。
-- 招待で役割を渡せてしまうと、そこが抜け道になる。
-- コーチやマネージャーは選手しか招待できない。
-- -------------------------------------------------------------
create or replace function app.guard_invitation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_member_team uuid;
begin
  if new.role_code <> 'player' and app.role_in_team(new.team_id) <> 'system_admin' then
    raise exception '選手以外を招待できるのは管理者だけです';
  end if;

  -- 既存の部員に結び付ける招待なら、同じチームであること（0011 の教訓）
  if new.team_member_id is not null then
    select team_id into v_member_team from public.team_members where id = new.team_member_id;
    if v_member_team is distinct from new.team_id then
      raise exception '別のチームの部員は招待できません';
    end if;
  end if;

  -- 作るときだけ見る。時間が経って期限切れになるのは当たり前なので、
  -- あとからの更新（accepted_at を入れるなど）を止めてはいけない。
  if tg_op = 'INSERT' and new.expires_at <= now() then
    raise exception '期限が過去になっています';
  end if;

  return new;
end;
$$;

drop trigger if exists team_invitations_guard on public.team_invitations;
create trigger team_invitations_guard
  before insert or update on public.team_invitations
  for each row execute function app.guard_invitation();

-- -------------------------------------------------------------
-- 受け取る側から見た招待
--
-- まだログインしていない人が呼ぶので anon にも実行を許す。
-- **トークンのハッシュを知っている人にだけ**答える。
-- 返すのは画面に出すぶんだけで、他の部員の情報は出さない。
-- -------------------------------------------------------------
create or replace function public.find_invitation(p_token_hash text)
returns table (
  team_name    text,
  invited_name text,
  email        text,
  role_code    text,
  expires_at   timestamptz,
  accepted_at  timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    t.display_name,
    p.full_name,
    i.email,
    i.role_code,
    i.expires_at,
    i.accepted_at
  from public.team_invitations i
  join public.teams t on t.id = i.team_id
  left join public.team_members tm on tm.id = i.team_member_id
  left join public.profiles p on p.id = tm.profile_id
  where i.token_hash = p_token_hash;
$$;

revoke all on function public.find_invitation(text) from public;
grant execute on function public.find_invitation(text) to anon, authenticated;

-- -------------------------------------------------------------
-- 招待を受ける
--
-- 認証利用者を作るのはアプリ側（Supabase Auth）。
-- ここは「その利用者を、この部員に結び付ける」だけを引き受ける。
--
-- 期限切れ・使用済みは必ずここで弾く。
-- 画面側でも見るが、最後に守るのはこちら。
-- -------------------------------------------------------------
create or replace function public.accept_invitation(p_token_hash text, p_user_id uuid, p_full_name text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inv        public.team_invitations;
  v_profile_id uuid;
  v_member_id  uuid;
begin
  select * into v_inv from public.team_invitations where token_hash = p_token_hash;
  if v_inv.id is null then
    raise exception '招待が見つかりません';
  end if;

  if v_inv.accepted_at is not null then
    raise exception 'この招待はすでに使われています';
  end if;

  if v_inv.expires_at <= now() then
    raise exception 'この招待は期限が切れています';
  end if;

  -- 1人の認証利用者が2つのプロフィールを持たないようにする
  if exists (select 1 from public.profiles where user_id = p_user_id) then
    raise exception 'この利用者はすでに登録されています';
  end if;

  if v_inv.team_member_id is not null then
    -- 移行で登録済みの部員に、ログインを結び付ける（ADR-0002）
    select tm.id, tm.profile_id into v_member_id, v_profile_id
    from public.team_members tm
    where tm.id = v_inv.team_member_id and tm.deleted_at is null;

    if v_member_id is null then
      raise exception '招待された部員が見つかりません';
    end if;

    update public.profiles
      set user_id = p_user_id,
          email = coalesce(email, v_inv.email)
      where id = v_profile_id and user_id is null;

    if not found then
      raise exception 'この部員にはすでにログインが結び付いています';
    end if;
  else
    -- 名簿に無い人を新しく迎える
    insert into public.profiles (user_id, full_name, email)
    values (p_user_id, coalesce(nullif(btrim(p_full_name), ''), v_inv.email), v_inv.email)
    returning id into v_profile_id;

    insert into public.team_members (team_id, profile_id, role_code, status)
    values (v_inv.team_id, v_profile_id, v_inv.role_code, 'active')
    returning id into v_member_id;
  end if;

  update public.team_invitations set accepted_at = now() where id = v_inv.id;

  -- 63章: 誰がいつ入ったかは残す
  insert into public.audit_logs (team_id, actor_id, action, target_table, target_id, summary)
  values (v_inv.team_id, v_profile_id, 'invitation.accept', 'team_members', v_member_id,
          format('%s として参加', v_inv.role_code));

  return v_member_id;
end;
$$;

revoke all on function public.accept_invitation(text, uuid, text) from public;
grant execute on function public.accept_invitation(text, uuid, text) to anon, authenticated;

-- -------------------------------------------------------------
-- 発行した招待は、生の値を持たない
--
-- スタッフが一覧で見られるのは「誰に・いつまで・使われたか」だけ。
-- リンクをもう一度見ることはできない。無くしたら作り直す。
-- -------------------------------------------------------------
comment on table public.team_invitations is
  '招待。リンクの生の値は保存しないため、再表示はできない。無くした場合は作り直す。';


-- ---------- 0022_report_feedback.sql ----------
-- =============================================================
-- 0022_report_feedback.sql
-- 日報へのコーチのコメント（16章）。
--
-- 見つかった問題:
--   report_feedbacks のポリシーが、**日報の公開範囲を見ていなかった**。
--
--     select: 本人 or report.view_all
--     write : report.view_all
--
--   日報側は visibility in ('staff','team') を見ているのに、
--   コメント側は権限だけで判定していた。
--   そのため「自分だけ」にした日報にも、コーチがコメントを書けた。
--
--   選手が公開範囲を private にするのは
--   「コーチにも見せたくない」という意思表示なので、
--   そこにコメントが付くのは、いちばんあってはならない壊れ方。
--   （Phase 7 の videos と同じ形。権限と公開範囲は別のもの）
--
-- 対処:
--   コメントの可否を、日報が見えるかどうかに合わせる。
--   判定を1か所にまとめて、select と write の両方から使う。
-- =============================================================

/**
 * その日報が、いまの利用者に見えるか。
 *
 * daily_reports のポリシーと同じ規則。
 * ここを直したら、あちらも直すこと。
 */
create or replace function app.can_see_report(p_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.daily_reports r
    where r.id = p_report_id
      and r.deleted_at is null
      and (
        app.is_own_member(r.team_member_id)
        or (r.visibility in ('staff', 'team') and app.has_permission(r.team_id, 'report.view_all'))
        or (r.visibility = 'team' and app.is_team_member(r.team_id))
      )
  );
$$;

revoke all on function app.can_see_report(uuid) from public;
grant execute on function app.can_see_report(uuid) to authenticated;

-- 見える日報のコメントだけが見える
drop policy if exists report_feedbacks_select on public.report_feedbacks;
create policy report_feedbacks_select on public.report_feedbacks
  for select to authenticated
  using (deleted_at is null and app.can_see_report(daily_report_id));

-- 書けるのは「見えていて、かつ全員の日報を見る権限がある」人。
-- 選手が他人の日報にコメントすることは考えない（16章）。
drop policy if exists report_feedbacks_staff_write on public.report_feedbacks;
create policy report_feedbacks_staff_write on public.report_feedbacks
  for all to authenticated
  using (
    deleted_at is null
    and app.has_permission(team_id, 'report.view_all')
    and app.can_see_report(daily_report_id)
  )
  with check (
    app.has_permission(team_id, 'report.view_all')
    and app.can_see_report(daily_report_id)
    -- 差出人を偽らせない（0015 の通知と同じ考え方）
    and author_id = app.current_profile_id()
  );

-- -------------------------------------------------------------
-- 参照先のチーム一致（0011 の教訓）
-- -------------------------------------------------------------
create or replace function app.validate_report_feedback()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team uuid;
begin
  select team_id into v_team from public.daily_reports where id = new.daily_report_id;
  if v_team is null then
    raise exception '対象の日報が見つかりません';
  end if;
  if v_team <> new.team_id then
    raise exception '別のチームの日報にはコメントできません';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists report_feedbacks_validate on public.report_feedbacks;
create trigger report_feedbacks_validate
  before insert or update on public.report_feedbacks
  for each row execute function app.validate_report_feedback();

-- -------------------------------------------------------------
-- コメントの取り消し
--
-- 0019 で閲覧の条件に deleted_at is null が入ったので、
-- 素朴な update では消せない。関数を通す（0013 と同じ形）。
--
-- 消せるのは書いた本人だけ。
-- 選手から見えたものが、他の人の判断で黙って消えるのは避ける。
-- -------------------------------------------------------------
create or replace function public.soft_delete_report_feedback(p_feedback_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.report_feedbacks;
begin
  select * into v_row from public.report_feedbacks where id = p_feedback_id and deleted_at is null;
  if v_row.id is null then
    raise exception '対象のコメントが見つかりません';
  end if;

  if v_row.author_id <> app.current_profile_id() then
    raise exception '自分が書いたコメントだけ消せます';
  end if;

  update public.report_feedbacks set deleted_at = now() where id = p_feedback_id;
end;
$$;

revoke all on function public.soft_delete_report_feedback(uuid) from public;
grant execute on function public.soft_delete_report_feedback(uuid) to authenticated;

-- -------------------------------------------------------------
-- 通知の種別を足す（0015 の CHECK に無かった）
-- -------------------------------------------------------------
alter table public.notifications
  drop constraint if exists notifications_notification_type_check;

alter table public.notifications
  add constraint notifications_notification_type_check
  check (notification_type in (
    'feedback_requested', 'feedback_assigned', 'feedback_answered',
    'feedback_follow_up', 'feedback_acknowledged', 'feedback_overdue',
    'share_approval_requested',
    'skill_applied', 'skill_application_updated',
    'report_commented',
    'report_missing', 'training_missing', 'general'));


-- ---------- 0023_submission_status.sql ----------
-- =============================================================
-- 0023_submission_status.sql
-- 「出したこと」と「中身」を分ける（12章・16章）。
--
-- 積み残していた問題:
--   公開範囲を「自分だけ」にした日報が、
--   コーチの提出状況では**未提出に見えていた**。
--
--   RLS は行が見えるか見えないかしか決められない。
--   「あることは見せるが、中身は見せない」が書けない。
--   そのため private の日報は行ごと消え、
--   ちゃんと書いて出した選手が「出していない人」として並んでいた。
--
--   これは提出状況という画面の目的（見落としを減らす）を裏切る。
--   出していない人を追いかけるための画面で、
--   出した人が未提出として名前を出されるのは、いちばん困る間違え方。
--
-- 直し方の考え:
--   * 選手が守りたいのは**中身**であって、出したという事実ではない。
--     「自分だけ」は「読まないでほしい」であって
--     「書いたことを隠したい」ではない（16章）。
--   * 事実だけを返す関数を作る。中身は1文字も返さない。
--   * 中身を読める日報だけ id を返す。
--     private の日報は id を返さないので、画面から開くこともできない。
--     （id を返しても RLS が止めるが、返さないほうが事故が起きない）
--   * ビューは使わない。ビューは所有者の権限で動くため、
--     何を返すかの線引きが定義の中に書かれない。
--     関数なら「何を返して、何を返さないか」がその場に残る。
--
--   選手にはこの扱いを画面で伝える。
--   「黙って伝わっている」が一番よくない。
-- =============================================================

/**
 * ある日の提出状況（12章）。
 *
 * **返すのは「出したかどうか」だけ。中身は返さない。**
 *
 * 読める日報だけ readable_report_id が入る。
 * 「自分だけ」の日報は submitted_report = true だが id は null。
 * つまりコーチは「出したことは分かるが、開けない」。
 *
 * ここを直したら daily_reports のポリシーと
 * app.can_see_report()（0022）も見ること。3つは同じ規則の上にある。
 */
create or replace function public.list_submission_status(p_team_id uuid, p_date date)
returns table (
  team_member_id uuid,
  submitted_condition boolean,
  submitted_report boolean,
  submitted_training boolean,
  readable_report_id uuid,
  report_is_private boolean,
  training_is_private boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  -- security definer は RLS を素通りする。権限は自分で確かめる。
  if not app.has_permission(p_team_id, 'report.view_all') then
    raise exception '提出状況を見る権限がありません';
  end if;

  return query
  select
    m.id,
    exists (
      select 1 from public.daily_conditions c
      where c.team_member_id = m.id and c.recorded_on = p_date and c.deleted_at is null
    ),
    exists (
      select 1 from public.daily_reports r
      where r.team_member_id = m.id and r.report_date = p_date
        and r.status = 'submitted' and r.deleted_at is null
    ),
    exists (
      select 1 from public.training_records t
      where t.team_member_id = m.id and t.performed_on = p_date and t.deleted_at is null
    ),
    -- 中身を読めるものだけ id を渡す
    (
      select r.id from public.daily_reports r
      where r.team_member_id = m.id and r.report_date = p_date
        and r.status = 'submitted' and r.deleted_at is null
        and r.visibility in ('staff', 'team')
      order by r.submitted_at desc nulls last
      limit 1
    ),
    exists (
      select 1 from public.daily_reports r
      where r.team_member_id = m.id and r.report_date = p_date
        and r.status = 'submitted' and r.deleted_at is null
        and r.visibility = 'private'
    ),
    exists (
      select 1 from public.training_records t
      where t.team_member_id = m.id and t.performed_on = p_date and t.deleted_at is null
        and t.visibility = 'private'
    )
  from public.team_members m
  where m.team_id = p_team_id
    and m.role_code = 'player'
    and m.status = 'active'
    and m.deleted_at is null;
end;
$$;

revoke all on function public.list_submission_status(uuid, date) from public;
grant execute on function public.list_submission_status(uuid, date) to authenticated;

-- 選手にこの扱いをどう伝えるかは、画面側の純粋な関数にまとめてある
-- （src/features/daily/lib/disclosure.ts）。
-- 公開範囲の選択肢のすぐ横に、そのとき何が伝わるかを出す。

