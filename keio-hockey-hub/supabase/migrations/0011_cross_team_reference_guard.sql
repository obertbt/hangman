-- =============================================================
-- 0011_cross_team_reference_guard.sql
--
-- 別チームのレコードを参照する行を作れないようにする。
--
-- 見つかった問題:
--   video_clips の RLS は「作成者が自分」「team_id が自分のチーム」しか見ていなかった。
--   そのため、別チームの video_id を指すクリップを、自分のチームの行として
--   作れてしまった（動画のUUIDを知っていれば）。
--   同じことが feedback_requests でも起きる。
--
-- 対処:
--   RLS ではなくトリガで、参照先とチームが一致することを保証する。
--   これは権限の問題ではなくデータの整合性なので、
--   どの経路（service role を含む）から書いても守られるべき。
-- =============================================================

-- -------------------------------------------------------------
-- 仮想クリップ: 元動画と同じチームでなければならない
-- -------------------------------------------------------------
create or replace function app.validate_video_clip()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_duration numeric;
  v_team_id  uuid;
begin
  select duration_seconds, team_id into v_duration, v_team_id
  from public.videos
  where id = new.video_id;

  if v_team_id is null then
    raise exception '対象の動画が見つかりません';
  end if;

  -- 別チームの動画を参照させない（62章）
  if v_team_id <> new.team_id then
    raise exception '別のチームの動画は参照できません';
  end if;

  if v_duration is not null and new.end_seconds > v_duration then
    raise exception 'クリップの終了位置(%)が動画の長さ(%)を超えています', new.end_seconds, v_duration;
  end if;

  return new;
end;
$$;

-- -------------------------------------------------------------
-- フィードバック依頼: 参照する動画・クリップ・イベントも同じチーム
-- -------------------------------------------------------------
create or replace function app.validate_feedback_references()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team_id uuid;
begin
  if new.video_id is not null then
    select team_id into v_team_id from public.videos where id = new.video_id;
    if v_team_id is null or v_team_id <> new.team_id then
      raise exception '別のチームの動画は参照できません';
    end if;
  end if;

  if new.video_clip_id is not null then
    select team_id into v_team_id from public.video_clips where id = new.video_clip_id;
    if v_team_id is null or v_team_id <> new.team_id then
      raise exception '別のチームのクリップは参照できません';
    end if;
  end if;

  if new.event_id is not null then
    select team_id into v_team_id from public.events where id = new.event_id;
    if v_team_id is null or v_team_id <> new.team_id then
      raise exception '別のチームの予定は参照できません';
    end if;
  end if;

  if new.daily_report_id is not null then
    select team_id into v_team_id from public.daily_reports where id = new.daily_report_id;
    if v_team_id is null or v_team_id <> new.team_id then
      raise exception '別のチームの日報は参照できません';
    end if;
  end if;

  -- 依頼者が本当にそのチームの一員か
  select team_id into v_team_id from public.team_members where id = new.requester_id;
  if v_team_id is null or v_team_id <> new.team_id then
    raise exception '依頼者がこのチームの所属ではありません';
  end if;

  return new;
end;
$$;

drop trigger if exists feedback_requests_validate_references on public.feedback_requests;
create trigger feedback_requests_validate_references
  before insert or update on public.feedback_requests
  for each row execute function app.validate_feedback_references();

-- -------------------------------------------------------------
-- 動画: R2 のファイルを参照する場合も同じチームでなければならない
-- -------------------------------------------------------------
create or replace function app.validate_video_references()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team_id uuid;
begin
  if new.file_id is not null then
    select team_id into v_team_id from public.files where id = new.file_id;
    if v_team_id is null or v_team_id <> new.team_id then
      raise exception '別のチームのファイルは参照できません';
    end if;
  end if;

  if new.event_id is not null then
    select team_id into v_team_id from public.events where id = new.event_id;
    if v_team_id is null or v_team_id <> new.team_id then
      raise exception '別のチームの予定は参照できません';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists videos_validate_references on public.videos;
create trigger videos_validate_references
  before insert or update on public.videos
  for each row execute function app.validate_video_references();
