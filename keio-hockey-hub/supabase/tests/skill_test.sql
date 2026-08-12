-- =============================================================
-- skill_test.sql
-- Phase 8: スキルの申請と承認（30〜32章）。
--
--   * 選手は自分の申請を出せる
--   * **選手は自分で自分を承認できない**（0014）
--   * 審査できるのは skill.review を持つ人だけ
--   * 差し戻すと選手の手元へ戻る
--   * 承認すると到達状況も承認になり、履歴が残る
--   * 他人の申請は見えない
--   * 別チームの動画・質問は根拠に添えられない（0011 の教訓）
--   * 履歴は書き換えられない
--
-- 実行方法は rls_test.sql と同じ。
-- =============================================================

\set ON_ERROR_STOP on

begin;

-- 準備 --------------------------------------------------------
insert into auth.users (id, email) values
  ('a2a20000-0000-0000-0000-000000000001', 'sk-player1@example.com'),
  ('a2a20000-0000-0000-0000-000000000002', 'sk-player2@example.com'),
  ('a2a20000-0000-0000-0000-000000000003', 'sk-coach@example.com'),
  ('a2a20000-0000-0000-0000-000000000004', 'sk-other@example.com');

insert into public.teams (id, name, display_name, slug) values
  ('b2b20000-0000-0000-0000-00000000000a', 'sk-team-a', 'スキルA', 'sk-team-a'),
  ('b2b20000-0000-0000-0000-00000000000b', 'sk-team-b', 'スキルB', 'sk-team-b');

insert into public.profiles (id, user_id, full_name) values
  ('c2c20000-0000-0000-0000-000000000001', 'a2a20000-0000-0000-0000-000000000001', '選手1'),
  ('c2c20000-0000-0000-0000-000000000002', 'a2a20000-0000-0000-0000-000000000002', '選手2'),
  ('c2c20000-0000-0000-0000-000000000003', 'a2a20000-0000-0000-0000-000000000003', 'コーチ'),
  ('c2c20000-0000-0000-0000-000000000004', 'a2a20000-0000-0000-0000-000000000004', '別チーム選手');

insert into public.team_members (id, team_id, profile_id, role_code) values
  ('d2d20000-0000-0000-0000-000000000001', 'b2b20000-0000-0000-0000-00000000000a', 'c2c20000-0000-0000-0000-000000000001', 'player'),
  ('d2d20000-0000-0000-0000-000000000002', 'b2b20000-0000-0000-0000-00000000000a', 'c2c20000-0000-0000-0000-000000000002', 'player'),
  ('d2d20000-0000-0000-0000-000000000003', 'b2b20000-0000-0000-0000-00000000000a', 'c2c20000-0000-0000-0000-000000000003', 'coach'),
  ('d2d20000-0000-0000-0000-000000000004', 'b2b20000-0000-0000-0000-00000000000b', 'c2c20000-0000-0000-0000-000000000004', 'player');

-- スキル階層（チームAとチームBに1つずつ）
insert into public.skill_categories (id, team_id, name) values
  ('e2e20000-0000-0000-0000-00000000000a', 'b2b20000-0000-0000-0000-00000000000a', 'ドリブル'),
  ('e2e20000-0000-0000-0000-00000000000b', 'b2b20000-0000-0000-0000-00000000000b', 'ドリブル');

insert into public.skills (id, team_id, skill_category_id, parent_id, name, level) values
  ('f2f20000-0000-0000-0000-00000000000a', 'b2b20000-0000-0000-0000-00000000000a',
   'e2e20000-0000-0000-0000-00000000000a', null, 'ボールを運ぶ', 2),
  ('f2f20000-0000-0000-0000-00000000000b', 'b2b20000-0000-0000-0000-00000000000b',
   'e2e20000-0000-0000-0000-00000000000b', null, 'よそのスキル', 2);

-- チームBの動画（根拠に添えられないことを確かめるため）
insert into public.videos (id, team_id, provider, provider_video_id, title, visibility, created_by)
values ('02020000-0000-0000-0000-00000000000b', 'b2b20000-0000-0000-0000-00000000000b',
        'youtube', 'zzzzzzzzzzz', 'よその動画', 'team', 'c2c20000-0000-0000-0000-000000000004');

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
-- 1. 選手が申請を出す
-- -------------------------------------------------------------
select pg_temp.login('a2a20000-0000-0000-0000-000000000001');  -- 選手1

