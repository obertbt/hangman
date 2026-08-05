-- =============================================================================
-- Hearth Growth : RLS の振る舞いテスト
-- =============================================================================
-- 実行方法は supabase/tests/README.md を参照。
--
-- ここで確認するのは「MVP完了条件」のうち、データベースが守るべき約束。
--   * 非公開投稿を他人が閲覧できない
--   * グループ外ユーザーが投稿・プロフィール・グループを閲覧できない
--   * タイマーの二重起動ができない
--   * 招待リンクの期限・失効・上限が効く
--   * コメントとリアクションが元投稿の公開範囲を超えない
--   * 管理者以外が管理者操作をできない
--
-- 失敗した時点で例外を投げて止まる。最後まで通れば合格を表示する。
-- 変更はすべて rollback するため、データは残らない。
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages to notice;

-- 検査結果は NOTICE として出すため、クエリの戻り値は捨てる
\o /dev/null

begin;

\set alice '11111111-1111-4111-8111-111111111111'
\set bob   '22222222-2222-4222-8222-222222222222'
\set carol '33333333-3333-4333-8333-333333333333'

-- 役割を跨いで値を持ち回るための置き場。一時テーブルには RLS が掛からない。
create temporary table v (key text primary key, value text) on commit drop;
-- 役割を切り替えても読めるようにする（一時テーブルなので他セッションからは見えない）
grant all on v to public;

create or replace function pg_temp.val(p_key text) returns text
language sql stable as $$ select value from pg_temp.v where key = p_key $$;

create or replace function pg_temp.uuid_val(p_key text) returns uuid
language sql stable as $$ select value::uuid from pg_temp.v where key = p_key $$;

create or replace function pg_temp.check(p_condition boolean, p_label text) returns void
language plpgsql as $$
begin
  if p_condition is not true then
    raise exception 'FAILED: %', p_label;
  end if;
  raise notice '  ok   %', p_label;
end;
$$;

-- テスト用ユーザー。auth.users への insert で profiles と初期カテゴリーが作られる。
insert into auth.users (id, email, raw_user_meta_data)
values
  (:'alice', 'alice@example.test', '{"display_name":"あさひ"}'::jsonb),
  (:'bob',   'bob@example.test',   '{"display_name":"ゆうき"}'::jsonb),
  (:'carol', 'carol@example.test', '{"display_name":"かおる"}'::jsonb);

insert into v values ('alice', :'alice'), ('bob', :'bob'), ('carol', :'carol');

\echo ''
\echo '== 登録時のトリガー'
select pg_temp.check(
  (select count(*) from public.profiles where id = :'alice') = 1,
  'プロフィールが自動で作られる');
select pg_temp.check(
  (select display_name from public.profiles where id = :'alice') = 'あさひ',
  '表示名がメタデータから設定される');
select pg_temp.check(
  (select count(*) from public.categories where user_id = :'alice') = 9,
  '初期カテゴリーが9件作られる');

-- -----------------------------------------------------------------------------
\echo ''
\echo '== グループ作成と招待'
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', :'alice', true);
set local role authenticated;

insert into v select 'group', public.create_group('ふたりの記録', '毎日を少しずつ')::text;

select pg_temp.check(
  (select role from public.group_members
    where group_id = pg_temp.uuid_val('group') and user_id = :'alice') = 'owner',
  '作成者が owner として登録される');

with created as (
  insert into public.group_invitations (group_id, invited_by, max_uses)
  values (pg_temp.uuid_val('group'), :'alice', 2)
  returning token
)
insert into v select 'invite', token from created;

select pg_temp.check(length(pg_temp.val('invite')) >= 40, '招待トークンが十分に長い');

-- 参加していない carol には何も見えない
reset role;
select set_config('request.jwt.claim.sub', :'carol', true);
set local role authenticated;

select pg_temp.check((select count(*) from public.groups) = 0,
  'グループ外のユーザーにはグループが見えない');
select pg_temp.check((select count(*) from public.group_invitations) = 0,
  'グループ外のユーザーには招待リンクが見えない');
select pg_temp.check((select count(*) from public.profiles where id = :'alice') = 0,
  'グループ外のユーザーには他人のプロフィールが見えない');
select pg_temp.check((select count(*) from public.group_members) = 0,
  'グループ外のユーザーにはメンバー一覧が見えない');

