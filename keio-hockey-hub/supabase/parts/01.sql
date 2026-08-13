-- ==========================================================
-- 自動生成: scripts/bundle-migrations.sh
-- 直接編集しない。直すのは supabase/migrations/ のほう。
-- 1 番目。中身: 0001_core.sql 0002_auth_helpers.sql 0003_timeline.sql 0004_daily.sql 
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

