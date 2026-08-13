-- =============================================================
-- submission_status_test.sql
-- 「出したこと」と「中身」を分ける（0023）。
--
--   * private の日報を出した選手が、未提出として並ばない
--   * それでも中身は読めない（id を返さない）
--   * 権限が無い人は呼べない
--   * 別チームの提出状況は覗けない
--   * 下書きは提出に数えない
--
-- 実行方法は rls_test.sql と同じ。
-- =============================================================

\set ON_ERROR_STOP on

begin;

-- 準備 --------------------------------------------------------
insert into auth.users (id, email) values
  ('a9a90000-0000-0000-0000-000000000001', 'ss-open@example.com'),
  ('a9a90000-0000-0000-0000-000000000002', 'ss-private@example.com'),
  ('a9a90000-0000-0000-0000-000000000003', 'ss-draft@example.com'),
  ('a9a90000-0000-0000-0000-000000000004', 'ss-coach@example.com'),
  ('a9a90000-0000-0000-0000-000000000005', 'ss-other-coach@example.com');

insert into public.teams (id, name, display_name, slug) values
  ('b9b90000-0000-0000-0000-00000000000a', 'ss-team', '提出テスト部', 'ss-team'),
  ('b9b90000-0000-0000-0000-00000000000b', 'ss-other', 'よその部', 'ss-other');

insert into public.profiles (id, user_id, full_name) values
  ('c9c90000-0000-0000-0000-000000000001', 'a9a90000-0000-0000-0000-000000000001', '公開選手'),
  ('c9c90000-0000-0000-0000-000000000002', 'a9a90000-0000-0000-0000-000000000002', '非公開選手'),
  ('c9c90000-0000-0000-0000-000000000003', 'a9a90000-0000-0000-0000-000000000003', '下書き選手'),
  ('c9c90000-0000-0000-0000-000000000004', 'a9a90000-0000-0000-0000-000000000004', 'コーチ'),
  ('c9c90000-0000-0000-0000-000000000005', 'a9a90000-0000-0000-0000-000000000005', 'よそのコーチ');

insert into public.team_members (id, team_id, profile_id, role_code) values
  ('d9d90000-0000-0000-0000-000000000001', 'b9b90000-0000-0000-0000-00000000000a', 'c9c90000-0000-0000-0000-000000000001', 'player'),
  ('d9d90000-0000-0000-0000-000000000002', 'b9b90000-0000-0000-0000-00000000000a', 'c9c90000-0000-0000-0000-000000000002', 'player'),
  ('d9d90000-0000-0000-0000-000000000003', 'b9b90000-0000-0000-0000-00000000000a', 'c9c90000-0000-0000-0000-000000000003', 'player'),
  ('d9d90000-0000-0000-0000-000000000004', 'b9b90000-0000-0000-0000-00000000000a', 'c9c90000-0000-0000-0000-000000000004', 'coach'),
  ('d9d90000-0000-0000-0000-000000000005', 'b9b90000-0000-0000-0000-00000000000b', 'c9c90000-0000-0000-0000-000000000005', 'coach');

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

create or replace function pg_temp.check_bool(p_label text, p_actual boolean, p_expected boolean)
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
-- 1. 3人がそれぞれ違う出し方をする
-- -------------------------------------------------------------
select pg_temp.login('a9a90000-0000-0000-0000-000000000001');  -- 公開選手
insert into public.daily_reports
  (id, team_id, team_member_id, report_date, what_happened, visibility, status, submitted_at)
values
  ('e9e90000-0000-0000-0000-000000000001', 'b9b90000-0000-0000-0000-00000000000a',
   'd9d90000-0000-0000-0000-000000000001', '2026-08-12', 'コーチにも見せる', 'staff', 'submitted', now());

select pg_temp.login('a9a90000-0000-0000-0000-000000000002');  -- 非公開選手
insert into public.daily_reports
  (id, team_id, team_member_id, report_date, what_happened, visibility, status, submitted_at)
values
  ('e9e90000-0000-0000-0000-000000000002', 'b9b90000-0000-0000-0000-00000000000a',
   'd9d90000-0000-0000-0000-000000000002', '2026-08-12', '自分だけのもの', 'private', 'submitted', now());

-- 同じ日にトレーニングも「自分だけ」で入れる
insert into public.training_records
  (id, team_id, team_member_id, performed_on, training_type, visibility)
values
  ('e9e90000-0000-0000-0000-00000000000a', 'b9b90000-0000-0000-0000-00000000000a',
   'd9d90000-0000-0000-0000-000000000002', '2026-08-12', 'running', 'private');

select pg_temp.login('a9a90000-0000-0000-0000-000000000003');  -- 下書き選手
insert into public.daily_reports
  (id, team_id, team_member_id, report_date, what_happened, visibility, status)
values
  ('e9e90000-0000-0000-0000-000000000003', 'b9b90000-0000-0000-0000-00000000000a',
   'd9d90000-0000-0000-0000-000000000003', '2026-08-12', '書きかけ', 'staff', 'draft');

-- -------------------------------------------------------------
-- 2. これまでの見え方（素の SELECT）では private が消える
--
--    直したのはここ。RLS そのものは変えていない。
-- -------------------------------------------------------------
select pg_temp.login('a9a90000-0000-0000-0000-000000000004');  -- コーチ