-- bob が招待を受ける
reset role;
select set_config('request.jwt.claim.sub', :'bob', true);
set local role authenticated;

select pg_temp.check(
  public.accept_invitation(pg_temp.val('invite')) = pg_temp.uuid_val('group'),
  '招待から正しいグループへ参加できる');
select pg_temp.check((select count(*) from public.group_members) = 2,
  'メンバーが2人になる');
select pg_temp.check((select count(*) from public.profiles where id = :'alice') = 1,
  '同じグループのメンバーのプロフィールは見える');

-- 参加済みユーザーが再実行しても利用回数を消費しない
select public.accept_invitation(pg_temp.val('invite'));
reset role;
select pg_temp.check(
  (select used_count from public.group_invitations where token = pg_temp.val('invite')) = 1,
  '参加済みユーザーの再実行では利用回数が増えない');

-- -----------------------------------------------------------------------------
\echo ''
\echo '== 公開範囲'
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', :'alice', true);
set local role authenticated;

insert into v
select 'category', id::text from public.categories where user_id = :'alice' and name = '勉強';

with created as (
  insert into public.activity_posts
    (user_id, category_id, title, duration_seconds, activity_date, visibility)
  values (:'alice', pg_temp.uuid_val('category'), '非公開の記録', 1800, current_date, 'private')
  returning id
)
insert into v select 'private_post', id::text from created;

with created as (
  insert into public.activity_posts
    (user_id, category_id, title, duration_seconds, activity_date, visibility, group_id)
  values (:'alice', pg_temp.uuid_val('category'), 'グループへの記録', 3600, current_date, 'group',
          pg_temp.uuid_val('group'))
  returning id
)
insert into v select 'group_post', id::text from created;

with created as (
  insert into public.activity_posts
    (user_id, category_id, title, duration_seconds, activity_date, visibility)
  values (:'alice', pg_temp.uuid_val('category'), '選んだ人だけの記録', 600, current_date, 'selected')
  returning id
)
insert into v select 'selected_post', id::text from created;

insert into public.post_allowed_users (post_id, user_id)
values (pg_temp.uuid_val('selected_post'), :'bob');

select pg_temp.check((select count(*) from public.activity_posts) = 3,
  '投稿者は自分の投稿をすべて見られる');

reset role;
select set_config('request.jwt.claim.sub', :'bob', true);
set local role authenticated;

select pg_temp.check(
  (select count(*) from public.activity_posts where id = pg_temp.uuid_val('private_post')) = 0,
  '非公開投稿は他人には見えない');
select pg_temp.check(
  (select count(*) from public.activity_posts where id = pg_temp.uuid_val('group_post')) = 1,
  'グループ公開の投稿はメンバーに見える');
select pg_temp.check(
  (select count(*) from public.activity_posts where id = pg_temp.uuid_val('selected_post')) = 1,
  'selected 公開の投稿は許可されたユーザーに見える');

reset role;
select set_config('request.jwt.claim.sub', :'carol', true);
set local role authenticated;
select pg_temp.check((select count(*) from public.activity_posts) = 0,
  'グループ外のユーザーには投稿が1件も見えない');

-- 他人になりすました投稿は作れない
do $$
declare v_cat uuid;
begin
  select id into v_cat from public.categories where user_id = auth.uid() limit 1;
  begin
    insert into public.activity_posts (user_id, category_id, duration_seconds, activity_date, visibility)
    values (pg_temp.uuid_val('alice'), v_cat, 600, current_date, 'private');
    raise exception 'FAILED: 他人の user_id で投稿を作れてしまった';
  exception when insufficient_privilege then
    raise notice '  ok   他人の user_id では投稿を作れない';
  end;
end;
$$;

-- 所属していないグループへは公開できない
do $$
declare v_cat uuid;
begin
  select id into v_cat from public.categories where user_id = auth.uid() limit 1;
  begin
    insert into public.activity_posts
      (user_id, category_id, duration_seconds, activity_date, visibility, group_id)
    values (auth.uid(), v_cat, 600, current_date, 'group', pg_temp.uuid_val('group'));
    raise exception 'FAILED: 所属していないグループへ公開できてしまった';
  exception when insufficient_privilege then
    raise notice '  ok   所属していないグループへは公開できない';
  end;
end;
$$;

