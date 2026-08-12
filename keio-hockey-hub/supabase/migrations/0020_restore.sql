-- =============================================================
-- 0020_restore.sql
--
-- 消したものを戻せるようにする。
--
-- なぜ要るか:
--   0019 で「消したものは、消した人からも見えない」に直した。
--   守りとしては正しいが、そのままだと**間違えて消したものを取り戻せない**。
--   60章が動画に30日の猶予を置いているのと同じ考え方を、他の記録にも広げる。
--
--   記録は本人の努力の証拠なので、消えたら戻せないのは怖い。
--   「怖くて消せない」と、要らない記録が残り続けて画面が読みにくくなる。
--   気軽に消せて、間違えたら戻せるのがいちばんよい。
--
-- どう作るか:
--   閲覧できる条件がすべて `deleted_at is null` なので、
--   消したものは通常の SELECT では引けない。
--   一覧も復元も security definer の関数を通す。
--   **その人が戻せるものだけ**を返す（権限の確認は関数の中）。
-- =============================================================

/**
 * 消したもののうち、自分が戻せるものを並べる。
 *
 * 種別ごとに「誰が戻せるか」が違う。
 *   トレーニング記録 … 本人だけ
 *   動画・クリップ   … 投稿者本人か storage.manage
 *   スキル定義       … skill.review
 *
 * `restorable` が false のものは、実体がもう無い（物理削除済み）。
 * 一覧には出すが、押しても戻らないことを画面で伝える。
 */
