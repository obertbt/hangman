-- =============================================================
-- feedback_test.sql
-- Phase 6: 質問 → 回答 → 確認 → 次回課題 の一周を確かめる。
--
--   * コーチが回答でき、状態が answered になる
--   * 回答は上書きされず、追記される（55章）
--   * 選手が確認できる。コーチは確認できない
--   * 再質問で follow_up に戻り、もう一度回答できる
--   * コーチは一方的に team 公開へ変えられない（29章）
--   * 回答の next_task が次の練習の目標につながる
--
-- 実行方法は rls_test.sql と同じ。
-- =============================================================

\set ON_ERROR_STOP on

begin;

-- 準備 --------------------------------------------------------
insert into auth.users (id, email) values
  ('aaaa1111-0000-0000-0000-000000000001', 'fb-player@example.com'),
  ('aaaa1111-0000-0000-0000-000000000002', 'fb-coach@example.com'),
  ('aaaa1111-0000-0000-0000-000000000003', 'fb-other@example.com');

insert into public.teams (id, name, display_name, slug)
values ('bbbb1111-0000-0000-0000-000000000001', 'fb-team', 'フィードバック検証チーム', 'fb-team');

insert into public.profiles (id, user_id, full_name) values
  ('cccc1111-0000-0000-0000-000000000001', 'aaaa1111-0000-0000-0000-000000000001', '選手'),
  ('cccc1111-0000-0000-0000-000000000002', 'aaaa1111-0000-0000-0000-000000000002', 'コーチ'),
  ('cccc1111-0000-0000-0000-000000000003', 'aaaa1111-0000-0000-0000-000000000003', '別の選手');

insert into public.team_members (id, team_id, profile_id, role_code) values
  ('dddd1111-0000-0000-0000-000000000001', 'bbbb1111-0000-0000-0000-000000000001',
   'cccc1111-0000-0000-0000-000000000001', 'player'),
  ('dddd1111-0000-0000-0000-000000000002', 'bbbb1111-0000-0000-0000-000000000001',
   'cccc1111-0000-0000-0000-000000000002', 'coach'),
  ('dddd1111-0000-0000-0000-000000000003', 'bbbb1111-0000-0000-0000-000000000001',
   'cccc1111-0000-0000-0000-000000000003', 'player');

insert into public.videos (id, team_id, provider, provider_video_id, title, duration_seconds, visibility, created_by)
values ('eeee1111-0000-0000-0000-000000000001', 'bbbb1111-0000-0000-0000-000000000001',
        'youtube', 'dQw4w9WgXcQ', '練習試合', 3600, 'team', 'cccc1111-0000-0000-0000-000000000001');

insert into public.feedback_requests
  (id, team_id, requester_id, video_id, question_type, question, status, visibility, submitted_at)
values ('ffff1111-0000-0000-0000-000000000001', 'bbbb1111-0000-0000-0000-000000000001',
        'dddd1111-0000-0000-0000-000000000001', 'eeee1111-0000-0000-0000-000000000001',
        'judgement', '内側に運ぶべきでしたか', 'submitted', 'private_staff', now() - interval '4 days');

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

create or replace function pg_temp.check_text(p_label text, p_actual text, p_expected text)
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
-- 1. コーチが担当して回答する
-- -------------------------------------------------------------
select pg_temp.login('aaaa1111-0000-0000-0000-000000000002');  -- コーチ

update public.feedback_requests
set status = 'assigned', assigned_coach_id = 'dddd1111-0000-0000-0000-000000000002', assigned_at = now()
where id = 'ffff1111-0000-0000-0000-000000000001';

insert into public.feedback_responses
  (id, team_id, feedback_request_id, responder_id, conclusion, next_task)
values ('11112222-0000-0000-0000-000000000001', 'bbbb1111-0000-0000-0000-000000000001',
        'ffff1111-0000-0000-0000-000000000001', 'dddd1111-0000-0000-0000-000000000002',
        '内側で合っています', '受ける前に内側を1回見る');

update public.feedback_requests set status = 'answered', answered_at = now()
where id = 'ffff1111-0000-0000-0000-000000000001';

select pg_temp.check('コーチは回答できる', (select count(*) from public.feedback_responses), 1);
select pg_temp.check_text('状態が answered になる',
  (select status from public.feedback_requests where id = 'ffff1111-0000-0000-0000-000000000001'),
  'answered');

-- 状態の履歴が自動で残る（0006 のトリガ）
select pg_temp.check('状態の履歴が残る',
  (select count(*) from public.feedback_status_histories
   where feedback_request_id = 'ffff1111-0000-0000-0000-000000000001'), 2);

-- -------------------------------------------------------------
-- 2. 他の選手からは見えない（29章: 既定は private_staff）
-- -------------------------------------------------------------
select pg_temp.login('aaaa1111-0000-0000-0000-000000000003');  -- 別の選手
select pg_temp.check('他の選手からは質問が見えない', (select count(*) from public.feedback_requests), 0);
select pg_temp.check('他の選手からは回答も見えない', (select count(*) from public.feedback_responses), 0);

-- -------------------------------------------------------------
-- 3. 選手が確認する
-- -------------------------------------------------------------
select pg_temp.login('aaaa1111-0000-0000-0000-000000000001');  -- 質問した選手

