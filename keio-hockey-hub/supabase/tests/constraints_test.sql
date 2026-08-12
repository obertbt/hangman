-- =============================================================
-- constraints_test.sql
-- DB 側で守ると決めたことを確かめる。
--
--   * 動画フィードバックの不正な状態遷移を禁止する（27章）
--   * 状態を変えたら履歴が残る（75章）
--   * 仮想クリップが元動画の長さを超えない（53章）
--
-- 実行方法は rls_test.sql と同じ。
-- =============================================================

\set ON_ERROR_STOP on

begin;

-- 準備 --------------------------------------------------------
insert into public.teams (id, name, display_name, slug)
values ('ffff0000-0000-0000-0000-000000000001', 'ct', '検査チーム', 'constraint-team');

insert into public.profiles (id, full_name)
values
  ('ffff0000-0000-0000-0000-000000000002', '選手'),
  ('ffff0000-0000-0000-0000-000000000003', 'コーチ');

insert into public.team_members (id, team_id, profile_id, role_code)
values
  ('ffff0000-0000-0000-0000-000000000004', 'ffff0000-0000-0000-0000-000000000001',
   'ffff0000-0000-0000-0000-000000000002', 'player'),
  ('ffff0000-0000-0000-0000-000000000005', 'ffff0000-0000-0000-0000-000000000001',
   'ffff0000-0000-0000-0000-000000000003', 'coach');

insert into public.videos (id, team_id, provider, provider_video_id, title, duration_seconds, created_by)
values ('ffff0000-0000-0000-0000-000000000006', 'ffff0000-0000-0000-0000-000000000001',
        'youtube', 'dQw4w9WgXcQ', '練習全体', 3600, 'ffff0000-0000-0000-0000-000000000002');

create or replace function pg_temp.check(p_label text, p_actual bigint, p_expected bigint)
returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'NG: % (期待 %, 実際 %)', p_label, p_expected, p_actual;
  end if;
  raise notice 'ok: %', p_label;
end;
$$;

-- -------------------------------------------------------------
-- 1. 仮想クリップ（53章）
-- -------------------------------------------------------------
insert into public.video_clips (id, team_id, video_id, created_by, start_seconds, end_seconds)
values ('ffff0000-0000-0000-0000-000000000007', 'ffff0000-0000-0000-0000-000000000001',
        'ffff0000-0000-0000-0000-000000000006', 'ffff0000-0000-0000-0000-000000000002', 754, 828);
select pg_temp.check('妥当なクリップは作れる', (select count(*) from public.video_clips), 1);

do $$
begin
  begin
    insert into public.video_clips (team_id, video_id, created_by, start_seconds, end_seconds)
    values ('ffff0000-0000-0000-0000-000000000001', 'ffff0000-0000-0000-0000-000000000006',
            'ffff0000-0000-0000-0000-000000000002', 100, 50);
    raise exception 'NG: 終了が開始より前のクリップを作れてしまった';
  exception when check_violation then
    raise notice 'ok: 終了が開始より前のクリップは作れない';
  end;
end;
$$;

do $$
begin
  begin
    insert into public.video_clips (team_id, video_id, created_by, start_seconds, end_seconds)
    values ('ffff0000-0000-0000-0000-000000000001', 'ffff0000-0000-0000-0000-000000000006',
            'ffff0000-0000-0000-0000-000000000002', 100, 9999);
    raise exception 'NG: 動画の長さを超えるクリップを作れてしまった';
  exception when raise_exception then
    -- トリガが投げる例外。メッセージで区別する。
    if sqlerrm like 'NG:%' then raise; end if;
    raise notice 'ok: 動画の長さを超えるクリップは作れない';
  end;
end;
$$;

-- -------------------------------------------------------------
-- 2. フィードバックの状態遷移（27章）
-- -------------------------------------------------------------
insert into public.feedback_requests
  (id, team_id, requester_id, video_id, question, status)
values ('ffff0000-0000-0000-0000-000000000008', 'ffff0000-0000-0000-0000-000000000001',
        'ffff0000-0000-0000-0000-000000000004', 'ffff0000-0000-0000-0000-000000000006',
        'この判断でよかったですか', 'draft');

-- draft → submitted は許される
update public.feedback_requests set status = 'submitted'
where id = 'ffff0000-0000-0000-0000-000000000008';
select pg_temp.check('draft → submitted は通る',
  (select count(*) from public.feedback_requests where status = 'submitted'), 1);

-- 履歴が残る
select pg_temp.check('状態変更が履歴に残る',
  (select count(*) from public.feedback_status_histories
   where feedback_request_id = 'ffff0000-0000-0000-0000-000000000008'), 1);

-- submitted → closed は飛ばしすぎなので禁止
do $$
begin
  begin
    update public.feedback_requests set status = 'closed'
    where id = 'ffff0000-0000-0000-0000-000000000008';
    raise exception 'NG: submitted から closed へ飛べてしまった';
  exception when raise_exception then
    if sqlerrm like 'NG:%' then raise; end if;
    raise notice 'ok: submitted → closed は禁止される';
  end;
end;
$$;

-- 正しい順路は通る: submitted → assigned → answered → acknowledged → closed
update public.feedback_requests set status = 'assigned' where id = 'ffff0000-0000-0000-0000-000000000008';
update public.feedback_requests set status = 'answered' where id = 'ffff0000-0000-0000-0000-000000000008';
update public.feedback_requests set status = 'acknowledged' where id = 'ffff0000-0000-0000-0000-000000000008';
update public.feedback_requests set status = 'closed' where id = 'ffff0000-0000-0000-0000-000000000008';
select pg_temp.check('正しい順路はすべて通る',
  (select count(*) from public.feedback_requests where status = 'closed'), 1);

-- closed からは動かせない
do $$
begin
  begin
    update public.feedback_requests set status = 'reviewing'
    where id = 'ffff0000-0000-0000-0000-000000000008';
    raise exception 'NG: closed から戻れてしまった';
  exception when raise_exception then
    if sqlerrm like 'NG:%' then raise; end if;
    raise notice 'ok: closed からは動かせない';
  end;
end;
$$;

select pg_temp.check('順路のぶんだけ履歴が積まれている',
  (select count(*) from public.feedback_status_histories
   where feedback_request_id = 'ffff0000-0000-0000-0000-000000000008'), 5);

-- -------------------------------------------------------------
-- 3. 背番号の重複（在籍中のみ禁止）
-- -------------------------------------------------------------
update public.team_members set jersey_number = 10
where id = 'ffff0000-0000-0000-0000-000000000004';

do $$
begin
  begin
    update public.team_members set jersey_number = 10
    where id = 'ffff0000-0000-0000-0000-000000000005';
    raise exception 'NG: 在籍中の選手で背番号が重複できてしまった';
  exception when unique_violation then
    raise notice 'ok: 在籍中の背番号は重複しない';
  end;
end;
$$;

rollback;
