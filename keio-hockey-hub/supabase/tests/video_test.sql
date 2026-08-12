-- =============================================================
-- video_test.sql
-- Phase 5 の書き込み経路を RLS の下で確かめる。
--
--   * 選手は動画を登録でき、仮想クリップを作れる
--   * 選手は質問を投稿できる（video.feedback_request）
--   * 他の選手からは private_staff の質問が見えない
--   * コーチからは見える（video.feedback_answer）
--   * 別チームからは何も見えない
--
-- 実行方法は rls_test.sql と同じ。
-- =============================================================

\set ON_ERROR_STOP on

begin;

-- 準備 --------------------------------------------------------
insert into auth.users (id, email) values
  ('11110000-0000-0000-0000-000000000001', 'v-player1@example.com'),
  ('11110000-0000-0000-0000-000000000002', 'v-player2@example.com'),
  ('11110000-0000-0000-0000-000000000003', 'v-coach@example.com'),
  ('11110000-0000-0000-0000-000000000004', 'v-other@example.com');

insert into public.teams (id, name, display_name, slug) values
  ('22220000-0000-0000-0000-00000000000a', 'v-team-a', '動画チームA', 'v-team-a'),
  ('22220000-0000-0000-0000-00000000000b', 'v-team-b', '動画チームB', 'v-team-b');

insert into public.profiles (id, user_id, full_name) values
  ('33330000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001', '選手1'),
  ('33330000-0000-0000-0000-000000000002', '11110000-0000-0000-0000-000000000002', '選手2'),
  ('33330000-0000-0000-0000-000000000003', '11110000-0000-0000-0000-000000000003', 'コーチ'),
  ('33330000-0000-0000-0000-000000000004', '11110000-0000-0000-0000-000000000004', '別チーム選手');

insert into public.team_members (id, team_id, profile_id, role_code) values
  ('44440000-0000-0000-0000-000000000001', '22220000-0000-0000-0000-00000000000a', '33330000-0000-0000-0000-000000000001', 'player'),
  ('44440000-0000-0000-0000-000000000002', '22220000-0000-0000-0000-00000000000a', '33330000-0000-0000-0000-000000000002', 'player'),
  ('44440000-0000-0000-0000-000000000003', '22220000-0000-0000-0000-00000000000a', '33330000-0000-0000-0000-000000000003', 'coach'),
  ('44440000-0000-0000-0000-000000000004', '22220000-0000-0000-0000-00000000000b', '33330000-0000-0000-0000-000000000004', 'player');

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
-- 1. 選手が動画を登録する（player は video.upload を持つ）
-- -------------------------------------------------------------
select pg_temp.login('11110000-0000-0000-0000-000000000001');

insert into public.videos
  (id, team_id, provider, provider_video_id, title, duration_seconds, visibility, created_by)
values
  ('55550000-0000-0000-0000-000000000001', '22220000-0000-0000-0000-00000000000a',
   'youtube', 'dQw4w9WgXcQ', '練習試合', 3600, 'team', '33330000-0000-0000-0000-000000000001');

select pg_temp.check('選手は動画を登録できる', (select count(*) from public.videos), 1);

-- -------------------------------------------------------------
-- 2. 仮想クリップを作る（18章の例: 12:34〜12:48）
-- -------------------------------------------------------------
insert into public.video_clips
  (id, team_id, video_id, created_by, start_seconds, end_seconds, title)
values
  ('66660000-0000-0000-0000-000000000001', '22220000-0000-0000-0000-00000000000a',
   '55550000-0000-0000-0000-000000000001', '33330000-0000-0000-0000-000000000001',
   754, 768, '右サイドの1対1');

select pg_temp.check('選手は仮想クリップを作れる', (select count(*) from public.video_clips), 1);

-- 動画本体は増えない（実ファイルを切り出さない）
select pg_temp.check('クリップを作っても動画は増えない', (select count(*) from public.videos), 1);

-- -------------------------------------------------------------
-- 3. 質問を投稿する（既定の公開範囲は private_staff）
-- -------------------------------------------------------------
insert into public.feedback_requests
  (id, team_id, requester_id, video_id, video_clip_id, question_type, question, status, visibility, submitted_at)
values
  ('77770000-0000-0000-0000-000000000001', '22220000-0000-0000-0000-00000000000a',
   '44440000-0000-0000-0000-000000000001',
   '55550000-0000-0000-0000-000000000001', '66660000-0000-0000-0000-000000000001',
   'judgement', '内側に運ぶべきでしたか', 'submitted', 'private_staff', now());

select pg_temp.check('選手は質問を投稿できる', (select count(*) from public.feedback_requests), 1);

