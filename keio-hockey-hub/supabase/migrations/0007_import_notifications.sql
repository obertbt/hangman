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
