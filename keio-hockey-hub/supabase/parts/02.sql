-- ==========================================================
-- 自動生成: scripts/bundle-migrations.sh
-- 直接編集しない。直すのは supabase/migrations/ のほう。
-- 2 番目。中身: 0005_files_videos.sql 0006_feedback_skills.sql 
-- ==========================================================


-- ---------- 0005_files_videos.sql ----------
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


-- ---------- 0006_feedback_skills.sql ----------
-- =============================================================
-- 0006_feedback_skills.sql
-- 動画フィードバック（25〜29章, 54〜56章）とスキル（30〜32章）
--
-- 要点:
--   * 不正な状態遷移を DB 側で禁止する（27章）。
--   * 過去の回答を上書きしない（55章）。回答は追記のみ。
--   * コーチが一方的に team 公開へ変更できない（29章）。
-- =============================================================

-- -------------------------------------------------------------
-- スキル階層（30章）大分類 → 中目標 → 小目標
-- -------------------------------------------------------------
create table if not exists public.skill_categories (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  name        text not null,
  description text,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  unique (team_id, name)
);

create table if not exists public.skills (
  id                 uuid primary key default gen_random_uuid(),
  team_id            uuid not null references public.teams(id) on delete cascade,
  skill_category_id  uuid not null references public.skill_categories(id) on delete cascade,
  -- 自己参照で「中目標 → 小目標」を表す。parent_id が null なら中目標。
  parent_id          uuid references public.skills(id) on delete cascade,
  name               text not null,
  description        text,
  criteria           text,
  level              int not null default 1 check (level between 1 and 3),
  sort_order         int not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);

create index if not exists skills_category_idx on public.skills (skill_category_id, sort_order);
create index if not exists skills_parent_idx on public.skills (parent_id);

-- 選手ごとの到達状況（31章）
create table if not exists public.player_skills (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null references public.teams(id) on delete cascade,
  team_member_id  uuid not null references public.team_members(id) on delete cascade,
  skill_id        uuid not null references public.skills(id) on delete cascade,
  status          text not null default 'not_started'
                    check (status in ('not_started', 'applied', 'feedback', 'approved')),
  approved_at     timestamptz,
  approved_by     uuid references public.profiles(id),
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (team_member_id, skill_id)
);

create index if not exists player_skills_member_idx on public.player_skills (team_member_id, status);

create trigger player_skills_set_updated_at
  before update on public.player_skills
  for each row execute function app.set_updated_at();

