-- =============================================================
-- report_feedback_test.sql
-- 日報へのコーチのコメント（16章）。
--
--   * コーチは staff / team 公開の日報にコメントできる
--   * **「自分だけ」にした日報にはコメントできない**（0022 で塞いだ穴）
--   * コメントは本人とコーチに見える。他の選手には見えない
--   * 差出人は偽れない
--   * 消せるのは書いた本人だけ
--   * 別チームの日報にはコメントできない（0011 の教訓）
--
-- 実行方法は rls_test.sql と同じ。
-- =============================================================

\set ON_ERROR_STOP on

begin;

-- 準備 --------------------------------------------------------
insert into auth.users (id, email) values
  ('a8a80000-0000-0000-0000-000000000001', 'rf-player1@example.com'),
  ('a8a80000-0000-0000-0000-000000000002', 'rf-player2@example.com'),
  ('a8a80000-0000-0000-0000-000000000003', 'rf-coach@example.com'),
  ('a8a80000-0000-0000-0000-000000000004', 'rf-coach2@example.com'),
  ('a8a80000-0000-0000-0000-000000000005', 'rf-other@example.com');

insert into public.teams (id, name, display_name, slug) values
  ('b8b80000-0000-0000-0000-00000000000a', 'rf-team', '日報テスト部', 'rf-team'),
  ('b8b80000-0000-0000-0000-00000000000b', 'rf-other', 'よその部', 'rf-other');

insert into public.profiles (id, user_id, full_name) values
  ('c8c80000-0000-0000-0000-000000000001', 'a8a80000-0000-0000-0000-000000000001', '選手1'),
  ('c8c80000-0000-0000-0000-000000000002', 'a8a80000-0000-0000-0000-000000000002', '選手2'),
  ('c8c80000-0000-0000-0000-000000000003', 'a8a80000-0000-0000-0000-000000000003', 'コーチ'),
  ('c8c80000-0000-0000-0000-000000000004', 'a8a80000-0000-0000-0000-000000000004', 'コーチ2'),
  ('c8c80000-0000-0000-0000-000000000005', 'a8a80000-0000-0000-0000-000000000005', '別チーム');

insert into public.team_members (id, team_id, profile_id, role_code) values
  ('d8d80000-0000-0000-0000-000000000001', 'b8b80000-0000-0000-0000-00000000000a', 'c8c80000-0000-0000-0000-000000000001', 'player'),
  ('d8d80000-0000-0000-0000-000000000002', 'b8b80000-0000-0000-0000-00000000000a', 'c8c80000-0000-0000-0000-000000000002', 'player'),
  ('d8d80000-0000-0000-0000-000000000003', 'b8b80000-0000-0000-0000-00000000000a', 'c8c80000-0000-0000-0000-000000000003', 'coach'),
  ('d8d80000-0000-0000-0000-000000000004', 'b8b80000-0000-0000-0000-00000000000a', 'c8c80000-0000-0000-0000-000000000004', 'coach'),
  ('d8d80000-0000-0000-0000-000000000005', 'b8b80000-0000-0000-0000-00000000000b', 'c8c80000-0000-0000-0000-000000000005', 'player');

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
-- 1. 選手が日報を出す（公開範囲を3種類）
-- -------------------------------------------------------------
select pg_temp.login('a8a80000-0000-0000-0000-000000000001');  -- 選手1

insert into public.daily_reports
  (id, team_id, team_member_id, report_date, what_happened, visibility, status, submitted_at)
values
  ('e8e80000-0000-0000-0000-000000000001', 'b8b80000-0000-0000-0000-00000000000a',
   'd8d80000-0000-0000-0000-000000000001', '2026-08-10', 'コーチにも見せる', 'staff', 'submitted', now()),
  ('e8e80000-0000-0000-0000-000000000002', 'b8b80000-0000-0000-0000-00000000000a',
   'd8d80000-0000-0000-0000-000000000001', '2026-08-11', '自分だけのもの', 'private', 'submitted', now()),
  ('e8e80000-0000-0000-0000-000000000003', 'b8b80000-0000-0000-0000-00000000000a',
   'd8d80000-0000-0000-0000-000000000001', '2026-08-12', 'みんなに見せる', 'team', 'submitted', now());

