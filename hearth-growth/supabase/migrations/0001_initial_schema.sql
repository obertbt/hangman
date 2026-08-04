-- =============================================================================
-- Hearth Growth : 初期スキーマ
-- =============================================================================
-- 設計方針
--   * 状態を持つ「タイマー」(activity_sessions) と、
--     タイムラインに出る「記録」(activity_posts) を分離する。
--   * 列挙値は enum ではなく text + CHECK 制約で表現する。
--     （後から値を追加・削除する際のマイグレーション負荷を避けるため）
--   * 削除は原則として論理削除 (deleted_at) を使う。
--   * RLS は 0002_rls_policies.sql で一括して有効化する。
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- 共通トリガー関数: updated_at の自動更新
-- -----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- profiles : auth.users と 1:1 のプロフィール
-- -----------------------------------------------------------------------------
create table public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  display_name       text        not null check (char_length(display_name) between 1 and 50),
  avatar_url         text,
  bio                text        check (char_length(bio) <= 500),
  timezone           text        not null default 'Asia/Tokyo',
  default_visibility text        not null default 'group'
                       check (default_visibility in ('private', 'group', 'selected')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- groups : クローズドグループ
-- -----------------------------------------------------------------------------
create table public.groups (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null check (char_length(name) between 1 and 50),
  description text        check (char_length(description) <= 500),
  owner_id    uuid        not null references public.profiles (id) on delete restrict,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index groups_owner_id_idx on public.groups (owner_id);

create trigger groups_touch_updated_at
  before update on public.groups
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- group_members : グループ参加情報
-- -----------------------------------------------------------------------------
create table public.group_members (
  id        uuid        primary key default gen_random_uuid(),
  group_id  uuid        not null references public.groups (id) on delete cascade,
  user_id   uuid        not null references public.profiles (id) on delete cascade,
  role      text        not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  unique (group_id, user_id)
);

create index group_members_user_id_idx on public.group_members (user_id);
create index group_members_group_id_idx on public.group_members (group_id);

-- -----------------------------------------------------------------------------
-- group_invitations : 招待リンク
-- -----------------------------------------------------------------------------
create table public.group_invitations (
  id         uuid        primary key default gen_random_uuid(),
  group_id   uuid        not null references public.groups (id) on delete cascade,
  -- 推測困難なトークン。既定は 32byte の URL-safe 乱数（base64url 相当）。
  token      text        not null unique default replace(replace(encode(gen_random_bytes(32), 'base64'), '+', '-'), '/', '_'),
  invited_by uuid        not null references public.profiles (id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '7 days'),
  max_uses   integer     not null default 10 check (max_uses > 0),
  used_count integer     not null default 0 check (used_count >= 0),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index group_invitations_group_id_idx on public.group_invitations (group_id);

-- -----------------------------------------------------------------------------
-- categories : 活動カテゴリー（個人用 or グループ共通）
-- -----------------------------------------------------------------------------
create table public.categories (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        references public.profiles (id) on delete cascade,
  group_id   uuid        references public.groups (id) on delete cascade,
  name       text        not null check (char_length(name) between 1 and 30),
  icon       text        not null default '📝',
  color      text        not null default '#8B7355' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order integer     not null default 100,
  is_active  boolean     not null default true,
  created_at timestamptz not null default now(),
  -- user_id / group_id はどちらか一方のみを持つ
  constraint categories_owner_check check (num_nonnulls(user_id, group_id) = 1)
);

create unique index categories_user_name_key
  on public.categories (user_id, name) where user_id is not null;
create unique index categories_group_name_key
  on public.categories (group_id, name) where group_id is not null;
create index categories_group_id_idx on public.categories (group_id) where group_id is not null;

-- -----------------------------------------------------------------------------
-- activity_sessions : タイマーセッション
-- -----------------------------------------------------------------------------
create table public.activity_sessions (
  id                   uuid        primary key default gen_random_uuid(),
  user_id              uuid        not null references public.profiles (id) on delete cascade,
  category_id          uuid        not null references public.categories (id) on delete restrict,
  title                text        check (char_length(title) <= 100),
  note                 text        check (char_length(note) <= 1000),
  status               text        not null default 'running'
                         check (status in ('running', 'paused', 'completed', 'cancelled')),
  started_at           timestamptz not null default now(),
  paused_at            timestamptz,
  total_paused_seconds integer     not null default 0 check (total_paused_seconds >= 0),
  ended_at             timestamptz,
  duration_seconds     integer     check (duration_seconds >= 0),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  -- paused のときだけ paused_at を持つ
  constraint sessions_paused_at_check check (
    (status = 'paused' and paused_at is not null)
    or (status <> 'paused' and paused_at is null)
  ),
  -- 終了済みセッションは ended_at と duration_seconds を必ず持つ
  constraint sessions_completed_check check (
    status <> 'completed'
    or (ended_at is not null and duration_seconds is not null)
  ),
  constraint sessions_time_order_check check (ended_at is null or ended_at >= started_at)
);

-- 13.3 二重起動防止: 1ユーザーにつき running / paused は同時に1件まで
create unique index activity_sessions_one_active_per_user
  on public.activity_sessions (user_id)
  where status in ('running', 'paused');

create index activity_sessions_user_status_idx on public.activity_sessions (user_id, status);
create index activity_sessions_started_at_idx on public.activity_sessions (started_at desc);

create trigger activity_sessions_touch_updated_at
  before update on public.activity_sessions
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- activity_posts : タイムラインに載る活動記録
-- -----------------------------------------------------------------------------
create table public.activity_posts (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references public.profiles (id) on delete cascade,
  session_id       uuid        unique references public.activity_sessions (id) on delete set null,
  category_id      uuid        not null references public.categories (id) on delete restrict,
  title            text        check (char_length(title) <= 100),
  body             text        check (char_length(body) <= 5000),
  duration_seconds integer     not null check (duration_seconds >= 0 and duration_seconds <= 86400),
  activity_date    date        not null,
  visibility       text        not null default 'group'
                     check (visibility in ('private', 'group', 'selected')),
  group_id         uuid        references public.groups (id) on delete cascade,
  started_at       timestamptz,
  ended_at         timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  -- visibility = 'group' のときだけ group_id を持つ
  constraint posts_group_visibility_check check (
    (visibility = 'group' and group_id is not null)
    or (visibility <> 'group' and group_id is null)
  )
);

create index activity_posts_user_id_idx      on public.activity_posts (user_id);
create index activity_posts_group_id_idx     on public.activity_posts (group_id) where group_id is not null;
create index activity_posts_activity_date_idx on public.activity_posts (activity_date desc);
create index activity_posts_created_at_idx   on public.activity_posts (created_at desc);
create index activity_posts_category_id_idx  on public.activity_posts (category_id);
-- 集計（今日 / 今週 / カテゴリー別）で最も使う組み合わせ
create index activity_posts_user_date_idx
  on public.activity_posts (user_id, activity_date desc)
  where deleted_at is null;

create trigger activity_posts_touch_updated_at
  before update on public.activity_posts
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- post_allowed_users : visibility = 'selected' の閲覧許可ユーザー
-- -----------------------------------------------------------------------------
create table public.post_allowed_users (
  post_id uuid not null references public.activity_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (post_id, user_id)
);

create index post_allowed_users_user_id_idx on public.post_allowed_users (user_id);

-- -----------------------------------------------------------------------------
-- reactions : 応援リアクション（1ユーザー1投稿につき1件）
-- -----------------------------------------------------------------------------
create table public.reactions (
  id            uuid        primary key default gen_random_uuid(),
  post_id       uuid        not null references public.activity_posts (id) on delete cascade,
  user_id       uuid        not null references public.profiles (id) on delete cascade,
  reaction_type text        not null
                  check (reaction_type in ('cheer', 'good_job', 'amazing', 'together', 'streak')),
  created_at    timestamptz not null default now(),
  unique (post_id, user_id)
);

create index reactions_post_id_idx on public.reactions (post_id);

-- -----------------------------------------------------------------------------
-- comments : コメント
-- -----------------------------------------------------------------------------
create table public.comments (
  id         uuid        primary key default gen_random_uuid(),
  post_id    uuid        not null references public.activity_posts (id) on delete cascade,
  user_id    uuid        not null references public.profiles (id) on delete cascade,
  body       text        not null check (char_length(body) between 1 and 2000),
  -- 10.2 投稿者が自分の投稿へのコメントを非表示にできる
  is_hidden  boolean     not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index comments_post_id_created_at_idx on public.comments (post_id, created_at);

create trigger comments_touch_updated_at
  before update on public.comments
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- daily_goals / weekly_goals : 目標
-- -----------------------------------------------------------------------------
create table public.daily_goals (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        not null references public.profiles (id) on delete cascade,
  goal_date      date        not null,
  target_seconds integer     not null check (target_seconds > 0 and target_seconds <= 86400),
  message        text        check (char_length(message) <= 200),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, goal_date)
);

create trigger daily_goals_touch_updated_at
  before update on public.daily_goals
  for each row execute function public.touch_updated_at();

create table public.weekly_goals (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references public.profiles (id) on delete cascade,
  -- 週の開始は月曜日（15.2）
  week_start_date date        not null check (extract(isodow from week_start_date) = 1),
  category_id     uuid        references public.categories (id) on delete cascade,
  target_seconds  integer     not null check (target_seconds > 0),
  message         text        check (char_length(message) <= 200),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- category_id が null（全体目標）の行も1件だけに限定する
  unique nulls not distinct (user_id, week_start_date, category_id)
);

create trigger weekly_goals_touch_updated_at
  before update on public.weekly_goals
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- 新規ユーザー登録時: プロフィールと初期カテゴリーを自動作成
-- -----------------------------------------------------------------------------
create or replace function public.create_default_categories(p_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.categories (user_id, name, icon, color, sort_order)
  values
    (p_user_id, '勉強',     '📚', '#6B8E9F', 10),
    (p_user_id, '仕事',     '💼', '#7D7C84', 20),
    (p_user_id, '読書',     '📖', '#9C8455', 30),
    (p_user_id, '運動',     '🏃', '#7FA37F', 40),
    (p_user_id, 'ホッケー', '🏒', '#5F7FA3', 50),
    (p_user_id, '個人開発', '💻', '#8B7BA8', 60),
    (p_user_id, '趣味',     '🎨', '#B08968', 70),
    (p_user_id, '家事',     '🏠', '#A3907F', 80),
    (p_user_id, 'その他',   '📝', '#8B8B8B', 90)
  on conflict (user_id, name) where user_id is not null do nothing;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display_name text;
begin
  v_display_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    split_part(coalesce(new.email, 'user'), '@', 1)
  );

  insert into public.profiles (id, display_name, timezone)
  values (
    new.id,
    left(v_display_name, 50),
    coalesce(nullif(new.raw_user_meta_data ->> 'timezone', ''), 'Asia/Tokyo')
  )
  on conflict (id) do nothing;

  perform public.create_default_categories(new.id);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
