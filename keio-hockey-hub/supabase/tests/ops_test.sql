-- =============================================================
-- ops_test.sql
-- Phase 9: 容量の集計と掃除、通知、監査ログ（59章・60章・63章）。
--
--   * 容量を集計できるのは storage.manage を持つ人だけ
--   * 削除待ちのファイルは「まだ容量を使っている」と数える
--   * 実体を消したファイルは容量から外れる
--   * 物理削除は監査ログに残る
--   * 期限切れのアップロードを片付けられる
--   * 監査ログは選手から見えない
--   * 通知の既読は本人だけが付けられる
--
-- 実行方法は rls_test.sql と同じ。
-- =============================================================

\set ON_ERROR_STOP on

begin;

-- 準備 --------------------------------------------------------
insert into auth.users (id, email) values
  ('a3a30000-0000-0000-0000-000000000001', 'ops-player@example.com'),
  ('a3a30000-0000-0000-0000-000000000002', 'ops-admin@example.com'),
  ('a3a30000-0000-0000-0000-000000000003', 'ops-other@example.com');

insert into public.teams (id, name, display_name, slug) values
  ('b3b30000-0000-0000-0000-00000000000a', 'ops-team-a', '運用A', 'ops-team-a'),
  ('b3b30000-0000-0000-0000-00000000000b', 'ops-team-b', '運用B', 'ops-team-b');

insert into public.profiles (id, user_id, full_name) values
  ('c3c30000-0000-0000-0000-000000000001', 'a3a30000-0000-0000-0000-000000000001', '選手'),
  ('c3c30000-0000-0000-0000-000000000002', 'a3a30000-0000-0000-0000-000000000002', '管理者'),
  ('c3c30000-0000-0000-0000-000000000003', 'a3a30000-0000-0000-0000-000000000003', '別チーム');

insert into public.team_members (id, team_id, profile_id, role_code) values
  ('d3d30000-0000-0000-0000-000000000001', 'b3b30000-0000-0000-0000-00000000000a', 'c3c30000-0000-0000-0000-000000000001', 'player'),
  ('d3d30000-0000-0000-0000-000000000002', 'b3b30000-0000-0000-0000-00000000000a', 'c3c30000-0000-0000-0000-000000000002', 'system_admin'),
  ('d3d30000-0000-0000-0000-000000000003', 'b3b30000-0000-0000-0000-00000000000b', 'c3c30000-0000-0000-0000-000000000003', 'player');

-- ファイル3件。100MB の動画2件（うち1件は論理削除済み）と、2MB の画像1件。
insert into public.files
  (id, team_id, uploaded_by, storage_provider, bucket, storage_key, mime_type, size_bytes,
   media_type, upload_status, visibility, deleted_at)
values
  ('e3e30000-0000-0000-0000-000000000001', 'b3b30000-0000-0000-0000-00000000000a',
   'c3c30000-0000-0000-0000-000000000001', 'r2', 'b',
   'teams/b3b30000-0000-0000-0000-00000000000a/videos/2026/08/12/aaa.mp4',
   'video/mp4', 104857600, 'video', 'ready', 'private_staff', null),
  ('e3e30000-0000-0000-0000-000000000002', 'b3b30000-0000-0000-0000-00000000000a',
   'c3c30000-0000-0000-0000-000000000001', 'r2', 'b',
   'teams/b3b30000-0000-0000-0000-00000000000a/videos/2026/07/01/bbb.mp4',
   'video/mp4', 104857600, 'video', 'ready', 'private_staff', now() - interval '31 days'),
  ('e3e30000-0000-0000-0000-000000000003', 'b3b30000-0000-0000-0000-00000000000a',
   'c3c30000-0000-0000-0000-000000000001', 'r2', 'b',
   'teams/b3b30000-0000-0000-0000-00000000000a/images/2026/08/12/ccc.jpg',
   'image/jpeg', 2097152, 'image', 'ready', 'team', null);

-- 30日を過ぎた削除予約
insert into public.file_deletion_jobs (id, team_id, file_id, scheduled_for, status)
values ('f3f30000-0000-0000-0000-000000000001', 'b3b30000-0000-0000-0000-00000000000a',
        'e3e30000-0000-0000-0000-000000000002', now() - interval '1 day', 'pending');

-- 期限切れのアップロード
insert into public.upload_sessions
  (id, team_id, created_by, bucket, storage_key, declared_mime, declared_size, media_type, status, expires_at)
values ('03030000-0000-0000-0000-000000000001', 'b3b30000-0000-0000-0000-00000000000a',
        'c3c30000-0000-0000-0000-000000000001', 'b',
        'teams/b3b30000-0000-0000-0000-00000000000a/videos/2026/08/12/ddd.mp4',
        'video/mp4', 1000, 'video', 'pending', now() - interval '2 hours');

create or replace function pg_temp.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
end;
$$;

