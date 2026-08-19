-- =============================================================================
-- Hearth Growth : 初回セットアップ用（全マイグレーションをまとめたもの）
-- =============================================================================
-- Supabase の SQL Editor に、このファイルの中身をまるごと貼って一度だけ実行します。
-- supabase/migrations/ の各ファイルを番号順に連結しただけで、内容は同じです。
--
-- 2回目以降やマイグレーションを追加したときは、
-- supabase/migrations/ の新しいファイルだけを個別に実行してください。
--
-- このファイルは生成物です。直接編集せず、migrations 側を直してから
--   npm run db:bundle
-- で作り直してください。
-- =============================================================================


-- ═══════════════════════════════════════════════════════════════════════════
-- 0001_initial_schema.sql
-- ═══════════════════════════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════════════════════════
-- 0002_rls_policies.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- =============================================================================
-- Hearth Growth : Row Level Security
-- =============================================================================
-- 原則
--   * すべての公開テーブルで RLS を有効化する（12.3）。
--   * 公開範囲の判定はフロントエンドに依存せず、必ずここで保証する（9章）。
--   * group_members を参照するポリシーは再帰を起こすため、
--     SECURITY DEFINER 関数を経由して判定する。
--   * SECURITY DEFINER 関数は search_path を固定し、実行権限を authenticated に限定する。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 判定用ヘルパー関数
-- -----------------------------------------------------------------------------

-- 指定グループのメンバーか
create or replace function public.is_group_member(p_group_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = p_user_id
  );
$$;

-- 指定グループの管理者（owner / admin）か
create or replace function public.is_group_admin(p_group_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id
      and user_id = p_user_id
      and role in ('owner', 'admin')
  );
$$;

-- 自分と相手が同じグループに所属しているか
create or replace function public.shares_group_with(p_user_id uuid, p_viewer_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members viewer
    join public.group_members target on target.group_id = viewer.group_id
    where viewer.user_id = p_viewer_id and target.user_id = p_user_id
  );
$$;

-- 投稿を閲覧できるか（private / group / selected の判定を1か所に集約する）
create or replace function public.can_view_post(p_post_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.activity_posts p
    where p.id = p_post_id
      and p.deleted_at is null
      and (
        p.user_id = p_user_id
        or (p.visibility = 'group' and public.is_group_member(p.group_id, p_user_id))
        or (
          p.visibility = 'selected'
          and exists (
            select 1 from public.post_allowed_users a
            where a.post_id = p.id and a.user_id = p_user_id
          )
        )
      )
  );
$$;

-- 投稿の所有者か
create or replace function public.is_post_owner(p_post_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.activity_posts
    where id = p_post_id and user_id = p_user_id
  );
$$;

revoke all on function public.is_group_member(uuid, uuid)   from public, anon;
revoke all on function public.is_group_admin(uuid, uuid)    from public, anon;
revoke all on function public.shares_group_with(uuid, uuid) from public, anon;
revoke all on function public.can_view_post(uuid, uuid)     from public, anon;
revoke all on function public.is_post_owner(uuid, uuid)     from public, anon;
grant execute on function public.is_group_member(uuid, uuid)   to authenticated;
grant execute on function public.is_group_admin(uuid, uuid)    to authenticated;
grant execute on function public.shares_group_with(uuid, uuid) to authenticated;
grant execute on function public.can_view_post(uuid, uuid)     to authenticated;
grant execute on function public.is_post_owner(uuid, uuid)     to authenticated;

-- -----------------------------------------------------------------------------
-- RLS 有効化
-- -----------------------------------------------------------------------------
alter table public.profiles           enable row level security;
alter table public.groups             enable row level security;
alter table public.group_members      enable row level security;
alter table public.group_invitations  enable row level security;
alter table public.categories         enable row level security;
alter table public.activity_sessions  enable row level security;
alter table public.activity_posts     enable row level security;
alter table public.post_allowed_users enable row level security;
alter table public.reactions          enable row level security;
alter table public.comments           enable row level security;
alter table public.daily_goals        enable row level security;
alter table public.weekly_goals       enable row level security;

-- -----------------------------------------------------------------------------
-- profiles
--   閲覧: 自分 + 同じグループのメンバーのみ（グループ外へは一切返さない）
-- -----------------------------------------------------------------------------
create policy "profiles_select_self_or_group_peer" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.shares_group_with(id));

create policy "profiles_insert_self" on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

create policy "profiles_update_self" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- groups
-- -----------------------------------------------------------------------------
create policy "groups_select_member" on public.groups
  for select to authenticated
  using (public.is_group_member(id));

create policy "groups_insert_owner_is_self" on public.groups
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "groups_update_admin" on public.groups
  for update to authenticated
  using (public.is_group_admin(id))
  with check (public.is_group_admin(id));

create policy "groups_delete_owner" on public.groups
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- group_members
--   参加は招待経由（accept_invitation）に限定する。
--   直接 insert できるのは「グループ作成者が自分を owner として登録する」場合のみ。
-- -----------------------------------------------------------------------------
create policy "group_members_select_member" on public.group_members
  for select to authenticated
  using (public.is_group_member(group_id));

create policy "group_members_insert_group_owner_self" on public.group_members
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.groups g
      where g.id = group_id and g.owner_id = (select auth.uid())
    )
  );

-- 権限変更は管理者のみ。owner 行は変更させない。
create policy "group_members_update_admin" on public.group_members
  for update to authenticated
  using (public.is_group_admin(group_id) and role <> 'owner')
  with check (public.is_group_admin(group_id) and role <> 'owner');

-- 退会（自分）または管理者による削除。owner は削除できない。
create policy "group_members_delete_self_or_admin" on public.group_members
  for delete to authenticated
  using (
    role <> 'owner'
    and (user_id = (select auth.uid()) or public.is_group_admin(group_id))
  );

-- -----------------------------------------------------------------------------
-- group_invitations
--   トークンからの参照は accept_invitation / get_invitation_preview 経由に限る。
-- -----------------------------------------------------------------------------
create policy "group_invitations_select_admin" on public.group_invitations
  for select to authenticated
  using (public.is_group_admin(group_id));

create policy "group_invitations_insert_admin" on public.group_invitations
  for insert to authenticated
  with check (public.is_group_admin(group_id) and invited_by = (select auth.uid()));

create policy "group_invitations_update_admin" on public.group_invitations
  for update to authenticated
  using (public.is_group_admin(group_id))
  with check (public.is_group_admin(group_id));

create policy "group_invitations_delete_admin" on public.group_invitations
  for delete to authenticated
  using (public.is_group_admin(group_id));

-- -----------------------------------------------------------------------------
-- categories
--   個人カテゴリー: 本人のみ / グループカテゴリー: メンバーは閲覧、管理者が編集
-- -----------------------------------------------------------------------------
create policy "categories_select_own_or_group" on public.categories
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (group_id is not null and public.is_group_member(group_id))
  );

create policy "categories_insert_own_or_group_admin" on public.categories
  for insert to authenticated
  with check (
    (user_id = (select auth.uid()) and group_id is null)
    or (group_id is not null and user_id is null and public.is_group_admin(group_id))
  );

create policy "categories_update_own_or_group_admin" on public.categories
  for update to authenticated
  using (
    user_id = (select auth.uid())
    or (group_id is not null and public.is_group_admin(group_id))
  )
  with check (
    user_id = (select auth.uid())
    or (group_id is not null and public.is_group_admin(group_id))
  );

create policy "categories_delete_own_or_group_admin" on public.categories
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    or (group_id is not null and public.is_group_admin(group_id))
  );

-- -----------------------------------------------------------------------------
-- activity_sessions
--   本人のみ。「今活動している人」は get_active_group_members() で
--   必要な列だけを返す（タイトルやメモを他人に晒さないため）。
-- -----------------------------------------------------------------------------
create policy "activity_sessions_select_own" on public.activity_sessions
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "activity_sessions_insert_own" on public.activity_sessions
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "activity_sessions_update_own" on public.activity_sessions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "activity_sessions_delete_own" on public.activity_sessions
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- activity_posts
-- -----------------------------------------------------------------------------
-- 投稿者は自分の投稿を常に読める（論理削除したものも含む）。
-- ここで `deleted_at is null` を投稿者にも掛けると、deleted_at を立てた瞬間に
-- 新しい行が SELECT ポリシーを満たさなくなり、論理削除の UPDATE 自体が
-- 「new row violates row-level security policy」で失敗する。
-- 他人からは、論理削除した投稿は見えない。
-- 一覧を出す側は `deleted_at is null` で絞ること。
create policy "activity_posts_select_visible" on public.activity_posts
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      deleted_at is null
      and (
        (visibility = 'group' and public.is_group_member(group_id))
        or (
          visibility = 'selected'
          and exists (
            select 1 from public.post_allowed_users a
            where a.post_id = id and a.user_id = (select auth.uid())
          )
        )
      )
    )
  );

-- group 公開は「自分が所属するグループ」にしか出せない
create policy "activity_posts_insert_own" on public.activity_posts
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (visibility <> 'group' or public.is_group_member(group_id))
  );

create policy "activity_posts_update_own" on public.activity_posts
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (visibility <> 'group' or public.is_group_member(group_id))
  );

create policy "activity_posts_delete_own" on public.activity_posts
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- post_allowed_users
-- -----------------------------------------------------------------------------
create policy "post_allowed_users_select_owner_or_self" on public.post_allowed_users
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_post_owner(post_id));

create policy "post_allowed_users_insert_owner" on public.post_allowed_users
  for insert to authenticated
  with check (public.is_post_owner(post_id));

create policy "post_allowed_users_delete_owner" on public.post_allowed_users
  for delete to authenticated
  using (public.is_post_owner(post_id));

-- -----------------------------------------------------------------------------
-- reactions : 元投稿の閲覧権限に従う
-- -----------------------------------------------------------------------------
create policy "reactions_select_visible_post" on public.reactions
  for select to authenticated
  using (public.can_view_post(post_id));

create policy "reactions_insert_own" on public.reactions
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_view_post(post_id));

create policy "reactions_update_own" on public.reactions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.can_view_post(post_id));

create policy "reactions_delete_own" on public.reactions
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- comments : 元投稿の閲覧権限に従う
--   非表示コメントは、コメント本人と投稿者にだけ見える。
--   投稿者による非表示化は set_comment_hidden() で行う（本文は変更できない）。
-- -----------------------------------------------------------------------------
-- コメントも同じ理由で、本人には常に見えるようにしておく
-- （そうしないと本人が deleted_at を立てられない）。
create policy "comments_select_visible_post" on public.comments
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      deleted_at is null
      and public.can_view_post(post_id)
      and (not is_hidden or public.is_post_owner(post_id))
    )
  );

create policy "comments_insert_own" on public.comments
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_view_post(post_id));

