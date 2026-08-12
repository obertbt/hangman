-- =============================================================
-- 0013_soft_delete_rpc.sql
--
-- 論理削除ができなくなっていたのを直す。
--
-- 見つかった問題:
--   PostgreSQL は UPDATE のとき、SELECT ポリシーを**更新後の行にも**適用する。
--   （検証済み: SELECT ポリシーを足すと同じ UPDATE が通るようになる）
--
--   files / videos の SELECT ポリシーには `deleted_at is null` が入っている。
--   そのため deleted_at を入れた瞬間に自分から見えない行になり、
--   「new row violates row-level security policy」で弾かれていた。
--   つまり**誰も論理削除できなかった**。
--
-- 直し方の選択:
--   (A) 所有者は削除済みも見える、という SELECT ポリシーを足す
--       → 62章「削除済みファイルを通常閲覧できない」が緩む。採らない。
--   (B) 論理削除だけを security definer の関数で行う
--       → SELECT ポリシーは厳しいまま保てる。
--         削除は「特別な操作」として、監査ログと物理削除の予約も同時に作れる。
--
--   (B) を採る。60章（30日後に物理削除）と63章（動画削除を監査ログに残す）も
--   同じ場所で満たせるため、結果的にこちらのほうが筋がよい。
-- =============================================================

/**
 * 投稿した動画を削除する（論理削除）。
 *
 * できるのは、投稿した本人か storage.manage を持つ人だけ。
 * 実体は消さず、30日後に物理削除するための予約を作る（60章）。
 */
create or replace function public.soft_delete_video(p_video_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_video   public.videos;
  v_file    public.files;
  v_profile uuid;
  v_days    int := 30;
begin
  v_profile := app.current_profile_id();
  if v_profile is null then
    raise exception 'ログインしていません';
  end if;

  select * into v_video from public.videos where id = p_video_id and deleted_at is null;
  if v_video.id is null then
    raise exception '対象の動画が見つかりません';
  end if;

  -- 本人か、容量を管理する人だけ
  if v_video.created_by <> v_profile and not app.has_permission(v_video.team_id, 'storage.manage') then
    raise exception 'この動画を削除する権限がありません';
  end if;

  update public.videos set deleted_at = now() where id = p_video_id;

  -- R2 のファイルを持つ動画なら、ファイルも論理削除して物理削除を予約する
  if v_video.file_id is not null then
    select * into v_file from public.files where id = v_video.file_id;

    if v_file.id is not null and v_file.deleted_at is null then
      update public.files
      set deleted_at = now(), upload_status = 'deleted'
      where id = v_file.id;

      insert into public.file_deletion_jobs (team_id, file_id, scheduled_for)
      values (v_file.team_id, v_file.id, now() + make_interval(days => v_days));
    end if;
  end if;

  -- 63章: 動画削除は監査ログに残す。key や URL そのものは残さない。
  insert into public.audit_logs (team_id, actor_id, action, target_table, target_id, summary)
  values (
    v_video.team_id,
    v_profile,
    'video.delete',
    'videos',
    p_video_id,
    format('動画を削除: %s（%s日後に実体を削除）', v_video.title, v_days)
  );
end;
$$;

revoke all on function public.soft_delete_video(uuid) from public;
grant execute on function public.soft_delete_video(uuid) to authenticated;

/**
 * 同じ理由で、仮想クリップも関数で消す。
 * こちらは実体を持たないので、履歴だけ残す。
 */
create or replace function public.soft_delete_video_clip(p_clip_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clip    public.video_clips;
  v_profile uuid;
begin
  v_profile := app.current_profile_id();
  if v_profile is null then
    raise exception 'ログインしていません';
  end if;

  select * into v_clip from public.video_clips where id = p_clip_id and deleted_at is null;
  if v_clip.id is null then
    raise exception '対象の場面が見つかりません';
  end if;

  if v_clip.created_by <> v_profile and not app.is_staff(v_clip.team_id) then
    raise exception 'この場面を削除する権限がありません';
  end if;

  -- 質問に使われている場面は消さない（質問の中身が読めなくなるため）
  if exists (
    select 1 from public.feedback_requests
    where video_clip_id = p_clip_id and deleted_at is null
  ) then
    raise exception 'この場面は質問に使われているため削除できません';
  end if;

  update public.video_clips set deleted_at = now() where id = p_clip_id;
end;
$$;

revoke all on function public.soft_delete_video_clip(uuid) from public;
grant execute on function public.soft_delete_video_clip(uuid) to authenticated;