create or replace function pg_temp.check(p_label text, p_actual bigint, p_expected bigint)
returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'NG: % (期待 %, 実際 %)', p_label, p_expected, p_actual;
  end if;
  raise notice 'ok: %', p_label;
end;
$$;

set local role authenticated;

-- -------------------------------------------------------------
-- 1. 集計できるのは権限を持つ人だけ
-- -------------------------------------------------------------
select pg_temp.login('a3a30000-0000-0000-0000-000000000001');  -- 選手

do $$
begin
  begin
    perform public.capture_storage_usage('b3b30000-0000-0000-0000-00000000000a');
    raise exception 'NG: 選手が容量を集計できてしまった';
  exception when raise_exception then
    if sqlerrm like 'NG:%' then raise; end if;
    raise notice 'ok: 選手は容量を集計できない（%）', sqlerrm;
  end;
end;
$$;

select pg_temp.check('選手には容量の記録が見えない',
  (select count(*) from public.storage_usage_snapshots), 0);

-- -------------------------------------------------------------
-- 2. 管理者が集計する
-- -------------------------------------------------------------
select pg_temp.login('a3a30000-0000-0000-0000-000000000002');  -- 管理者

select public.capture_storage_usage('b3b30000-0000-0000-0000-00000000000a');

select pg_temp.check('合計は3件ぶん',
  (select total_bytes from public.storage_usage_snapshots
   where team_id = 'b3b30000-0000-0000-0000-00000000000a'), 211812352);  -- 100MB*2 + 2MB

select pg_temp.check('動画だけを数えられる',
  (select video_bytes from public.storage_usage_snapshots
   where team_id = 'b3b30000-0000-0000-0000-00000000000a'), 209715200);

-- 60章: 論理削除しただけのファイルは、まだ R2 の容量を使っている
select pg_temp.check('削除待ちも容量を使っていると数える',
  (select deleted_bytes from public.storage_usage_snapshots
   where team_id = 'b3b30000-0000-0000-0000-00000000000a'), 104857600);

select pg_temp.check('ファイル数を数える',
  (select file_count from public.storage_usage_snapshots
   where team_id = 'b3b30000-0000-0000-0000-00000000000a'), 3);

-- 同じ日に2回呼んでも増えない
select public.capture_storage_usage('b3b30000-0000-0000-0000-00000000000a');
select pg_temp.check('同じ日の記録は1件だけ',
  (select count(*) from public.storage_usage_snapshots
   where team_id = 'b3b30000-0000-0000-0000-00000000000a'), 1);

-- 別チームは集計できない
do $$
begin
  begin
    perform public.capture_storage_usage('b3b30000-0000-0000-0000-00000000000b');
    raise exception 'NG: 別チームの容量を集計できてしまった';
  exception when raise_exception then
    if sqlerrm like 'NG:%' then raise; end if;
    raise notice 'ok: 別チームの容量は集計できない（%）', sqlerrm;
  end;
end;
$$;

-- -------------------------------------------------------------
-- 3. 物理削除の後始末（60章・63章）
-- -------------------------------------------------------------
select pg_temp.check('期限の来た削除予約が見える',
  (select count(*) from public.file_deletion_jobs
   where status = 'pending' and scheduled_for <= now()), 1);

select public.complete_file_deletion('f3f30000-0000-0000-0000-000000000001');

select pg_temp.check('予約が done になる',
  (select count(*) from public.file_deletion_jobs
   where id = 'f3f30000-0000-0000-0000-000000000001' and status = 'done'), 1);

set local role postgres;
select pg_temp.check('ファイルに実体無しの印が付く',
  (select count(*) from public.files
   where id = 'e3e30000-0000-0000-0000-000000000002' and upload_status = 'deleted'), 1);

select pg_temp.check('物理削除が監査ログに残る',
  (select count(*) from public.audit_logs where action = 'file.hard_delete'), 1);
set local role authenticated;

-- 実体を消したので、容量から外れる
select public.capture_storage_usage('b3b30000-0000-0000-0000-00000000000a');

select pg_temp.check('消したぶん合計が減る',
  (select total_bytes from public.storage_usage_snapshots
   where team_id = 'b3b30000-0000-0000-0000-00000000000a'), 106954752);  -- 100MB + 2MB

select pg_temp.check('削除待ちが0になる',
  (select deleted_bytes from public.storage_usage_snapshots
   where team_id = 'b3b30000-0000-0000-0000-00000000000a'), 0);

-- 失敗したときは理由を残して、次回また拾えるようにする
insert into public.file_deletion_jobs (id, team_id, file_id, scheduled_for, status)
values ('f3f30000-0000-0000-0000-000000000002', 'b3b30000-0000-0000-0000-00000000000a',
        'e3e30000-0000-0000-0000-000000000003', now() - interval '1 day', 'pending');