-- 論理削除。投稿者は自分で deleted_at を立てられ、他人からは見えなくなる。
reset role;
select set_config('request.jwt.claim.sub', :'alice', true);
set local role authenticated;
update public.activity_posts set deleted_at = now() where id = pg_temp.uuid_val('group_post');
select pg_temp.check(
  (select deleted_at from public.activity_posts where id = pg_temp.uuid_val('group_post')) is not null,
  '投稿者は自分の投稿を論理削除できる');

reset role;
select set_config('request.jwt.claim.sub', :'bob', true);
set local role authenticated;
select pg_temp.check(
  (select count(*) from public.activity_posts where id = pg_temp.uuid_val('group_post')) = 0,
  '論理削除した投稿は他のメンバーから見えなくなる');

reset role;
update public.activity_posts set deleted_at = null where id = pg_temp.uuid_val('group_post');

-- -----------------------------------------------------------------------------
\echo ''
\echo '== コメントとリアクション'
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', :'bob', true);
set local role authenticated;

insert into public.comments (post_id, user_id, body)
values (pg_temp.uuid_val('group_post'), :'bob', 'おつかれさま');
insert into public.reactions (post_id, user_id, reaction_type)
values (pg_temp.uuid_val('group_post'), :'bob', 'cheer');

select pg_temp.check((select count(*) from public.comments) = 1,
  '閲覧できる投稿にはコメントできる');

do $$
begin
  begin
    insert into public.reactions (post_id, user_id, reaction_type)
    values (pg_temp.uuid_val('group_post'), auth.uid(), 'amazing');
    raise exception 'FAILED: 1投稿に2つ目のリアクションを付けられてしまった';
  exception when unique_violation then
    raise notice '  ok   1ユーザーにつき1投稿1リアクション';
  end;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', :'carol', true);
set local role authenticated;

select pg_temp.check((select count(*) from public.comments) = 0,
  '閲覧できない投稿のコメントは見えない');
select pg_temp.check((select count(*) from public.reactions) = 0,
  '閲覧できない投稿のリアクションは見えない');

do $$
begin
  begin
    insert into public.comments (post_id, user_id, body)
    values (pg_temp.uuid_val('group_post'), auth.uid(), '見えないはずの投稿へのコメント');
    raise exception 'FAILED: 閲覧できない投稿にコメントできてしまった';
  exception when insufficient_privilege then
    raise notice '  ok   閲覧できない投稿にはコメントできない';
  end;
end;
$$;

-- 投稿者はコメントを非表示にできる
reset role;
select set_config('request.jwt.claim.sub', :'alice', true);
set local role authenticated;
insert into v select 'comment', id::text from public.comments limit 1;
select public.set_comment_hidden(pg_temp.uuid_val('comment'), true);

reset role;
select set_config('request.jwt.claim.sub', :'bob', true);
set local role authenticated;
select pg_temp.check(
  (select count(*) from public.comments where id = pg_temp.uuid_val('comment')) = 1,
  '非表示にされたコメントは、書いた本人には見える');

-- 第三者を装ってコメントを非表示にはできない
reset role;
select set_config('request.jwt.claim.sub', :'carol', true);
set local role authenticated;
do $$
begin
  begin
    perform public.set_comment_hidden(pg_temp.uuid_val('comment'), true);
    raise exception 'FAILED: 投稿者以外がコメントを非表示にできてしまった';
  exception when insufficient_privilege then
    raise notice '  ok   投稿者以外はコメントを非表示にできない';
  end;
end;
$$;

-- -----------------------------------------------------------------------------
\echo ''
\echo '== タイマー'
-- -----------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claim.sub', :'alice', true);
set local role authenticated;

insert into public.activity_sessions (user_id, category_id, title)
values (:'alice', pg_temp.uuid_val('category'), '英単語');

do $$
begin
  begin
    insert into public.activity_sessions (user_id, category_id, title)
    values (auth.uid(), pg_temp.uuid_val('category'), '二重起動');
    raise exception 'FAILED: タイマーを二重に開始できてしまった';
  exception when unique_violation then
    raise notice '  ok   running のセッションは1件までしか持てない';
  end;
end;
$$;

update public.activity_sessions set status = 'paused', paused_at = now() where user_id = :'alice';

