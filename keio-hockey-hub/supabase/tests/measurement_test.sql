-- =============================================================
-- measurement_test.sql
-- 測定（3章の6: 成長を確認できる）。
--
--   * コーチは全員ぶんの記録を入れられる
--   * 選手は自分の記録だけ入れられる
--   * 他人の記録は見えないし、触れない
--   * 別チームの測定会・項目・部員は参照できない（0011 の教訓）
--   * 値が空の記録は作れない
--
-- 実行方法は rls_test.sql と同じ。
-- =============================================================

\set ON_ERROR_STOP on

begin;

-- 準備 --------------------------------------------------------
insert into auth.users (id, email) values
  ('a4a40000-0000-0000-0000-000000000001', 'ms-player1@example.com'),
  ('a4a40000-0000-0000-0000-000000000002', 'ms-player2@example.com'),
  ('a4a40000-0000-0000-0000-000000000003', 'ms-coach@example.com'),
  ('a4a40000-0000-0000-0000-000000000004', 'ms-other@example.com');

insert into public.teams (id, name, display_name, slug) values
  ('b4b40000-0000-0000-0000-00000000000a', 'ms-team-a', '測定A', 'ms-team-a'),
  ('b4b40000-0000-0000-0000-00000000000b', 'ms-team-b', '測定B', 'ms-team-b');

insert into public.profiles (id, user_id, full_name) values
  ('c4c40000-0000-0000-0000-000000000001', 'a4a40000-0000-0000-0000-000000000001', '選手1'),
  ('c4c40000-0000-0000-0000-000000000002', 'a4a40000-0000-0000-0000-000000000002', '選手2'),
  ('c4c40000-0000-0000-0000-000000000003', 'a4a40000-0000-0000-0000-000000000003', 'コーチ'),
  ('c4c40000-0000-0000-0000-000000000004', 'a4a40000-0000-0000-0000-000000000004', '別チーム選手');

insert into public.team_members (id, team_id, profile_id, role_code) values
  ('d4d40000-0000-0000-0000-000000000001', 'b4b40000-0000-0000-0000-00000000000a', 'c4c40000-0000-0000-0000-000000000001', 'player'),
  ('d4d40000-0000-0000-0000-000000000002', 'b4b40000-0000-0000-0000-00000000000a', 'c4c40000-0000-0000-0000-000000000002', 'player'),
  ('d4d40000-0000-0000-0000-000000000003', 'b4b40000-0000-0000-0000-00000000000a', 'c4c40000-0000-0000-0000-000000000003', 'coach'),
  ('d4d40000-0000-0000-0000-000000000004', 'b4b40000-0000-0000-0000-00000000000b', 'c4c40000-0000-0000-0000-000000000004', 'player');

insert into public.measurement_items (id, team_id, name, unit, better) values
  ('e4e40000-0000-0000-0000-00000000000a', 'b4b40000-0000-0000-0000-00000000000a', '50m走', '秒', 'lower'),
  ('e4e40000-0000-0000-0000-00000000000b', 'b4b40000-0000-0000-0000-00000000000b', 'よその項目', '秒', 'lower');

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
-- 1. 測定会を作れるのはスタッフだけ
-- -------------------------------------------------------------
select pg_temp.login('a4a40000-0000-0000-0000-000000000001');  -- 選手

do $$
begin
  begin
    insert into public.measurement_events (team_id, name, measured_on)
    values ('b4b40000-0000-0000-0000-00000000000a', '勝手な測定会', current_date);
    raise exception 'NG: 選手が測定会を作れてしまった';
  exception
    when insufficient_privilege then
      raise notice 'ok: 選手は測定会を作れない（RLS）';
    when raise_exception then
      if sqlerrm like 'NG:%' then raise; end if;
      raise notice 'ok: 選手は測定会を作れない（%）', sqlerrm;
  end;
end;
$$;

select pg_temp.login('a4a40000-0000-0000-0000-000000000003');  -- コーチ

