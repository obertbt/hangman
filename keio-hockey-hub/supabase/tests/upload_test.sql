-- =============================================================
-- upload_test.sql
-- Phase 7: 短編動画のアップロード（20章・21章・22章）。
--
--   * 選手は自分の upload_session と files を作れる
--   * 他人の upload_session は見えない
--   * 別チームのファイルは見えない
--   * 投稿した動画は既定で private_staff（本人とスタッフだけ）
--   * files を指す videos は、同じチームのファイルしか参照できない（0011）
--   * 論理削除したファイルは通常の閲覧から消える
--
-- 実行方法は rls_test.sql と同じ。
-- =============================================================

\set ON_ERROR_STOP on

begin;

-- 準備 --------------------------------------------------------
insert into auth.users (id, email) values
  ('a1a10000-0000-0000-0000-000000000001', 'up-player1@example.com'),
  ('a1a10000-0000-0000-0000-000000000002', 'up-player2@example.com'),
  ('a1a10000-0000-0000-0000-000000000003', 'up-coach@example.com'),
  ('a1a10000-0000-0000-0000-000000000004', 'up-other@example.com');

insert into public.teams (id, name, display_name, slug) values
  ('b1b10000-0000-0000-0000-00000000000a', 'up-team-a', 'アップロードA', 'up-team-a'),
  ('b1b10000-0000-0000-0000-00000000000b', 'up-team-b', 'アップロードB', 'up-team-b');

insert into public.profiles (id, user_id, full_name) values
  ('c1c10000-0000-0000-0000-000000000001', 'a1a10000-0000-0000-0000-000000000001', '選手1'),
  ('c1c10000-0000-0000-0000-000000000002', 'a1a10000-0000-0000-0000-000000000002', '選手2'),
  ('c1c10000-0000-0000-0000-000000000003', 'a1a10000-0000-0000-0000-000000000003', 'コーチ'),
  ('c1c10000-0000-0000-0000-000000000004', 'a1a10000-0000-0000-0000-000000000004', '別チーム選手');

insert into public.team_members (id, team_id, profile_id, role_code) values
  ('d1d10000-0000-0000-0000-000000000001', 'b1b10000-0000-0000-0000-00000000000a', 'c1c10000-0000-0000-0000-000000000001', 'player'),
  ('d1d10000-0000-0000-0000-000000000002', 'b1b10000-0000-0000-0000-00000000000a', 'c1c10000-0000-0000-0000-000000000002', 'player'),
  ('d1d10000-0000-0000-0000-000000000003', 'b1b10000-0000-0000-0000-00000000000a', 'c1c10000-0000-0000-0000-000000000003', 'coach'),
  ('d1d10000-0000-0000-0000-000000000004', 'b1b10000-0000-0000-0000-00000000000b', 'c1c10000-0000-0000-0000-000000000004', 'player');

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
-- 1. 選手がアップロードを始める
-- -------------------------------------------------------------
select pg_temp.login('a1a10000-0000-0000-0000-000000000001');  -- 選手1

insert into public.upload_sessions
  (id, team_id, created_by, bucket, storage_key, declared_mime, declared_size, media_type, status, expires_at)
values ('e1e10000-0000-0000-0000-000000000001', 'b1b10000-0000-0000-0000-00000000000a',
        'c1c10000-0000-0000-0000-000000000001', 'test-bucket',
        'teams/b1b10000-0000-0000-0000-00000000000a/videos/2026/08/12/aaa.mp4',
        'video/mp4', 10000000, 'video', 'pending', now() + interval '20 minutes');

select pg_temp.check('選手はアップロードを始められる', (select count(*) from public.upload_sessions), 1);

-- -------------------------------------------------------------
-- 2. 実物が確認できたら files を確定する
-- -------------------------------------------------------------
insert into public.files
  (id, team_id, uploaded_by, storage_provider, bucket, storage_key, mime_type, size_bytes,
   media_type, duration_seconds, upload_status, visibility)
values ('f1f10000-0000-0000-0000-000000000001', 'b1b10000-0000-0000-0000-00000000000a',
        'c1c10000-0000-0000-0000-000000000001', 'r2', 'test-bucket',
        'teams/b1b10000-0000-0000-0000-00000000000a/videos/2026/08/12/aaa.mp4',
        'video/mp4', 10000000, 'video', 25, 'ready', 'private_staff');

update public.upload_sessions
set status = 'ready', file_id = 'f1f10000-0000-0000-0000-000000000001', completed_at = now()
where id = 'e1e10000-0000-0000-0000-000000000001';

select pg_temp.check('ファイルを確定できる', (select count(*) from public.files), 1);

-- 動画として登録する
insert into public.videos
  (id, team_id, provider, file_id, title, duration_seconds, visibility, created_by)