select pg_temp.check('本人は回答を見られる', (select count(*) from public.feedback_responses), 1);

update public.feedback_requests set status = 'acknowledged', acknowledged_at = now()
where id = 'ffff1111-0000-0000-0000-000000000001';

select pg_temp.check_text('選手が確認すると acknowledged になる',
  (select status from public.feedback_requests where id = 'ffff1111-0000-0000-0000-000000000001'),
  'acknowledged');

-- -------------------------------------------------------------
-- 4. 再質問すると follow_up に戻り、もう一度回答できる（55章: 追記）
-- -------------------------------------------------------------
insert into public.feedback_messages
  (team_id, feedback_request_id, sender_id, message_type, body)
values ('bbbb1111-0000-0000-0000-000000000001', 'ffff1111-0000-0000-0000-000000000001',
        'dddd1111-0000-0000-0000-000000000001', 'follow_up_question', 'その場合の体の向きは？');

update public.feedback_requests set status = 'follow_up'
where id = 'ffff1111-0000-0000-0000-000000000001';

select pg_temp.check_text('再質問で follow_up になる',
  (select status from public.feedback_requests where id = 'ffff1111-0000-0000-0000-000000000001'),
  'follow_up');

select pg_temp.login('aaaa1111-0000-0000-0000-000000000002');  -- コーチ

insert into public.feedback_responses
  (team_id, feedback_request_id, responder_id, conclusion, next_task)
values ('bbbb1111-0000-0000-0000-000000000001', 'ffff1111-0000-0000-0000-000000000001',
        'dddd1111-0000-0000-0000-000000000002', '半身で受けてください', '半身で受ける形を3回試す');

update public.feedback_requests set status = 'answered', answered_at = now()
where id = 'ffff1111-0000-0000-0000-000000000001';

-- 55章: 過去の回答は消えない
select pg_temp.check('回答は上書きされず2件になる', (select count(*) from public.feedback_responses), 2);
select pg_temp.check('最初の回答が残っている',
  (select count(*) from public.feedback_responses where conclusion = '内側で合っています'), 1);

-- -------------------------------------------------------------
-- 5. 不正な状態遷移は DB が拒む（27章）
-- -------------------------------------------------------------
do $$
begin
  begin
    update public.feedback_requests set status = 'submitted'
    where id = 'ffff1111-0000-0000-0000-000000000001';
    raise exception 'NG: answered から submitted へ戻せてしまった';
  exception when raise_exception then
    if sqlerrm like 'NG:%' then raise; end if;
    raise notice 'ok: answered から submitted へは戻せない';
  end;
end;
$$;

-- -------------------------------------------------------------
-- 6. コーチは一方的に team 公開へ変えられない（29章）
-- -------------------------------------------------------------
insert into public.feedback_share_requests
  (id, team_id, feedback_request_id, requested_by, target_visibility)
values ('22223333-0000-0000-0000-000000000001', 'bbbb1111-0000-0000-0000-000000000001',
        'ffff1111-0000-0000-0000-000000000001', 'dddd1111-0000-0000-0000-000000000002', 'team');

update public.feedback_share_requests set status = 'approved'
where id = '22223333-0000-0000-0000-000000000001';

select pg_temp.check('コーチは自分の共有提案を承認できない',
  (select count(*) from public.feedback_share_requests where status = 'approved'), 0);

-- 選手が承認して初めて公開される
select pg_temp.login('aaaa1111-0000-0000-0000-000000000001');
update public.feedback_share_requests set status = 'approved', responded_at = now()
where id = '22223333-0000-0000-0000-000000000001';
update public.feedback_requests set visibility = 'team'
where id = 'ffff1111-0000-0000-0000-000000000001';

select pg_temp.check('選手が承認すると team 公開になる',
  (select count(*) from public.feedback_requests
   where id = 'ffff1111-0000-0000-0000-000000000001' and visibility = 'team'), 1);

-- 公開されたので、他の選手からも見えるようになる
select pg_temp.login('aaaa1111-0000-0000-0000-000000000003');
select pg_temp.check('承認後は他の選手からも見える', (select count(*) from public.feedback_requests), 1);

-- -------------------------------------------------------------
-- 7. 回答の next_task が次の練習の目標につながる（循環）
-- -------------------------------------------------------------
select pg_temp.login('aaaa1111-0000-0000-0000-000000000001');

insert into public.practice_goals
  (team_id, team_member_id, target_date, goal, source_feedback_id)
values ('bbbb1111-0000-0000-0000-000000000001', 'dddd1111-0000-0000-0000-000000000001',
        current_date, '半身で受ける形を3回試す', 'ffff1111-0000-0000-0000-000000000001');

select pg_temp.check('コーチの回答から次の練習の目標が作られる',
  (select count(*) from public.practice_goals
   where source_feedback_id = 'ffff1111-0000-0000-0000-000000000001'), 1);

select pg_temp.check_text('目標の中身が回答の next_task と一致する',
  (select goal from public.practice_goals
   where source_feedback_id = 'ffff1111-0000-0000-0000-000000000001'),
  '半身で受ける形を3回試す');

reset role;
rollback;
