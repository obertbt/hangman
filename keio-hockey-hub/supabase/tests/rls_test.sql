-- =============================================================
-- rls_test.sql
-- 62章で「保証する」と決めたことを、実際に SQL で確かめる。
--
-- 実行（素の PostgreSQL の場合）:
--   psql -d <db> -f supabase/tests/_supabase_stub.sql
--   psql -d <db> -f supabase/migrations/*.sql
--   psql -d <db> -f supabase/tests/rls_test.sql
--
-- どれか1つでも失敗すれば exception で止まる。
-- =============================================================

\set ON_ERROR_STOP on

begin;

-- -------------------------------------------------------------
-- 準備: 2チーム分の利用者を作る
--   チームA: 管理者 / コーチ / 選手1 / 選手2
--   チームB: 選手3（別チーム。何も見えてはいけない）
-- -------------------------------------------------------------
insert into auth.users (id, email) values
  ('aaaa0000-0000-0000-0000-000000000001', 'admin-t@example.com'),
  ('aaaa0000-0000-0000-0000-000000000002', 'coach-t@example.com'),
  ('aaaa0000-0000-0000-0000-000000000003', 'p1@example.com'),
  ('aaaa0000-0000-0000-0000-000000000004', 'p2@example.com'),
  ('aaaa0000-0000-0000-0000-000000000005', 'other@example.com');

insert into public.teams (id, name, display_name, slug) values
  ('bbbb0000-0000-0000-0000-0000000000a1', 'team-a', 'チームA', 'team-a'),
  ('bbbb0000-0000-0000-0000-0000000000b1', 'team-b', 'チームB', 'team-b');

insert into public.profiles (id, user_id, full_name, email) values
  ('cccc0000-0000-0000-0000-000000000001', 'aaaa0000-0000-0000-0000-000000000001', '管理者', 'admin-t@example.com'),
  ('cccc0000-0000-0000-0000-000000000002', 'aaaa0000-0000-0000-0000-000000000002', 'コーチ', 'coach-t@example.com'),
  ('cccc0000-0000-0000-0000-000000000003', 'aaaa0000-0000-0000-0000-000000000003', '選手1', 'p1@example.com'),
  ('cccc0000-0000-0000-0000-000000000004', 'aaaa0000-0000-0000-0000-000000000004', '選手2', 'p2@example.com'),
  ('cccc0000-0000-0000-0000-000000000005', 'aaaa0000-0000-0000-0000-000000000005', '別チーム選手', 'other@example.com');

insert into public.team_members (id, team_id, profile_id, role_code, status) values
  ('dddd0000-0000-0000-0000-000000000001', 'bbbb0000-0000-0000-0000-0000000000a1', 'cccc0000-0000-0000-0000-000000000001', 'system_admin', 'active'),
  ('dddd0000-0000-0000-0000-000000000002', 'bbbb0000-0000-0000-0000-0000000000a1', 'cccc0000-0000-0000-0000-000000000002', 'coach', 'active'),
  ('dddd0000-0000-0000-0000-000000000003', 'bbbb0000-0000-0000-0000-0000000000a1', 'cccc0000-0000-0000-0000-000000000003', 'player', 'active'),
  ('dddd0000-0000-0000-0000-000000000004', 'bbbb0000-0000-0000-0000-0000000000a1', 'cccc0000-0000-0000-0000-000000000004', 'player', 'active'),
  ('dddd0000-0000-0000-0000-000000000005', 'bbbb0000-0000-0000-0000-0000000000b1', 'cccc0000-0000-0000-0000-000000000005', 'player', 'active');

-- 選手2 の日報を3種類の公開範囲で作る
insert into public.daily_reports (id, team_id, team_member_id, report_date, visibility, status, what_happened) values
  ('eeee0000-0000-0000-0000-000000000001', 'bbbb0000-0000-0000-0000-0000000000a1', 'dddd0000-0000-0000-0000-000000000004', '2026-08-10', 'private', 'submitted', '誰にも見せない'),
  ('eeee0000-0000-0000-0000-000000000002', 'bbbb0000-0000-0000-0000-0000000000a1', 'dddd0000-0000-0000-0000-000000000004', '2026-08-11', 'staff',   'submitted', 'コーチには見せる'),
  ('eeee0000-0000-0000-0000-000000000003', 'bbbb0000-0000-0000-0000-0000000000a1', 'dddd0000-0000-0000-0000-000000000004', '2026-08-12', 'team',    'submitted', 'チーム全員に見せる');

-- 検査用の小さなヘルパ
create or replace function pg_temp.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
end;
$$;

create or replace function pg_temp.check(p_label text, p_actual bigint, p_expected bigint)
returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'RLS NG: % (期待 %, 実際 %)', p_label, p_expected, p_actual;
  end if;
  raise notice 'ok: %', p_label;
end;
$$;

set local role authenticated;

-- -------------------------------------------------------------
-- 1. 他選手の非公開日報を見られない
-- -------------------------------------------------------------
select pg_temp.login('aaaa0000-0000-0000-0000-000000000003');  -- 選手1

select pg_temp.check(
  '選手1 からは 選手2 の private 日報が見えない',
  (select count(*) from public.daily_reports where id = 'eeee0000-0000-0000-0000-000000000001'), 0);

select pg_temp.check(
  '選手1 からは 選手2 の staff 日報が見えない',
  (select count(*) from public.daily_reports where id = 'eeee0000-0000-0000-0000-000000000002'), 0);

select pg_temp.check(
  '選手1 からは 選手2 の team 日報だけ見える',
  (select count(*) from public.daily_reports where id = 'eeee0000-0000-0000-0000-000000000003'), 1);

-- -------------------------------------------------------------
-- 2. 本人は自分の日報を全部見られる
-- -------------------------------------------------------------
select pg_temp.login('aaaa0000-0000-0000-0000-000000000004');  -- 選手2
select pg_temp.check(
  '本人は自分の日報を3件すべて見られる',
  (select count(*) from public.daily_reports where team_member_id = 'dddd0000-0000-0000-0000-000000000004'), 3);

-- -------------------------------------------------------------
-- 3. コーチは report.view_all を持つので staff / team が見える。private は見えない。
-- -------------------------------------------------------------
select pg_temp.login('aaaa0000-0000-0000-0000-000000000002');  -- コーチ
select pg_temp.check(
  'コーチからは private 日報が見えない',
  (select count(*) from public.daily_reports where id = 'eeee0000-0000-0000-0000-000000000001'), 0);
select pg_temp.check(
  'コーチからは staff/team 日報が見える',
  (select count(*) from public.daily_reports where id in
     ('eeee0000-0000-0000-0000-000000000002', 'eeee0000-0000-0000-0000-000000000003')), 2);

-- -------------------------------------------------------------
-- 4. 別チームからは何も見えない
-- -------------------------------------------------------------
select pg_temp.login('aaaa0000-0000-0000-0000-000000000005');  -- 別チーム選手
select pg_temp.check(
  '別チームからは日報が1件も見えない',
  (select count(*) from public.daily_reports), 0);
select pg_temp.check(
  '別チームからはチームAの名簿が見えない',
  (select count(*) from public.team_members where team_id = 'bbbb0000-0000-0000-0000-0000000000a1'), 0);
select pg_temp.check(
  '別チームからはチームA自体が見えない',
  (select count(*) from public.teams where id = 'bbbb0000-0000-0000-0000-0000000000a1'), 0);

-- -------------------------------------------------------------
-- 5. 選手はイベントを作れない（event.manage を持たない）
-- -------------------------------------------------------------
select pg_temp.login('aaaa0000-0000-0000-0000-000000000003');  -- 選手1
do $$
begin
  begin
    insert into public.events (team_id, title, event_date)
    values ('bbbb0000-0000-0000-0000-0000000000a1', '勝手に作った練習', '2026-08-20');
    raise exception 'RLS NG: 選手がイベントを作れてしまった';
  exception
    when insufficient_privilege then
      raise notice 'ok: 選手はイベントを作れない';
  end;
end;
$$;

-- -------------------------------------------------------------
-- 6. 選手は Import を実行できない（import.execute を持たない）
-- -------------------------------------------------------------
do $$
begin
  begin
    insert into public.import_sessions (team_id, created_by, import_type, source_type)
    values ('bbbb0000-0000-0000-0000-0000000000a1', 'cccc0000-0000-0000-0000-000000000003', 'player', 'paste');
    raise exception 'RLS NG: 選手が Import Session を作れてしまった';
  exception
    when insufficient_privilege then
      raise notice 'ok: 選手は Import を実行できない';
  end;
end;
$$;

-- -------------------------------------------------------------
-- 7. 管理者は Import を実行できる
-- -------------------------------------------------------------
select pg_temp.login('aaaa0000-0000-0000-0000-000000000001');  -- 管理者
insert into public.import_sessions (team_id, created_by, import_type, source_type)
values ('bbbb0000-0000-0000-0000-0000000000a1', 'cccc0000-0000-0000-0000-000000000001', 'player', 'paste');
select pg_temp.check(
  '管理者は Import Session を作れる',
  (select count(*) from public.import_sessions), 1);

-- -------------------------------------------------------------
-- 8. 他人の日報を書き換えられない
-- -------------------------------------------------------------
select pg_temp.login('aaaa0000-0000-0000-0000-000000000003');  -- 選手1
update public.daily_reports set what_happened = '改ざん'
where id = 'eeee0000-0000-0000-0000-000000000003';
select pg_temp.check(
  '他人の team 日報は読めても書き換えられない',
  (select count(*) from public.daily_reports where what_happened = '改ざん'), 0);

-- -------------------------------------------------------------
-- 9. 未ログイン（anon）は何も読めない
-- -------------------------------------------------------------
reset role;
set local role anon;
do $$
begin
  begin
    perform count(*) from public.daily_reports;
    raise exception 'RLS NG: anon が日報テーブルを読めてしまった';
  exception
    when insufficient_privilege then
      raise notice 'ok: anon は日報を読めない';
  end;
end;
$$;

reset role;
rollback;