insert into public.measurement_events (id, team_id, name, measured_on) values
  ('f4f40000-0000-0000-0000-000000000001', 'b4b40000-0000-0000-0000-00000000000a', '春の測定会', '2026-04-01'),
  ('f4f40000-0000-0000-0000-000000000002', 'b4b40000-0000-0000-0000-00000000000a', '夏の測定会', '2026-08-01');

select pg_temp.check('コーチは測定会を作れる',
  (select count(*) from public.measurement_events), 2);

-- -------------------------------------------------------------
-- 2. コーチは全員ぶんの記録を入れられる
-- -------------------------------------------------------------
insert into public.measurement_results
  (team_id, measurement_event_id, measurement_item_id, team_member_id, value)
values
  ('b4b40000-0000-0000-0000-00000000000a', 'f4f40000-0000-0000-0000-000000000001',
   'e4e40000-0000-0000-0000-00000000000a', 'd4d40000-0000-0000-0000-000000000001', 8.2),
  ('b4b40000-0000-0000-0000-00000000000a', 'f4f40000-0000-0000-0000-000000000001',
   'e4e40000-0000-0000-0000-00000000000a', 'd4d40000-0000-0000-0000-000000000002', 8.5);

select pg_temp.check('コーチは全員ぶんの記録を入れられる',
  (select count(*) from public.measurement_results), 2);

-- 値が空の記録は作れない
do $$
begin
  begin
    insert into public.measurement_results
      (team_id, measurement_event_id, measurement_item_id, team_member_id, note)
    values ('b4b40000-0000-0000-0000-00000000000a', 'f4f40000-0000-0000-0000-000000000002',
            'e4e40000-0000-0000-0000-00000000000a', 'd4d40000-0000-0000-0000-000000000001', '欠席');
    raise exception 'NG: 値の無い記録を作れてしまった';
  exception when raise_exception then
    if sqlerrm like 'NG:%' then raise; end if;
    raise notice 'ok: 値の無い記録は作れない（%）', sqlerrm;
  end;
end;
$$;

-- 別チームの部員の記録は作れない（0011 の教訓）
do $$
begin
  begin
    insert into public.measurement_results
      (team_id, measurement_event_id, measurement_item_id, team_member_id, value)
    values ('b4b40000-0000-0000-0000-00000000000a', 'f4f40000-0000-0000-0000-000000000001',
            'e4e40000-0000-0000-0000-00000000000a', 'd4d40000-0000-0000-0000-000000000004', 8.0);
    raise exception 'NG: 別チームの部員の記録を作れてしまった';
  exception
    when insufficient_privilege then
      raise notice 'ok: 別チームの部員の記録は作れない（RLS）';
    when raise_exception then
      if sqlerrm like 'NG:%' then raise; end if;
      raise notice 'ok: 別チームの部員の記録は作れない（%）', sqlerrm;
  end;
end;
$$;

-- 別チームの測定項目も参照できない
do $$
begin
  begin
    insert into public.measurement_results
      (team_id, measurement_event_id, measurement_item_id, team_member_id, value)
    values ('b4b40000-0000-0000-0000-00000000000a', 'f4f40000-0000-0000-0000-000000000001',
            'e4e40000-0000-0000-0000-00000000000b', 'd4d40000-0000-0000-0000-000000000001', 8.0);
    raise exception 'NG: 別チームの項目で記録を作れてしまった';
  exception
    when insufficient_privilege then
      raise notice 'ok: 別チームの項目では記録を作れない（RLS）';
    when raise_exception then
      if sqlerrm like 'NG:%' then raise; end if;
      raise notice 'ok: 別チームの項目では記録を作れない（%）', sqlerrm;
  end;
end;
$$;

-- -------------------------------------------------------------
-- 3. 選手は自分の記録だけ入れられる（0017 で足した）
-- -------------------------------------------------------------
select pg_temp.login('a4a40000-0000-0000-0000-000000000001');  -- 選手1

