-- =============================================================================
-- Hearth Growth : get_active_group_members に paused_at を足す
-- =============================================================================
-- 休憩中のメンバーの経過時間は「停止した時刻 - 開始 - 累計停止時間」で止まる。
-- paused_at を返さないと、休憩中でも時間が進んでいるように見えてしまう。
--
-- 戻り値の型が変わるため、CREATE OR REPLACE では差し替えられない。先に削除する。
-- 引き続き title / note は返さない（本人の意図しない共有を避けるため）。
-- =============================================================================

drop function if exists public.get_active_group_members();

create function public.get_active_group_members()
returns table (
  user_id              uuid,
  display_name         text,
  avatar_url           text,
  category_name        text,
  category_icon        text,
  category_color       text,
  status               text,
  started_at           timestamptz,
  paused_at            timestamptz,
  total_paused_seconds integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.user_id,
    p.display_name,
    p.avatar_url,
    c.name,
    c.icon,
    c.color,
    s.status,
    s.started_at,
    s.paused_at,
    s.total_paused_seconds
  from public.activity_sessions s
  join public.profiles p   on p.id = s.user_id
  join public.categories c on c.id = s.category_id
  where s.status in ('running', 'paused')
    and (s.user_id = auth.uid() or public.shares_group_with(s.user_id, auth.uid()))
  order by s.started_at asc;
$$;

revoke all on function public.get_active_group_members() from public, anon;
grant execute on function public.get_active_group_members() to authenticated;
