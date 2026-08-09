-- Hearth Growth : 0001_initial_schema.sql だけを実行する（2 / 2）
-- すでに動いている環境へ、この変更ぶんだけを足すためのファイルです。
-- まっさらな状態から作る場合は supabase/setup/ の 01 から順に実行してください。

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