insert into public.skill_applications (id, team_id, team_member_id, skill_id, comment, status)
values ('11220000-0000-0000-0000-000000000001', 'b2b20000-0000-0000-0000-00000000000a',
        'd2d20000-0000-0000-0000-000000000001', 'f2f20000-0000-0000-0000-00000000000a',
        '3回中3回できました', 'submitted');

select pg_temp.check('選手は自分の申請を出せる',
  (select count(*) from public.skill_applications), 1);

-- トリガが提出時刻を入れる
select pg_temp.check('提出時刻が自動で入る',
  (select count(*) from public.skill_applications
   where id = '11220000-0000-0000-0000-000000000001' and submitted_at is not null), 1);

insert into public.player_skills (id, team_id, team_member_id, skill_id, status)
values ('22330000-0000-0000-0000-000000000001', 'b2b20000-0000-0000-0000-00000000000a',
        'd2d20000-0000-0000-0000-000000000001', 'f2f20000-0000-0000-0000-00000000000a', 'applied');

select pg_temp.check('到達状況を申請中にできる',
  (select count(*) from public.player_skills where status = 'applied'), 1);

-- 57章: 申請するとコーチへ通知が飛ぶ。
-- INSERT ポリシーが無いと黙って作られないので、ここで押さえる（0015）。
insert into public.notifications
  (id, team_id, notification_type, title, body, link_path, related_table, related_id, created_by)
values ('33440000-0000-0000-0000-000000000001', 'b2b20000-0000-0000-0000-00000000000a',
        'skill_applied', 'スキルの申請が届きました', '選手1さんが申請しました',
        '/skills/applications/11220000-0000-0000-0000-000000000001',
        'skill_applications', '11220000-0000-0000-0000-000000000001',
        'c2c20000-0000-0000-0000-000000000001');

insert into public.notification_targets (notification_id, team_member_id)
values ('33440000-0000-0000-0000-000000000001', 'd2d20000-0000-0000-0000-000000000003');

-- 作った本人には見えない（自分宛ではないので）。届いたかどうかは受け取る側で確かめる。
select pg_temp.login('a2a20000-0000-0000-0000-000000000003');  -- コーチ
select pg_temp.check('コーチに申請の通知が届く',
  (select count(*) from public.notifications
   where id = '33440000-0000-0000-0000-000000000001'), 1);
select pg_temp.check('他の選手には届かない',
  (select count(*) from public.notification_targets
   where team_member_id = 'd2d20000-0000-0000-0000-000000000002'), 0);

select pg_temp.login('a2a20000-0000-0000-0000-000000000001');  -- 選手1へ戻る

-- 差出人は偽れない
do $$
begin
  begin
    insert into public.notifications (team_id, notification_type, title, created_by)
    values ('b2b20000-0000-0000-0000-00000000000a', 'general', 'コーチのふり',
            'c2c20000-0000-0000-0000-000000000003');
    raise exception 'NG: 他人の名前で通知を作れてしまった';
  exception
    when insufficient_privilege then
      raise notice 'ok: 他人の名前では通知を作れない（RLS）';
    when raise_exception then
      if sqlerrm like 'NG:%' then raise; end if;
      raise notice 'ok: 他人の名前では通知を作れない（%）', sqlerrm;
  end;
end;
$$;

-- -------------------------------------------------------------
-- 2. **選手は自分で自分を承認できない**（0014 で塞いだ穴）
-- -------------------------------------------------------------
do $$
begin
  begin
    update public.player_skills set status = 'approved'
    where id = '22330000-0000-0000-0000-000000000001';
    raise exception 'NG: 選手が自分で自分を承認できてしまった';
  exception when raise_exception then
    if sqlerrm like 'NG:%' then raise; end if;
    raise notice 'ok: 選手は自分で自分を承認できない（%）', sqlerrm;
  end;
end;
$$;