-- スキル申請
create table if not exists public.skill_applications (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null references public.teams(id) on delete cascade,
  team_member_id  uuid not null references public.team_members(id) on delete cascade,
  skill_id        uuid not null references public.skills(id) on delete cascade,
  comment         text,
  status          text not null default 'submitted'
                    check (status in ('draft', 'submitted', 'reviewing', 'approved', 'rejected', 'withdrawn')),
  submitted_at    timestamptz,
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create index if not exists skill_applications_team_status_idx
  on public.skill_applications (team_id, status);

create trigger skill_applications_set_updated_at
  before update on public.skill_applications
  for each row execute function app.set_updated_at();

-- 申請の根拠（32章）動画・クリップ・フィードバックを添える
create table if not exists public.skill_application_items (
  id                    uuid primary key default gen_random_uuid(),
  team_id               uuid not null references public.teams(id) on delete cascade,
  skill_application_id  uuid not null references public.skill_applications(id) on delete cascade,
  item_type             text not null
                          check (item_type in ('video', 'video_clip', 'feedback_request', 'file', 'note')),
  video_id              uuid references public.videos(id) on delete set null,
  video_clip_id         uuid references public.video_clips(id) on delete set null,
  feedback_request_id   uuid,
  file_id               uuid references public.files(id) on delete set null,
  note                  text,
  created_at            timestamptz not null default now()
);

create index if not exists skill_application_items_application_idx
  on public.skill_application_items (skill_application_id);

-- 審査結果
create table if not exists public.skill_reviews (
  id                    uuid primary key default gen_random_uuid(),
  team_id               uuid not null references public.teams(id) on delete cascade,
  skill_application_id  uuid not null references public.skill_applications(id) on delete cascade,
  reviewer_id           uuid not null references public.profiles(id) on delete cascade,
  decision              text not null check (decision in ('approved', 'rejected', 'needs_more')),
  comment               text,
  created_at            timestamptz not null default now()
);

create index if not exists skill_reviews_application_idx
  on public.skill_reviews (skill_application_id, created_at desc);

-- 状態履歴（75章: 重要状態変更は History を残す）
create table if not exists public.skill_status_histories (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null references public.teams(id) on delete cascade,
  player_skill_id uuid not null references public.player_skills(id) on delete cascade,
  from_status     text,
  to_status       text not null,
  changed_by      uuid references public.profiles(id),
  reason          text,
  created_at      timestamptz not null default now()
);

create index if not exists skill_status_histories_skill_idx
  on public.skill_status_histories (player_skill_id, created_at desc);

-- -------------------------------------------------------------
-- feedback_requests（54章）
-- -------------------------------------------------------------
create table if not exists public.feedback_requests (
  id                    uuid primary key default gen_random_uuid(),
  team_id               uuid not null references public.teams(id) on delete cascade,

  requester_id          uuid not null references public.team_members(id) on delete cascade,
  assigned_coach_id     uuid references public.team_members(id) on delete set null,

  video_id              uuid references public.videos(id) on delete set null,
  video_clip_id         uuid references public.video_clips(id) on delete set null,

  event_id              uuid references public.events(id) on delete set null,
  daily_report_id       uuid references public.daily_reports(id) on delete set null,
  skill_id              uuid references public.skills(id) on delete set null,
  skill_application_id  uuid references public.skill_applications(id) on delete set null,

  question_type         text not null default 'other'
                          check (question_type in (
                            'judgement', 'play_choice', 'technique', 'positioning',
                            'defense_priority', 'attack_positioning', 'skill_application', 'other')),
  question              text not null,

  status                text not null default 'draft'
                          check (status in ('draft', 'submitted', 'assigned', 'reviewing',
                                            'answered', 'acknowledged', 'follow_up', 'closed', 'withdrawn')),
  -- 29章: 初期値は private_staff
  visibility            text not null default 'private_staff'
                          check (visibility in ('private_staff', 'selected_members', 'team')),

  submitted_at          timestamptz,
  assigned_at           timestamptz,
  answered_at           timestamptz,
  acknowledged_at       timestamptz,
  closed_at             timestamptz,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz,

  -- 動画かクリップのどちらかは必要（下書きを除く）
  check (status = 'draft' or video_id is not null or video_clip_id is not null)
);

create index if not exists feedback_requests_team_status_idx
  on public.feedback_requests (team_id, status, submitted_at desc);
create index if not exists feedback_requests_requester_idx
  on public.feedback_requests (requester_id, created_at desc);
create index if not exists feedback_requests_coach_idx
  on public.feedback_requests (assigned_coach_id, status);

create trigger feedback_requests_set_updated_at
  before update on public.feedback_requests
  for each row execute function app.set_updated_at();

-- 状態履歴
create table if not exists public.feedback_status_histories (
  id                   uuid primary key default gen_random_uuid(),
  team_id              uuid not null references public.teams(id) on delete cascade,
  feedback_request_id  uuid not null references public.feedback_requests(id) on delete cascade,
  from_status          text,
  to_status            text not null,
  changed_by           uuid references public.profiles(id),
  note                 text,
  created_at           timestamptz not null default now()
);

create index if not exists feedback_status_histories_request_idx
  on public.feedback_status_histories (feedback_request_id, created_at desc);

-- 27章: 不正な状態遷移を禁止する。
create or replace function app.is_valid_feedback_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select case p_from
    when 'draft'        then p_to in ('submitted', 'withdrawn')
    when 'submitted'    then p_to in ('assigned', 'reviewing', 'withdrawn')
    when 'assigned'     then p_to in ('reviewing', 'answered', 'withdrawn')
    when 'reviewing'    then p_to in ('answered', 'assigned', 'withdrawn')
    when 'answered'     then p_to in ('acknowledged', 'follow_up', 'closed')
    when 'acknowledged' then p_to in ('follow_up', 'closed')
    when 'follow_up'    then p_to in ('reviewing', 'answered', 'closed')
    when 'closed'       then false
    when 'withdrawn'    then false
    else false
  end;
$$;

create or replace function app.guard_feedback_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from old.status then
    if not app.is_valid_feedback_transition(old.status, new.status) then
      raise exception '不正な状態遷移です: % → %', old.status, new.status;
    end if;

    insert into public.feedback_status_histories (team_id, feedback_request_id, from_status, to_status, changed_by)
    values (new.team_id, new.id, old.status, new.status, app.current_profile_id());
  end if;

  return new;
end;
$$;

create trigger feedback_requests_guard_status
  before update on public.feedback_requests
  for each row execute function app.guard_feedback_status();

-- -------------------------------------------------------------
-- feedback_responses（55章）追記のみ。過去の回答を上書きしない。
-- -------------------------------------------------------------
create table if not exists public.feedback_responses (
  id                       uuid primary key default gen_random_uuid(),
  team_id                  uuid not null references public.teams(id) on delete cascade,
  feedback_request_id      uuid not null references public.feedback_requests(id) on delete cascade,
  responder_id             uuid not null references public.team_members(id) on delete cascade,

  conclusion               text not null,
  positive_points          text,
  improvement_points       text,
  recommended_action       text,
  technical_correction     text,
  next_task                text,

  related_skill_id         uuid references public.skills(id) on delete set null,
  reference_video_id       uuid references public.videos(id) on delete set null,

  requires_in_person_review boolean not null default false,
  suggests_team_share       boolean not null default false,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  deleted_at               timestamptz
);

create index if not exists feedback_responses_request_idx
  on public.feedback_responses (feedback_request_id, created_at desc);

-- 再質問（56章）
create table if not exists public.feedback_messages (
  id                   uuid primary key default gen_random_uuid(),
  team_id              uuid not null references public.teams(id) on delete cascade,
  feedback_request_id  uuid not null references public.feedback_requests(id) on delete cascade,
  sender_id            uuid not null references public.team_members(id) on delete cascade,
  message_type         text not null default 'comment'
                         check (message_type in ('comment', 'follow_up_question', 'system')),
  body                 text not null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz
);

create index if not exists feedback_messages_request_idx
  on public.feedback_messages (feedback_request_id, created_at);

-- 29章: team 公開は選手の承認が要る
create table if not exists public.feedback_share_requests (
  id                   uuid primary key default gen_random_uuid(),
  team_id              uuid not null references public.teams(id) on delete cascade,
  feedback_request_id  uuid not null references public.feedback_requests(id) on delete cascade,
  requested_by         uuid not null references public.team_members(id) on delete cascade,
  target_visibility    text not null
                         check (target_visibility in ('selected_members', 'team')),
  status               text not null default 'pending'
                         check (status in ('pending', 'approved', 'rejected')),
  responded_at         timestamptz,
  reason               text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists feedback_share_requests_request_idx
  on public.feedback_share_requests (feedback_request_id, status);

-- スキル申請の根拠として指す先を、テーブル定義後に結び付ける
alter table public.skill_application_items
  drop constraint if exists skill_application_items_feedback_fk;
alter table public.skill_application_items
  add constraint skill_application_items_feedback_fk
  foreign key (feedback_request_id) references public.feedback_requests(id) on delete set null;

-- 練習目標が参照するフィードバック（フィードバック → 次回課題）
alter table public.practice_goals
  drop constraint if exists practice_goals_source_feedback_fk;
alter table public.practice_goals
  add constraint practice_goals_source_feedback_fk
  foreign key (source_feedback_id) references public.feedback_requests(id) on delete set null;

