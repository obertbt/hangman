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
