-- =============================================================
-- 0021_invitations.sql
-- 招待の入口（Phase 1 の積み残し）。
--
-- いまは最初の管理者以外も、Supabase の管理画面で利用者を作る必要がある。
-- 新入部員が入るたびに管理画面を開くのは、長く続かない（3章の11）。
--
-- 難しいのは「まだ部員でない人」を相手にすること。
-- RLS は「チームの一員かどうか」で守っているので、
-- 招待を受け取る側はどのポリシーにも当てはまらない。
-- 受け取り側の入口だけを security definer の関数で開ける。
-- =============================================================

-- -------------------------------------------------------------
-- 生のトークンを DB に残さない
--
-- 招待リンクは「持っているだけでアカウントを作れる」ものなので、
-- パスワードと同じ重さで扱う。
-- 残すのはハッシュだけ。DB が漏れても、そこから招待リンクは作れない。
-- （署名付き URL を保存しないのと同じ考え方。75章）
-- -------------------------------------------------------------
alter table public.team_invitations rename column token to token_hash;

comment on column public.team_invitations.token_hash is
  '招待トークンの sha256（16進）。生の値は発行時にリンクへ載せるだけで、ここには残さない。';

-- -------------------------------------------------------------
-- 招待できる役割の制限
--
-- 0018 で「役割を変えられるのは管理者だけ」にした。
-- 招待で役割を渡せてしまうと、そこが抜け道になる。
-- コーチやマネージャーは選手しか招待できない。
-- -------------------------------------------------------------
create or replace function app.guard_invitation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_member_team uuid;
begin
  if new.role_code <> 'player' and app.role_in_team(new.team_id) <> 'system_admin' then
    raise exception '選手以外を招待できるのは管理者だけです';
  end if;

  -- 既存の部員に結び付ける招待なら、同じチームであること（0011 の教訓）
  if new.team_member_id is not null then
    select team_id into v_member_team from public.team_members where id = new.team_member_id;
    if v_member_team is distinct from new.team_id then
      raise exception '別のチームの部員は招待できません';
    end if;
  end if;

  -- 作るときだけ見る。時間が経って期限切れになるのは当たり前なので、
  -- あとからの更新（accepted_at を入れるなど）を止めてはいけない。
  if tg_op = 'INSERT' and new.expires_at <= now() then
    raise exception '期限が過去になっています';
  end if;

  return new;
end;
$$;

drop trigger if exists team_invitations_guard on public.team_invitations;
create trigger team_invitations_guard
  before insert or update on public.team_invitations
  for each row execute function app.guard_invitation();

-- -------------------------------------------------------------
-- 受け取る側から見た招待
--
-- まだログインしていない人が呼ぶので anon にも実行を許す。
-- **トークンのハッシュを知っている人にだけ**答える。
-- 返すのは画面に出すぶんだけで、他の部員の情報は出さない。
-- -------------------------------------------------------------
create or replace function public.find_invitation(p_token_hash text)
returns table (
  team_name    text,
  invited_name text,
  email        text,
  role_code    text,
  expires_at   timestamptz,
  accepted_at  timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    t.display_name,
    p.full_name,
    i.email,
    i.role_code,
    i.expires_at,
    i.accepted_at
  from public.team_invitations i
  join public.teams t on t.id = i.team_id
  left join public.team_members tm on tm.id = i.team_member_id
  left join public.profiles p on p.id = tm.profile_id
  where i.token_hash = p_token_hash;
$$;

revoke all on function public.find_invitation(text) from public;
grant execute on function public.find_invitation(text) to anon, authenticated;

-- -------------------------------------------------------------
-- 招待を受ける
--
-- 認証利用者を作るのはアプリ側（Supabase Auth）。
-- ここは「その利用者を、この部員に結び付ける」だけを引き受ける。
--
-- 期限切れ・使用済みは必ずここで弾く。
-- 画面側でも見るが、最後に守るのはこちら。
-- -------------------------------------------------------------
create or replace function public.accept_invitation(p_token_hash text, p_user_id uuid, p_full_name text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inv        public.team_invitations;
  v_profile_id uuid;
  v_member_id  uuid;
begin
  select * into v_inv from public.team_invitations where token_hash = p_token_hash;
  if v_inv.id is null then
    raise exception '招待が見つかりません';
  end if;

  if v_inv.accepted_at is not null then
    raise exception 'この招待はすでに使われています';
  end if;

  if v_inv.expires_at <= now() then
    raise exception 'この招待は期限が切れています';
  end if;

  -- 1人の認証利用者が2つのプロフィールを持たないようにする
  if exists (select 1 from public.profiles where user_id = p_user_id) then
    raise exception 'この利用者はすでに登録されています';
  end if;

  if v_inv.team_member_id is not null then
    -- 移行で登録済みの部員に、ログインを結び付ける（ADR-0002）
    select tm.id, tm.profile_id into v_member_id, v_profile_id
    from public.team_members tm
    where tm.id = v_inv.team_member_id and tm.deleted_at is null;

    if v_member_id is null then
      raise exception '招待された部員が見つかりません';
    end if;

    update public.profiles
      set user_id = p_user_id,
          email = coalesce(email, v_inv.email)
      where id = v_profile_id and user_id is null;

    if not found then
      raise exception 'この部員にはすでにログインが結び付いています';
    end if;
  else
    -- 名簿に無い人を新しく迎える
    insert into public.profiles (user_id, full_name, email)
    values (p_user_id, coalesce(nullif(btrim(p_full_name), ''), v_inv.email), v_inv.email)
    returning id into v_profile_id;

    insert into public.team_members (team_id, profile_id, role_code, status)
    values (v_inv.team_id, v_profile_id, v_inv.role_code, 'active')
    returning id into v_member_id;
  end if;

  update public.team_invitations set accepted_at = now() where id = v_inv.id;

  -- 63章: 誰がいつ入ったかは残す
  insert into public.audit_logs (team_id, actor_id, action, target_table, target_id, summary)
  values (v_inv.team_id, v_profile_id, 'invitation.accept', 'team_members', v_member_id,
          format('%s として参加', v_inv.role_code));

  return v_member_id;
end;
$$;

revoke all on function public.accept_invitation(text, uuid, text) from public;
grant execute on function public.accept_invitation(text, uuid, text) to anon, authenticated;

-- -------------------------------------------------------------
-- 発行した招待は、生の値を持たない
--
-- スタッフが一覧で見られるのは「誰に・いつまで・使われたか」だけ。
-- リンクをもう一度見ることはできない。無くしたら作り直す。
-- -------------------------------------------------------------
comment on table public.team_invitations is
  '招待。リンクの生の値は保存しないため、再表示はできない。無くした場合は作り直す。';
