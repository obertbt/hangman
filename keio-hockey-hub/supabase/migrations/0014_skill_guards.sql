-- =============================================================
-- 0014_skill_guards.sql
--
-- スキル（30〜32章）を書く前に確かめること。
--
-- 見つかった問題:
--   player_skills の更新ポリシーが
--     using (skill.review を持つ or 本人)
--   になっていた。つまり**選手が自分の到達状況を approved にできた**。
--   スキル承認はこのシステムで唯一「他人に認めてもらう」記録なので、
--   自分で書き換えられるなら意味がない。
--   skill_applications も同じで、本人が自分の申請を approved にできた。
--
-- 対処:
--   0011 と同じ考え方で、RLS ではなくトリガで守る。
--   これは権限だけの話ではなく「その行が正しいか」の話なので、
--   service role を含めどの経路から書いても守られるべき。
--
--   ついでに、参照先のチーム一致（0011 の教訓）と
--   到達状況の履歴（75章）もここでまとめて面倒を見る。
-- =============================================================

-- -------------------------------------------------------------
-- 到達状況: 承認できるのは審査できる人だけ
-- -------------------------------------------------------------
create or replace function app.validate_player_skill()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_skill_team  uuid;
  v_member_team uuid;
  v_was_approved boolean := false;
begin
  -- 参照先のチーム一致（0011 の教訓）
  select team_id into v_skill_team from public.skills where id = new.skill_id;
  if v_skill_team is null then
    raise exception '対象のスキルが見つかりません';
  end if;
  if v_skill_team <> new.team_id then
    raise exception '別のチームのスキルは参照できません';
  end if;

  select team_id into v_member_team from public.team_members where id = new.team_member_id;
  if v_member_team is null then
    raise exception '対象の部員が見つかりません';
  end if;
  if v_member_team <> new.team_id then
    raise exception '別のチームの部員は参照できません';
  end if;

  if tg_op = 'UPDATE' then
    v_was_approved := old.status = 'approved';
  end if;

  -- 承認へ入るときと、承認から出るときは skill.review が要る
  if new.status = 'approved' and not v_was_approved then
    if not app.has_permission(new.team_id, 'skill.review') then
      raise exception 'スキルを承認できるのは審査担当だけです';
    end if;
    new.approved_at := now();
    new.approved_by := app.current_profile_id();
  elsif v_was_approved and new.status <> 'approved' then
    if not app.has_permission(new.team_id, 'skill.review') then
      raise exception '承認済みのスキルを取り消せるのは審査担当だけです';
    end if;
    new.approved_at := null;
    new.approved_by := null;
  elsif new.status <> 'approved' then
    -- 承認していないのに承認の跡だけ残す、を防ぐ
    new.approved_at := null;
    new.approved_by := null;
  end if;

  return new;
end;
$$;

drop trigger if exists player_skills_validate on public.player_skills;
create trigger player_skills_validate
  before insert or update on public.player_skills
  for each row execute function app.validate_player_skill();

-- -------------------------------------------------------------
-- 到達状況の履歴（75章）
--
-- 画面から書き忘れることがあるので、DB 側で自動的に残す。
-- 「いつ承認されたか」は選手にとって一番大事な記録なので、
-- アプリの実装漏れで欠けてはいけない。
-- -------------------------------------------------------------
create or replace function app.log_player_skill_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- 何も起きていない 'not_started' での作成は履歴に残さない（読むときの雑音になる）
  if tg_op = 'INSERT' then
    if new.status <> 'not_started' then
      insert into public.skill_status_histories (team_id, player_skill_id, from_status, to_status, changed_by)
      values (new.team_id, new.id, null, new.status, app.current_profile_id());
    end if;
  elsif new.status is distinct from old.status then
    insert into public.skill_status_histories (team_id, player_skill_id, from_status, to_status, changed_by)
    values (new.team_id, new.id, old.status, new.status, app.current_profile_id());
  end if;

  return new;
end;
$$;

drop trigger if exists player_skills_log_status on public.player_skills;
create trigger player_skills_log_status
  after insert or update on public.player_skills
  for each row execute function app.log_player_skill_status();

