-- =============================================================
-- role_test.sql
-- 役割と権限の変更（13章・63章）。
--
--   * 役割を変えられるのは管理者だけ
--   * **マネージャーが自分を管理者に昇格できない**（0018 で塞いだ穴）
--   * 自分の役割は自分で変えられない
--   * 最後の管理者を降格・退部させられない
--   * 役割と権限の変更は監査ログに残る
--   * 名簿の編集（背番号など）はスタッフが今までどおりできる
--
-- 実行方法は rls_test.sql と同じ。
-- =============================================================

\set ON_ERROR_STOP on

begin;

-- 準備 --------------------------------------------------------
insert into auth.users (id, email) values
  ('a5a50000-0000-0000-0000-000000000001', 'rl-admin@example.com'),
  ('a5a50000-0000-0000-0000-000000000002', 'rl-manager@example.com'),
  ('a5a50000-0000-0000-0000-000000000003', 'rl-player@example.com'),
  ('a5a50000-0000-0000-0000-000000000004', 'rl-admin2@example.com');

insert into public.teams (id, name, display_name, slug) values
  ('b5b50000-0000-0000-0000-00000000000a', 'rl-team', '役割テスト', 'rl-team');

insert into public.profiles (id, user_id, full_name) values
  ('c5c50000-0000-0000-0000-000000000001', 'a5a50000-0000-0000-0000-000000000001', '管理者'),
  ('c5c50000-0000-0000-0000-000000000002', 'a5a50000-0000-0000-0000-000000000002', 'マネージャー'),
  ('c5c50000-0000-0000-0000-000000000003', 'a5a50000-0000-0000-0000-000000000003', '選手'),
  ('c5c50000-0000-0000-0000-000000000004', 'a5a50000-0000-0000-0000-000000000004', '管理者2');

insert into public.team_members (id, team_id, profile_id, role_code, jersey_number) values
  ('d5d50000-0000-0000-0000-000000000001', 'b5b50000-0000-0000-0000-00000000000a', 'c5c50000-0000-0000-0000-000000000001', 'system_admin', null),
  ('d5d50000-0000-0000-0000-000000000002', 'b5b50000-0000-0000-0000-00000000000a', 'c5c50000-0000-0000-0000-000000000002', 'manager', null),
  ('d5d50000-0000-0000-0000-000000000003', 'b5b50000-0000-0000-0000-00000000000a', 'c5c50000-0000-0000-0000-000000000003', 'player', 7);

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
-- 1. **マネージャーが自分を管理者に昇格できない**（0018 で塞いだ穴）
-- -------------------------------------------------------------
select pg_temp.login('a5a50000-0000-0000-0000-000000000002');  -- マネージャー

do $$
begin
  begin
    update public.team_members set role_code = 'system_admin'
    where id = 'd5d50000-0000-0000-0000-000000000002';
    raise exception 'NG: マネージャーが自分を管理者にできてしまった';
  exception when raise_exception then
    if sqlerrm like 'NG:%' then raise; end if;
    raise notice 'ok: マネージャーは自分を管理者にできない（%）', sqlerrm;
  end;
end;
$$;

-- 他人の役割も変えられない
do $$
begin
  begin
    update public.team_members set role_code = 'coach'
    where id = 'd5d50000-0000-0000-0000-000000000003';
    raise exception 'NG: マネージャーが他人の役割を変えられてしまった';
  exception when raise_exception then
    if sqlerrm like 'NG:%' then raise; end if;
    raise notice 'ok: マネージャーは他人の役割も変えられない（%）', sqlerrm;
  end;
end;
$$;

-- 名簿の編集は今までどおりできる（締めすぎていないことの確認）
update public.team_members set jersey_number = 10
where id = 'd5d50000-0000-0000-0000-000000000003';

select pg_temp.check('スタッフは背番号を直せる',
  (select count(*) from public.team_members
   where id = 'd5d50000-0000-0000-0000-000000000003' and jersey_number = 10), 1);

-- -------------------------------------------------------------
-- 2. 選手は何も変えられない
-- -------------------------------------------------------------
select pg_temp.login('a5a50000-0000-0000-0000-000000000003');  -- 選手

do $$
begin
  begin
    update public.team_members set role_code = 'coach'
    where id = 'd5d50000-0000-0000-0000-000000000003';
    if not found then
      raise notice 'ok: 選手は自分の役割を変えられない（RLS で対象外）';
    else
      raise exception 'NG: 選手が自分の役割を変えられてしまった';
    end if;
  exception when raise_exception then
    if sqlerrm like 'NG:%' then raise; end if;
    raise notice 'ok: 選手は自分の役割を変えられない（%）', sqlerrm;
  end;