select pg_temp.check('素の SELECT では private の日報は見えない',
  (select count(*) from public.daily_reports
   where report_date = '2026-08-12' and status = 'submitted'), 1);

-- -------------------------------------------------------------
-- 3. 提出状況では、出したことが分かる
-- -------------------------------------------------------------
select pg_temp.check('提出状況は在籍選手ぶん返る',
  (select count(*) from public.list_submission_status(
     'b9b90000-0000-0000-0000-00000000000a', '2026-08-12')), 3);

select pg_temp.check('日報を出した2人が提出済みになる',
  (select count(*) from public.list_submission_status(
     'b9b90000-0000-0000-0000-00000000000a', '2026-08-12')
   where submitted_report), 2);

select pg_temp.check_bool('「自分だけ」で出した人も提出済みとして数える',
  (select submitted_report from public.list_submission_status(
     'b9b90000-0000-0000-0000-00000000000a', '2026-08-12')
   where team_member_id = 'd9d90000-0000-0000-0000-000000000002'), true);

select pg_temp.check_bool('その人には「中身は非公開」の印が付く',
  (select report_is_private from public.list_submission_status(
     'b9b90000-0000-0000-0000-00000000000a', '2026-08-12')
   where team_member_id = 'd9d90000-0000-0000-0000-000000000002'), true);

select pg_temp.check_bool('下書きは提出に数えない',
  (select submitted_report from public.list_submission_status(
     'b9b90000-0000-0000-0000-00000000000a', '2026-08-12')
   where team_member_id = 'd9d90000-0000-0000-0000-000000000003'), false);

select pg_temp.check_bool('「自分だけ」のトレーニングも入力済みとして数える',
  (select submitted_training from public.list_submission_status(
     'b9b90000-0000-0000-0000-00000000000a', '2026-08-12')
   where team_member_id = 'd9d90000-0000-0000-0000-000000000002'), true);

-- -------------------------------------------------------------
-- 4. **それでも中身は読めない**
-- -------------------------------------------------------------
select pg_temp.check('中身を読める日報だけ id が返る',
  (select count(*) from public.list_submission_status(
     'b9b90000-0000-0000-0000-00000000000a', '2026-08-12')
   where readable_report_id is not null), 1);

select pg_temp.check_bool('「自分だけ」の日報は id を返さない（開けない）',
  (select readable_report_id is null from public.list_submission_status(
     'b9b90000-0000-0000-0000-00000000000a', '2026-08-12')
   where team_member_id = 'd9d90000-0000-0000-0000-000000000002'), true);

select pg_temp.check_bool('公開した日報の id は、その日報を指す',
  (select readable_report_id = 'e9e90000-0000-0000-0000-000000000001'
   from public.list_submission_status(
     'b9b90000-0000-0000-0000-00000000000a', '2026-08-12')
   where team_member_id = 'd9d90000-0000-0000-0000-000000000001'), true);

-- id を手で当てても、RLS が止める
select pg_temp.check('id を直接指定しても private の中身は取れない',
  (select count(*) from public.daily_reports
   where id = 'e9e90000-0000-0000-0000-000000000002'), 0);

-- -------------------------------------------------------------
-- 5. 呼べる人を限る
-- -------------------------------------------------------------
select pg_temp.login('a9a90000-0000-0000-0000-000000000001');  -- 選手
do $$
begin
  begin
    perform * from public.list_submission_status(
      'b9b90000-0000-0000-0000-00000000000a', '2026-08-12');
    raise exception 'NG: 選手が提出状況を見られてしまった';
  exception when raise_exception then
    if sqlerrm like 'NG:%' then raise; end if;
    raise notice 'ok: 選手は提出状況を見られない（%）', sqlerrm;
  end;
end;
$$;

select pg_temp.login('a9a90000-0000-0000-0000-000000000005');  -- よそのコーチ
do $$
begin
  begin
    perform * from public.list_submission_status(
      'b9b90000-0000-0000-0000-00000000000a', '2026-08-12');
    raise exception 'NG: 別チームの提出状況を覗けてしまった';
  exception when raise_exception then
    if sqlerrm like 'NG:%' then raise; end if;
    raise notice 'ok: 別チームの提出状況は覗けない（%）', sqlerrm;
  end;
end;
$$;

-- -------------------------------------------------------------
-- 6. 消した日報は提出に数えない
-- -------------------------------------------------------------
-- 日報の論理削除はまだ画面から行えない（専用の関数が無い）。
-- ここで見たいのは「消えた行を数えないこと」なので、状態だけ作る。
reset role;
update public.daily_reports set deleted_at = now()
where id = 'e9e90000-0000-0000-0000-000000000001';
set local role authenticated;

select pg_temp.login('a9a90000-0000-0000-0000-000000000004');  -- コーチ
select pg_temp.check_bool('消した日報は提出に数えない',
  (select submitted_report from public.list_submission_status(
     'b9b90000-0000-0000-0000-00000000000a', '2026-08-12')
   where team_member_id = 'd9d90000-0000-0000-0000-000000000001'), false);

reset role;
rollback;