insert into public.measurement_results
  (team_id, measurement_event_id, measurement_item_id, team_member_id, value, note)
values ('b4b40000-0000-0000-0000-00000000000a', 'f4f40000-0000-0000-0000-000000000002',
        'e4e40000-0000-0000-0000-00000000000a', 'd4d40000-0000-0000-0000-000000000001', 8.0,
        '自主的に測りました');

select pg_temp.check('選手は自分の記録を入れられる',
  (select count(*) from public.measurement_results
   where team_member_id = 'd4d40000-0000-0000-0000-000000000001'), 2);

do $$
begin
  begin
    insert into public.measurement_results
      (team_id, measurement_event_id, measurement_item_id, team_member_id, value)
    values ('b4b40000-0000-0000-0000-00000000000a', 'f4f40000-0000-0000-0000-000000000002',
            'e4e40000-0000-0000-0000-00000000000a', 'd4d40000-0000-0000-0000-000000000002', 7.0);
    raise exception 'NG: 選手が他人の記録を入れられてしまった';
  exception
    when insufficient_privilege then
      raise notice 'ok: 選手は他人の記録を入れられない（RLS）';
    when raise_exception then
      if sqlerrm like 'NG:%' then raise; end if;
      raise notice 'ok: 選手は他人の記録を入れられない（%）', sqlerrm;
  end;
end;
$$;

-- -------------------------------------------------------------
-- 4. 他人の記録は見えない
-- -------------------------------------------------------------
select pg_temp.check('選手には自分の記録だけが見える',
  (select count(*) from public.measurement_results), 2);

select pg_temp.check('測定会はチーム全員が見られる',
  (select count(*) from public.measurement_events), 2);

select pg_temp.check('測定項目もチーム全員が見られる',
  (select count(*) from public.measurement_items), 1);

-- 他人の記録は書き換えられない（そもそも見えない）
update public.measurement_results set value = 99
where team_member_id = 'd4d40000-0000-0000-0000-000000000002';

set local role postgres;
select pg_temp.check('他人の記録は変わっていない',
  (select count(*) from public.measurement_results
   where team_member_id = 'd4d40000-0000-0000-0000-000000000002' and value = 8.5), 1);
set local role authenticated;

-- -------------------------------------------------------------
-- 5. コーチには全員ぶんが見える
-- -------------------------------------------------------------
select pg_temp.login('a4a40000-0000-0000-0000-000000000003');  -- コーチ
select pg_temp.check('コーチには全員ぶんが見える',
  (select count(*) from public.measurement_results), 3);

-- 同じ測定会・項目・人で2件は作れない（上書きになる）
do $$
begin
  begin
    insert into public.measurement_results
      (team_id, measurement_event_id, measurement_item_id, team_member_id, value)
    values ('b4b40000-0000-0000-0000-00000000000a', 'f4f40000-0000-0000-0000-000000000001',
            'e4e40000-0000-0000-0000-00000000000a', 'd4d40000-0000-0000-0000-000000000001', 7.9);
    raise exception 'NG: 同じ枠に2件作れてしまった';
  exception
    when unique_violation then
      raise notice 'ok: 同じ測定会・項目・人で2件は作れない';
    when raise_exception then
      if sqlerrm like 'NG:%' then raise; end if;
      raise notice 'ok: 同じ測定会・項目・人で2件は作れない（%）', sqlerrm;
  end;
end;
$$;

-- -------------------------------------------------------------
-- 6. 別チームからは何も見えない
-- -------------------------------------------------------------
select pg_temp.login('a4a40000-0000-0000-0000-000000000004');  -- 別チーム
select pg_temp.check('別チームからは測定会が見えない',
  (select count(*) from public.measurement_events), 0);
select pg_temp.check('別チームからは記録が見えない',
  (select count(*) from public.measurement_results), 0);

reset role;
rollback;