select public.complete_file_deletion('f3f30000-0000-0000-0000-000000000002', 'R2 が応答しませんでした');

select pg_temp.check('失敗は理由とともに残る',
  (select count(*) from public.file_deletion_jobs
   where id = 'f3f30000-0000-0000-0000-000000000002'
     and status = 'failed' and error_message = 'R2 が応答しませんでした'), 1);

set local role postgres;
select pg_temp.check('失敗したファイルには印を付けない',
  (select count(*) from public.files
   where id = 'e3e30000-0000-0000-0000-000000000003' and upload_status = 'deleted'), 0);
set local role authenticated;

-- -------------------------------------------------------------
-- 4. 途中でやめたアップロードの片付け（21章）
-- -------------------------------------------------------------
select pg_temp.check('期限切れのセッションを片付ける',
  public.expire_stale_uploads('b3b30000-0000-0000-0000-00000000000a'), 1);

select pg_temp.check('もう一度呼んでも二重に数えない',
  public.expire_stale_uploads('b3b30000-0000-0000-0000-00000000000a'), 0);

select pg_temp.login('a3a30000-0000-0000-0000-000000000001');  -- 選手
do $$
begin
  begin
    perform public.expire_stale_uploads('b3b30000-0000-0000-0000-00000000000a');
    raise exception 'NG: 選手が片付けを実行できてしまった';
  exception when raise_exception then
    if sqlerrm like 'NG:%' then raise; end if;
    raise notice 'ok: 選手は片付けを実行できない（%）', sqlerrm;
  end;
end;
$$;

-- -------------------------------------------------------------
-- 5. 監査ログ（63章）
-- -------------------------------------------------------------
select pg_temp.check('選手には監査ログが見えない',
  (select count(*) from public.audit_logs), 0);

select pg_temp.login('a3a30000-0000-0000-0000-000000000002');  -- 管理者
select pg_temp.check('管理者には監査ログが見える',
  (select count(*) from public.audit_logs), 1);

do $$
begin
  begin
    delete from public.audit_logs;
    raise exception 'NG: 監査ログを消せてしまった';
  exception
    when insufficient_privilege then
      raise notice 'ok: 監査ログは消せない';
    when raise_exception then
      if sqlerrm like 'NG:%' then raise; end if;
      raise notice 'ok: 監査ログは消せない（%）', sqlerrm;
  end;
end;
$$;

-- 容量の記録も手では書けない
do $$
begin
  begin
    update public.storage_usage_snapshots set total_bytes = 0;
    raise exception 'NG: 容量の記録を書き換えられてしまった';
  exception
    when insufficient_privilege then
      raise notice 'ok: 容量の記録は手で書き換えられない';
    when raise_exception then
      if sqlerrm like 'NG:%' then raise; end if;
      raise notice 'ok: 容量の記録は手で書き換えられない（%）', sqlerrm;
  end;
end;
$$;

-- -------------------------------------------------------------
-- 6. 通知の既読（57章）
-- -------------------------------------------------------------
insert into public.notifications
  (id, team_id, notification_type, title, body, created_by)
values ('13130000-0000-0000-0000-000000000001', 'b3b30000-0000-0000-0000-00000000000a',
        'general', 'お知らせ', '明日は雨天中止です', 'c3c30000-0000-0000-0000-000000000002');

insert into public.notification_targets (notification_id, team_member_id) values
  ('13130000-0000-0000-0000-000000000001', 'd3d30000-0000-0000-0000-000000000001'),
  ('13130000-0000-0000-0000-000000000001', 'd3d30000-0000-0000-0000-000000000002');

select pg_temp.login('a3a30000-0000-0000-0000-000000000001');  -- 選手

select pg_temp.check('宛先になっていれば通知が見える',
  (select count(*) from public.notifications), 1);

select pg_temp.check('自分宛の宛先だけが見える',
  (select count(*) from public.notification_targets), 1);

update public.notification_targets set read_at = now()
where notification_id = '13130000-0000-0000-0000-000000000001';

select pg_temp.check('自分の既読を付けられる',
  (select count(*) from public.notification_targets where read_at is not null), 1);

-- 他人の既読は付けられない（そもそも見えないので0件更新になる）
set local role postgres;
select pg_temp.check('他人の既読は変わっていない',
  (select count(*) from public.notification_targets
   where team_member_id = 'd3d30000-0000-0000-0000-000000000002' and read_at is null), 1);
set local role authenticated;

-- -------------------------------------------------------------
-- 7. 別チームからは何も見えない
-- -------------------------------------------------------------
select pg_temp.login('a3a30000-0000-0000-0000-000000000003');  -- 別チーム
select pg_temp.check('別チームからは通知が見えない',
  (select count(*) from public.notifications), 0);
select pg_temp.check('別チームからはファイルが見えない',
  (select count(*) from public.files), 0);

reset role;
rollback;
