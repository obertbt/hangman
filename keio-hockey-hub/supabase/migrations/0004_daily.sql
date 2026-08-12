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