-- -------------------------------------------------------------
-- 申請: 審査結果を本人が書き込めないようにする
-- -------------------------------------------------------------
create or replace function app.validate_skill_application()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_skill_team  uuid;
  v_member_team uuid;
  v_old_status  text;
begin
  select team_id into v_skill_team from public.skills where id = new.skill_id;
  if v_skill_team is null then
    raise exception '対象のスキルが見つかりません';
  end if;
  if v_skill_team <> new.team_id then
    raise exception '別のチームのスキルは参照できません';
  end if;

  select team_id into v_member_team from public.team_members where id = new.team_member_id;
  if v_member_team is null then
    raise exception '対象の部員が見つかりません';
  end if;
  if v_member_team <> new.team_id then
    raise exception '別のチームの部員は参照できません';
  end if;

  v_old_status := case when tg_op = 'UPDATE' then old.status else null end;

  -- 審査の結果にあたる状態は、審査担当しか付けられない
  if new.status in ('reviewing', 'approved', 'rejected') and new.status is distinct from v_old_status then
    if not app.has_permission(new.team_id, 'skill.review') then
      raise exception '申請を審査できるのは審査担当だけです';
    end if;
    new.reviewed_at := now();
  end if;

  if new.status = 'submitted' and new.status is distinct from v_old_status then
    new.submitted_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists skill_applications_validate on public.skill_applications;
create trigger skill_applications_validate
  before insert or update on public.skill_applications
  for each row execute function app.validate_skill_application();

-- -------------------------------------------------------------
-- 申請の根拠: 別チームの動画・質問を添えられないようにする（0011 の教訓）
-- -------------------------------------------------------------
create or replace function app.validate_skill_application_item()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team uuid;
begin
  select team_id into v_team from public.skill_applications where id = new.skill_application_id;
  if v_team is null then
    raise exception '対象の申請が見つかりません';
  end if;
  if v_team <> new.team_id then
    raise exception '別のチームの申請には根拠を足せません';
  end if;

  if new.video_id is not null then
    select team_id into v_team from public.videos where id = new.video_id;
    if v_team is distinct from new.team_id then
      raise exception '別のチームの動画は参照できません';
    end if;
  end if;

  if new.video_clip_id is not null then
    select team_id into v_team from public.video_clips where id = new.video_clip_id;
    if v_team is distinct from new.team_id then
      raise exception '別のチームのクリップは参照できません';
    end if;
  end if;

  if new.feedback_request_id is not null then
    select team_id into v_team from public.feedback_requests where id = new.feedback_request_id;
    if v_team is distinct from new.team_id then
      raise exception '別のチームの質問は参照できません';
    end if;
  end if;

  if new.file_id is not null then
    select team_id into v_team from public.files where id = new.file_id;
    if v_team is distinct from new.team_id then
      raise exception '別のチームのファイルは参照できません';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists skill_application_items_validate on public.skill_application_items;
create trigger skill_application_items_validate
  before insert or update on public.skill_application_items
  for each row execute function app.validate_skill_application_item();

-- -------------------------------------------------------------
-- 審査結果: 対象の申請と同じチームであること
-- -------------------------------------------------------------
create or replace function app.validate_skill_review()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team uuid;
begin
  select team_id into v_team from public.skill_applications where id = new.skill_application_id;
  if v_team is null then
    raise exception '対象の申請が見つかりません';
  end if;
  if v_team <> new.team_id then
    raise exception '別のチームの申請は審査できません';
  end if;

  return new;
end;
$$;

drop trigger if exists skill_reviews_validate on public.skill_reviews;
create trigger skill_reviews_validate
  before insert or update on public.skill_reviews
  for each row execute function app.validate_skill_review();

-- -------------------------------------------------------------
-- 履歴は消させない・書き換えさせない
--
-- 「いつ承認されたか」を後から書き換えられると、記録の意味がなくなる。
-- 追加はトリガ（security definer）が行うので、
-- 利用者から直接 insert できる必要はない。
-- -------------------------------------------------------------
revoke insert, update, delete on public.skill_status_histories from authenticated;
revoke update, delete on public.skill_reviews from authenticated;