do $$
begin
  begin
    insert into public.activity_sessions (user_id, category_id)
    values (auth.uid(), pg_temp.uuid_val('category'));
    raise exception 'FAILED: 一時停止中にもう1件開始できてしまった';
  exception when unique_violation then
    raise notice '  ok   paused のセッションがあるときも新しく開始できない';
  end;
end;
$$;

do $$
begin
  begin
    update public.activity_sessions set status = 'running' where user_id = auth.uid();
    raise exception 'FAILED: paused_at を残したまま running に戻せてしまった';
  exception when check_violation then
    raise notice '  ok   paused_at を残したまま running には戻せない';
  end;
end;
$$;

-- -----------------------------------------------------------------------------
-- タイマーの状態遷移（RPC）
-- -----------------------------------------------------------------------------
reset role;
-- 直前のテストで残っているセッションを片付ける
delete from public.activity_sessions where user_id = pg_temp.uuid_val('alice');

select set_config('request.jwt.claim.sub', :'alice', true);
set local role authenticated;

insert into v select 'session', (public.start_session(pg_temp.uuid_val('category'), '英単語')).id::text;

select pg_temp.check(
  (select status from public.activity_sessions where id = pg_temp.uuid_val('session')) = 'running',
  'start_session で running のセッションが作られる');

-- 二重起動は RPC が分かりやすい例外にする
do $$
begin
  begin
    perform public.start_session(pg_temp.uuid_val('category'), '二重起動');
    raise exception 'FAILED: start_session が二重起動を許した';
  exception
    when raise_exception then
      if sqlerrm like 'FAILED:%' then raise; end if;
      raise notice '  ok   start_session は活動中のセッションがあると失敗する';
  end;
end;
$$;

-- 一時停止 → 再開で、停止していた時間が積み上がる
select public.pause_session(pg_temp.uuid_val('session'));
select pg_temp.check(
  (select paused_at is not null from public.activity_sessions where id = pg_temp.uuid_val('session')),
  'pause_session で paused_at が入る');

-- 停止時間を1分だけ過去に見せかけて再開する
reset role;
update public.activity_sessions
set paused_at = paused_at - interval '60 seconds'
where id = pg_temp.uuid_val('session');
select set_config('request.jwt.claim.sub', :'alice', true);
set local role authenticated;

select public.resume_session(pg_temp.uuid_val('session'));
select pg_temp.check(
  (select total_paused_seconds between 59 and 61
     from public.activity_sessions where id = pg_temp.uuid_val('session')),
  'resume_session が停止していた時間を積み上げる');
select pg_temp.check(
  (select paused_at is null and status = 'running'
     from public.activity_sessions where id = pg_temp.uuid_val('session')),
  'resume_session で running に戻る');

-- 開始を10分前にずらして終了し、停止時間が差し引かれることを見る
reset role;
update public.activity_sessions
set started_at = now() - interval '10 minutes'
where id = pg_temp.uuid_val('session');
select set_config('request.jwt.claim.sub', :'alice', true);
set local role authenticated;

select public.complete_session(pg_temp.uuid_val('session'));
select pg_temp.check(
  (select duration_seconds between 538 and 542
     from public.activity_sessions where id = pg_temp.uuid_val('session')),
  'duration = 終了 - 開始 - 累計停止時間（10分 - 1分 = 9分）');
select pg_temp.check(
  (select status = 'completed' and ended_at is not null
     from public.activity_sessions where id = pg_temp.uuid_val('session')),
  'complete_session で completed になる');

-- 終了済みのセッションは操作できない
do $$
begin
  begin
    perform public.pause_session(pg_temp.uuid_val('session'));
    raise exception 'FAILED: 終了済みのセッションを一時停止できてしまった';
  exception
    when no_data_found then
      raise notice '  ok   終了済みのセッションは操作できない';
  end;
end;
$$;

-- 終了時刻の修正（13.4）。開始より前や未来は受け付けない。
insert into v select 'session2', (public.start_session(pg_temp.uuid_val('category'), '長時間')).id::text;

do $$
begin
  begin
    perform public.complete_session(pg_temp.uuid_val('session2'), now() - interval '1 day');
    raise exception 'FAILED: 開始より前の終了時刻を受け付けてしまった';
  exception
    when raise_exception then
      if sqlerrm like 'FAILED:%' then raise; end if;
      raise notice '  ok   開始より前の終了時刻は受け付けない';
  end;

  begin
    perform public.complete_session(pg_temp.uuid_val('session2'), now() + interval '1 day');
    raise exception 'FAILED: 未来の終了時刻を受け付けてしまった';
  exception
    when raise_exception then
      if sqlerrm like 'FAILED:%' then raise; end if;
      raise notice '  ok   未来の終了時刻は受け付けない';
  end;
