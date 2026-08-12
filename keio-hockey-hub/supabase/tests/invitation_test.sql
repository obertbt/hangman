-- =============================================================
-- invitation_test.sql
-- 招待の入口（Phase 1 の積み残し）。
--
--   * 生のトークンは DB に残らない（残るのはハッシュ）
--   * コーチは選手しか招待できない。管理者だけが役割を渡せる
--   * 期限切れ・使用済みの招待は使えない
--   * 使い切り。1つのリンクで2人目は作れない
--   * 移行で登録済みの部員に、ログインを結び付けられる（ADR-0002）
--   * 招待は、まだログインしていない人からも引ける（他人の情報は出さない）
--
-- 実行方法は rls_test.sql と同じ。
-- =============================================================

\set ON_ERROR_STOP on

begin;

-- 準備 --------------------------------------------------------
insert into auth.users (id, email) values
  ('a7a70000-0000-0000-0000-000000000001', 'iv-admin@example.com'),
  ('a7a70000-0000-0000-0000-000000000002', 'iv-coach@example.com'),
  ('a7a70000-0000-0000-0000-000000000003', 'iv-player@example.com'),
  -- 招待を受ける側（まだプロフィールを持たない）
  ('a7a70000-0000-0000-0000-000000000009', 'iv-newcomer@example.com'),
  ('a7a70000-0000-0000-0000-00000000000a', 'iv-newcomer2@example.com');

insert into public.teams (id, name, display_name, slug) values
  ('b7b70000-0000-0000-0000-00000000000a', 'iv-team', '招待テスト部', 'iv-team'),
  ('b7b70000-0000-0000-0000-00000000000b', 'iv-other', 'よその部', 'iv-other');

insert into public.profiles (id, user_id, full_name) values
  ('c7c70000-0000-0000-0000-000000000001', 'a7a70000-0000-0000-0000-000000000001', '管理者'),
  ('c7c70000-0000-0000-0000-000000000002', 'a7a70000-0000-0000-0000-000000000002', 'コーチ'),
  ('c7c70000-0000-0000-0000-000000000003', 'a7a70000-0000-0000-0000-000000000003', '選手'),
  -- 移行で登録したが、まだログインしていない部員（ADR-0002）
  ('c7c70000-0000-0000-0000-000000000004', null, '新入部員'),
  ('c7c70000-0000-0000-0000-000000000005', null, 'よその部員');

insert into public.team_members (id, team_id, profile_id, role_code) values
  ('d7d70000-0000-0000-0000-000000000001', 'b7b70000-0000-0000-0000-00000000000a', 'c7c70000-0000-0000-0000-000000000001', 'system_admin'),
  ('d7d70000-0000-0000-0000-000000000002', 'b7b70000-0000-0000-0000-00000000000a', 'c7c70000-0000-0000-0000-000000000002', 'coach'),
  ('d7d70000-0000-0000-0000-000000000003', 'b7b70000-0000-0000-0000-00000000000a', 'c7c70000-0000-0000-0000-000000000003', 'player'),
  ('d7d70000-0000-0000-0000-000000000004', 'b7b70000-0000-0000-0000-00000000000a', 'c7c70000-0000-0000-0000-000000000004', 'player'),
  ('d7d70000-0000-0000-0000-000000000005', 'b7b70000-0000-0000-0000-00000000000b', 'c7c70000-0000-0000-0000-000000000005', 'player');

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

-- 生のトークンは "raw-token-..."、DB に入れるのは sha256
create or replace function pg_temp.hash(p_token text) returns text language sql as $$
  select encode(digest(p_token, 'sha256'), 'hex');
$$;

set local role authenticated;

-- -------------------------------------------------------------
-- 1. コーチは選手しか招待できない（0018 の抜け道を塞ぐ）
-- -------------------------------------------------------------
select pg_temp.login('a7a70000-0000-0000-0000-000000000002');  -- コーチ

do $$
begin
  begin
    insert into public.team_invitations (team_id, email, role_code, token_hash, expires_at)
    values ('b7b70000-0000-0000-0000-00000000000a', 'x@example.com', 'system_admin',
            pg_temp.hash('raw-token-escalate'), now() + interval '14 days');
    raise exception 'NG: コーチが管理者を招待できてしまった';
  exception when raise_exception then
    if sqlerrm like 'NG:%' then raise; end if;
    raise notice 'ok: コーチは管理者を招待できない（%）', sqlerrm;
  end;
end;
$$;

