-- =============================================================
-- 0005_files_videos.sql
-- ファイル / アップロードセッション / 動画 / 仮想クリップ
-- （18〜24章, 51〜53章）
--
-- 原則:
--   * ファイル本体は DB に入れない。保存先は R2 か YouTube。
--   * 署名付き URL や恒久公開 URL を DB に保存しない（75章）。
--   * storage_key に氏名を入れない（75章）。
-- =============================================================

-- -------------------------------------------------------------
-- files（51章）
-- -------------------------------------------------------------
create table if not exists public.files (
  id                  uuid primary key default gen_random_uuid(),
  team_id             uuid not null references public.teams(id) on delete cascade,
  uploaded_by         uuid not null references public.profiles(id) on delete cascade,

  storage_provider    text not null default 'r2'
                        check (storage_provider in ('r2', 's3', 'local')),
  bucket              text not null,
  storage_key         text not null,

  original_filename   text,
  normalized_filename text,
  mime_type           text not null,
  size_bytes          bigint not null check (size_bytes >= 0),
  checksum            text,

  media_type          text not null default 'other'
                        check (media_type in ('video', 'image', 'pdf', 'other')),
  width               int,
  height              int,
  duration_seconds    numeric(8, 2) check (duration_seconds >= 0),
  video_codec         text,
  audio_codec         text,
  frame_rate          numeric(5, 2),

  upload_status       text not null default 'pending'
                        check (upload_status in ('pending', 'uploading', 'uploaded', 'verifying', 'ready', 'failed', 'quarantined', 'deleted')),
  visibility          text not null default 'private_staff'
                        check (visibility in ('private_staff', 'selected_members', 'team')),

  retention_policy    text not null default 'keep'
                        check (retention_policy in ('keep', 'temporary')),
  expires_at          timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,

  unique (bucket, storage_key)
);

create index if not exists files_team_idx on public.files (team_id, created_at desc);
create index if not exists files_uploader_idx on public.files (uploaded_by, created_at desc);
-- 論理削除の物理削除待ちを拾う
create index if not exists files_deleted_idx on public.files (deleted_at) where deleted_at is not null;

create trigger files_set_updated_at
  before update on public.files
  for each row execute function app.set_updated_at();