select pg_temp.check('自分の日報は3件とも見える',
  (select count(*) from public.daily_reports), 3);

-- -------------------------------------------------------------
-- 2. コーチから見えるのは staff / team だけ
-- -------------------------------------------------------------
select pg_temp.login('a8a80000-0000-0000-0000-000000000003');  -- コーチ

select pg_temp.check('コーチには private が見えない',
  (select count(*) from public.daily_reports), 2);

-- staff 公開にはコメントできる
insert into public.report_feedbacks (id, team_id, daily_report_id, author_id, body)
values ('f8f80000-0000-0000-0000-000000000001', 'b8b80000-0000-0000-0000-00000000000a',
        'e8e80000-0000-0000-0000-000000000001', 'c8c80000-0000-0000-0000-000000000003',
        '切り替えが速くなっています。次は逆足も。');

select pg_temp.check('コーチは staff 公開の日報にコメントできる',
  (select count(*) from public.report_feedbacks), 1);

-- -------------------------------------------------------------
-- 3. **「自分だけ」の日報にはコメントできない**（0022 で塞いだ穴）
-- -------------------------------------------------------------
do $$
begin
  begin
    insert into public.report_feedbacks (team_id, daily_report_id, author_id, body)
    values ('b8b80000-0000-0000-0000-00000000000a', 'e8e80000-0000-0000-0000-000000000002',
            'c8c80000-0000-0000-0000-000000000003', '見えないはずの日報へ');
    raise exception 'NG: private の日報にコメントできてしまった';
  exception
    when insufficient_privilege then
      raise notice 'ok: private の日報にはコメントできない（RLS）';
    when raise_exception then
      if sqlerrm like 'NG:%' then raise; end if;
      raise notice 'ok: private の日報にはコメントできない（%）', sqlerrm;
  end;
end;
$$;

-- 差出人は偽れない
do $$
begin
  begin
    insert into public.report_feedbacks (team_id, daily_report_id, author_id, body)
    values ('b8b80000-0000-0000-0000-00000000000a', 'e8e80000-0000-0000-0000-000000000001',
            'c8c80000-0000-0000-0000-000000000004', 'コーチ2のふり');
    raise exception 'NG: 他人の名前でコメントできてしまった';
  exception
    when insufficient_privilege then
      raise notice 'ok: 他人の名前ではコメントできない（RLS）';
    when raise_exception then
      if sqlerrm like 'NG:%' then raise; end if;
      raise notice 'ok: 他人の名前ではコメントできない（%）', sqlerrm;
  end;
end;
$$;

-- 別チームの日報にもコメントできない（0011 の教訓）
do $$
begin
  begin
    insert into public.report_feedbacks (team_id, daily_report_id, author_id, body)
    values ('b8b80000-0000-0000-0000-00000000000b', 'e8e80000-0000-0000-0000-000000000001',
            'c8c80000-0000-0000-0000-000000000003', 'チームを偽る');
    raise exception 'NG: 別チームとしてコメントできてしまった';
  exception
    when insufficient_privilege then
      raise notice 'ok: 別チームとしてはコメントできない（RLS）';
    when raise_exception then
      if sqlerrm like 'NG:%' then raise; end if;
      raise notice 'ok: 別チームとしてはコメントできない（%）', sqlerrm;
  end;
end;
$$;

-- -------------------------------------------------------------
-- 4. コメントが見える範囲
-- -------------------------------------------------------------
select pg_temp.login('a8a80000-0000-0000-0000-000000000001');  -- 書かれた本人
select pg_temp.check('本人には自分の日報のコメントが見える',
  (select count(*) from public.report_feedbacks), 1);