do $$
begin
  begin
    update public.skill_applications set status = 'approved'
    where id = '11220000-0000-0000-0000-000000000001';
    raise exception 'NG: 選手が自分の申請を承認できてしまった';
  exception when raise_exception then
    if sqlerrm like 'NG:%' then raise; end if;
    raise notice 'ok: 選手は自分の申請を承認できない（%）', sqlerrm;
  end;
end;
$$;

-- -------------------------------------------------------------
-- 3. 根拠は同じチームのものだけ（0011 の教訓）
-- -------------------------------------------------------------
do $$
begin
  begin
    insert into public.skill_application_items
      (team_id, skill_application_id, item_type, video_id)
    values ('b2b20000-0000-0000-0000-00000000000a', '11220000-0000-0000-0000-000000000001',
            'video', '02020000-0000-0000-0000-00000000000b');
    raise exception 'NG: 別チームの動画を根拠にできてしまった';
  exception
    when insufficient_privilege then
      raise notice 'ok: 別チームの動画は根拠にできない（RLS）';
    when raise_exception then
      if sqlerrm like 'NG:%' then raise; end if;
      raise notice 'ok: 別チームの動画は根拠にできない（%）', sqlerrm;
  end;
end;
$$;

insert into public.skill_application_items (team_id, skill_application_id, item_type, note)
values ('b2b20000-0000-0000-0000-00000000000a', '11220000-0000-0000-0000-000000000001',
        'note', '自主練で20本続けて成功しました');

select pg_temp.check('自分の申請には根拠を足せる',
  (select count(*) from public.skill_application_items), 1);

-- 別チームのスキルを指す申請も作れない
do $$
begin
  begin
    insert into public.skill_applications (team_id, team_member_id, skill_id, status)
    values ('b2b20000-0000-0000-0000-00000000000a', 'd2d20000-0000-0000-0000-000000000001',
            'f2f20000-0000-0000-0000-00000000000b', 'submitted');
    raise exception 'NG: 別チームのスキルに申請できてしまった';
  exception
    when insufficient_privilege then
      raise notice 'ok: 別チームのスキルには申請できない（RLS）';
    when raise_exception then
      if sqlerrm like 'NG:%' then raise; end if;
      raise notice 'ok: 別チームのスキルには申請できない（%）', sqlerrm;
  end;
end;
$$;

-- -------------------------------------------------------------
-- 4. 他人の申請は見えない
-- -------------------------------------------------------------
select pg_temp.login('a2a20000-0000-0000-0000-000000000002');  -- 選手2
select pg_temp.check('他の選手からは申請が見えない',
  (select count(*) from public.skill_applications), 0);
select pg_temp.check('他の選手からは到達状況が見えない',
  (select count(*) from public.player_skills), 0);

-- 審査権限が無いので、他人の申請を承認もできない
do $$
begin
  begin
    update public.skill_applications set status = 'approved'
    where id = '11220000-0000-0000-0000-000000000001';
    if not found then
      raise notice 'ok: 他の選手は申請を承認できない（対象が見えない）';
    else
      raise exception 'NG: 他の選手が申請を承認できてしまった';
    end if;
  exception when raise_exception then
    if sqlerrm like 'NG:%' then raise; end if;
    raise notice 'ok: 他の選手は申請を承認できない（%）', sqlerrm;
  end;
end;
$$;

-- -------------------------------------------------------------
-- 5. コーチが差し戻す（不合格ではない。選手の手元へ返す）
-- -------------------------------------------------------------
select pg_temp.login('a2a20000-0000-0000-0000-000000000003');  -- コーチ

select pg_temp.check('コーチには申請が見える',
  (select count(*) from public.skill_applications), 1);

insert into public.skill_reviews (team_id, skill_application_id, reviewer_id, decision, comment)
values ('b2b20000-0000-0000-0000-00000000000a', '11220000-0000-0000-0000-000000000001',
        'c2c20000-0000-0000-0000-000000000003', 'needs_more', '動画も付けてください');

update public.skill_applications set status = 'draft'
where id = '11220000-0000-0000-0000-000000000001';

update public.player_skills set status = 'feedback'
where id = '22330000-0000-0000-0000-000000000001';

select pg_temp.check_text('差し戻すと選手の手元へ戻る',
  (select status from public.skill_applications where id = '11220000-0000-0000-0000-000000000001'),
  'draft');