end;
$$;

-- -------------------------------------------------------------
-- 3. 管理者は他人の役割を変えられる。自分のは変えられない
-- -------------------------------------------------------------
select pg_temp.login('a5a50000-0000-0000-0000-000000000001');  -- 管理者

update public.team_members set role_code = 'coach'
where id = 'd5d50000-0000-0000-0000-000000000003';

select pg_temp.check('管理者は他人の役割を変えられる',
  (select count(*) from public.team_members
   where id = 'd5d50000-0000-0000-0000-000000000003' and role_code = 'coach'), 1);

do $$
begin
  begin
    update public.team_members set role_code = 'coach'
    where id = 'd5d50000-0000-0000-0000-000000000001';
    raise exception 'NG: 管理者が自分の役割を変えられてしまった';
  exception when raise_exception then
    if sqlerrm like 'NG:%' then raise; end if;
    raise notice 'ok: 管理者でも自分の役割は変えられない（%）', sqlerrm;
  end;
end;
$$;

-- -------------------------------------------------------------
-- 4. 最後の管理者を締め出せない
-- -------------------------------------------------------------
-- 管理者が1人しかいない状態で、その人を退部させようとする
do $$
begin
  begin
    update public.team_members set status = 'graduated'
    where id = 'd5d50000-0000-0000-0000-000000000001';
    raise exception 'NG: 最後の管理者を退部させられてしまった';
  exception when raise_exception then
    if sqlerrm like 'NG:%' then raise; end if;
    raise notice 'ok: 最後の管理者は退部させられない（%）', sqlerrm;
  end;
end;
$$;

-- 2人目の管理者を作れば、1人目を降ろせる
insert into public.team_members (id, team_id, profile_id, role_code) values
  ('d5d50000-0000-0000-0000-000000000004', 'b5b50000-0000-0000-0000-00000000000a',
   'c5c50000-0000-0000-0000-000000000004', 'system_admin');

select pg_temp.login('a5a50000-0000-0000-0000-000000000004');  -- 管理者2

update public.team_members set status = 'graduated'
where id = 'd5d50000-0000-0000-0000-000000000001';

select pg_temp.check('管理者が2人いれば1人を退部させられる',
  (select count(*) from public.team_members
   where id = 'd5d50000-0000-0000-0000-000000000001' and status = 'graduated'), 1);

-- -------------------------------------------------------------
-- 5. 監査ログ（63章）
-- -------------------------------------------------------------
set local role postgres;
select pg_temp.check('役割の変更が監査ログに残る',
  (select count(*) from public.audit_logs where action = 'member.role_change'), 1);

select pg_temp.check('変更の前後が残る',
  (select count(*) from public.audit_logs
   where action = 'member.role_change'
     and before_value ->> 'role_code' = 'player'
     and after_value ->> 'role_code' = 'coach'), 1);
set local role authenticated;

-- -------------------------------------------------------------
-- 6. 個別権限
-- -------------------------------------------------------------
insert into public.member_permissions (team_member_id, permission_code, granted, granted_by)
values ('d5d50000-0000-0000-0000-000000000003', 'import.execute', true,
        'c5c50000-0000-0000-0000-000000000004');

select pg_temp.check('管理者は個別権限を付けられる',
  (select count(*) from public.member_permissions), 1);

set local role postgres;
select pg_temp.check('権限の変更も監査ログに残る',
  (select count(*) from public.audit_logs where action = 'member.permission_change'), 1);
set local role authenticated;

-- 付けた権限が実際に効く（13章: 個別権限が役割より優先）
select pg_temp.login('a5a50000-0000-0000-0000-000000000003');  -- 権限を付けられた人
select pg_temp.check('付けた権限が効く',
  (select case when app.has_permission('b5b50000-0000-0000-0000-00000000000a', 'import.execute')
          then 1 else 0 end), 1);

-- マネージャーは個別権限を付けられない
select pg_temp.login('a5a50000-0000-0000-0000-000000000002');  -- マネージャー
do $$
begin
  begin
    insert into public.member_permissions (team_member_id, permission_code, granted)
    values ('d5d50000-0000-0000-0000-000000000002', 'import.execute', true);
    raise exception 'NG: マネージャーが自分に権限を付けられてしまった';
  exception
    when insufficient_privilege then
      raise notice 'ok: マネージャーは個別権限を付けられない（RLS）';
    when raise_exception then
      if sqlerrm like 'NG:%' then raise; end if;
      raise notice 'ok: マネージャーは個別権限を付けられない（%）', sqlerrm;
  end;
end;
$$;

reset role;
rollback;
