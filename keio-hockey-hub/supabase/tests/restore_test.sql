-- =============================================================
-- restore_test.sql
-- 消したものを戻す（60章の考え方を他の記録にも広げたもの）。
--
--   * 消したものは一覧に出る。出るのは「自分が戻せるもの」だけ
--   * 戻すと、また普通に見えるようになる
--   * **動画を戻すと、物理削除の予約も取り消される**
--   * 実体が消えた動画は戻せない
--   * 他人のものは一覧にも出ないし、戻せない
--
-- 実行方法は rls_test.sql と同じ。
-- =============================================================

\set ON_ERROR_STOP on

begin;

-- 準備 --------------------------------------------------------
insert into auth.users (id, email) values
  ('a6a60000-0000-0000-0000-000000000001', 'rs-player1@example.com'),
  ('a6a60000-0000-0000-0000-000000000002', 'rs-player2@example.com'),
  ('a6a60000-0000-0000-0000-000000000003', 'rs-coach@example.com');

insert into public.teams (id, name, display_name, slug) values
  ('b6b60000-0000-0000-0000-00000000000a', 'rs-team', '復元テスト', 'rs-team');

insert into public.profiles (id, user_id, full_name) values
  ('c6c60000-0000-0000-0000-000000000001', 'a6a60000-0000-0000-0000-000000000001', '選手1'),
  ('c6c60000-0000-0000-0000-000000000002', 'a6a60000-0000-0000-0000-000000000002', '選手2'),
  ('c6c60000-0000-0000-0000-000000000003', 'a6a60000-0000-0000-0000-000000000003', 'コーチ');

insert into public.team_members (id, team_id, profile_id, role_code) values
  ('d6d60000-0000-0000-0000-000000000001', 'b6b60000-0000-0000-0000-00000000000a', 'c6c60000-0000-0000-0000-000000000001', 'player'),
  ('d6d60000-0000-0000-0000-000000000002', 'b6b60000-0000-0000-0000-00000000000a', 'c6c60000-0000-0000-0000-000000000002', 'player'),
  ('d6d60000-0000-0000-0000-000000000003', 'b6b60000-0000-0000-0000-00000000000a', 'c6c60000-0000-0000-0000-000000000003', 'coach');

-- 選手1の動画（R2 に実体あり）
insert into public.files
  (id, team_id, uploaded_by, storage_provider, bucket, storage_key, mime_type, size_bytes,
   media_type, upload_status, visibility)
values ('e6e60000-0000-0000-0000-000000000001', 'b6b60000-0000-0000-0000-00000000000a',
        'c6c60000-0000-0000-0000-000000000001', 'r2', 'b',
        'teams/b6b60000-0000-0000-0000-00000000000a/videos/2026/08/12/aaa.mp4',
        'video/mp4', 1000, 'video', 'ready', 'private_staff');

insert into public.videos (id, team_id, provider, file_id, title, visibility, created_by)
values ('f6f60000-0000-0000-0000-000000000001', 'b6b60000-0000-0000-0000-00000000000a',
        'r2', 'e6e60000-0000-0000-0000-000000000001', '自主練の動画', 'private_staff',
        'c6c60000-0000-0000-0000-000000000001');

-- 選手1のトレーニング記録
insert into public.training_records
  (id, team_id, team_member_id, performed_on, training_type, menu)
values ('06060000-0000-0000-0000-000000000001', 'b6b60000-0000-0000-0000-00000000000a',
        'd6d60000-0000-0000-0000-000000000001', '2026-08-12', 'running', '朝ラン');

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
-- 1. 消す → 見えなくなる → 一覧には出る
-- -------------------------------------------------------------
select pg_temp.login('a6a60000-0000-0000-0000-000000000001');  -- 選手1

select public.soft_delete_video('f6f60000-0000-0000-0000-000000000001');
select public.soft_delete_training_record('06060000-0000-0000-0000-000000000001');

select pg_temp.check('消した動画は普通には見えない',
  (select count(*) from public.videos), 0);
select pg_temp.check('消した記録も普通には見えない',
  (select count(*) from public.training_records), 0);

select pg_temp.check('消したものは一覧に出る',
  (select count(*) from public.list_deleted_items('b6b60000-0000-0000-0000-00000000000a')), 2);

select pg_temp.check('戻せる状態になっている',
  (select count(*) from public.list_deleted_items('b6b60000-0000-0000-0000-00000000000a')
   where restorable), 2);

-- 論理削除しただけの動画は、まだ R2 に実体がある。
-- ここで upload_status を 'deleted' にしてしまうと容量集計から外れる（0020 で直した）。
set local role postgres;
select pg_temp.check('論理削除では実体ありのまま',
  (select count(*) from public.files
   where id = 'e6e60000-0000-0000-0000-000000000001' and upload_status <> 'deleted'), 1);
set local role authenticated;

-- 60章: 30日後の物理削除が予約されている
set local role postgres;
select pg_temp.check('物理削除が予約されている',
  (select count(*) from public.file_deletion_jobs
   where file_id = 'e6e60000-0000-0000-0000-000000000001' and status = 'pending'), 1);
set local role authenticated;

-- -------------------------------------------------------------
-- 2. 他人のものは一覧に出ないし、戻せない
-- -------------------------------------------------------------
select pg_temp.login('a6a60000-0000-0000-0000-000000000002');  -- 選手2

select pg_temp.check('他人が消したものは一覧に出ない',
  (select count(*) from public.list_deleted_items('b6b60000-0000-0000-0000-00000000000a')), 0);