select pg_temp.login('a8a80000-0000-0000-0000-000000000002');  -- 別の選手
select pg_temp.check('他の選手にはコメントが見えない',
  (select count(*) from public.report_feedbacks), 0);

select pg_temp.login('a8a80000-0000-0000-0000-000000000004');  -- 別のコーチ
select pg_temp.check('他のコーチにはコメントが見える',
  (select count(*) from public.report_feedbacks), 1);

select pg_temp.login('a8a80000-0000-0000-0000-000000000005');  -- 別チーム
select pg_temp.check('別チームにはコメントが見えない',
  (select count(*) from public.report_feedbacks), 0);

-- -------------------------------------------------------------
-- 5. team 公開の日報のコメントは、チームの誰からも見える
-- -------------------------------------------------------------
select pg_temp.login('a8a80000-0000-0000-0000-000000000003');  -- コーチ
insert into public.report_feedbacks (id, team_id, daily_report_id, author_id, body)
values ('f8f80000-0000-0000-0000-000000000002', 'b8b80000-0000-0000-0000-00000000000a',
        'e8e80000-0000-0000-0000-000000000003', 'c8c80000-0000-0000-0000-000000000003',
        'みんなの参考になります。');

select pg_temp.login('a8a80000-0000-0000-0000-000000000002');  -- 別の選手
select pg_temp.check('team 公開の日報のコメントは他の選手にも見える',
  (select count(*) from public.report_feedbacks), 1);

-- -------------------------------------------------------------
-- 6. 消せるのは書いた本人だけ
-- -------------------------------------------------------------
select pg_temp.login('a8a80000-0000-0000-0000-000000000004');  -- 書いていないコーチ
do $$
begin
  begin
    perform public.soft_delete_report_feedback('f8f80000-0000-0000-0000-000000000001');
    raise exception 'NG: 他人のコメントを消せてしまった';
  exception when raise_exception then
    if sqlerrm like 'NG:%' then raise; end if;
    raise notice 'ok: 他人のコメントは消せない（%）', sqlerrm;
  end;
end;
$$;

select pg_temp.login('a8a80000-0000-0000-0000-000000000001');  -- 書かれた側の選手
do $$
begin
  begin
    perform public.soft_delete_report_feedback('f8f80000-0000-0000-0000-000000000001');
    raise exception 'NG: 選手がコーチのコメントを消せてしまった';
  exception when raise_exception then
    if sqlerrm like 'NG:%' then raise; end if;
    raise notice 'ok: 選手はコーチのコメントを消せない（%）', sqlerrm;
  end;
end;
$$;

select pg_temp.login('a8a80000-0000-0000-0000-000000000003');  -- 書いた本人
select public.soft_delete_report_feedback('f8f80000-0000-0000-0000-000000000001');

select pg_temp.check('書いた本人は消せる',
  (select count(*) from public.report_feedbacks
   where id = 'f8f80000-0000-0000-0000-000000000001'), 0);

-- -------------------------------------------------------------
-- 7. 公開範囲を狭めると、コメントも見えなくなる
-- -------------------------------------------------------------
select pg_temp.login('a8a80000-0000-0000-0000-000000000001');  -- 選手1
update public.daily_reports set visibility = 'private'
where id = 'e8e80000-0000-0000-0000-000000000003';

select pg_temp.login('a8a80000-0000-0000-0000-000000000002');  -- 別の選手
select pg_temp.check('公開をやめたらコメントも見えなくなる',
  (select count(*) from public.report_feedbacks), 0);

select pg_temp.login('a8a80000-0000-0000-0000-000000000003');  -- コーチ
select pg_temp.check('コーチからも見えなくなる',
  (select count(*) from public.report_feedbacks), 0);

select pg_temp.login('a8a80000-0000-0000-0000-000000000001');  -- 本人
select pg_temp.check('本人には残って見える',
  (select count(*) from public.report_feedbacks), 1);

reset role;
rollback;