end;
$$;

-- 取り消しは記録を残さない
select public.cancel_session(pg_temp.uuid_val('session2'));
select pg_temp.check(
  (select status from public.activity_sessions where id = pg_temp.uuid_val('session2')) = 'cancelled',
  'cancel_session で cancelled になる');

-- 取り消した後は、また新しく始められる
insert into v select 'session3', (public.start_session(pg_temp.uuid_val('category'))).id::text;
select pg_temp.check(
  (select status from public.activity_sessions where id = pg_temp.uuid_val('session3')) = 'running',
  '取り消した後は新しいタイマーを開始できる');

-- 他人のセッションは操作できない
reset role;
select set_config('request.jwt.claim.sub', :'bob', true);
set local role authenticated;
do $$
begin
  begin
    perform public.pause_session(pg_temp.uuid_val('session3'));
    raise exception 'FAILED: 他人のタイマーを一時停止できてしまった';
  exception
    when no_data_found then
      raise notice '  ok   他人のタイマーは操作できない';
  end;
end;
$$;

-- 使えないカテゴリーでは開始できない
do $$
begin
  begin
    perform public.start_session(pg_temp.uuid_val('category'));  -- alice の個人カテゴリー
    raise exception 'FAILED: 他人のカテゴリーで開始できてしまった';
  exception
    when no_data_found then
      raise notice '  ok   他人の個人カテゴリーでは開始できない';
  end;
end;
$$;

-- 他人のセッションは直接見えない
reset role;
select set_config('request.jwt.claim.sub', :'bob', true);
set local role authenticated;
select pg_temp.check((select count(*) from public.activity_sessions) = 0,
  '他人のタイマーセッションは直接見えない');
select pg_temp.check(
  (select count(*) from public.get_active_group_members() where user_id = pg_temp.uuid_val('alice')) = 1,
  '同じグループの活動中メンバーは取得できる');

reset role;
select set_config('request.jwt.claim.sub', :'carol', true);
set local role authenticated;
select pg_temp.check((select count(*) from public.get_active_group_members()) = 0,
  'グループ外からは活動中メンバーが見えない');

-- -----------------------------------------------------------------------------
\echo ''
\echo '== 活動記録の作成（RPC）'
-- -----------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claim.sub', :'alice', true);
set local role authenticated;

-- 手動記録: カテゴリーと時間だけで作れる
insert into v select 'manual_post',
  public.create_activity_post(p_category_id := pg_temp.uuid_val('category'), p_duration_seconds := 1800)::text;

select pg_temp.check(
  (select duration_seconds = 1800 and visibility = 'private' and session_id is null
     from public.activity_posts where id = pg_temp.uuid_val('manual_post')),
  '手動記録はカテゴリーと時間だけで作れる');

select pg_temp.check(
  (select activity_date from public.activity_posts where id = pg_temp.uuid_val('manual_post'))
    = public.user_today(pg_temp.uuid_val('alice')),
  'activity_date はユーザーのタイムゾーンでの今日になる');

-- 未来の日付、範囲外の時間は受け付けない
do $$
begin
  begin
    perform public.create_activity_post(
      p_category_id := pg_temp.uuid_val('category'),
      p_duration_seconds := 600,
      p_activity_date := (public.user_today() + 1));
    raise exception 'FAILED: 未来の日付で記録を作れてしまった';
  exception when raise_exception then
    if sqlerrm like 'FAILED:%' then raise; end if;
    raise notice '  ok   未来の日付では記録を作れない';
  end;

  begin
    perform public.create_activity_post(
      p_category_id := pg_temp.uuid_val('category'), p_duration_seconds := 86401);
    raise exception 'FAILED: 24時間を超える記録を作れてしまった';
  exception when raise_exception then
    if sqlerrm like 'FAILED:%' then raise; end if;
    raise notice '  ok   24時間を超える記録は作れない';
  end;
end;
$$;

