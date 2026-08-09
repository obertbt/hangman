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