insert into public.team_invitations (id, team_id, team_member_id, email, role_code, token_hash, invited_by, expires_at)
values ('e7e70000-0000-0000-0000-000000000001', 'b7b70000-0000-0000-0000-00000000000a',
        'd7d70000-0000-0000-0000-000000000004', 'iv-newcomer@example.com', 'player',
        pg_temp.hash('raw-token-newcomer'), 'c7c70000-0000-0000-0000-000000000002',
        now() + interval '14 days');

select pg_temp.check('コーチは選手を招待できる',
  (select count(*) from public.team_invitations), 1);

-- 生の値は残っていない
select pg_temp.check('DB に生のトークンは無い',
  (select count(*) from public.team_invitations where token_hash like 'raw-token%'), 0);

select pg_temp.check('残っているのはハッシュ',
  (select count(*) from public.team_invitations
   where token_hash = pg_temp.hash('raw-token-newcomer')), 1);

-- 別チームの部員は招待できない（0011 の教訓）
do $$
begin
  begin
    insert into public.team_invitations (team_id, team_member_id, email, role_code, token_hash, expires_at)
    values ('b7b70000-0000-0000-0000-00000000000a', 'd7d70000-0000-0000-0000-000000000005',
            'y@example.com', 'player', pg_temp.hash('raw-token-other'), now() + interval '14 days');
    raise exception 'NG: 別チームの部員を招待できてしまった';
  exception
    when insufficient_privilege then
      raise notice 'ok: 別チームの部員は招待できない（RLS）';
    when raise_exception then
      if sqlerrm like 'NG:%' then raise; end if;
      raise notice 'ok: 別チームの部員は招待できない（%）', sqlerrm;
  end;
end;
$$;

-- 期限が過去の招待は作れない
do $$
begin
  begin
    insert into public.team_invitations (team_id, email, role_code, token_hash, expires_at)
    values ('b7b70000-0000-0000-0000-00000000000a', 'z@example.com', 'player',
            pg_temp.hash('raw-token-past'), now() - interval '1 day');
    raise exception 'NG: 期限切れの招待を作れてしまった';
  exception when raise_exception then
    if sqlerrm like 'NG:%' then raise; end if;
    raise notice 'ok: 期限が過去の招待は作れない（%）', sqlerrm;
  end;
end;
$$;

-- 管理者なら役割を渡せる
select pg_temp.login('a7a70000-0000-0000-0000-000000000001');  -- 管理者
insert into public.team_invitations (id, team_id, email, role_code, token_hash, invited_by, expires_at)
values ('e7e70000-0000-0000-0000-000000000002', 'b7b70000-0000-0000-0000-00000000000a',
        'iv-newcoach@example.com', 'coach', pg_temp.hash('raw-token-coach'),
        'c7c70000-0000-0000-0000-000000000001', now() + interval '14 days');

select pg_temp.check('管理者はコーチを招待できる',
  (select count(*) from public.team_invitations where role_code = 'coach'), 1);

-- 選手は招待を作れない
select pg_temp.login('a7a70000-0000-0000-0000-000000000003');  -- 選手
do $$
begin
  begin
    insert into public.team_invitations (team_id, email, role_code, token_hash, expires_at)
    values ('b7b70000-0000-0000-0000-00000000000a', 'w@example.com', 'player',
            pg_temp.hash('raw-token-player'), now() + interval '14 days');
    raise exception 'NG: 選手が招待を作れてしまった';
  exception
    when insufficient_privilege then
      raise notice 'ok: 選手は招待を作れない（RLS）';
    when raise_exception then
      if sqlerrm like 'NG:%' then raise; end if;
      raise notice 'ok: 選手は招待を作れない（%）', sqlerrm;
  end;
end;
$$;

-- -------------------------------------------------------------
-- 2. 受け取る側は、まだログインしていない
-- -------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select pg_temp.check('未ログインでも招待の内容は引ける',
  (select count(*) from public.find_invitation(pg_temp.hash('raw-token-newcomer'))), 1);

select pg_temp.check('招待された人の名前が出る',
  (select count(*) from public.find_invitation(pg_temp.hash('raw-token-newcomer'))
   where invited_name = '新入部員' and team_name = '招待テスト部'), 1);

-- トークンを知らなければ何も出ない
select pg_temp.check('でたらめなトークンでは何も出ない',
  (select count(*) from public.find_invitation(pg_temp.hash('raw-token-guess'))), 0);

