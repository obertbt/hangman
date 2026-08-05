-- Hearth Growth セットアップ 1 / 6
-- 番号順に、Supabase の SQL Editor へ貼り付けて実行してください。
-- 元になっているのは supabase/migrations/ の各ファイルです。

create extension if not exists "pgcrypto";

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

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

create table public.group_invitations (
  id         uuid        primary key default gen_random_uuid(),
  group_id   uuid        not null references public.groups (id) on delete cascade,
  token      text        not null unique default replace(replace(encode(gen_random_bytes(32), 'base64'), '+', '-'), '/', '_'),
  invited_by uuid        not null references public.profiles (id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '7 days'),
  max_uses   integer     not null default 10 check (max_uses > 0),
  used_count integer     not null default 0 check (used_count >= 0),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index group_invitations_group_id_idx on public.group_invitations (group_id);

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
  constraint categories_owner_check check (num_nonnulls(user_id, group_id) = 1)
);

create unique index categories_user_name_key
  on public.categories (user_id, name) where user_id is not null;
create unique index categories_group_name_key
  on public.categories (group_id, name) where group_id is not null;
create index categories_group_id_idx on public.categories (group_id) where group_id is not null;

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
  constraint sessions_paused_at_check check (
    (status = 'paused' and paused_at is not null)
    or (status <> 'paused' and paused_at is null)
  ),
  constraint sessions_completed_check check (
    status <> 'completed'
    or (ended_at is not null and duration_seconds is not null)
  ),
  constraint sessions_time_order_check check (ended_at is null or ended_at >= started_at)
);

create unique index activity_sessions_one_active_per_user
  on public.activity_sessions (user_id)
  where status in ('running', 'paused');

create index activity_sessions_user_status_idx on public.activity_sessions (user_id, status);
create index activity_sessions_started_at_idx on public.activity_sessions (started_at desc);

create trigger activity_sessions_touch_updated_at
  before update on public.activity_sessions
  for each row execute function public.touch_updated_at();

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
create index activity_posts_user_date_idx
  on public.activity_posts (user_id, activity_date desc)
  where deleted_at is null;

create trigger activity_posts_touch_updated_at
  before update on public.activity_posts
  for each row execute function public.touch_updated_at();

create table public.post_allowed_users (
  post_id uuid not null references public.activity_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (post_id, user_id)
);

create index post_allowed_users_user_id_idx on public.post_allowed_users (user_id);

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

create table public.comments (
  id         uuid        primary key default gen_random_uuid(),
  post_id    uuid        not null references public.activity_posts (id) on delete cascade,
  user_id    uuid        not null references public.profiles (id) on delete cascade,
  body       text        not null check (char_length(body) between 1 and 2000),
  is_hidden  boolean     not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
