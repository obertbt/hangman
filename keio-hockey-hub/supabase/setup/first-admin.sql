-- =============================================================
-- first-admin.sql
-- 最初の管理者を作る。**SQL が要るのはこの1回だけ。**
--
-- 2人目からは、画面の「招待」からリンクを渡せば本人が作れる。
--
-- 前提:
--   1. migration を流し終えている
--   2. Supabase の Authentication → Users → Add user で
--      自分のメールとパスワードを登録してある
--      （Auto Confirm User を有効にしておく。確認メールを待たずに入れる）
--
-- 使い方:
--   下の2行だけ書き換えて、SQL Editor で実行する。
-- =============================================================

do $$
declare
  -- ▼ ここだけ書き換える ▼
  v_email     text := 'ここに管理者のメールアドレス';
  v_full_name text := 'ここに氏名';
  -- ▲ ここだけ書き換える ▲

  v_user_id uuid;
  v_team_id uuid;
  v_profile_id uuid;
begin
  select id into v_user_id from auth.users where email = v_email;
  if v_user_id is null then
    raise exception
      '% の利用者が見つかりません。先に Authentication → Users で作ってください。', v_email;
  end if;

  -- チーム。seed.sql を流してあれば、そこで作ったものを使う。
  select id into v_team_id from public.teams where slug = 'keio-hockey';
  if v_team_id is null then
    insert into public.teams (name, display_name, slug)
    values ('keio-hockey', '慶應義塾大学 女子フィールドホッケー部', 'keio-hockey')
    returning id into v_team_id;
  end if;

  -- プロフィール。
  -- seed.sql の見本（admin@example.com など）と同じメールなら、それに結び付ける。
  -- そうでなければ新しく作る。二重に作らないための分岐。
  select id into v_profile_id from public.profiles where user_id = v_user_id;

  if v_profile_id is null then
    select id into v_profile_id
    from public.profiles
    where email = v_email and user_id is null
    limit 1;

    if v_profile_id is not null then
      update public.profiles set user_id = v_user_id where id = v_profile_id;
    else
      insert into public.profiles (user_id, full_name, email)
      values (v_user_id, v_full_name, v_email)
      returning id into v_profile_id;
    end if;
  end if;

  -- 所属。すでにあれば管理者へ上げる。
  if exists (
    select 1 from public.team_members
    where team_id = v_team_id and profile_id = v_profile_id and deleted_at is null
  ) then
    -- 0018 のトリガは「自分の役割は変えられない」を見るが、
    -- ここはまだ誰も所属していない段階の設定なので、直接更新する。
    update public.team_members
    set role_code = 'system_admin', status = 'active'
    where team_id = v_team_id and profile_id = v_profile_id;
  else
    insert into public.team_members (team_id, profile_id, role_code, status)
    values (v_team_id, v_profile_id, 'system_admin', 'active');
  end if;

  raise notice '完了: % を管理者にしました。ログインできます。', v_email;
end;
$$;

-- 確認。1行返れば成功。
select
  p.full_name as 氏名,
  p.email     as メール,
  m.role_code as 役割,
  t.display_name as チーム
from public.team_members m
join public.profiles p on p.id = m.profile_id
join public.teams t on t.id = m.team_id
where m.role_code = 'system_admin' and p.user_id is not null;