-- 招待の表そのものは読めない。
-- RLS で0件になるのではなく、anon には権限ごと無い（0010）。
do $$
begin
  begin
    perform count(*) from public.team_invitations;
    raise exception 'NG: 未ログインから招待の表を読めてしまった';
  exception
    when insufficient_privilege then
      raise notice 'ok: 未ログインから招待の表は読めない（権限なし）';
    when raise_exception then
      if sqlerrm like 'NG:%' then raise; end if;
      raise notice 'ok: 未ログインから招待の表は読めない（%）', sqlerrm;
  end;
end;
$$;

-- -------------------------------------------------------------
-- 3. 招待を受ける（移行で登録済みの部員に結び付ける）
-- -------------------------------------------------------------
select public.accept_invitation(
  pg_temp.hash('raw-token-newcomer'),
  'a7a70000-0000-0000-0000-000000000009',
  '新入部員');

set local role postgres;
select pg_temp.check('ログインが部員に結び付く',
  (select count(*) from public.profiles
   where id = 'c7c70000-0000-0000-0000-000000000004'
     and user_id = 'a7a70000-0000-0000-0000-000000000009'), 1);

select pg_temp.check('部員が増えたわけではない',
  (select count(*) from public.team_members
   where team_id = 'b7b70000-0000-0000-0000-00000000000a'), 4);

select pg_temp.check('招待は使用済みになる',
  (select count(*) from public.team_invitations
   where id = 'e7e70000-0000-0000-0000-000000000001' and accepted_at is not null), 1);

select pg_temp.check('参加が監査ログに残る',
  (select count(*) from public.audit_logs where action = 'invitation.accept'), 1);
set local role anon;

-- 使い切り。同じリンクで2人目は作れない
do $$
begin
  begin
    perform public.accept_invitation(
      pg_temp.hash('raw-token-newcomer'),
      'a7a70000-0000-0000-0000-00000000000a',
      '別の人');
    raise exception 'NG: 使用済みの招待をもう一度使えてしまった';
  exception when raise_exception then
    if sqlerrm like 'NG:%' then raise; end if;
    raise notice 'ok: 使用済みの招待は使えない（%）', sqlerrm;
  end;
end;
$$;

-- 同じ利用者が2つのプロフィールを持たない
do $$
begin
  begin
    perform public.accept_invitation(
      pg_temp.hash('raw-token-coach'),
      'a7a70000-0000-0000-0000-000000000009',
      'すでに登録済みの人');
    raise exception 'NG: 1人が2つのプロフィールを持ててしまった';
  exception when raise_exception then
    if sqlerrm like 'NG:%' then raise; end if;
    raise notice 'ok: 1人が2つのプロフィールを持てない（%）', sqlerrm;
  end;
end;
$$;

-- -------------------------------------------------------------
-- 4. 名簿に無い人を新しく迎える
-- -------------------------------------------------------------
select public.accept_invitation(
  pg_temp.hash('raw-token-coach'),
  'a7a70000-0000-0000-0000-00000000000a',
  '新しいコーチ');

set local role postgres;
select pg_temp.check('新しい部員が作られる',
  (select count(*) from public.team_members
   where team_id = 'b7b70000-0000-0000-0000-00000000000a'), 5);

select pg_temp.check('招待した役割で入る',
  (select count(*) from public.team_members tm
   join public.profiles p on p.id = tm.profile_id
   where p.user_id = 'a7a70000-0000-0000-0000-00000000000a' and tm.role_code = 'coach'), 1);
set local role anon;

-- -------------------------------------------------------------
-- 5. 期限切れの招待は使えない
-- -------------------------------------------------------------
set local role postgres;
insert into public.team_invitations (id, team_id, email, role_code, token_hash, expires_at)
values ('e7e70000-0000-0000-0000-000000000003', 'b7b70000-0000-0000-0000-00000000000a',
        'iv-late@example.com', 'player', pg_temp.hash('raw-token-late'),
        now() + interval '14 days');
-- トリガを通さずに期限だけ過去へ（時間の経過を作る）
update public.team_invitations set expires_at = now() - interval '1 day'
where id = 'e7e70000-0000-0000-0000-000000000003';
set local role anon;

select pg_temp.check('期限切れでも内容は引ける（理由を伝えるため）',
  (select count(*) from public.find_invitation(pg_temp.hash('raw-token-late'))), 1);

do $$
begin
  begin
    perform public.accept_invitation(
      pg_temp.hash('raw-token-late'),
      'a7a70000-0000-0000-0000-000000000009',
      '遅れた人');
    raise exception 'NG: 期限切れの招待を使えてしまった';
  exception when raise_exception then
    if sqlerrm like 'NG:%' then raise; end if;
    raise notice 'ok: 期限切れの招待は使えない（%）', sqlerrm;
  end;
end;
$$;

reset role;
rollback;
