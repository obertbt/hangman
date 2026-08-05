-- Hearth Growth セットアップ 2 / 6
-- 番号順に、Supabase の SQL Editor へ貼り付けて実行してください。
-- 元になっているのは supabase/migrations/ の各ファイルです。

create index comments_post_id_created_at_idx on public.comments (post_id, created_at);

create trigger comments_touch_updated_at
  before update on public.comments
  for each row execute function public.touch_updated_at();

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
  week_start_date date        not null check (extract(isodow from week_start_date) = 1),
  category_id     uuid        references public.categories (id) on delete cascade,
  target_seconds  integer     not null check (target_seconds > 0),
  message         text        check (char_length(message) <= 200),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique nulls not distinct (user_id, week_start_date, category_id)
);

create trigger weekly_goals_touch_updated_at
  before update on public.weekly_goals
  for each row execute function public.touch_updated_at();

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

create policy "group_members_update_admin" on public.group_members
  for update to authenticated
  using (public.is_group_admin(group_id) and role <> 'owner')
  with check (public.is_group_admin(group_id) and role <> 'owner');

create policy "group_members_delete_self_or_admin" on public.group_members
  for delete to authenticated
  using (
    role <> 'owner'
    and (user_id = (select auth.uid()) or public.is_group_admin(group_id))
  );

create policy "group_invitations_select_admin" on public.group_invitations
  for select to authenticated
  using (public.is_group_admin(group_id));

create policy "group_invitations_insert_admin" on public.group_invitations
  for insert to authenticated
  with check (public.is_group_admin(group_id) and invited_by = (select auth.uid()));