-- タイマー由来の記録: 活動時間はセッションから取る（クライアントの値を使わない）
insert into v select 'timer_post',
  public.create_activity_post(
    p_session_id := pg_temp.uuid_val('session'),
    p_duration_seconds := 999999,   -- 無視されるべき値
    p_visibility := 'group',
    p_group_id := pg_temp.uuid_val('group'))::text;

select pg_temp.check(
  (select duration_seconds between 538 and 542
     from public.activity_posts where id = pg_temp.uuid_val('timer_post')),
  'タイマー由来の記録は、渡された活動時間ではなくセッションの値を使う');

-- 同じセッションから二重に記録は作れない
do $$
begin
  begin
    perform public.create_activity_post(p_session_id := pg_temp.uuid_val('session'));
    raise exception 'FAILED: 同じセッションから2つ記録を作れてしまった';
  exception when raise_exception or unique_violation then
    if sqlerrm like 'FAILED:%' then raise; end if;
    raise notice '  ok   同じセッションから記録は1つしか作れない';
  end;
end;
$$;

-- 所属していないグループへは公開できない / 届かない相手は宛先にできない
do $$
begin
  begin
    perform public.create_activity_post(
      p_category_id := pg_temp.uuid_val('category'), p_duration_seconds := 600,
      p_visibility := 'selected', p_allowed_user_ids := array[pg_temp.uuid_val('carol')]);
    raise exception 'FAILED: 同じグループにいない相手を宛先にできてしまった';
  exception when insufficient_privilege then
    raise notice '  ok   同じグループにいない相手は宛先にできない';
  end;

  begin
    perform public.create_activity_post(
      p_category_id := pg_temp.uuid_val('category'), p_duration_seconds := 600,
      p_visibility := 'selected', p_allowed_user_ids := array[]::uuid[]);
    raise exception 'FAILED: 宛先なしの selected を作れてしまった';
  exception when raise_exception then
    if sqlerrm like 'FAILED:%' then raise; end if;
    raise notice '  ok   宛先なしの selected 公開は作れない';
  end;
end;
$$;

-- 編集: 公開範囲を変えると宛先も入れ替わる
select public.update_activity_post(
  p_post_id := pg_temp.uuid_val('manual_post'),
  p_title := '英単語',
  p_visibility := 'selected',
  p_allowed_user_ids := array[pg_temp.uuid_val('bob')]);

select pg_temp.check(
  (select count(*) from public.post_allowed_users
    where post_id = pg_temp.uuid_val('manual_post')) = 1,
  '編集で selected にすると宛先が登録される');

select public.update_activity_post(
  p_post_id := pg_temp.uuid_val('manual_post'),
  p_visibility := 'private');

select pg_temp.check(
  (select count(*) from public.post_allowed_users
    where post_id = pg_temp.uuid_val('manual_post')) = 0,
  'private に戻すと宛先が消える');

-- タイマー由来の記録は、編集でも時間を書き換えられない
select public.update_activity_post(
  p_post_id := pg_temp.uuid_val('timer_post'),
  p_duration_seconds := 1,
  p_visibility := 'private');
select pg_temp.check(
  (select duration_seconds between 538 and 542
     from public.activity_posts where id = pg_temp.uuid_val('timer_post')),
  'タイマー由来の記録は編集でも活動時間が変わらない');

-- 他人の記録は編集も削除もできない
reset role;
select set_config('request.jwt.claim.sub', :'bob', true);
set local role authenticated;
do $$
begin
  begin
    perform public.update_activity_post(
      p_post_id := pg_temp.uuid_val('manual_post'), p_visibility := 'private');
    raise exception 'FAILED: 他人の記録を編集できてしまった';
  exception when no_data_found then
    raise notice '  ok   他人の記録は編集できない';
  end;

  begin
    perform public.delete_activity_post(pg_temp.uuid_val('manual_post'));
    raise exception 'FAILED: 他人の記録を削除できてしまった';
  exception when no_data_found then
    raise notice '  ok   他人の記録は削除できない';
  end;
end;
$$;

-- 論理削除
reset role;
select set_config('request.jwt.claim.sub', :'alice', true);
set local role authenticated;
select public.delete_activity_post(pg_temp.uuid_val('manual_post'));
select pg_temp.check(
  (select deleted_at is not null from public.activity_posts where id = pg_temp.uuid_val('manual_post')),
  'delete_activity_post は行を消さず deleted_at を立てる');