select pg_temp.check_text('到達状況は差し戻し中になる',
  (select status from public.player_skills where id = '22330000-0000-0000-0000-000000000001'),
  'feedback');

-- -------------------------------------------------------------
-- 6. コーチが承認する
-- -------------------------------------------------------------
select pg_temp.login('a2a20000-0000-0000-0000-000000000001');  -- 選手が出し直す
update public.skill_applications set status = 'submitted'
where id = '11220000-0000-0000-0000-000000000001';

select pg_temp.login('a2a20000-0000-0000-0000-000000000003');  -- コーチ

insert into public.skill_reviews (team_id, skill_application_id, reviewer_id, decision, comment)
values ('b2b20000-0000-0000-0000-00000000000a', '11220000-0000-0000-0000-000000000001',
        'c2c20000-0000-0000-0000-000000000003', 'approved', 'できています');

update public.skill_applications set status = 'approved'
where id = '11220000-0000-0000-0000-000000000001';

update public.player_skills set status = 'approved'
where id = '22330000-0000-0000-0000-000000000001';

select pg_temp.check_text('コーチは承認できる',
  (select status from public.player_skills where id = '22330000-0000-0000-0000-000000000001'),
  'approved');

-- 承認したのが誰かは、アプリに書かせずトリガが入れる
select pg_temp.check('承認した人と時刻が自動で入る',
  (select count(*) from public.player_skills
   where id = '22330000-0000-0000-0000-000000000001'
     and approved_by = 'c2c20000-0000-0000-0000-000000000003'
     and approved_at is not null), 1);

select pg_temp.check('審査の記録は上書きされず2件残る',
  (select count(*) from public.skill_reviews), 2);

-- -------------------------------------------------------------
-- 7. 履歴（75章）
-- -------------------------------------------------------------
select pg_temp.check('到達状況の履歴が残る',
  (select count(*) from public.skill_status_histories
   where player_skill_id = '22330000-0000-0000-0000-000000000001'), 3);  -- applied → feedback → approved

-- 同じトランザクション内では now() が進まないので、created_at では順番を決められない。
-- 「どこからどこへ動いたか」で確かめる。
select pg_temp.check('差し戻しの履歴が残る',
  (select count(*) from public.skill_status_histories
   where player_skill_id = '22330000-0000-0000-0000-000000000001'
     and from_status = 'applied' and to_status = 'feedback'), 1);

select pg_temp.check('承認の履歴が、誰がやったかとともに残る',
  (select count(*) from public.skill_status_histories
   where player_skill_id = '22330000-0000-0000-0000-000000000001'
     and from_status = 'feedback' and to_status = 'approved'
     and changed_by = 'c2c20000-0000-0000-0000-000000000003'), 1);

-- 履歴は書き換えられない
do $$
begin
  begin
    update public.skill_status_histories set to_status = 'not_started';
    raise exception 'NG: 履歴を書き換えられてしまった';
  exception
    when insufficient_privilege then
      raise notice 'ok: 履歴は書き換えられない';
    when raise_exception then
      if sqlerrm like 'NG:%' then raise; end if;
      raise notice 'ok: 履歴は書き換えられない（%）', sqlerrm;
  end;
end;
$$;

do $$
begin
  begin
    delete from public.skill_status_histories;
    raise exception 'NG: 履歴を消せてしまった';
  exception
    when insufficient_privilege then
      raise notice 'ok: 履歴は消せない';
    when raise_exception then
      if sqlerrm like 'NG:%' then raise; end if;
      raise notice 'ok: 履歴は消せない（%）', sqlerrm;
  end;
end;
$$;

-- -------------------------------------------------------------
-- 8. 承認済みを取り消せるのも審査担当だけ
-- -------------------------------------------------------------
select pg_temp.login('a2a20000-0000-0000-0000-000000000001');  -- 選手本人

do $$
begin
  begin
    update public.player_skills set status = 'not_started'
    where id = '22330000-0000-0000-0000-000000000001';
    raise exception 'NG: 選手が承認済みを取り消せてしまった';
  exception when raise_exception then
    if sqlerrm like 'NG:%' then raise; end if;
    raise notice 'ok: 選手は承認済みを取り消せない（%）', sqlerrm;
  end;
