-- Hearth Growth セットアップ 7 / 11
-- 番号順に、Supabase の SQL Editor へ貼り付けて実行してください。
-- 元になっているのは supabase/migrations/ の各ファイルです。

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

alter table public.profiles
  add column if not exists notify_reaction   boolean not null default true,
  add column if not exists notify_comment    boolean not null default true,
  add column if not exists notify_group_join boolean not null default true;

create table public.notifications (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references public.profiles (id) on delete cascade,
  actor_id   uuid        references public.profiles (id) on delete cascade,
  type       text        not null check (type in ('reaction', 'comment', 'group_join')),
  post_id    uuid        references public.activity_posts (id) on delete cascade,
  comment_id uuid        references public.comments (id) on delete cascade,
  group_id   uuid        references public.groups (id) on delete cascade,
  actor_count integer    not null default 1 check (actor_count > 0),
  read_at    timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_not_self check (actor_id is null or actor_id <> user_id)
);

create index notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

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

alter table public.notifications enable row level security;

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

create or replace function public.notify_on_reaction()
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

alter table public.group_invitations
  alter column token set default translate(
    encode(gen_random_bytes(32), 'base64'),
    '+/=',
    '-_'
  );

update public.group_invitations
set token = rtrim(token, '=')
where token like '%=';

create table public.post_groups (
  post_id  uuid not null references public.activity_posts (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  primary key (post_id, group_id)
);

create index post_groups_group_id_idx on public.post_groups (group_id);

insert into public.post_groups (post_id, group_id)
select id, group_id
from public.activity_posts
where visibility = 'group' and group_id is not null
on conflict do nothing;

alter table public.post_groups enable row level security;

create policy "post_groups_select_visible" on public.post_groups
  for select to authenticated
  using (public.is_post_owner(post_id) or public.is_group_member(group_id));

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