do $$
begin
  begin
    perform public.delete_activity_post(pg_temp.uuid_val('manual_post'));
    raise exception 'FAILED: 削除済みの記録をもう一度削除できてしまった';
  exception when no_data_found then
    raise notice '  ok   削除済みの記録は二重に削除されない';
  end;
end;
$$;

-- -----------------------------------------------------------------------------
\echo ''
\echo '== 招待の期限・失効・上限'
-- -----------------------------------------------------------------------------
reset role;
with created as (
  insert into public.group_invitations (group_id, invited_by, expires_at)
  values (pg_temp.uuid_val('group'), pg_temp.uuid_val('alice'), now() - interval '1 day')
  returning token
)
insert into v select 'expired', token from created;
with created as (
  insert into public.group_invitations (group_id, invited_by, max_uses, used_count)
  values (pg_temp.uuid_val('group'), pg_temp.uuid_val('alice'), 1, 1)
  returning token
)
insert into v select 'used_up', token from created;
with created as (
  insert into public.group_invitations (group_id, invited_by, revoked_at)
  values (pg_temp.uuid_val('group'), pg_temp.uuid_val('alice'), now())
  returning token
)
insert into v select 'revoked', token from created;

select set_config('request.jwt.claim.sub', :'carol', true);
set local role authenticated;

do $$
declare
  v_case text;
  v_labels constant text[] := array['expired', 'used_up', 'revoked'];
  v_names  constant text[] := array['期限切れ', '利用上限', '失効済み'];
  i integer;
begin
  for i in 1 .. array_length(v_labels, 1) loop
    v_case := pg_temp.val(v_labels[i]);
    begin
      perform public.accept_invitation(v_case);
      raise exception 'FAILED: %の招待で参加できてしまった', v_names[i];
    exception
      when raise_exception then
        if sqlerrm like 'FAILED:%' then raise; end if;
        raise notice '  ok   %の招待では参加できない', v_names[i];
    end;
  end loop;
end;
$$;

select pg_temp.check(
  (select is_valid from public.get_invitation_preview(pg_temp.val('expired'))) = false,
  '招待リンクの確認画面でも期限切れと分かる');
select pg_temp.check(
  (select reason from public.get_invitation_preview(pg_temp.val('revoked'))) = 'revoked',
  '失効した招待は理由まで返る');
select pg_temp.check(
  (select group_name from public.get_invitation_preview(pg_temp.val('expired'))) = 'ふたりの記録',
  'ログイン前でもグループ名だけは確認できる');

-- 権限のないユーザーは招待を作れない
do $$
begin
  begin
    insert into public.group_invitations (group_id, invited_by)
    values (pg_temp.uuid_val('group'), auth.uid());
    raise exception 'FAILED: グループ外のユーザーが招待を作れてしまった';
  exception when insufficient_privilege then
    raise notice '  ok   グループ外のユーザーは招待を作れない';
  end;
end;
$$;

-- -----------------------------------------------------------------------------
\echo ''
\echo '== 管理者操作'
-- -----------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claim.sub', :'bob', true);
set local role authenticated;

update public.group_members set role = 'admin'
where group_id = pg_temp.uuid_val('group') and user_id = :'bob';

reset role;
select pg_temp.check(
  (select role from public.group_members
    where group_id = pg_temp.uuid_val('group') and user_id = :'bob') = 'member',
  '一般メンバーは自分を管理者に昇格できない');

select set_config('request.jwt.claim.sub', :'alice', true);
set local role authenticated;
delete from public.group_members
where group_id = pg_temp.uuid_val('group') and user_id = :'alice';

reset role;
select pg_temp.check(
  (select count(*) from public.group_members
    where group_id = pg_temp.uuid_val('group') and user_id = :'alice') = 1,
  '作成者はメンバーから削除されない');

-- 退会はできる
select set_config('request.jwt.claim.sub', :'bob', true);
set local role authenticated;
delete from public.group_members
where group_id = pg_temp.uuid_val('group') and user_id = :'bob';
reset role;
select pg_temp.check(
  (select count(*) from public.group_members where group_id = pg_temp.uuid_val('group')) = 1,
  '一般メンバーは自分で退会できる');

rollback;

\o

\echo ''
\echo '  すべての RLS テストに合格しました。'
\echo ''