values ('01010000-0000-0000-0000-000000000001', 'b1b10000-0000-0000-0000-00000000000a',
        'r2', 'f1f10000-0000-0000-0000-000000000001', '自主練', 25, 'private_staff',
        'c1c10000-0000-0000-0000-000000000001');

select pg_temp.check('R2 の動画として登録できる',
  (select count(*) from public.videos where provider = 'r2'), 1);

-- storage key にはチームが入っている（62章の検算に使う）
select pg_temp.check('storage key が自分のチームで始まる',
  (select count(*) from public.files
   where storage_key like 'teams/b1b10000-0000-0000-0000-00000000000a/%'), 1);

-- -------------------------------------------------------------
-- 3. 他の選手からは見えない（既定は private_staff）
-- -------------------------------------------------------------
select pg_temp.login('a1a10000-0000-0000-0000-000000000002');  -- 同じチームの別の選手

select pg_temp.check('他の選手からは投稿した動画が見えない', (select count(*) from public.videos), 0);
select pg_temp.check('他の選手からはファイルが見えない', (select count(*) from public.files), 0);
select pg_temp.check('他人のアップロード記録は見えない', (select count(*) from public.upload_sessions), 0);

-- -------------------------------------------------------------
-- 4. コーチからは見える（video.view_team を持つ）
-- -------------------------------------------------------------
select pg_temp.login('a1a10000-0000-0000-0000-000000000003');  -- コーチ
select pg_temp.check('コーチからは動画が見える', (select count(*) from public.videos), 1);
select pg_temp.check('コーチからはファイルが見える', (select count(*) from public.files), 1);

-- -------------------------------------------------------------
-- 5. 別チームからは何も見えない
-- -------------------------------------------------------------
select pg_temp.login('a1a10000-0000-0000-0000-000000000004');  -- 別チーム
select pg_temp.check('別チームからはファイルが見えない', (select count(*) from public.files), 0);
select pg_temp.check('別チームからは動画が見えない', (select count(*) from public.videos), 0);

-- 別チームのファイルを指す動画は作れない（0011）
do $$
begin
  begin
    insert into public.videos (team_id, provider, file_id, title, visibility, created_by)
    values ('b1b10000-0000-0000-0000-00000000000b', 'r2', 'f1f10000-0000-0000-0000-000000000001',
            'よその動画', 'team', 'c1c10000-0000-0000-0000-000000000004');
    raise exception 'NG: 別チームのファイルを指す動画を作れてしまった';
  exception
    when insufficient_privilege or foreign_key_violation then
      raise notice 'ok: 別チームのファイルを指す動画は作れない（RLS）';
    when raise_exception then
      if sqlerrm like 'NG:%' then raise; end if;
      raise notice 'ok: 別チームのファイルを指す動画は作れない（%）', sqlerrm;
  end;
end;
$$;

-- -------------------------------------------------------------
-- 6. 削除（0013）
--
-- SELECT ポリシーが deleted_at is null を条件にしているため、
-- 直接 UPDATE では論理削除できない（PostgreSQL は SELECT ポリシーを
-- 更新後の行にも適用する）。削除は関数を通して行う。
-- -------------------------------------------------------------
select pg_temp.login('a1a10000-0000-0000-0000-000000000002');  -- 投稿していない選手

do $$
begin
  begin
    perform public.soft_delete_video('01010000-0000-0000-0000-000000000001');
    raise exception 'NG: 他人の動画を削除できてしまった';
  exception when raise_exception then
    if sqlerrm like 'NG:%' then raise; end if;
    raise notice 'ok: 他人の動画は削除できない（%）', sqlerrm;
  end;
end;
$$;

select pg_temp.login('a1a10000-0000-0000-0000-000000000001');  -- 投稿した本人

select public.soft_delete_video('01010000-0000-0000-0000-000000000001');

select pg_temp.check('本人は自分の動画を削除できる', (select count(*) from public.videos), 0);
select pg_temp.check('ファイルも一緒に論理削除される', (select count(*) from public.files), 0);

-- 60章: 30日後に実体を消すための予約が作られる
set local role postgres;
select pg_temp.check('物理削除の予約が作られる',
  (select count(*) from public.file_deletion_jobs
   where file_id = 'f1f10000-0000-0000-0000-000000000001'), 1);

-- 63章: 削除は監査ログに残る
select pg_temp.check('削除が監査ログに残る',
  (select count(*) from public.audit_logs where action = 'video.delete'), 1);
set local role authenticated;

-- 予約は storage.manage を持つ人だけが見られる
select pg_temp.check('選手には削除予約が見えない', (select count(*) from public.file_deletion_jobs), 0);

reset role;
rollback;
