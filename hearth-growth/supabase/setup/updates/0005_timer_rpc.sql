-- Hearth Growth : 0005_timer_rpc.sql だけを実行する
-- すでに動いている環境へ、この変更ぶんだけを足すためのファイルです。
-- まっさらな状態から作る場合は supabase/setup/ の 01 から順に実行してください。

create or replace function public.start_session(
  p_category_id uuid,
  p_title       text default null,
  p_note        text default null
)
returns public.activity_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.activity_sessions;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- 自分が使えるカテゴリーか（個人のもの、または所属グループのもの）
  if not exists (
    select 1 from public.categories c
    where c.id = p_category_id
      and c.is_active
      and (
        c.user_id = v_user_id
        or (c.group_id is not null and public.is_group_member(c.group_id, v_user_id))
      )
  ) then
    raise exception 'category not available' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.activity_sessions
    where user_id = v_user_id and status in ('running', 'paused')
  ) then
    raise exception 'session already active' using errcode = 'P0001';
  end if;

  insert into public.activity_sessions (user_id, category_id, title, note)
  values (
    v_user_id,
    p_category_id,
    nullif(trim(coalesce(p_title, '')), ''),
    nullif(trim(coalesce(p_note, '')), '')
  )
  returning * into v_session;

  return v_session;
end;
$$;

create or replace function public.pause_session(p_session_id uuid)
returns public.activity_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.activity_sessions;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  update public.activity_sessions
  set status = 'paused', paused_at = now()
  where id = p_session_id and user_id = v_user_id and status = 'running'
  returning * into v_session;

  if not found then
    raise exception 'session not running' using errcode = 'P0002';
  end if;

  return v_session;
end;
$$;

create or replace function public.resume_session(p_session_id uuid)
returns public.activity_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.activity_sessions;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  update public.activity_sessions
  set
    total_paused_seconds =
      total_paused_seconds + greatest(0, floor(extract(epoch from (now() - paused_at)))::integer),
    paused_at = null,
    status = 'running'
  where id = p_session_id and user_id = v_user_id and status = 'paused'
  returning * into v_session;

  if not found then
    raise exception 'session not paused' using errcode = 'P0002';
  end if;

  return v_session;
end;
$$;

create or replace function public.complete_session(
  p_session_id uuid,
  p_ended_at   timestamptz default null
)
returns public.activity_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id  uuid := auth.uid();
  v_current  public.activity_sessions;
  v_session  public.activity_sessions;
  v_ended_at timestamptz;
  v_paused   integer;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_current
  from public.activity_sessions
  where id = p_session_id and user_id = v_user_id and status in ('running', 'paused')
  for update;

  if not found then
    raise exception 'session not active' using errcode = 'P0002';
  end if;

  v_ended_at := coalesce(p_ended_at, now());

  if v_ended_at < v_current.started_at then
    raise exception 'ended_at before started_at' using errcode = 'P0001';
  end if;
  -- 時計のずれを考慮して少しだけ猶予を持たせる
  if v_ended_at > now() + interval '1 minute' then
    raise exception 'ended_at in the future' using errcode = 'P0001';
  end if;

  -- 一時停止のまま終了した場合、その停止時間も差し引く
  v_paused := v_current.total_paused_seconds
    + case
        when v_current.paused_at is null then 0
        else greatest(0, floor(extract(epoch from (v_ended_at - v_current.paused_at)))::integer)
      end;

  update public.activity_sessions
  set
    status               = 'completed',
    ended_at             = v_ended_at,
    paused_at            = null,
    total_paused_seconds = v_paused,
    duration_seconds     = greatest(
      0,
      floor(extract(epoch from (v_ended_at - v_current.started_at)))::integer - v_paused
    )
  where id = p_session_id
  returning * into v_session;

  return v_session;
end;
$$;

create or replace function public.cancel_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  update public.activity_sessions
  set status = 'cancelled', ended_at = now(), paused_at = null
  where id = p_session_id and user_id = v_user_id and status in ('running', 'paused');

  if not found then
    raise exception 'session not active' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.start_session(uuid, text, text)     from public, anon;
revoke all on function public.pause_session(uuid)                 from public, anon;
revoke all on function public.resume_session(uuid)                from public, anon;
revoke all on function public.complete_session(uuid, timestamptz) from public, anon;
revoke all on function public.cancel_session(uuid)                from public, anon;

grant execute on function public.start_session(uuid, text, text)     to authenticated;
grant execute on function public.pause_session(uuid)                 to authenticated;
grant execute on function public.resume_session(uuid)                to authenticated;
grant execute on function public.complete_session(uuid, timestamptz) to authenticated;
grant execute on function public.cancel_session(uuid)                to authenticated;