-- 本人からは見える
select pg_temp.check('本人は自分の質問を見られる',
  (select count(*) from public.feedback_requests where id = '77770000-0000-0000-0000-000000000001'), 1);

-- -------------------------------------------------------------
-- 4. 他の選手からは見えない（29章: 既定は private_staff）
-- -------------------------------------------------------------
select pg_temp.login('11110000-0000-0000-0000-000000000002');
select pg_temp.check('他の選手からは質問が見えない',
  (select count(*) from public.feedback_requests), 0);

-- ただし team 公開の動画そのものは見える
select pg_temp.check('team 公開の動画は他の選手にも見える',
  (select count(*) from public.videos where id = '55550000-0000-0000-0000-000000000001'), 1);

-- -------------------------------------------------------------
-- 5. コーチからは見える（video.feedback_answer を持つ）
-- -------------------------------------------------------------
select pg_temp.login('11110000-0000-0000-0000-000000000003');
select pg_temp.check('コーチは質問を見られる',
  (select count(*) from public.feedback_requests), 1);

-- -------------------------------------------------------------
-- 6. 別チームからは何も見えない
-- -------------------------------------------------------------
select pg_temp.login('11110000-0000-0000-0000-000000000004');
select pg_temp.check('別チームからは動画が見えない', (select count(*) from public.videos), 0);
select pg_temp.check('別チームからはクリップが見えない', (select count(*) from public.video_clips), 0);
select pg_temp.check('別チームからは質問が見えない', (select count(*) from public.feedback_requests), 0);

-- 別チームの動画を参照するクリップを、自分のチームの行として作れない（0011）
do $$
begin
  begin
    insert into public.video_clips (team_id, video_id, created_by, start_seconds, end_seconds)
    values ('22220000-0000-0000-0000-00000000000b', '55550000-0000-0000-0000-000000000001',
            '33330000-0000-0000-0000-000000000004', 0, 10);
    raise exception 'NG: 別チームの動画にクリップを作れてしまった';
  exception
    when insufficient_privilege or foreign_key_violation then
      raise notice 'ok: 別チームの動画にクリップは作れない（RLS）';
    when raise_exception then
      if sqlerrm like 'NG:%' then raise; end if;
      raise notice 'ok: 別チームの動画にクリップは作れない（%）', sqlerrm;
  end;
end;
$$;

-- 別チームの動画を指す質問も作れない
do $$
begin
  begin
    insert into public.feedback_requests
      (team_id, requester_id, video_id, question_type, question, status, visibility)
    values ('22220000-0000-0000-0000-00000000000b', '44440000-0000-0000-0000-000000000004',
            '55550000-0000-0000-0000-000000000001', 'other', '見えますか', 'submitted', 'private_staff');
    raise exception 'NG: 別チームの動画を指す質問を作れてしまった';
  exception
    when insufficient_privilege or foreign_key_violation then
      raise notice 'ok: 別チームの動画を指す質問は作れない（RLS）';
    when raise_exception then
      if sqlerrm like 'NG:%' then raise; end if;
      raise notice 'ok: 別チームの動画を指す質問は作れない（%）', sqlerrm;
  end;
end;
$$;

-- -------------------------------------------------------------
-- 7. コーチが勝手に team 公開へ変えられないこと（29章）
--    RLS では update 自体は通るが、共有依頼を経る運用にしている。
--    ここでは「選手が承認する側である」ことを確かめる。
-- -------------------------------------------------------------
select pg_temp.login('11110000-0000-0000-0000-000000000003');  -- コーチ

insert into public.feedback_share_requests
  (id, team_id, feedback_request_id, requested_by, target_visibility)
values
  ('88880000-0000-0000-0000-000000000001', '22220000-0000-0000-0000-00000000000a',
   '77770000-0000-0000-0000-000000000001', '44440000-0000-0000-0000-000000000003', 'team');

select pg_temp.check('コーチは共有を提案できる',
  (select count(*) from public.feedback_share_requests), 1);

-- コーチ自身は承認できない
update public.feedback_share_requests set status = 'approved'
where id = '88880000-0000-0000-0000-000000000001';
select pg_temp.check('コーチは自分の共有提案を承認できない',
  (select count(*) from public.feedback_share_requests where status = 'approved'), 0);

-- 依頼した選手なら承認できる
select pg_temp.login('11110000-0000-0000-0000-000000000001');
update public.feedback_share_requests set status = 'approved', responded_at = now()
where id = '88880000-0000-0000-0000-000000000001';
select pg_temp.check('選手は共有提案を承認できる',
  (select count(*) from public.feedback_share_requests where status = 'approved'), 1);

reset role;
rollback;