do $$
begin
  begin
    perform public.restore_video('f6f60000-0000-0000-0000-000000000001');
    raise exception 'NG: 他人の動画を戻せてしまった';
  exception when raise_exception then
    if sqlerrm like 'NG:%' then raise; end if;
    raise notice 'ok: 他人の動画は戻せない（%）', sqlerrm;
  end;
end;
$$;

do $$
begin
  begin
    perform public.restore_training_record('06060000-0000-0000-0000-000000000001');
    raise exception 'NG: 他人の記録を戻せてしまった';
  exception when raise_exception then
    if sqlerrm like 'NG:%' then raise; end if;
    raise notice 'ok: 他人の記録は戻せない（%）', sqlerrm;
  end;
end;
$$;

-- -------------------------------------------------------------
-- 3. 本人が戻す
-- -------------------------------------------------------------
select pg_temp.login('a6a60000-0000-0000-0000-000000000001');  -- 選手1

select public.restore_video('f6f60000-0000-0000-0000-000000000001');
select public.restore_training_record('06060000-0000-0000-0000-000000000001');

select pg_temp.check('戻した動画はまた見える',
  (select count(*) from public.videos), 1);
select pg_temp.check('戻した記録もまた見える',
  (select count(*) from public.training_records), 1);
select pg_temp.check('一覧は空になる',
  (select count(*) from public.list_deleted_items('b6b60000-0000-0000-0000-00000000000a')), 0);

-- **ここが本題**: 戻したのに30日後に実体が消えたら、再生できない動画が残る
set local role postgres;
select pg_temp.check('物理削除の予約が取り消される',
  (select count(*) from public.file_deletion_jobs
   where file_id = 'e6e60000-0000-0000-0000-000000000001' and status = 'pending'), 0);

select pg_temp.check('ファイルの論理削除も解ける',
  (select count(*) from public.files
   where id = 'e6e60000-0000-0000-0000-000000000001' and deleted_at is null), 1);

-- 63章: 戻したことも記録に残す
select pg_temp.check('復元が監査ログに残る',
  (select count(*) from public.audit_logs where action = 'video.restore'), 1);
set local role authenticated;

-- -------------------------------------------------------------
-- 4. 実体が消えた動画は戻せない
-- -------------------------------------------------------------
select public.soft_delete_video('f6f60000-0000-0000-0000-000000000001');

-- 30日が過ぎて、実体を消した状態を作る
set local role postgres;
update public.files set upload_status = 'deleted' where id = 'e6e60000-0000-0000-0000-000000000001';
set local role authenticated;

select pg_temp.check('戻せないものは一覧でそう分かる',
  (select count(*) from public.list_deleted_items('b6b60000-0000-0000-0000-00000000000a')
   where kind = 'video' and not restorable), 1);

do $$
begin
  begin
    perform public.restore_video('f6f60000-0000-0000-0000-000000000001');
    raise exception 'NG: 実体の無い動画を戻せてしまった';
  exception when raise_exception then
    if sqlerrm like 'NG:%' then raise; end if;
    raise notice 'ok: 実体が消えた動画は戻せない（%）', sqlerrm;
  end;
end;
$$;

-- -------------------------------------------------------------
-- 5. スキル定義の復元（親子の順番）
-- -------------------------------------------------------------
select pg_temp.login('a6a60000-0000-0000-0000-000000000003');  -- コーチ

insert into public.skill_categories (id, team_id, name)
values ('16160000-0000-0000-0000-000000000001', 'b6b60000-0000-0000-0000-00000000000a', 'ドリブル');

insert into public.skills (id, team_id, skill_category_id, parent_id, name, level) values
  ('26260000-0000-0000-0000-000000000001', 'b6b60000-0000-0000-0000-00000000000a',
   '16160000-0000-0000-0000-000000000001', null, '運ぶ', 2),
  ('26260000-0000-0000-0000-000000000002', 'b6b60000-0000-0000-0000-00000000000a',
   '16160000-0000-0000-0000-000000000001', '26260000-0000-0000-0000-000000000001', '10m運ぶ', 3);

-- 小目標 → 中目標の順に消す
select public.soft_delete_skill('26260000-0000-0000-0000-000000000002');
select public.soft_delete_skill('26260000-0000-0000-0000-000000000001');

select pg_temp.check('消したスキル定義が一覧に出る',
  (select count(*) from public.list_deleted_items('b6b60000-0000-0000-0000-00000000000a')
   where kind = 'skill'), 2);

-- 中目標が消えたままでは、小目標を戻せない（宙に浮くため）
do $$
begin
  begin
    perform public.restore_skill('26260000-0000-0000-0000-000000000002');
    raise exception 'NG: 親が消えたまま小目標を戻せてしまった';
  exception when raise_exception then
    if sqlerrm like 'NG:%' then raise; end if;
    raise notice 'ok: 中目標が先に要る（%）', sqlerrm;
  end;
end;
$$;

select public.restore_skill('26260000-0000-0000-0000-000000000001');
select public.restore_skill('26260000-0000-0000-0000-000000000002');

select pg_temp.check('順番どおりなら戻せる',
  (select count(*) from public.skills
   where skill_category_id = '16160000-0000-0000-0000-000000000001'), 2);

-- 選手はスキル定義を戻せない
select pg_temp.login('a6a60000-0000-0000-0000-000000000001');  -- 選手1
select pg_temp.check('選手の一覧にスキル定義は出ない',
  (select count(*) from public.list_deleted_items('b6b60000-0000-0000-0000-00000000000a')
   where kind = 'skill'), 0);

reset role;
rollback;