create or replace function public.list_deleted_items(p_team_id uuid)
returns table (
  kind        text,
  item_id     uuid,
  label       text,
  deleted_at  timestamptz,
  restorable  boolean,
  note        text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile uuid := app.current_profile_id();
begin
  if v_profile is null or not app.is_team_member(p_team_id) then
    return;
  end if;

  -- 動画
  return query
  select
    'video'::text,
    v.id,
    v.title,
    v.deleted_at,
    -- 実体を消したあとは戻せない（60章の30日を過ぎたもの）
    coalesce(f.upload_status, 'ready') <> 'deleted',
    case
      when coalesce(f.upload_status, 'ready') = 'deleted' then '実体が削除済みのため戻せません'
      else null
    end
  from public.videos v
  left join public.files f on f.id = v.file_id
  where v.team_id = p_team_id
    and v.deleted_at is not null
    and (v.created_by = v_profile or app.has_permission(p_team_id, 'storage.manage'));

  -- 場面（仮想クリップ）
  return query
  select
    'video_clip'::text,
    c.id,
    coalesce(c.title, '指定した場面'),
    c.deleted_at,
    true,
    null::text
  from public.video_clips c
  where c.team_id = p_team_id
    and c.deleted_at is not null
    and (c.created_by = v_profile or app.has_permission(p_team_id, 'storage.manage'));

  -- トレーニング記録（本人だけ）
  return query
  select
    'training_record'::text,
    t.id,
    to_char(t.performed_on, 'YYYY-MM-DD') || ' ' || coalesce(t.menu, t.training_type),
    t.deleted_at,
    true,
    null::text
  from public.training_records t
  where t.team_id = p_team_id
    and t.deleted_at is not null
    and app.is_own_member(t.team_member_id);

  -- スキル定義
  return query
  select
    'skill'::text,
    s.id,
    s.name,
    s.deleted_at,
    true,
    null::text
  from public.skills s
  where s.team_id = p_team_id
    and s.deleted_at is not null
    and app.has_permission(p_team_id, 'skill.review');
end;
$$;

revoke all on function public.list_deleted_items(uuid) from public;
grant execute on function public.list_deleted_items(uuid) to authenticated;

-- -------------------------------------------------------------
-- 復元
--
-- 消したときと同じ権限を要求する。
-- 戻したことも監査ログに残す（63章）。
-- -------------------------------------------------------------

/**
 * 動画を戻す。
 *
 * **物理削除の予約も取り消す。**
 * ここを忘れると、戻したはずの動画が30日後に実体だけ消えて、
 * 再生できない動画が残る。
 */
create or replace function public.restore_video(p_video_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_video   public.videos;
  v_status  text;
  v_profile uuid := app.current_profile_id();
begin
  select * into v_video from public.videos where id = p_video_id and deleted_at is not null;
  if v_video.id is null then
    raise exception '対象の動画が見つかりません';
  end if;

  if v_video.created_by <> v_profile and not app.has_permission(v_video.team_id, 'storage.manage') then
    raise exception 'この動画を戻す権限がありません';
  end if;

  if v_video.file_id is not null then
    select upload_status into v_status from public.files where id = v_video.file_id;
    if v_status = 'deleted' then
      raise exception '実体がすでに消えているため戻せません';
    end if;

    update public.files set deleted_at = null where id = v_video.file_id;

    -- 予約が残っていると、戻した動画が30日後に壊れる
    update public.file_deletion_jobs
      set status = 'failed', error_message = '復元されたため取り消し', attempted_at = now()
      where file_id = v_video.file_id and status = 'pending';
  end if;

  update public.videos set deleted_at = null where id = p_video_id;

  insert into public.audit_logs (team_id, actor_id, action, target_table, target_id, summary)
  values (v_video.team_id, v_profile, 'video.restore', 'videos', p_video_id, v_video.title);
end;
$$;

revoke all on function public.restore_video(uuid) from public;
grant execute on function public.restore_video(uuid) to authenticated;

/** 場面を戻す。元の動画が消えたままなら戻さない。 */
create or replace function public.restore_video_clip(p_clip_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clip    public.video_clips;
  v_video   public.videos;
  v_profile uuid := app.current_profile_id();
begin
  select * into v_clip from public.video_clips where id = p_clip_id and deleted_at is not null;
  if v_clip.id is null then
    raise exception '対象の場面が見つかりません';
  end if;

  if v_clip.created_by <> v_profile and not app.has_permission(v_clip.team_id, 'storage.manage') then
    raise exception 'この場面を戻す権限がありません';
  end if;

  select * into v_video from public.videos where id = v_clip.video_id;
  if v_video.id is null or v_video.deleted_at is not null then
    raise exception '元の動画が消えています。先に動画を戻してください';
  end if;

  update public.video_clips set deleted_at = null where id = p_clip_id;
end;
$$;

revoke all on function public.restore_video_clip(uuid) from public;
grant execute on function public.restore_video_clip(uuid) to authenticated;

/** 自分のトレーニング記録を戻す。 */
create or replace function public.restore_training_record(p_record_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.training_records;
begin
  select * into v_row from public.training_records where id = p_record_id and deleted_at is not null;
  if v_row.id is null then
    raise exception '対象の記録が見つかりません';
  end if;

  if not app.is_own_member(v_row.team_member_id) then
    raise exception 'この記録を戻す権限がありません';
  end if;

  update public.training_records set deleted_at = null where id = p_record_id;
end;
$$;

revoke all on function public.restore_training_record(uuid) from public;
grant execute on function public.restore_training_record(uuid) to authenticated;

/** スキル定義を戻す。親が消えたままなら戻さない（宙に浮くため）。 */
create or replace function public.restore_skill(p_skill_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row     public.skills;
  v_parent  public.skills;
  v_deleted timestamptz;
begin
  select * into v_row from public.skills where id = p_skill_id and deleted_at is not null;
  if v_row.id is null then
    raise exception '対象の目標が見つかりません';
  end if;

  if not app.has_permission(v_row.team_id, 'skill.review') then
    raise exception 'スキル定義を変えられるのは審査担当だけです';
  end if;

  select deleted_at into v_deleted from public.skill_categories where id = v_row.skill_category_id;
  if v_deleted is not null then
    raise exception '大分類が消えています。先に大分類を戻してください';
  end if;

  if v_row.parent_id is not null then
    select * into v_parent from public.skills where id = v_row.parent_id;
    if v_parent.id is null or v_parent.deleted_at is not null then
      raise exception '中目標が消えています。先に中目標を戻してください';
    end if;
  end if;

  update public.skills set deleted_at = null where id = p_skill_id;

  insert into public.audit_logs (team_id, actor_id, action, target_table, target_id, summary)
  values (v_row.team_id, app.current_profile_id(), 'skill.restore', 'skills', p_skill_id, v_row.name);
end;
$$;

revoke all on function public.restore_skill(uuid) from public;
grant execute on function public.restore_skill(uuid) to authenticated;

-- =============================================================
-- おまけで見つかった問題: 論理削除で upload_status を 'deleted' にしていた
--
-- 0013 の soft_delete_video は、論理削除の時点で
--   update public.files set deleted_at = now(), upload_status = 'deleted'
-- としていた。
--
-- しかし 'deleted' は「R2 から実体が消えた」という意味で、
-- 0016 の complete_file_deletion が実際に消したあとに立てるもの。
-- 論理削除の時点で立ててしまうと、意味が2つになる。
--
-- 実害:
--   capture_storage_usage は upload_status = 'deleted' を集計から外す。
--   そのため**アプリから動画を消すと、まだ R2 にあるのに容量から消えた**。
--   「削除待ち（deleted_bytes）」も常に 0 になり、
--   「片付ければこれだけ空く」が出てこない。59章の目的が崩れる。
--
--   さらに今回、復元の判定にも使えなくなっていた
--   （消した直後の動画が「実体が無い」と見えてしまう）。
--
-- 直し方:
--   論理削除では deleted_at だけを入れる。
--   'deleted' を立てるのは、実体を消し終えたときだけ。
-- =============================================================

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

  if v_video.created_by <> v_profile and not app.has_permission(v_video.team_id, 'storage.manage') then
    raise exception 'この動画を削除する権限がありません';
  end if;

  update public.videos set deleted_at = now() where id = p_video_id;

  if v_video.file_id is not null then
    select * into v_file from public.files where id = v_video.file_id;

    if v_file.id is not null and v_file.deleted_at is null then
      -- upload_status はそのまま。実体はまだ R2 にある。
      update public.files set deleted_at = now() where id = v_file.id;

      insert into public.file_deletion_jobs (team_id, file_id, scheduled_for)
      values (v_file.team_id, v_file.id, now() + make_interval(days => v_days));
    end if;
  end if;

  insert into public.audit_logs (team_id, actor_id, action, target_table, target_id, summary)
  values (
    v_video.team_id, v_profile, 'video.delete', 'videos', p_video_id,
    format('動画を削除: %s（%s日後に実体を削除）', v_video.title, v_days)
  );
end;
$$;

-- すでに 'deleted' になってしまった行を戻す。
-- 実体を本当に消したものには、done の予約が残っているので見分けられる。
update public.files f
set upload_status = 'ready'
where f.upload_status = 'deleted'
  and not exists (
    select 1 from public.file_deletion_jobs j
    where j.file_id = f.id and j.status = 'done'
  );