create policy "comments_update_own" on public.comments
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "comments_delete_own_or_post_owner" on public.comments
  for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_post_owner(post_id));

-- -----------------------------------------------------------------------------
-- daily_goals / weekly_goals : 本人のみ
-- -----------------------------------------------------------------------------
create policy "daily_goals_all_own" on public.daily_goals
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "weekly_goals_all_own" on public.weekly_goals
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════
-- 0003_rpc.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- =============================================================================
-- Hearth Growth : RLS だけでは表現できない操作のための RPC
-- =============================================================================
-- ここに置くのは「行単位の許可では足りず、手続きとして原子的に実行したい処理」だけ。
-- すべて SECURITY DEFINER のため、関数内で必ず auth.uid() を検証する。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- create_group : グループ作成と owner メンバー登録を1トランザクションで行う
-- -----------------------------------------------------------------------------
create or replace function public.create_group(p_name text, p_description text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id  uuid := auth.uid();
  v_group_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  insert into public.groups (name, description, owner_id)
  values (trim(p_name), nullif(trim(coalesce(p_description, '')), ''), v_user_id)
  returning id into v_group_id;

  insert into public.group_members (group_id, user_id, role)
  values (v_group_id, v_user_id, 'owner');

  return v_group_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- get_invitation_preview : 招待リンクを開いたときに見せる最小限の情報
--   トークンを知っている人にだけ、グループ名と招待者名を返す。
--   メンバー一覧や投稿は一切返さない。
-- -----------------------------------------------------------------------------
create or replace function public.get_invitation_preview(p_token text)
returns table (
  group_id     uuid,
  group_name   text,
  inviter_name text,
  member_count integer,
  is_valid     boolean,
  reason       text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv record;
begin
  select i.*, g.name as group_name, p.display_name as inviter_name
    into v_inv
  from public.group_invitations i
  join public.groups g   on g.id = i.group_id
  join public.profiles p on p.id = i.invited_by
  where i.token = p_token;

  if not found then
    return query select null::uuid, null::text, null::text, 0, false, 'not_found'::text;
    return;
  end if;

  return query
  select
    v_inv.group_id,
    v_inv.group_name,
    v_inv.inviter_name,
    (select count(*)::integer from public.group_members m where m.group_id = v_inv.group_id),
    case
      when v_inv.revoked_at is not null then false
      when v_inv.expires_at <= now() then false
      when v_inv.used_count >= v_inv.max_uses then false
      else true
    end,
    case
      when v_inv.revoked_at is not null then 'revoked'
      when v_inv.expires_at <= now() then 'expired'
      when v_inv.used_count >= v_inv.max_uses then 'exhausted'
      else 'ok'
    end;
end;
$$;

-- -----------------------------------------------------------------------------
-- accept_invitation : 招待トークンでグループに参加する
--   有効期限・失効・利用上限を関数内で検証し、used_count を原子的に加算する。
-- -----------------------------------------------------------------------------
create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_inv     public.group_invitations;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- 同じトークンへの同時アクセスを直列化する
  select * into v_inv
  from public.group_invitations
  where token = p_token
  for update;

  if not found then
    raise exception 'invitation not found' using errcode = 'P0002';
  end if;

  if v_inv.revoked_at is not null then
    raise exception 'invitation revoked' using errcode = 'P0001';
  end if;

  if v_inv.expires_at <= now() then
    raise exception 'invitation expired' using errcode = 'P0001';
  end if;

  if v_inv.used_count >= v_inv.max_uses then
    raise exception 'invitation exhausted' using errcode = 'P0001';
  end if;

  -- 参加済みなら used_count を消費せずそのまま返す
  if exists (
    select 1 from public.group_members
    where group_id = v_inv.group_id and user_id = v_user_id
  ) then
    return v_inv.group_id;
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (v_inv.group_id, v_user_id, 'member');

  update public.group_invitations
  set used_count = used_count + 1
  where id = v_inv.id;

  return v_inv.group_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- get_active_group_members : 「今、頑張っている人」
--   activity_sessions 自体は本人しか select できない。
--   ここでホーム画面に必要な列だけを、同じグループの相手に限って返す。
--   title / note は返さない（本人の意図しない共有を避けるため）。
-- -----------------------------------------------------------------------------
create or replace function public.get_active_group_members()
returns table (
  user_id              uuid,
  display_name         text,
  avatar_url           text,
  category_name        text,
  category_icon        text,
  category_color       text,
  status               text,
  started_at           timestamptz,
  total_paused_seconds integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.user_id,
    p.display_name,
    p.avatar_url,
    c.name,
    c.icon,
    c.color,
    s.status,
    s.started_at,
    s.total_paused_seconds
  from public.activity_sessions s
  join public.profiles p   on p.id = s.user_id
  join public.categories c on c.id = s.category_id
  where s.status in ('running', 'paused')
    and (s.user_id = auth.uid() or public.shares_group_with(s.user_id, auth.uid()))
  order by s.started_at asc;
$$;

-- -----------------------------------------------------------------------------
-- set_comment_hidden : 投稿者が自分の投稿へのコメントを非表示にする（10.2）
--   本文の書き換えはできない。
-- -----------------------------------------------------------------------------
create or replace function public.set_comment_hidden(p_comment_id uuid, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_post_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select post_id into v_post_id from public.comments where id = p_comment_id;

  if not found then
    raise exception 'comment not found' using errcode = 'P0002';
  end if;

  if not public.is_post_owner(v_post_id, v_user_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  update public.comments set is_hidden = p_hidden where id = p_comment_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 実行権限
-- -----------------------------------------------------------------------------
revoke all on function public.create_group(text, text)              from public, anon;
revoke all on function public.accept_invitation(text)               from public, anon;
revoke all on function public.get_active_group_members()            from public, anon;
revoke all on function public.set_comment_hidden(uuid, boolean)     from public, anon;
revoke all on function public.get_invitation_preview(text)          from public;

grant execute on function public.create_group(text, text)          to authenticated;
grant execute on function public.accept_invitation(text)           to authenticated;
grant execute on function public.get_active_group_members()        to authenticated;
grant execute on function public.set_comment_hidden(uuid, boolean) to authenticated;
-- 招待リンクはログイン前にも内容を確認できるようにする
grant execute on function public.get_invitation_preview(text)      to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0004_storage_avatars.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- =============================================================================
-- Hearth Growth : プロフィール画像用ストレージ
-- =============================================================================
-- 画像はグループのメンバーが見るため公開バケットにするが、
-- 書き込みは「自分の user_id フォルダ配下」に限定する。
-- 容量と MIME タイプはバケット側でも制限する（20章）。
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2 * 1024 * 1024, -- 2MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 既存ポリシーを作り直せるようにしておく
drop policy if exists "avatars_read_all"      on storage.objects;
drop policy if exists "avatars_insert_own"    on storage.objects;
drop policy if exists "avatars_update_own"    on storage.objects;
drop policy if exists "avatars_delete_own"    on storage.objects;

create policy "avatars_read_all" on storage.objects
  for select
  using (bucket_id = 'avatars');

-- パスの先頭フォルダを自分の user_id に強制する: avatars/<uid>/<file>
create policy "avatars_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 0005_timer_rpc.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- =============================================================================
-- Hearth Growth : タイマーの状態遷移
-- =============================================================================
-- 時刻の基準を1か所に固定するため、状態遷移はすべて DB 側で行う（13章）。
--
--   * 経過時間の計算に使う「今」は常に Postgres の now()。
--     アプリサーバーやブラウザの時計は使わない。
--   * duration_seconds = ended_at - started_at - total_paused_seconds
--   * running / paused は1ユーザー1件まで（部分一意インデックスが最終防衛線）。
--     ここでは、その前に分かりやすい例外を投げる。
--
-- SECURITY DEFINER だが、対象は必ず auth.uid() 自身の行に限定している。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- start_session : タイマーを開始する
-- -----------------------------------------------------------------------------
create or replace function public.start_session(
  p_category_id uuid,
  p_title       text default null,
  p_note        text default null
)
returns public.activity_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.activity_sessions;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- 自分が使えるカテゴリーか（個人のもの、または所属グループのもの）
  if not exists (
    select 1 from public.categories c
    where c.id = p_category_id
      and c.is_active
      and (
        c.user_id = v_user_id
        or (c.group_id is not null and public.is_group_member(c.group_id, v_user_id))
      )
  ) then
    raise exception 'category not available' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.activity_sessions
    where user_id = v_user_id and status in ('running', 'paused')
  ) then
    raise exception 'session already active' using errcode = 'P0001';
  end if;

  insert into public.activity_sessions (user_id, category_id, title, note)
  values (
    v_user_id,
    p_category_id,
    nullif(trim(coalesce(p_title, '')), ''),
    nullif(trim(coalesce(p_note, '')), '')
  )
  returning * into v_session;

  return v_session;
end;
$$;

-- -----------------------------------------------------------------------------
-- pause_session : 一時停止する
-- -----------------------------------------------------------------------------
create or replace function public.pause_session(p_session_id uuid)
returns public.activity_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.activity_sessions;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  update public.activity_sessions
  set status = 'paused', paused_at = now()
  where id = p_session_id and user_id = v_user_id and status = 'running'
  returning * into v_session;

  if not found then
    raise exception 'session not running' using errcode = 'P0002';
  end if;

  return v_session;
end;
$$;

-- -----------------------------------------------------------------------------
-- resume_session : 再開する
--   停止していた時間を total_paused_seconds へ足し込む。
-- -----------------------------------------------------------------------------
create or replace function public.resume_session(p_session_id uuid)
returns public.activity_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.activity_sessions;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  update public.activity_sessions
  set
    total_paused_seconds =
      total_paused_seconds + greatest(0, floor(extract(epoch from (now() - paused_at)))::integer),
    paused_at = null,
    status = 'running'
  where id = p_session_id and user_id = v_user_id and status = 'paused'
  returning * into v_session;

  if not found then
    raise exception 'session not paused' using errcode = 'P0002';
  end if;

  return v_session;
end;
$$;

-- -----------------------------------------------------------------------------
-- complete_session : 終了して活動時間を確定する
--
--   p_ended_at を渡すと終了時刻を修正できる（13.4 の異常終了への対応）。
--   ただし開始より前や未来の時刻は受け付けない。勝手な自動終了はしない。
-- -----------------------------------------------------------------------------
create or replace function public.complete_session(
  p_session_id uuid,
  p_ended_at   timestamptz default null
)
returns public.activity_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id  uuid := auth.uid();
  v_current  public.activity_sessions;
  v_session  public.activity_sessions;
  v_ended_at timestamptz;
  v_paused   integer;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_current
  from public.activity_sessions
  where id = p_session_id and user_id = v_user_id and status in ('running', 'paused')
  for update;

  if not found then
    raise exception 'session not active' using errcode = 'P0002';
  end if;

  v_ended_at := coalesce(p_ended_at, now());

  if v_ended_at < v_current.started_at then
    raise exception 'ended_at before started_at' using errcode = 'P0001';
  end if;
  -- 時計のずれを考慮して少しだけ猶予を持たせる
  if v_ended_at > now() + interval '1 minute' then
    raise exception 'ended_at in the future' using errcode = 'P0001';
  end if;

  -- 一時停止のまま終了した場合、その停止時間も差し引く
  v_paused := v_current.total_paused_seconds
    + case
        when v_current.paused_at is null then 0
        else greatest(0, floor(extract(epoch from (v_ended_at - v_current.paused_at)))::integer)
      end;

  update public.activity_sessions
  set
    status               = 'completed',
    ended_at             = v_ended_at,
    paused_at            = null,
    total_paused_seconds = v_paused,
    duration_seconds     = greatest(
      0,
      floor(extract(epoch from (v_ended_at - v_current.started_at)))::integer - v_paused
    )
  where id = p_session_id
  returning * into v_session;

  return v_session;
end;
$$;

-- -----------------------------------------------------------------------------
-- cancel_session : 記録を残さずに取り消す
-- -----------------------------------------------------------------------------
create or replace function public.cancel_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  update public.activity_sessions
  set status = 'cancelled', ended_at = now(), paused_at = null
  where id = p_session_id and user_id = v_user_id and status in ('running', 'paused');

  if not found then
    raise exception 'session not active' using errcode = 'P0002';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 実行権限
-- -----------------------------------------------------------------------------
revoke all on function public.start_session(uuid, text, text)     from public, anon;
revoke all on function public.pause_session(uuid)                 from public, anon;
revoke all on function public.resume_session(uuid)                from public, anon;
revoke all on function public.complete_session(uuid, timestamptz) from public, anon;
revoke all on function public.cancel_session(uuid)                from public, anon;

grant execute on function public.start_session(uuid, text, text)     to authenticated;
grant execute on function public.pause_session(uuid)                 to authenticated;
grant execute on function public.resume_session(uuid)                to authenticated;
grant execute on function public.complete_session(uuid, timestamptz) to authenticated;
grant execute on function public.cancel_session(uuid)                to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0006_post_rpc.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- =============================================================================
-- Hearth Growth : 活動記録の作成と更新
-- =============================================================================
-- 投稿本体と post_allowed_users（selected 公開の宛先）を必ず一緒に書き換える。
-- 2回に分けると、宛先の insert だけ失敗したときに
-- 「selected なのに誰も見られない投稿」が残る。
--
-- 併せて、クライアントを信用しない値をここで確定させる。
--   * タイマー由来の投稿は、活動時間をセッションから取る（改ざんさせない）
--   * activity_date はユーザーのタイムゾーンで決める（15.1）
--   * 未来の日付は受け付けない
-- =============================================================================

-- -----------------------------------------------------------------------------
-- user_today : そのユーザーのタイムゾーンでの「今日」
-- -----------------------------------------------------------------------------
create or replace function public.user_today(p_user_id uuid default auth.uid())
returns date
language sql
stable
security definer
set search_path = public
as $$
  select (now() at time zone coalesce(
    (select timezone from public.profiles where id = p_user_id),
    'Asia/Tokyo'
  ))::date;
$$;

revoke all on function public.user_today(uuid) from public, anon;
grant execute on function public.user_today(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 内部用: 公開範囲の指定が筋の通ったものかを確かめる
-- -----------------------------------------------------------------------------
create or replace function public.assert_visibility_target(
  p_user_id          uuid,
  p_visibility       text,
  p_group_id         uuid,
  p_allowed_user_ids uuid[]
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_target uuid;
begin
  if p_visibility = 'group' then
    if p_group_id is null then
      raise exception 'group required' using errcode = 'P0001';
    end if;
    if not public.is_group_member(p_group_id, p_user_id) then
      raise exception 'not a group member' using errcode = '42501';
    end if;
  elsif p_group_id is not null then
    raise exception 'group not allowed' using errcode = 'P0001';
  end if;

  if p_visibility = 'selected' then
    if p_allowed_user_ids is null or array_length(p_allowed_user_ids, 1) is null then
      raise exception 'no allowed users' using errcode = 'P0001';
    end if;
    -- 宛先に選べるのは、同じグループにいる相手だけ
    foreach v_target in array p_allowed_user_ids loop
      if v_target <> p_user_id and not public.shares_group_with(v_target, p_user_id) then
        raise exception 'user not reachable' using errcode = '42501';
      end if;
    end loop;
  end if;
end;
$$;

revoke all on function public.assert_visibility_target(uuid, text, uuid, uuid[]) from public, anon;

-- -----------------------------------------------------------------------------
-- create_activity_post : 活動記録を作る
--   p_session_id を渡すとタイマー由来の記録、渡さなければ手動記録。
-- -----------------------------------------------------------------------------
create or replace function public.create_activity_post(
  p_category_id      uuid    default null,
  p_session_id       uuid    default null,
  p_title            text    default null,
  p_body             text    default null,
  p_duration_seconds integer default null,
  p_activity_date    date    default null,
  p_visibility       text    default 'private',
  p_group_id         uuid    default null,
  p_allowed_user_ids uuid[]  default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id     uuid := auth.uid();
  v_session     public.activity_sessions;
  v_category_id uuid := p_category_id;
  v_duration    integer := p_duration_seconds;
  v_date        date := p_activity_date;
  v_started_at  timestamptz;
  v_ended_at    timestamptz;
  v_post_id     uuid;
  v_target      uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_visibility not in ('private', 'group', 'selected') then
    raise exception 'invalid visibility' using errcode = 'P0001';
  end if;

  if p_session_id is not null then
    select * into v_session
    from public.activity_sessions
    where id = p_session_id and user_id = v_user_id and status = 'completed'
    for update;

    if not found then
      raise exception 'session not completed' using errcode = 'P0002';
    end if;

    if exists (select 1 from public.activity_posts where session_id = p_session_id) then
      raise exception 'session already posted' using errcode = 'P0001';
    end if;

    -- タイマー由来の値はクライアントから受け取らない
    v_category_id := v_session.category_id;
    v_duration    := coalesce(v_session.duration_seconds, 0);
    v_started_at  := v_session.started_at;
    v_ended_at    := v_session.ended_at;
    v_date        := (v_session.ended_at at time zone coalesce(
                       (select timezone from public.profiles where id = v_user_id), 'Asia/Tokyo'))::date;
  else
    if v_category_id is null then
      raise exception 'category required' using errcode = 'P0001';
    end if;
    if v_duration is null then
      raise exception 'duration required' using errcode = 'P0001';
    end if;
    v_date := coalesce(v_date, public.user_today(v_user_id));

    if v_date > public.user_today(v_user_id) then
      raise exception 'activity_date in the future' using errcode = 'P0001';
    end if;
  end if;

  -- 自分が使えるカテゴリーか
  if not exists (
    select 1 from public.categories c
    where c.id = v_category_id
      and (
        c.user_id = v_user_id
        or (c.group_id is not null and public.is_group_member(c.group_id, v_user_id))
      )
  ) then
    raise exception 'category not available' using errcode = 'P0002';
  end if;

  if v_duration < 0 or v_duration > 86400 then
    raise exception 'duration out of range' using errcode = 'P0001';
  end if;

  perform public.assert_visibility_target(v_user_id, p_visibility, p_group_id, p_allowed_user_ids);

  insert into public.activity_posts (
    user_id, session_id, category_id, title, body,
    duration_seconds, activity_date, visibility, group_id, started_at, ended_at
  )
  values (
    v_user_id,
    p_session_id,
    v_category_id,
    nullif(trim(coalesce(p_title, '')), ''),
    nullif(trim(coalesce(p_body, '')), ''),
    v_duration,
    v_date,
    p_visibility,
    case when p_visibility = 'group' then p_group_id else null end,
    v_started_at,
    v_ended_at
  )
  returning id into v_post_id;

  if p_visibility = 'selected' then
    foreach v_target in array p_allowed_user_ids loop
      insert into public.post_allowed_users (post_id, user_id)
      values (v_post_id, v_target)
      on conflict do nothing;
    end loop;
  end if;

  return v_post_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- update_activity_post : 内容と公開範囲を編集する
--   活動時間そのものは、タイマー由来かどうかで扱いを変える。
--   タイマー由来の記録では時間を書き換えさせない（履歴と食い違うため）。
-- -----------------------------------------------------------------------------
create or replace function public.update_activity_post(
  p_post_id          uuid,
  p_title            text    default null,
  p_body             text    default null,
  p_duration_seconds integer default null,
  p_activity_date    date    default null,
  p_visibility       text    default 'private',
  p_group_id         uuid    default null,
  p_allowed_user_ids uuid[]  default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_post    public.activity_posts;
  v_target  uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_post
  from public.activity_posts
  where id = p_post_id and user_id = v_user_id and deleted_at is null
  for update;

  if not found then
    raise exception 'post not found' using errcode = 'P0002';
  end if;

  if p_visibility not in ('private', 'group', 'selected') then
    raise exception 'invalid visibility' using errcode = 'P0001';
  end if;

  perform public.assert_visibility_target(v_user_id, p_visibility, p_group_id, p_allowed_user_ids);

  if v_post.session_id is null then
    if p_duration_seconds is not null and (p_duration_seconds < 0 or p_duration_seconds > 86400) then
      raise exception 'duration out of range' using errcode = 'P0001';
    end if;
    if p_activity_date is not null and p_activity_date > public.user_today(v_user_id) then
      raise exception 'activity_date in the future' using errcode = 'P0001';
    end if;
  end if;

  update public.activity_posts
  set
    title      = nullif(trim(coalesce(p_title, '')), ''),
    body       = nullif(trim(coalesce(p_body, '')), ''),
    visibility = p_visibility,
    group_id   = case when p_visibility = 'group' then p_group_id else null end,
    -- タイマー由来の記録では時間と日付を据え置く
    duration_seconds = case
      when v_post.session_id is not null then v_post.duration_seconds
      else coalesce(p_duration_seconds, v_post.duration_seconds)
    end,
    activity_date = case
      when v_post.session_id is not null then v_post.activity_date
      else coalesce(p_activity_date, v_post.activity_date)
    end
  where id = p_post_id;

  -- 宛先は毎回入れ替える
  delete from public.post_allowed_users where post_id = p_post_id;

  if p_visibility = 'selected' then
    foreach v_target in array p_allowed_user_ids loop
      insert into public.post_allowed_users (post_id, user_id)
      values (p_post_id, v_target)
      on conflict do nothing;
    end loop;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- delete_activity_post : 論理削除
-- -----------------------------------------------------------------------------
create or replace function public.delete_activity_post(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  update public.activity_posts
  set deleted_at = now()
  where id = p_post_id and user_id = v_user_id and deleted_at is null;

  if not found then
    raise exception 'post not found' using errcode = 'P0002';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 実行権限
-- -----------------------------------------------------------------------------
revoke all on function public.create_activity_post(uuid, uuid, text, text, integer, date, text, uuid, uuid[])
  from public, anon;
revoke all on function public.update_activity_post(uuid, text, text, integer, date, text, uuid, uuid[])
  from public, anon;
revoke all on function public.delete_activity_post(uuid) from public, anon;

grant execute on function public.create_activity_post(uuid, uuid, text, text, integer, date, text, uuid, uuid[])
  to authenticated;
grant execute on function public.update_activity_post(uuid, text, text, integer, date, text, uuid, uuid[])
  to authenticated;
grant execute on function public.delete_activity_post(uuid) to authenticated;
grant execute on function public.assert_visibility_target(uuid, text, uuid, uuid[]) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0007_active_members_paused_at.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- =============================================================================
-- Hearth Growth : get_active_group_members に paused_at を足す
-- =============================================================================
-- 休憩中のメンバーの経過時間は「停止した時刻 - 開始 - 累計停止時間」で止まる。
-- paused_at を返さないと、休憩中でも時間が進んでいるように見えてしまう。
--
-- 戻り値の型が変わるため、CREATE OR REPLACE では差し替えられない。先に削除する。
-- 引き続き title / note は返さない（本人の意図しない共有を避けるため）。
-- =============================================================================

drop function if exists public.get_active_group_members();

create function public.get_active_group_members()
returns table (
  user_id              uuid,
  display_name         text,
  avatar_url           text,
  category_name        text,
  category_icon        text,
  category_color       text,
  status               text,
  started_at           timestamptz,
  paused_at            timestamptz,
  total_paused_seconds integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.user_id,
    p.display_name,
    p.avatar_url,
    c.name,
    c.icon,
    c.color,
    s.status,
    s.started_at,
    s.paused_at,
    s.total_paused_seconds
  from public.activity_sessions s
  join public.profiles p   on p.id = s.user_id
  join public.categories c on c.id = s.category_id
  where s.status in ('running', 'paused')
    and (s.user_id = auth.uid() or public.shares_group_with(s.user_id, auth.uid()))
  order by s.started_at asc;
$$;

revoke all on function public.get_active_group_members() from public, anon;
grant execute on function public.get_active_group_members() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0008_summary.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- =============================================================================
-- Hearth Growth : 集計（15章）
-- =============================================================================
-- 集計をアプリ側でやると、全件を引いてから足すことになる。
-- 「今日」「今週」の境目もユーザーのタイムゾーン次第なので、まとめて DB に置く。
--
--   * 週の始まりは月曜日（Postgres の date_trunc('week') と同じ）
--   * 論理削除した記録は数えない
--   * 個人の集計は必ず auth.uid() の分だけを返す
-- =============================================================================

-- -----------------------------------------------------------------------------
-- user_week_start : そのユーザーのタイムゾーンでの「今週の月曜日」
-- -----------------------------------------------------------------------------
create or replace function public.user_week_start(p_user_id uuid default auth.uid())
returns date
language sql
stable
security definer
set search_path = public
as $$
  select date_trunc('week', public.user_today(p_user_id)::timestamp)::date;
$$;

-- -----------------------------------------------------------------------------
-- get_period_summary : 期間の合計（両端を含む）
-- -----------------------------------------------------------------------------
create or replace function public.get_period_summary(p_from date, p_to date)
returns table (total_seconds bigint, post_count integer, active_days integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(sum(p.duration_seconds), 0)::bigint,
    count(*)::integer,
    count(distinct p.activity_date)::integer
  from public.activity_posts p
  where p.user_id = auth.uid()
    and p.deleted_at is null
    and p.activity_date between p_from and p_to;
$$;

-- -----------------------------------------------------------------------------
-- get_daily_totals : 日ごとの合計（グラフ用）
--   記録が無い日は返らない。呼び出し側で 0 として扱う。
-- -----------------------------------------------------------------------------
create or replace function public.get_daily_totals(p_from date, p_to date)
returns table (activity_date date, total_seconds bigint, post_count integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.activity_date,
    coalesce(sum(p.duration_seconds), 0)::bigint,
    count(*)::integer
  from public.activity_posts p
  where p.user_id = auth.uid()
    and p.deleted_at is null
    and p.activity_date between p_from and p_to
  group by p.activity_date
  order by p.activity_date;
$$;

-- -----------------------------------------------------------------------------
-- get_category_summary : カテゴリー別の合計（15.3）
-- -----------------------------------------------------------------------------
create or replace function public.get_category_summary(p_from date, p_to date)
returns table (
  category_id    uuid,
  category_name  text,
  category_icon  text,
  category_color text,
  total_seconds  bigint,
  post_count     integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.name,
    c.icon,
    c.color,
    coalesce(sum(p.duration_seconds), 0)::bigint,
    count(*)::integer
  from public.activity_posts p
  join public.categories c on c.id = p.category_id
  where p.user_id = auth.uid()
    and p.deleted_at is null
    and p.activity_date between p_from and p_to
  group by c.id, c.name, c.icon, c.color
  order by 5 desc;
$$;

-- -----------------------------------------------------------------------------
-- get_current_streak : 連続記録日数（15.4）
--
--   1日1件以上の記録がある日を記録日とする。
--   今日まだ記録が無くても、昨日まで続いていれば途切れた扱いにしない。
-- -----------------------------------------------------------------------------
create or replace function public.get_current_streak(p_user_id uuid default auth.uid())
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today  date;
  v_anchor date;
  v_streak integer;
begin
  -- 他人の連続記録は返さない
  if p_user_id is distinct from auth.uid() then
    return 0;
  end if;

  v_today := public.user_today(p_user_id);

  select case
    when exists (
      select 1 from public.activity_posts
      where user_id = p_user_id and deleted_at is null and activity_date = v_today
    ) then v_today
    when exists (
      select 1 from public.activity_posts
      where user_id = p_user_id and deleted_at is null and activity_date = v_today - 1
    ) then v_today - 1
    else null
  end into v_anchor;

  if v_anchor is null then
    return 0;
  end if;

  -- 起点から1日ずつ遡り、途切れた時点で止める
  with days as (
    select distinct activity_date as day
    from public.activity_posts
    where user_id = p_user_id and deleted_at is null and activity_date <= v_anchor
  ),
  ordered as (
    select day, row_number() over (order by day desc) as rn
    from days
  ),
  expected as (
    select rn, day, (v_anchor - (rn - 1)::integer) as expected_day
    from ordered
  )
  select coalesce(
    (select min(rn) - 1 from expected where day <> expected_day),
    (select count(*) from expected)
  )::integer
  into v_streak;

  return coalesce(v_streak, 0);
end;
$$;

-- -----------------------------------------------------------------------------
-- get_group_week_summary : グループの今週（7.7, 15.5）
--
--   順位を競わせないため、返すのは活動時間と記録した日数だけ。
--   数えるのは「そのグループへ公開された記録」に限る。
--   非公開や別グループ向けの記録を、集計経由で漏らさないため。
-- -----------------------------------------------------------------------------
create or replace function public.get_group_week_summary(p_group_id uuid, p_week_start date default null)
returns table (
  user_id       uuid,
  display_name  text,
  avatar_url    text,
  total_seconds bigint,
  active_days   integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start date := coalesce(p_week_start, public.user_week_start());
begin
  if not public.is_group_member(p_group_id, auth.uid()) then
    raise exception 'not a group member' using errcode = '42501';
  end if;

  return query
  select
    m.user_id,
    pr.display_name,
    pr.avatar_url,
    coalesce(sum(p.duration_seconds), 0)::bigint,
    count(distinct p.activity_date)::integer
  from public.group_members m
  join public.profiles pr on pr.id = m.user_id
  left join public.activity_posts p
    on p.user_id = m.user_id
   and p.deleted_at is null
   and p.visibility = 'group'
   and p.group_id = p_group_id
   and p.activity_date between v_start and v_start + 6
  where m.group_id = p_group_id
  group by m.user_id, pr.display_name, pr.avatar_url
  order by pr.display_name;
end;
$$;

-- -----------------------------------------------------------------------------
-- 実行権限
-- -----------------------------------------------------------------------------
revoke all on function public.user_week_start(uuid)                  from public, anon;
revoke all on function public.get_period_summary(date, date)         from public, anon;
revoke all on function public.get_daily_totals(date, date)           from public, anon;
revoke all on function public.get_category_summary(date, date)       from public, anon;
revoke all on function public.get_current_streak(uuid)               from public, anon;
revoke all on function public.get_group_week_summary(uuid, date)     from public, anon;

grant execute on function public.user_week_start(uuid)              to authenticated;
grant execute on function public.get_period_summary(date, date)     to authenticated;
grant execute on function public.get_daily_totals(date, date)       to authenticated;
grant execute on function public.get_category_summary(date, date)   to authenticated;
grant execute on function public.get_current_streak(uuid)           to authenticated;
grant execute on function public.get_group_week_summary(uuid, date) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0009_activity_photos.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- =============================================================================
-- Hearth Growth : 活動記録の写真（24章「記録形式 → 写真」）
-- =============================================================================
-- プロフィール画像とは扱いを変える。
--
--   * プロフィール画像は公開バケット。URL を知られても困らない。
--   * 活動記録の写真は日々の生活が写る。非公開バケットに置き、
--     見るときだけ期限付きの URL を発行する。
--
-- 誰が見られるかは、記録本体とまったく同じ（can_view_post）。
-- 「自分だけ」の記録に付けた写真は、他の人からは取得できない。
-- =============================================================================

create table public.activity_photos (
  id           uuid        primary key default gen_random_uuid(),
  post_id      uuid        not null references public.activity_posts (id) on delete cascade,
  user_id      uuid        not null references public.profiles (id) on delete cascade,
  -- バケット内の位置。`<user_id>/<post_id>/<乱数>.jpg`
  storage_path text        not null unique,
  sort_order   integer     not null default 0,
  created_at   timestamptz not null default now()
);

create index activity_photos_post_id_idx on public.activity_photos (post_id, sort_order);

-- -----------------------------------------------------------------------------
-- 1件の記録に付けられる枚数の上限
--   多いほど良いものではないので、DB 側でも止める。
-- -----------------------------------------------------------------------------
create or replace function public.enforce_photo_limit()
returns trigger
language plpgsql
-- 数え上げが RLS に左右されると上限が揺らぐため、定義者権限で数える
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.activity_photos where post_id = new.post_id) >= 4 then
    raise exception 'too many photos' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger activity_photos_limit
  before insert on public.activity_photos
  for each row execute function public.enforce_photo_limit();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.activity_photos enable row level security;

create policy "activity_photos_select_visible_post" on public.activity_photos
  for select to authenticated
  using (user_id = (select auth.uid()) or public.can_view_post(post_id));

create policy "activity_photos_insert_own" on public.activity_photos
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_post_owner(post_id));

create policy "activity_photos_delete_own" on public.activity_photos
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- 保存先のバケット（非公開）
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'activity-photos',
  'activity-photos',
  false,                 -- 公開しない。期限付き URL 経由でのみ見せる
  5 * 1024 * 1024,       -- 5MB。画面側で縮小してから送るので、これで足りる
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "activity_photos_read"        on storage.objects;
drop policy if exists "activity_photos_write_own"   on storage.objects;
drop policy if exists "activity_photos_delete_own"  on storage.objects;

/*
 * 読み取り。
 *
 * 期限付き URL の発行にも、この権限が要る。
 * つまりここが「誰の写真を誰が見られるか」の実体になる。
 * 記録本体の公開範囲をそのまま参照するので、判断がずれることはない。
 */
create policy "activity_photos_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'activity-photos'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1 from public.activity_photos p
        where p.storage_path = storage.objects.name
          and public.can_view_post(p.post_id)
      )
    )
  );

-- 置けるのは自分のフォルダの中だけ
create policy "activity_photos_write_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'activity-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "activity_photos_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'activity-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 0010_notifications.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- =============================================================================
-- Hearth Growth : アプリ内のお知らせ
-- =============================================================================
-- 「競争しない・静かに続ける」が芯のアプリなので、通知も普通の SNS とは逆に振る。
--
--   * 他人が記録を増やすたびには知らせない。知らせるのは自分に向けられたものだけ。
--   * 応援は1件ずつ数えず、1つの記録につき「何人が応援したか」にまとめる。
--   * 種類ごとに自分でオフにできる。
--
-- お知らせの行はアプリのコードではなくトリガーが作る。
-- 画面側の書き忘れで「片方の経路だけ通知されない」が起きないようにするため。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 受け取り方の設定
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists notify_reaction   boolean not null default true,
  add column if not exists notify_comment    boolean not null default true,
  add column if not exists notify_group_join boolean not null default true;

-- -----------------------------------------------------------------------------
-- お知らせ本体
-- -----------------------------------------------------------------------------
create table public.notifications (
  id         uuid        primary key default gen_random_uuid(),
  -- 受け取る人
  user_id    uuid        not null references public.profiles (id) on delete cascade,
  -- きっかけを作った人。まとめたお知らせでは「最後の1人」を指す
  actor_id   uuid        references public.profiles (id) on delete cascade,
  type       text        not null check (type in ('reaction', 'comment', 'group_join')),
  post_id    uuid        references public.activity_posts (id) on delete cascade,
  comment_id uuid        references public.comments (id) on delete cascade,
  group_id   uuid        references public.groups (id) on delete cascade,
  -- まとめた人数。「3人が応援しています」の 3
  actor_count integer    not null default 1 check (actor_count > 0),
  read_at    timestamptz,
  created_at timestamptz not null default now(),
  -- 自分の行いを自分に知らせない
  constraint notifications_not_self check (actor_id is null or actor_id <> user_id)
);

-- 一覧は「自分あて・新しい順」でしか引かない
create index notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

-- 未読の数はベルの数字として毎回引くので、未読だけの索引を持たせる
create index notifications_unread_idx
  on public.notifications (user_id)
  where read_at is null;

/*
 * 応援をまとめるための一意制約。
 *
 * 「同じ記録への、まだ読んでいない応援のお知らせ」は1件しか作らせない。
 * 2人目からは行を増やさず actor_count を足す。
 * 既読にしたあとに新しい応援が来たら、それは新しいお知らせとして出す。
 */
create unique index notifications_unread_reaction_per_post
  on public.notifications (user_id, post_id)
  where type = 'reaction' and read_at is null;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.notifications enable row level security;

-- 作るのはトリガー（定義者権限）だけ。利用者に INSERT のポリシーは与えない。
create policy "notifications_select_own" on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "notifications_update_own" on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "notifications_delete_own" on public.notifications
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- 応援がついたとき
-- -----------------------------------------------------------------------------
create or replace function public.notify_on_reaction()
returns trigger
language plpgsql
-- 他人あての行を作るため定義者権限で動かす。利用者は INSERT できない。
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select p.user_id into v_owner
  from public.activity_posts p
  join public.profiles pr on pr.id = p.user_id
  where p.id = new.post_id
    and p.user_id <> new.user_id
    and p.deleted_at is null
    and pr.notify_reaction;

  if v_owner is null then
    return new;
  end if;

  insert into public.notifications (user_id, actor_id, type, post_id)
  values (v_owner, new.user_id, 'reaction', new.post_id)
  on conflict (user_id, post_id) where type = 'reaction' and read_at is null
  do update set
    actor_id    = excluded.actor_id,
    actor_count = public.notifications.actor_count + 1,
    created_at  = now();

  return new;
end;
$$;

create trigger reactions_notify
  after insert on public.reactions
  for each row execute function public.notify_on_reaction();

-- -----------------------------------------------------------------------------
-- コメントがついたとき
-- -----------------------------------------------------------------------------
create or replace function public.notify_on_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select p.user_id into v_owner
  from public.activity_posts p
  join public.profiles pr on pr.id = p.user_id
  where p.id = new.post_id
    and p.user_id <> new.user_id
    and p.deleted_at is null
    and pr.notify_comment;

  if v_owner is null then
    return new;
  end if;

  -- コメントは1件ずつ知らせる。まとめると誰への返事か分からなくなる。
  insert into public.notifications (user_id, actor_id, type, post_id, comment_id)
  values (v_owner, new.user_id, 'comment', new.post_id, new.id);

  return new;
end;
$$;

create trigger comments_notify
  after insert on public.comments
  for each row execute function public.notify_on_comment();

-- -----------------------------------------------------------------------------
-- グループに新しい人が入ったとき
-- -----------------------------------------------------------------------------
create or replace function public.notify_on_group_join()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 既にいる人全員へ1件ずつ。グループ作成時は他に誰もいないので何も起きない。
  insert into public.notifications (user_id, actor_id, type, group_id)
  select m.user_id, new.user_id, 'group_join', new.group_id
  from public.group_members m
  join public.profiles pr on pr.id = m.user_id
  where m.group_id = new.group_id
    and m.user_id <> new.user_id
    and pr.notify_group_join;

  return new;
end;
$$;

create trigger group_members_notify
  after insert on public.group_members
  for each row execute function public.notify_on_group_join();

-- -----------------------------------------------------------------------------
-- 既読にする
-- -----------------------------------------------------------------------------
/*
 * まとめて既読にする。
 *
 * 1件ずつの既読は UPDATE ポリシーで足りるが、
 * 「すべて既読にする」は行数が読めないので関数にして1往復で終わらせる。
 */
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.notifications
  set read_at = now()
  where user_id = auth.uid()
    and read_at is null
    and (p_ids is null or id = any (p_ids));

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0011_invitation_token_urlsafe.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- =============================================================================
-- Hearth Growth : 招待トークンを本当の base64url にする
-- =============================================================================
-- 0001 のトークンは `+` `/` を `-` `_` に置き換えていたが、
-- base64 の詰め物（末尾の `=`）を落としていなかった。
-- 32byte の乱数は必ず `=` 1個で終わるため、発行される招待リンクは
-- すべて `.../invite/xxxxx=` の形になっていた。
--
-- Next.js は経路の `=` を復号せず `%3D` のまま渡すため、
-- 受け取り側では常に `%` を含む文字列になり、形式検査で弾かれていた。
-- base64url が詰め物を持たない仕様なのは、まさにこれを避けるため。
--
-- 既存の行も詰め物を落としてそろえる。
-- 落とすのは末尾の `=` だけで、値の対応は1対1のままなので、
-- すでに配ったリンク（`=` 付き）も、受け取り側で同じように落とせば一致する。
-- =============================================================================

alter table public.group_invitations
  alter column token set default translate(
    encode(gen_random_bytes(32), 'base64'),
    '+/=',
    '-_'
  );

-- translate は3つ目の対応先が無い文字を削除する。つまり `=` は落ちる。
update public.group_invitations
set token = rtrim(token, '=')
where token like '%=';

-- ═══════════════════════════════════════════════════════════════════════════
-- 0012_post_groups.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- =============================================================================
-- Hearth Growth : 1つの記録を複数のグループへ公開できるようにする
-- =============================================================================
-- これまで公開先は activity_posts.group_id の1つだけだった。
-- 「勉強仲間にも家族にも見せたい」が表せないので、中間テーブルに移す。
--
-- selected 公開の宛先（post_allowed_users）と同じ形にそろえる。
-- 公開先が0件の group 公開は作れない（誰にも届かない記録になるため）。
--
-- 書き込みは RPC（定義者権限）だけに任せる。
-- 利用者に insert を許すと、自分の記録を勝手なグループへ結び付けられてしまう。
-- =============================================================================

create table public.post_groups (
  post_id  uuid not null references public.activity_posts (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  primary key (post_id, group_id)
);

create index post_groups_group_id_idx on public.post_groups (group_id);

-- 既存の公開先を移す
insert into public.post_groups (post_id, group_id)
select id, group_id
from public.activity_posts
where visibility = 'group' and group_id is not null
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.post_groups enable row level security;

-- 読めるのは、投稿者本人か、公開先のグループにいる人
create policy "post_groups_select_visible" on public.post_groups
  for select to authenticated
  using (public.is_post_owner(post_id) or public.is_group_member(group_id));

-- -----------------------------------------------------------------------------
-- 公開先が0件になったら「自分だけ」に戻す
-- -----------------------------------------------------------------------------
/*
 * グループが削除されると、この表の行も一緒に消える。
 * そのとき visibility だけ 'group' のまま残ると、
 * 「グループ公開のはずなのに誰にも届かない」状態になる。
 * 実態に合わせて「自分だけ」へ戻す。
 */
create or replace function public.normalize_post_visibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.activity_posts p
  set visibility = 'private'
  where p.id = old.post_id
    and p.visibility = 'group'
    and not exists (select 1 from public.post_groups g where g.post_id = p.id);

  return null;
end;
$$;

create trigger post_groups_normalize
  after delete on public.post_groups
  for each row execute function public.normalize_post_visibility();

-- -----------------------------------------------------------------------------
-- 閲覧判定を中間テーブル経由にする
-- -----------------------------------------------------------------------------
create or replace function public.can_view_post(p_post_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.activity_posts p
    where p.id = p_post_id
      and p.deleted_at is null
      and (
        p.user_id = p_user_id
        or (
          p.visibility = 'group'
          and exists (
            select 1 from public.post_groups g
            where g.post_id = p.id and public.is_group_member(g.group_id, p_user_id)
          )
        )
        or (
          p.visibility = 'selected'
          and exists (
            select 1 from public.post_allowed_users a
            where a.post_id = p.id and a.user_id = p_user_id
          )
        )
      )
  );
$$;

-- -----------------------------------------------------------------------------
-- 投稿本体から group_id を外す
-- -----------------------------------------------------------------------------
-- 公開先の整合（group 公開なら1件以上）は RPC 側で見る。
alter table public.activity_posts drop constraint posts_group_visibility_check;

drop policy "activity_posts_select_visible" on public.activity_posts;
drop policy "activity_posts_insert_own" on public.activity_posts;
drop policy "activity_posts_update_own" on public.activity_posts;

/*
 * 投稿者は無条件に許可してから deleted_at を見る。順序を入れ替えてはいけない。
 * 逆にすると、deleted_at を立てた行が自分の SELECT ポリシーを満たさなくなり、
 * 論理削除の UPDATE 自体が弾かれる（supabase/policies/README.md）。
 */
create policy "activity_posts_select_visible" on public.activity_posts
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      deleted_at is null
      and (
        (
          visibility = 'group'
          and exists (
            select 1 from public.post_groups g
            where g.post_id = id and public.is_group_member(g.group_id)
          )
        )
        or (
          visibility = 'selected'
          and exists (
            select 1 from public.post_allowed_users a
            where a.post_id = id and a.user_id = (select auth.uid())
          )
        )
      )
    )
  );

create policy "activity_posts_insert_own" on public.activity_posts
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "activity_posts_update_own" on public.activity_posts
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter table public.activity_posts drop column group_id;

-- -----------------------------------------------------------------------------
-- 公開範囲の検証と、記録の作成・更新
-- -----------------------------------------------------------------------------
-- 引数の型が変わるので、置き換えではなく作り直す（残すと多重定義になる）
drop function if exists public.assert_visibility_target(uuid, text, uuid, uuid[]);
drop function if exists public.create_activity_post(uuid, uuid, text, text, integer, date, text, uuid, uuid[]);
drop function if exists public.update_activity_post(uuid, text, text, integer, date, text, uuid, uuid[]);

create or replace function public.assert_visibility_target(
  p_user_id          uuid,
  p_visibility       text,
  p_group_ids        uuid[],
  p_allowed_user_ids uuid[]
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_target uuid;
begin
  if p_visibility = 'group' then
    if p_group_ids is null or array_length(p_group_ids, 1) is null then
      raise exception 'group required' using errcode = 'P0001';
    end if;
    if array_length(p_group_ids, 1) > 20 then
      raise exception 'too many groups' using errcode = 'P0001';
    end if;
    foreach v_target in array p_group_ids loop
      if not public.is_group_member(v_target, p_user_id) then
        raise exception 'not a group member' using errcode = '42501';
      end if;
    end loop;
  elsif p_group_ids is not null and array_length(p_group_ids, 1) is not null then
    raise exception 'group not allowed' using errcode = 'P0001';
  end if;

  if p_visibility = 'selected' then
    if p_allowed_user_ids is null or array_length(p_allowed_user_ids, 1) is null then
      raise exception 'no allowed users' using errcode = 'P0001';
    end if;
    -- 宛先に選べるのは、同じグループにいる相手だけ
    foreach v_target in array p_allowed_user_ids loop
      if v_target <> p_user_id and not public.shares_group_with(v_target, p_user_id) then
        raise exception 'user not reachable' using errcode = '42501';
      end if;
    end loop;
  end if;
end;
$$;

create or replace function public.create_activity_post(
  p_category_id      uuid    default null,
  p_session_id       uuid    default null,
  p_title            text    default null,
  p_body             text    default null,
  p_duration_seconds integer default null,
  p_activity_date    date    default null,
  p_visibility       text    default 'private',
  p_group_ids        uuid[]  default null,
  p_allowed_user_ids uuid[]  default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id     uuid := auth.uid();
  v_session     public.activity_sessions;
  v_category_id uuid := p_category_id;
  v_duration    integer := p_duration_seconds;
  v_date        date := p_activity_date;
  v_started_at  timestamptz;
  v_ended_at    timestamptz;
  v_post_id     uuid;
  v_target      uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_visibility not in ('private', 'group', 'selected') then
    raise exception 'invalid visibility' using errcode = 'P0001';
  end if;

  if p_session_id is not null then
    select * into v_session
    from public.activity_sessions
    where id = p_session_id and user_id = v_user_id and status = 'completed'
    for update;

    if not found then
      raise exception 'session not completed' using errcode = 'P0002';
    end if;

    if exists (select 1 from public.activity_posts where session_id = p_session_id) then
      raise exception 'session already posted' using errcode = 'P0001';
    end if;

    -- タイマー由来の値はクライアントから受け取らない
    v_category_id := v_session.category_id;
    v_duration    := coalesce(v_session.duration_seconds, 0);
    v_started_at  := v_session.started_at;
    v_ended_at    := v_session.ended_at;
    v_date        := (v_session.ended_at at time zone coalesce(
                       (select timezone from public.profiles where id = v_user_id), 'Asia/Tokyo'))::date;
  else
    if v_category_id is null then
      raise exception 'category required' using errcode = 'P0001';
    end if;
    if v_duration is null then
      raise exception 'duration required' using errcode = 'P0001';
    end if;
    v_date := coalesce(v_date, public.user_today(v_user_id));

    if v_date > public.user_today(v_user_id) then
      raise exception 'activity_date in the future' using errcode = 'P0001';
    end if;
  end if;

  -- 自分が使えるカテゴリーか
  if not exists (
    select 1 from public.categories c
    where c.id = v_category_id
      and (
        c.user_id = v_user_id
        or (c.group_id is not null and public.is_group_member(c.group_id, v_user_id))
      )
  ) then
    raise exception 'category not available' using errcode = 'P0002';
  end if;

  if v_duration < 0 or v_duration > 86400 then
    raise exception 'duration out of range' using errcode = 'P0001';
  end if;

  perform public.assert_visibility_target(v_user_id, p_visibility, p_group_ids, p_allowed_user_ids);

  insert into public.activity_posts (
    user_id, session_id, category_id, title, body,
    duration_seconds, activity_date, visibility, started_at, ended_at
  )
  values (
    v_user_id,
    p_session_id,
    v_category_id,
    nullif(trim(coalesce(p_title, '')), ''),
    nullif(trim(coalesce(p_body, '')), ''),
    v_duration,
    v_date,
    p_visibility,
    v_started_at,
    v_ended_at
  )
  returning id into v_post_id;

  if p_visibility = 'group' then
    foreach v_target in array p_group_ids loop
      insert into public.post_groups (post_id, group_id)
      values (v_post_id, v_target)
      on conflict do nothing;
    end loop;
  end if;

  if p_visibility = 'selected' then
    foreach v_target in array p_allowed_user_ids loop
      insert into public.post_allowed_users (post_id, user_id)
      values (v_post_id, v_target)
      on conflict do nothing;
    end loop;
  end if;

  return v_post_id;
end;
$$;

create or replace function public.update_activity_post(
  p_post_id          uuid,
  p_title            text    default null,
  p_body             text    default null,
  p_duration_seconds integer default null,
  p_activity_date    date    default null,
  p_visibility       text    default 'private',
  p_group_ids        uuid[]  default null,
  p_allowed_user_ids uuid[]  default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_post    public.activity_posts;
  v_target  uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_post
  from public.activity_posts
  where id = p_post_id and user_id = v_user_id and deleted_at is null
  for update;

  if not found then
    raise exception 'post not found' using errcode = 'P0002';
  end if;

  if p_visibility not in ('private', 'group', 'selected') then
    raise exception 'invalid visibility' using errcode = 'P0001';
  end if;

  perform public.assert_visibility_target(v_user_id, p_visibility, p_group_ids, p_allowed_user_ids);

  if v_post.session_id is null then
    if p_duration_seconds is not null and (p_duration_seconds < 0 or p_duration_seconds > 86400) then
      raise exception 'duration out of range' using errcode = 'P0001';
    end if;
    if p_activity_date is not null and p_activity_date > public.user_today(v_user_id) then
      raise exception 'activity_date in the future' using errcode = 'P0001';
    end if;
  end if;

  update public.activity_posts
  set
    title      = nullif(trim(coalesce(p_title, '')), ''),
    body       = nullif(trim(coalesce(p_body, '')), ''),
    visibility = p_visibility,
    -- タイマー由来の記録では時間と日付を据え置く
    duration_seconds = case
      when v_post.session_id is not null then v_post.duration_seconds
      else coalesce(p_duration_seconds, v_post.duration_seconds)
    end,
    activity_date = case
      when v_post.session_id is not null then v_post.activity_date
      else coalesce(p_activity_date, v_post.activity_date)
    end
  where id = p_post_id;

  -- 公開先と宛先は毎回入れ替える。
  -- 先に本体の visibility を更新してあるので、
  -- 0件になった瞬間に「自分だけ」へ戻す引き金は引かれない。
  delete from public.post_allowed_users where post_id = p_post_id;
  delete from public.post_groups where post_id = p_post_id;

  if p_visibility = 'group' then
    foreach v_target in array p_group_ids loop
      insert into public.post_groups (post_id, group_id)
      values (p_post_id, v_target)
      on conflict do nothing;
    end loop;
  end if;

  if p_visibility = 'selected' then
    foreach v_target in array p_allowed_user_ids loop
      insert into public.post_allowed_users (post_id, user_id)
      values (p_post_id, v_target)
      on conflict do nothing;
    end loop;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 「自分だけ」の記録をまとめて公開する
-- -----------------------------------------------------------------------------
/*
 * 本体と公開先の2か所を触るので、まとめて1つの手続きにする。
 * 画面から2回に分けて呼ぶと、途中で失敗したときに
 * 「group 公開なのに公開先が無い」記録が残る。
 */
create or replace function public.share_private_posts(p_group_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_ids     uuid[];
  v_group   uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  perform public.assert_visibility_target(v_user_id, 'group', p_group_ids, null);

  select array_agg(id) into v_ids
  from public.activity_posts
  where user_id = v_user_id and visibility = 'private' and deleted_at is null;

  if v_ids is null then
    return 0;
  end if;

  update public.activity_posts
  set visibility = 'group'
  where id = any (v_ids);

  foreach v_group in array p_group_ids loop
    insert into public.post_groups (post_id, group_id)
    select unnest(v_ids), v_group
    on conflict do nothing;
  end loop;

  return array_length(v_ids, 1);
end;
$$;

-- -----------------------------------------------------------------------------
-- グループの集計も中間テーブル経由にする
-- -----------------------------------------------------------------------------
create or replace function public.get_group_week_summary(p_group_id uuid, p_week_start date default null)
returns table (
  user_id       uuid,
  display_name  text,
  avatar_url    text,
  total_seconds bigint,
  active_days   integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start date := coalesce(p_week_start, public.user_week_start());
begin
  if not public.is_group_member(p_group_id, auth.uid()) then
    raise exception 'not a group member' using errcode = '42501';
  end if;

  return query
  select
    m.user_id,
    pr.display_name,
    pr.avatar_url,
    coalesce(sum(p.duration_seconds), 0)::bigint,
    count(distinct p.activity_date)::integer
  from public.group_members m
  join public.profiles pr on pr.id = m.user_id
  left join public.activity_posts p
    on p.user_id = m.user_id
   and p.deleted_at is null
   and p.visibility = 'group'
   and p.activity_date between v_start and v_start + 6
   and exists (
     select 1 from public.post_groups g
     where g.post_id = p.id and g.group_id = p_group_id
   )
  where m.group_id = p_group_id
  group by m.user_id, pr.display_name, pr.avatar_url
  order by pr.display_name;
end;
$$;

-- -----------------------------------------------------------------------------
-- 実行権限
-- -----------------------------------------------------------------------------
revoke all on function public.assert_visibility_target(uuid, text, uuid[], uuid[]) from public, anon;
revoke all on function public.create_activity_post(uuid, uuid, text, text, integer, date, text, uuid[], uuid[])
  from public, anon;
revoke all on function public.update_activity_post(uuid, text, text, integer, date, text, uuid[], uuid[])
  from public, anon;
revoke all on function public.share_private_posts(uuid[]) from public, anon;

grant execute on function public.assert_visibility_target(uuid, text, uuid[], uuid[]) to authenticated;
grant execute on function public.create_activity_post(uuid, uuid, text, text, integer, date, text, uuid[], uuid[])
  to authenticated;
grant execute on function public.update_activity_post(uuid, text, text, integer, date, text, uuid[], uuid[])
  to authenticated;
grant execute on function public.share_private_posts(uuid[]) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0013_delete_group.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- =============================================================================
-- Hearth Growth : グループの削除
-- =============================================================================
-- 削除で消えてよいのは「グループという入れ物」だけ。
-- メンバーが積み上げてきた記録は、誰のものであっても消さない。
--
-- 0012 で公開先を post_groups に移したので、グループを消すと
-- 公開先の行だけが消え、記録本体は残る。公開先が0件になった記録は
-- post_groups_normalize が「自分だけ」へ戻す。
--
-- 残る問題が1つある。グループのカテゴリーだ。
--   * categories.group_id は on delete cascade（グループと一緒に消える）
--   * activity_posts.category_id は on delete restrict（使われていると消せない）
-- そのままグループを消すと、外部キー違反で失敗する。
-- 使われているカテゴリーは、記録の持ち主の個人カテゴリーへ移してから消す。
-- =============================================================================

create or replace function public.delete_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_owner   uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select owner_id into v_owner from public.groups where id = p_group_id for update;

  if not found then
    raise exception 'group not found' using errcode = 'P0002';
  end if;

  -- 消せるのは作成者だけ（管理者でも消せない）
  if v_owner <> v_user_id then
    raise exception 'not the group owner' using errcode = '42501';
  end if;

  /*
   * グループのカテゴリーを使っている記録を、持ち主の個人カテゴリーへ移す。
   *
   * 同じ名前の個人カテゴリーがあればそこへ、無ければ作る。
   * 「その他」へ丸めると何の記録だったか分からなくなるため、名前を引き継ぐ。
   */
  insert into public.categories (user_id, name, icon, color, sort_order)
  select distinct p.user_id, c.name, c.icon, c.color, c.sort_order
  from public.activity_posts p
  join public.categories c on c.id = p.category_id
  where c.group_id = p_group_id
  on conflict (user_id, name) where user_id is not null do nothing;

  update public.activity_posts p
  set category_id = mine.id
  from public.categories c
  join public.categories mine on mine.name = c.name
  where p.category_id = c.id
    and c.group_id = p_group_id
    and mine.user_id = p.user_id;

  -- 走っているタイマーも同じように移す
  update public.activity_sessions s
  set category_id = mine.id
  from public.categories c
  join public.categories mine on mine.name = c.name
  where s.category_id = c.id
    and c.group_id = p_group_id
    and mine.user_id = s.user_id;

  -- ここまで来れば、あとはカスケードで片付く
  --   group_members / group_invitations / categories / post_groups
  -- 記録本体は post_groups だけが消え、公開先が無くなれば「自分だけ」に戻る。
  delete from public.groups where id = p_group_id;
end;
$$;

revoke all on function public.delete_group(uuid) from public, anon;
grant execute on function public.delete_group(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0014_sleep.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- =============================================================================
-- Hearth Growth : 就寝・起床のショートカットと、集計に数えないカテゴリー
-- =============================================================================
-- 睡眠も「記録として残す価値のあるもの」だが、努力の積み上げとは別物。
-- 8時間の睡眠を活動時間に足すと、1時間の勉強が数字の上で埋もれてしまう。
--
-- そこでカテゴリーに「集計に数えるか」の印を持たせ、睡眠だけ外す。
-- 記録は残り、タイムラインにも出るが、
-- 今日の活動時間・週の合計・カテゴリー別・連続記録には入らない。
-- =============================================================================

alter table public.categories
  add column if not exists counts_toward_total boolean not null default true;

comment on column public.categories.counts_toward_total is
  '活動時間の合計に数えるか。睡眠のように、記録はしたいが努力量ではないものを false にする。';

-- -----------------------------------------------------------------------------
-- 睡眠カテゴリー
-- -----------------------------------------------------------------------------
-- これから登録する人の初期カテゴリーに足す
create or replace function public.create_default_categories(p_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.categories (user_id, name, icon, color, sort_order, counts_toward_total)
  values
    (p_user_id, '勉強',     '📚', '#6B8E9F', 10, true),
    (p_user_id, '仕事',     '💼', '#7D7C84', 20, true),
    (p_user_id, '読書',     '📖', '#9C8455', 30, true),
    (p_user_id, '運動',     '🏃', '#7FA37F', 40, true),
    (p_user_id, 'ホッケー', '🏒', '#5F7FA3', 50, true),
    (p_user_id, '個人開発', '💻', '#8B7BA8', 60, true),
    (p_user_id, '趣味',     '🎨', '#B08968', 70, true),
    (p_user_id, '家事',     '🏠', '#A3907F', 80, true),
    (p_user_id, 'その他',   '📝', '#8B8B8B', 90, true),
    -- 集計には数えない。詳しくは 0014 の冒頭。
    (p_user_id, '睡眠',     '😴', '#7A7F9A', 95, false)
  on conflict (user_id, name) where user_id is not null do nothing;
$$;

-- すでに登録している人にも足す
insert into public.categories (user_id, name, icon, color, sort_order, counts_toward_total)
select id, '睡眠', '😴', '#7A7F9A', 95, false
from public.profiles
on conflict (user_id, name) where user_id is not null do nothing;

-- -----------------------------------------------------------------------------
-- 集計から外す
-- -----------------------------------------------------------------------------
create or replace function public.get_period_summary(p_from date, p_to date)
returns table (total_seconds bigint, post_count integer, active_days integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(sum(p.duration_seconds), 0)::bigint,
    count(*)::integer,
    count(distinct p.activity_date)::integer
  from public.activity_posts p
  join public.categories c on c.id = p.category_id
  where p.user_id = auth.uid()
    and p.deleted_at is null
    and c.counts_toward_total
    and p.activity_date between p_from and p_to;
$$;

create or replace function public.get_daily_totals(p_from date, p_to date)
returns table (activity_date date, total_seconds bigint, post_count integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.activity_date,
    coalesce(sum(p.duration_seconds), 0)::bigint,
    count(*)::integer
  from public.activity_posts p
  join public.categories c on c.id = p.category_id
  where p.user_id = auth.uid()
    and p.deleted_at is null
    and c.counts_toward_total
    and p.activity_date between p_from and p_to
  group by p.activity_date
  order by p.activity_date;
$$;

create or replace function public.get_category_summary(p_from date, p_to date)
returns table (
  category_id   uuid,
  category_name text,
  category_icon text,
  category_color text,
  total_seconds bigint,
  post_count    integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.name,
    c.icon,
    c.color,
    coalesce(sum(p.duration_seconds), 0)::bigint,
    count(*)::integer
  from public.activity_posts p
  join public.categories c on c.id = p.category_id
  where p.user_id = auth.uid()
    and p.deleted_at is null
    and c.counts_toward_total
    and p.activity_date between p_from and p_to
  group by c.id, c.name, c.icon, c.color
  order by 5 desc;
$$;

/*
 * 連続記録も睡眠では伸びない。
 * 寝ただけで「続いている」ことにすると、この数字の意味が無くなる。
 */
create or replace function public.get_current_streak(p_user_id uuid default auth.uid())
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today  date;
  v_anchor date;
  v_streak integer;
begin
  -- 他人の連続記録は返さない
  if p_user_id is distinct from auth.uid() then
    return 0;
  end if;

  v_today := public.user_today(p_user_id);

  select case
    when exists (
      select 1 from public.activity_posts p join public.categories c on c.id = p.category_id
      where p.user_id = p_user_id and p.deleted_at is null and c.counts_toward_total
        and p.activity_date = v_today
    ) then v_today
    when exists (
      select 1 from public.activity_posts p join public.categories c on c.id = p.category_id
      where p.user_id = p_user_id and p.deleted_at is null and c.counts_toward_total
        and p.activity_date = v_today - 1
    ) then v_today - 1
    else null
  end into v_anchor;

  if v_anchor is null then
    return 0;
  end if;

  -- 起点から1日ずつ遡り、途切れた時点で止める
  with days as (
    select distinct p.activity_date as day
    from public.activity_posts p
    join public.categories c on c.id = p.category_id
    where p.user_id = p_user_id and p.deleted_at is null and c.counts_toward_total
      and p.activity_date <= v_anchor
  ),
  ordered as (
    select day, row_number() over (order by day desc) as rn
    from days
  ),
  expected as (
    select rn, day, (v_anchor - (rn - 1)::integer) as expected_day
    from ordered
  )
  select coalesce(
    (select min(rn) - 1 from expected where day <> expected_day),
    (select count(*) from expected)
  )::integer
  into v_streak;

  return coalesce(v_streak, 0);
end;
$$;

create or replace function public.get_group_week_summary(p_group_id uuid, p_week_start date default null)
returns table (
  user_id       uuid,
  display_name  text,
  avatar_url    text,
  total_seconds bigint,
  active_days   integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start date := coalesce(p_week_start, public.user_week_start());
begin
  if not public.is_group_member(p_group_id, auth.uid()) then
    raise exception 'not a group member' using errcode = '42501';
  end if;

  return query
  select
    m.user_id,
    pr.display_name,
    pr.avatar_url,
    coalesce(sum(p.duration_seconds), 0)::bigint,
    count(distinct p.activity_date)::integer
  from public.group_members m
  join public.profiles pr on pr.id = m.user_id
  left join public.activity_posts p
    on p.user_id = m.user_id
   and p.deleted_at is null
   and p.visibility = 'group'
   and p.activity_date between v_start and v_start + 6
   and exists (
     select 1 from public.post_groups g
     where g.post_id = p.id and g.group_id = p_group_id
   )
   and exists (
     select 1 from public.categories c
     where c.id = p.category_id and c.counts_toward_total
   )
  where m.group_id = p_group_id
  group by m.user_id, pr.display_name, pr.avatar_url
  order by pr.display_name;
end;
$$;

-- -----------------------------------------------------------------------------
-- 就寝と起床
-- -----------------------------------------------------------------------------
/*
 * 就寝はタイマーの開始、起床はタイマーの終了と記録の作成にあたる。
 * 仕組みを増やさず、既にあるタイマーへ寄せる。
 * こうすると「今の睡眠時間」も途中で分かるし、
 * 端末の時計ではなくサーバーの時刻で測られる。
 *
 * 押す回数は1回ずつ。振り返りの入力は挟まない。
 * 眠いときと寝起きに文章を書かせない。
 */
create or replace function public.start_sleep()
returns public.activity_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id     uuid := auth.uid();
  v_category_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select id into v_category_id
  from public.categories
  where user_id = v_user_id and name = '睡眠'
  limit 1;

  -- 消してしまった人のために作り直す
  if v_category_id is null then
    insert into public.categories (user_id, name, icon, color, sort_order, counts_toward_total)
    values (v_user_id, '睡眠', '😴', '#7A7F9A', 95, false)
    returning id into v_category_id;
  end if;

  return public.start_session(v_category_id, null, null);
end;
$$;

/*
 * 起床。走っている睡眠のタイマーを終わらせ、そのまま記録にする。
 *
 * 公開範囲は、その人の既定（設定画面で選んだもの）に合わせる。
 * group を既定にしていて、どのグループにも入っていない場合は「自分だけ」。
 */
create or replace function public.wake_up()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id    uuid := auth.uid();
  v_session_id uuid;
  v_visibility text;
  v_group_ids  uuid[];
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select s.id into v_session_id
  from public.activity_sessions s
  join public.categories c on c.id = s.category_id
  where s.user_id = v_user_id
    and s.status in ('running', 'paused')
    and c.name = '睡眠'
  limit 1;

  if v_session_id is null then
    raise exception 'not sleeping' using errcode = 'P0002';
  end if;

  perform public.complete_session(v_session_id, null);

  select default_visibility into v_visibility from public.profiles where id = v_user_id;

  if v_visibility = 'group' then
    select array_agg(group_id) into v_group_ids
    from public.group_members where user_id = v_user_id;

    -- どこにも入っていなければ、公開しようがない
    if v_group_ids is null then
      v_visibility := 'private';
    end if;
  elsif v_visibility = 'selected' then
    -- 宛先を選ばせない導線なので、既定が selected でも「自分だけ」にする
    v_visibility := 'private';
  end if;

  return public.create_activity_post(
    p_session_id => v_session_id,
    p_visibility => v_visibility,
    p_group_ids  => v_group_ids
  );
end;
$$;

revoke all on function public.start_sleep() from public, anon;
revoke all on function public.wake_up() from public, anon;
grant execute on function public.start_sleep() to authenticated;
grant execute on function public.wake_up() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0015_wake_alarm.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- =============================================================================
-- Hearth Growth : 起床予定時刻と、「起きていますか？」の通知
-- =============================================================================
-- 目覚まし時計の代わりにはならない。Web の通知は省電力で遅れることがあり、
-- マナーモードも越えない。起こす役目は端末のアラームアプリのもの。
--
-- ここで作るのは「起きたことを1タップで記録する」ための呼びかけ。
-- 予定時刻に通知を出し、「起きている」を押したらその場で睡眠を終える。
--
-- 送信の流れ:
--   pg_cron（1分ごと）→ pg_net で /api/push/dispatch を叩く
--   → その API が claim_due_wake_alarms() で対象を取り、Web Push を送る
--
-- サービスロールキーは使わない。合言葉で守った関数を1つだけ開ける。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 定期実行と共有する合言葉
-- -----------------------------------------------------------------------------
create table public.app_config (
  key   text primary key,
  value text not null
);

alter table public.app_config enable row level security;

/*
 * 誰にも読ませない。ポリシーを書かないのではなく、
 * 「読めない」ことを目に見える形で残すために false のポリシーを置く。
 * 読めるのは定義者権限で動く関数だけ。
 */
create policy "app_config_no_access" on public.app_config
  for all to authenticated
  using (false)
  with check (false);

-- -----------------------------------------------------------------------------
-- 端末ごとの通知の宛先
-- -----------------------------------------------------------------------------
create table public.push_subscriptions (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references public.profiles (id) on delete cascade,
  -- ブラウザが発行する宛先。端末を変えると別の行になる。
  endpoint   text        not null unique,
  p256dh     text        not null,
  auth       text        not null,
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions_select_own" on public.push_subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "push_subscriptions_insert_own" on public.push_subscriptions
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "push_subscriptions_update_own" on public.push_subscriptions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "push_subscriptions_delete_own" on public.push_subscriptions
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- 起床予定
-- -----------------------------------------------------------------------------
create table public.sleep_alarms (
  session_id  uuid        primary key references public.activity_sessions (id) on delete cascade,
  user_id     uuid        not null references public.profiles (id) on delete cascade,
  wake_at     timestamptz not null,
  -- 通知を送った時刻。二重に送らないための印。
  notified_at timestamptz,
  created_at  timestamptz not null default now()
);

-- 1分ごとに「そろそろのものはあるか」を引くので、まだ送っていないものだけ索引に入れる
create index sleep_alarms_due_idx on public.sleep_alarms (wake_at) where notified_at is null;

alter table public.sleep_alarms enable row level security;

create policy "sleep_alarms_select_own" on public.sleep_alarms
  for select to authenticated
  using (user_id = (select auth.uid()));

/*
 * タイマーが終わったら（起床・取り消し・終了）、予定も一緒に消す。
 * 残しておくと、寝ていないのに「起きていますか？」が飛ぶ。
 */
create or replace function public.clear_sleep_alarm()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status not in ('running', 'paused') then
    delete from public.sleep_alarms where session_id = new.id;
  end if;
  return null;
end;
$$;

create trigger activity_sessions_clear_alarm
  after update of status on public.activity_sessions
  for each row execute function public.clear_sleep_alarm();

-- -----------------------------------------------------------------------------
-- 就寝（起床予定つき）
-- -----------------------------------------------------------------------------
drop function if exists public.start_sleep();

create or replace function public.start_sleep(p_wake_at timestamptz default null)
returns public.activity_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id     uuid := auth.uid();
  v_category_id uuid;
  v_session     public.activity_sessions;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select id into v_category_id
  from public.categories
  where user_id = v_user_id and name = '睡眠'
  limit 1;

  -- 消してしまった人のために作り直す
  if v_category_id is null then
    insert into public.categories (user_id, name, icon, color, sort_order, counts_toward_total)
    values (v_user_id, '睡眠', '😴', '#7A7F9A', 95, false)
    returning id into v_category_id;
  end if;

  v_session := public.start_session(v_category_id, null, null);

  if p_wake_at is not null then
    if p_wake_at <= now() then
      raise exception 'wake_at in the past' using errcode = 'P0001';
    end if;
    -- 24時間より先は入力の間違いとみなす
    if p_wake_at > now() + interval '24 hours' then
      raise exception 'wake_at too far' using errcode = 'P0001';
    end if;

    insert into public.sleep_alarms (session_id, user_id, wake_at)
    values (v_session.id, v_user_id, p_wake_at);
  end if;

  return v_session;
end;
$$;

-- 起床時に予定も片付ける（トリガーでも消えるが、意図として明示しておく）
create or replace function public.wake_up()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id    uuid := auth.uid();
  v_session_id uuid;
  v_visibility text;
  v_group_ids  uuid[];
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select s.id into v_session_id
  from public.activity_sessions s
  join public.categories c on c.id = s.category_id
  where s.user_id = v_user_id
    and s.status in ('running', 'paused')
    and c.name = '睡眠'
  limit 1;

  if v_session_id is null then
    raise exception 'not sleeping' using errcode = 'P0002';
  end if;

  perform public.complete_session(v_session_id, null);
  delete from public.sleep_alarms where session_id = v_session_id;

  select default_visibility into v_visibility from public.profiles where id = v_user_id;

  if v_visibility = 'group' then
    select array_agg(group_id) into v_group_ids
    from public.group_members where user_id = v_user_id;

    if v_group_ids is null then
      v_visibility := 'private';
    end if;
  elsif v_visibility = 'selected' then
    v_visibility := 'private';
  end if;

  return public.create_activity_post(
    p_session_id => v_session_id,
    p_visibility => v_visibility,
    p_group_ids  => v_group_ids
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 送るべき通知を取り出す（定期実行から呼ぶ）
-- -----------------------------------------------------------------------------
/*
 * 合言葉が合ったときだけ答える。
 *
 * サービスロールキーを配らずに済ませるための入口。
 * ここが返すのは「通知の宛先」だけで、記録も本文も返さない。
 * 取り出した時点で notified_at を立てるので、同じ予定を二度送らない。
 */
create or replace function public.claim_due_wake_alarms(p_secret text)
returns table (endpoint text, p256dh text, auth text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected text;
begin
  select value into v_expected from public.app_config where key = 'cron_secret';

  -- 合言葉が未設定なら、誰にも答えない
  if v_expected is null or p_secret is null or p_secret <> v_expected then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  with due as (
    update public.sleep_alarms a
    set notified_at = now()
    where a.notified_at is null
      and a.wake_at <= now()
      and exists (
        select 1 from public.activity_sessions s
        where s.id = a.session_id and s.status in ('running', 'paused')
      )
    returning a.user_id
  )
  select p.endpoint, p.p256dh, p.auth
  from due
  join public.push_subscriptions p on p.user_id = due.user_id;
end;
$$;

/*
 * 合言葉が合っているかだけを確かめる。
 *
 * /setup-check から呼ぶ。claim_due_wake_alarms を確認に使うと、
 * 時刻の来た予定をそこで消費してしまい、通知が飛ばなくなる。
 */
create or replace function public.check_cron_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_config
    where key = 'cron_secret' and value = p_secret and p_secret is not null
  );
$$;

revoke all on function public.check_cron_secret(text) from public;
grant execute on function public.check_cron_secret(text) to anon, authenticated;

revoke all on function public.claim_due_wake_alarms(text) from public;
-- 定期実行は anon 鍵で呼ぶ。中身は合言葉で守る。
grant execute on function public.claim_due_wake_alarms(text) to anon, authenticated;

revoke all on function public.start_sleep(timestamptz) from public, anon;
grant execute on function public.start_sleep(timestamptz) to authenticated;
