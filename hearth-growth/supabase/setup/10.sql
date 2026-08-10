-- Hearth Growth セットアップ 10 / 10
-- 番号順に、Supabase の SQL Editor へ貼り付けて実行してください。
-- 元になっているのは supabase/migrations/ の各ファイルです。

create or replace function public.get_group_week_summary(p_group_id uuid, p_week_start date default null)
returns table (
  user_id       uuid,
  display_name  text,
  avatar_url    text,
  total_seconds bigint,
  active_days   integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start date := coalesce(p_week_start, public.user_week_start());
begin
  if not public.is_group_member(p_group_id, auth.uid()) then
    raise exception 'not a group member' using errcode = '42501';
  end if;

  return query
  select
    m.user_id,
    pr.display_name,
    pr.avatar_url,
    coalesce(sum(p.duration_seconds), 0)::bigint,
    count(distinct p.activity_date)::integer
  from public.group_members m
  join public.profiles pr on pr.id = m.user_id
  left join public.activity_posts p
    on p.user_id = m.user_id
   and p.deleted_at is null
   and p.visibility = 'group'
   and p.activity_date between v_start and v_start + 6
   and exists (
     select 1 from public.post_groups g
     where g.post_id = p.id and g.group_id = p_group_id
   )
   and exists (
     select 1 from public.categories c
     where c.id = p.category_id and c.counts_toward_total
   )
  where m.group_id = p_group_id
  group by m.user_id, pr.display_name, pr.avatar_url
  order by pr.display_name;
end;
$$;

/*
 * 就寝はタイマーの開始、起床はタイマーの終了と記録の作成にあたる。
 * 仕組みを増やさず、既にあるタイマーへ寄せる。
 * こうすると「今の睡眠時間」も途中で分かるし、
 * 端末の時計ではなくサーバーの時刻で測られる。
 *
 * 押す回数は1回ずつ。振り返りの入力は挟まない。
 * 眠いときと寝起きに文章を書かせない。
 */
create or replace function public.start_sleep()
returns public.activity_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id     uuid := auth.uid();
  v_category_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select id into v_category_id
  from public.categories
  where user_id = v_user_id and name = '睡眠'
  limit 1;

  -- 消してしまった人のために作り直す
  if v_category_id is null then
    insert into public.categories (user_id, name, icon, color, sort_order, counts_toward_total)
    values (v_user_id, '睡眠', '😴', '#7A7F9A', 95, false)
    returning id into v_category_id;
  end if;

  return public.start_session(v_category_id, null, null);
end;
$$;

/*
 * 起床。走っている睡眠のタイマーを終わらせ、そのまま記録にする。
 *
 * 公開範囲は、その人の既定（設定画面で選んだもの）に合わせる。
 * group を既定にしていて、どのグループにも入っていない場合は「自分だけ」。
 */
create or replace function public.wake_up()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id    uuid := auth.uid();
  v_session_id uuid;
  v_visibility text;
  v_group_ids  uuid[];
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select s.id into v_session_id
  from public.activity_sessions s
  join public.categories c on c.id = s.category_id
  where s.user_id = v_user_id
    and s.status in ('running', 'paused')
    and c.name = '睡眠'
  limit 1;

  if v_session_id is null then
    raise exception 'not sleeping' using errcode = 'P0002';
  end if;

  perform public.complete_session(v_session_id, null);

  select default_visibility into v_visibility from public.profiles where id = v_user_id;

  if v_visibility = 'group' then
    select array_agg(group_id) into v_group_ids
    from public.group_members where user_id = v_user_id;

    -- どこにも入っていなければ、公開しようがない
    if v_group_ids is null then
      v_visibility := 'private';
    end if;
  elsif v_visibility = 'selected' then
    -- 宛先を選ばせない導線なので、既定が selected でも「自分だけ」にする
    v_visibility := 'private';
  end if;

  return public.create_activity_post(
    p_session_id => v_session_id,
    p_visibility => v_visibility,
    p_group_ids  => v_group_ids
  );
end;
$$;

revoke all on function public.start_sleep() from public, anon;
revoke all on function public.wake_up() from public, anon;
grant execute on function public.start_sleep() to authenticated;
grant execute on function public.wake_up() to authenticated;
