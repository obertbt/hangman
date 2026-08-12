-- =============================================================
-- 0017_measurement_guards.sql
-- 測定（3章の6: 成長を確認できる）を書く前に確かめること。
--
-- 0011 の教訓をそのまま当てる。
-- measurement_results は3つの表を指しているのに、
-- RLS は自分の team_id しか見ていなかった。
-- 別チームの記録会・項目・部員を指す行を作れてしまう。
--
-- チームの一致は権限ではなくデータの整合性なので、トリガで守る。
-- =============================================================

create or replace function app.validate_measurement_result()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team uuid;
begin
  select team_id into v_team from public.measurement_events where id = new.measurement_event_id;
  if v_team is null then
    raise exception '対象の測定会が見つかりません';
  end if;
  if v_team <> new.team_id then
    raise exception '別のチームの測定会は参照できません';
  end if;

  select team_id into v_team from public.measurement_items where id = new.measurement_item_id;
  if v_team is distinct from new.team_id then
    raise exception '別のチームの測定項目は参照できません';
  end if;

  select team_id into v_team from public.team_members where id = new.team_member_id;
  if v_team is distinct from new.team_id then
    raise exception '別のチームの部員は参照できません';
  end if;

  -- 数値も文字も入っていない行は、記録として意味がない
  if new.value is null and (new.text_value is null or btrim(new.text_value) = '') then
    raise exception '測定の値が入っていません';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists measurement_results_validate on public.measurement_results;
create trigger measurement_results_validate
  before insert or update on public.measurement_results
  for each row execute function app.validate_measurement_result();

-- -------------------------------------------------------------
-- 測定会も、参照先のシーズン・予定が同じチームであること
-- -------------------------------------------------------------
create or replace function app.validate_measurement_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team uuid;
begin
  if new.season_id is not null then
    select team_id into v_team from public.seasons where id = new.season_id;
    if v_team is distinct from new.team_id then
      raise exception '別のチームのシーズンは参照できません';
    end if;
  end if;

  if new.event_id is not null then
    select team_id into v_team from public.events where id = new.event_id;
    if v_team is distinct from new.team_id then
      raise exception '別のチームの予定は参照できません';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists measurement_events_validate on public.measurement_events;
create trigger measurement_events_validate
  before insert or update on public.measurement_events
  for each row execute function app.validate_measurement_event();

-- -------------------------------------------------------------
-- 自分の記録は自分でも入れられるようにする
--
-- 0008 では書き込みをスタッフだけに限っていた。
-- 記録会でコーチが測るぶんにはそれでよいが、
-- 「自主的に測った」を残せないと、記録が続かない。
--
-- ただし**他人の記録には触らせない**。
-- 更新も自分の行だけに限る（スタッフは全員ぶん触れる）。
-- -------------------------------------------------------------
create policy measurement_results_own_write on public.measurement_results
  for insert to authenticated
  with check (app.is_own_member(team_member_id) and app.is_team_member(team_id));

create policy measurement_results_own_update on public.measurement_results
  for update to authenticated
  using (app.is_own_member(team_member_id))
  with check (app.is_own_member(team_member_id));