end;
$$;

-- -------------------------------------------------------------
-- 9. 別チームからは何も見えない
-- -------------------------------------------------------------
select pg_temp.login('a2a20000-0000-0000-0000-000000000004');  -- 別チーム
select pg_temp.check('別チームからは申請が見えない',
  (select count(*) from public.skill_applications), 0);
select pg_temp.check('別チームからはスキル定義も見えない',
  (select count(*) from public.skills where team_id = 'b2b20000-0000-0000-0000-00000000000a'), 0);

-- -------------------------------------------------------------
-- 10. スキル定義の管理（30章）
--
-- 画面から大分類と目標を作れないと、Phase 8 を使い始められない。
-- -------------------------------------------------------------
select pg_temp.login('a2a20000-0000-0000-0000-000000000003');  -- コーチ

insert into public.skill_categories (id, team_id, name, sort_order)
values ('44550000-0000-0000-0000-000000000001', 'b2b20000-0000-0000-0000-00000000000a', 'トラップ', 2);

select pg_temp.check('コーチは大分類を作れる',
  (select count(*) from public.skill_categories), 2);

insert into public.skills (id, team_id, skill_category_id, parent_id, name, level, sort_order)
values ('55660000-0000-0000-0000-000000000001', 'b2b20000-0000-0000-0000-00000000000a',
        '44550000-0000-0000-0000-000000000001', null, '止める', 2, 1);

insert into public.skills (id, team_id, skill_category_id, parent_id, name, level, sort_order)
values ('55660000-0000-0000-0000-000000000002', 'b2b20000-0000-0000-0000-00000000000a',
        '44550000-0000-0000-0000-000000000001', '55660000-0000-0000-0000-000000000001',
        '浮き球を1回で止める', 3, 1);

select pg_temp.check('中目標と小目標を作れる',
  (select count(*) from public.skills
   where skill_category_id = '44550000-0000-0000-0000-000000000001'), 2);

-- 並び順を数える関数（0018）
select pg_temp.check('次の並び順は末尾になる',
  app.next_skill_sort_order('b2b20000-0000-0000-0000-00000000000a',
                            '44550000-0000-0000-0000-000000000001',
                            '55660000-0000-0000-0000-000000000001'), 2);

-- 誰も到達していない目標は消せる。
--
-- ここは 0019 で直した形の確認でもある。
-- `for all` のポリシーは SELECT にも効くので、
-- そこに deleted_at の条件が無いと「消したのに見えたまま」になる。
select public.soft_delete_skill('55660000-0000-0000-0000-000000000002');

select pg_temp.check('到達者のいない目標は消せる',
  (select count(*) from public.skills
   where skill_category_id = '44550000-0000-0000-0000-000000000001'), 1);

-- 消した本人（コーチ）からも見えない
select pg_temp.check('消した目標はコーチからも見えない',
  (select count(*) from public.skills
   where id = '55660000-0000-0000-0000-000000000002'), 0);

-- 到達者のいる目標は消せない（積み上げを消さない）
do $$
begin
  begin
    perform public.soft_delete_skill('f2f20000-0000-0000-0000-00000000000a');
    raise exception 'NG: 申請のある目標を消せてしまった';
  exception when raise_exception then
    if sqlerrm like 'NG:%' then raise; end if;
    raise notice 'ok: 申請のある目標は消せない（%）', sqlerrm;
  end;
end;
$$;

-- 選手は定義を触れない
select pg_temp.login('a2a20000-0000-0000-0000-000000000001');  -- 選手

do $$
begin
  begin
    insert into public.skill_categories (team_id, name)
    values ('b2b20000-0000-0000-0000-00000000000a', '勝手な大分類');
    raise exception 'NG: 選手が大分類を作れてしまった';
  exception
    when insufficient_privilege then
      raise notice 'ok: 選手は大分類を作れない（RLS）';
    when raise_exception then
      if sqlerrm like 'NG:%' then raise; end if;
      raise notice 'ok: 選手は大分類を作れない（%）', sqlerrm;
  end;
end;
$$;

select pg_temp.check('選手にも定義は見える（申請するため）',
  (select count(*) from public.skill_categories), 2);

reset role;
rollback;