-- -------------------------------------------------------------
-- upload_sessions（21章）
-- -------------------------------------------------------------
create table if not exists public.upload_sessions (
  id                uuid primary key default gen_random_uuid(),
  team_id           uuid not null references public.teams(id) on delete cascade,
  created_by        uuid not null references public.profiles(id) on delete cascade,
  file_id           uuid references public.files(id) on delete set null,

  bucket            text not null,
  storage_key       text not null,
  declared_mime     text not null,
  declared_size     bigint not null check (declared_size >= 0),
  media_type        text not null default 'video'
                      check (media_type in ('video', 'image', 'pdf', 'other')),

  status            text not null default 'pending'
                      check (status in ('pending', 'uploading', 'uploaded', 'verifying', 'ready', 'failed', 'quarantined', 'deleted')),
  failure_reason    text,

  expires_at        timestamptz not null,
  completed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists upload_sessions_creator_idx
  on public.upload_sessions (created_by, created_at desc);
create index if not exists upload_sessions_expiry_idx
  on public.upload_sessions (expires_at) where status not in ('ready', 'deleted');

create trigger upload_sessions_set_updated_at
  before update on public.upload_sessions
  for each row execute function app.set_updated_at();

-- 1日あたりのアップロード本数を数える（19章）
create or replace function app.daily_upload_count(p_profile_id uuid, p_day date)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::int
  from public.upload_sessions us
  where us.created_by = p_profile_id
    and us.media_type = 'video'
    and us.status in ('uploaded', 'verifying', 'ready')
    and (us.created_at at time zone 'Asia/Tokyo')::date = p_day;
$$;

grant execute on function app.daily_upload_count(uuid, date) to authenticated;

-- -------------------------------------------------------------
-- videos（52章）
-- -------------------------------------------------------------
create table if not exists public.videos (
  id                 uuid primary key default gen_random_uuid(),
  team_id            uuid not null references public.teams(id) on delete cascade,

  provider           text not null
                       check (provider in ('youtube', 'r2', 'cloudflare_stream', 'external')),
  provider_video_id  text,
  file_id            uuid references public.files(id) on delete set null,

  title              text not null,
  description        text,
  thumbnail_url      text,
  duration_seconds   numeric(9, 2) check (duration_seconds >= 0),

  recorded_at        timestamptz,
  uploaded_at        timestamptz,

  event_id           uuid references public.events(id) on delete set null,

  visibility         text not null default 'team'
                       check (visibility in ('private_staff', 'selected_members', 'team')),
  created_by         uuid not null references public.profiles(id) on delete cascade,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,

  -- provider ごとに、どちらの参照を持つべきかを決める
  check (
    (provider = 'youtube' and provider_video_id is not null)
    or (provider = 'r2' and file_id is not null)
    or provider in ('cloudflare_stream', 'external')
  )
);

create index if not exists videos_team_idx on public.videos (team_id, created_at desc);
create index if not exists videos_event_idx on public.videos (event_id);

create trigger videos_set_updated_at
  before update on public.videos
  for each row execute function app.set_updated_at();

-- -------------------------------------------------------------
-- video_clips（53章）仮想クリップ。実ファイルは切り出さない。
-- -------------------------------------------------------------
create table if not exists public.video_clips (
  id             uuid primary key default gen_random_uuid(),
  team_id        uuid not null references public.teams(id) on delete cascade,
  video_id       uuid not null references public.videos(id) on delete cascade,
  created_by     uuid not null references public.profiles(id) on delete cascade,

  start_seconds  numeric(9, 2) not null check (start_seconds >= 0),
  end_seconds    numeric(9, 2) not null,

  title          text,
  description    text,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,

  check (end_seconds > start_seconds)
);

create index if not exists video_clips_video_idx on public.video_clips (video_id);

create trigger video_clips_set_updated_at
  before update on public.video_clips
  for each row execute function app.set_updated_at();

-- クリップが元動画の長さを超えないことを保証する（53章の制約）。
-- CHECK では他テーブルを参照できないためトリガで行う。
create or replace function app.validate_video_clip()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_duration numeric;
begin
  select duration_seconds into v_duration
  from public.videos
  where id = new.video_id;

  if v_duration is not null and new.end_seconds > v_duration then
    raise exception 'クリップの終了位置(%)が動画の長さ(%)を超えています', new.end_seconds, v_duration;
  end if;

  return new;
end;
$$;

create trigger video_clips_validate
  before insert or update on public.video_clips
  for each row execute function app.validate_video_clip();

-- 動画に紐づくタグ
create table if not exists public.video_tags (
  id       uuid primary key default gen_random_uuid(),
  team_id  uuid not null references public.teams(id) on delete cascade,
  name     text not null,
  unique (team_id, name)
);

create table if not exists public.video_tag_relations (
  video_id      uuid not null references public.videos(id) on delete cascade,
  video_tag_id  uuid not null references public.video_tags(id) on delete cascade,
  primary key (video_id, video_tag_id)
);

-- ファイルと他レコードの関連（日報添付など）
create table if not exists public.file_relations (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references public.teams(id) on delete cascade,
  file_id       uuid not null references public.files(id) on delete cascade,
  relation_type text not null
                  check (relation_type in ('daily_report', 'feedback_request', 'feedback_response', 'profile_avatar', 'training_record', 'skill_application')),
  target_id     uuid not null,
  created_at    timestamptz not null default now(),
  unique (file_id, relation_type, target_id)
);

create index if not exists file_relations_target_idx
  on public.file_relations (relation_type, target_id);

-- 物理削除の予約（60章: 論理削除30日）
create table if not exists public.file_deletion_jobs (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references public.teams(id) on delete cascade,
  file_id       uuid not null references public.files(id) on delete cascade,
  scheduled_for timestamptz not null,
  status        text not null default 'pending'
                  check (status in ('pending', 'done', 'failed')),
  attempted_at  timestamptz,
  error_message text,
  created_at    timestamptz not null default now()
);

create index if not exists file_deletion_jobs_due_idx
  on public.file_deletion_jobs (scheduled_for) where status = 'pending';

-- 容量集計のスナップショット（59章）
create table if not exists public.storage_usage_snapshots (
  id             uuid primary key default gen_random_uuid(),
  team_id        uuid not null references public.teams(id) on delete cascade,
  captured_on    date not null,
  total_bytes    bigint not null default 0,
  video_bytes    bigint not null default 0,
  image_bytes    bigint not null default 0,
  pdf_bytes      bigint not null default 0,
  temp_bytes     bigint not null default 0,
  deleted_bytes  bigint not null default 0,
  file_count     int not null default 0,
  created_at     timestamptz not null default now(),
  unique (team_id, captured_on)
);
