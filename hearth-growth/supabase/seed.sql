-- =============================================================================
-- Hearth Growth : ローカル開発用シード
-- =============================================================================
-- 本番では実行しない。`supabase db reset` 時に migrations の後で適用される。
--
-- ユーザーのプロフィールと初期カテゴリーは auth.users への insert トリガー
-- (handle_new_user) が自動生成するため、ここではテスト用ユーザーだけを作る。
-- =============================================================================

do $$
declare
  v_alice uuid := '00000000-0000-4000-8000-000000000001';
  v_bob   uuid := '00000000-0000-4000-8000-000000000002';
  v_group uuid;
begin
  -- すでにシード済みなら何もしない
  if exists (select 1 from auth.users where id = v_alice) then
    return;
  end if;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values
    (v_alice, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'alice@example.com', crypt('password123', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"display_name":"あさひ"}'::jsonb, now(), now()),
    (v_bob, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'bob@example.com', crypt('password123', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"display_name":"ゆうき"}'::jsonb, now(), now());

  -- グループと参加（RPC は auth.uid() を要求するため、ここでは直接挿入する）
  insert into public.groups (name, description, owner_id)
  values ('ふたりの記録', '毎日を少しずつ積み上げる場所', v_alice)
  returning id into v_group;

  insert into public.group_members (group_id, user_id, role)
  values (v_group, v_alice, 'owner'),
         (v_group, v_bob, 'member');

  -- 動作確認用の記録を1件だけ
  insert into public.activity_posts
    (user_id, category_id, title, body, duration_seconds, activity_date, visibility, group_id)
  select
    v_alice,
    (select id from public.categories where user_id = v_alice and name = '勉強'),
    '英単語',
    '朝のうちに30分だけ。',
    1800,
    current_date,
    'group',
    v_group;
end;
$$;
