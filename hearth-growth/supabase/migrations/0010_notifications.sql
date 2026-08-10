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
