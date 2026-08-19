-- Hearth Growth セットアップ 11 / 11
-- 番号順に、Supabase の SQL Editor へ貼り付けて実行してください。
-- 元になっているのは supabase/migrations/ の各ファイルです。

/*
 * 合言葉が合ったときだけ答える。
 *
 * サービスロールキーを配らずに済ませるための入口。
 * ここが返すのは「通知の宛先」だけで、記録も本文も返さない。
 * 取り出した時点で notified_at を立てるので、同じ予定を二度送らない。
 */
create or replace function public.claim_due_wake_alarms(p_secret text)
returns table (endpoint text, p256dh text, auth text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected text;
begin
  select value into v_expected from public.app_config where key = 'cron_secret';

  -- 合言葉が未設定なら、誰にも答えない
  if v_expected is null or p_secret is null or p_secret <> v_expected then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  with due as (
    update public.sleep_alarms a
    set notified_at = now()
    where a.notified_at is null
      and a.wake_at <= now()
      and exists (
        select 1 from public.activity_sessions s
        where s.id = a.session_id and s.status in ('running', 'paused')
      )
    returning a.user_id
  )
  select p.endpoint, p.p256dh, p.auth
  from due
  join public.push_subscriptions p on p.user_id = due.user_id;
end;
$$;

/*
 * 合言葉が合っているかだけを確かめる。
 *
 * /setup-check から呼ぶ。claim_due_wake_alarms を確認に使うと、
 * 時刻の来た予定をそこで消費してしまい、通知が飛ばなくなる。
 */
create or replace function public.check_cron_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_config
    where key = 'cron_secret' and value = p_secret and p_secret is not null
  );
$$;

revoke all on function public.check_cron_secret(text) from public;
grant execute on function public.check_cron_secret(text) to anon, authenticated;

revoke all on function public.claim_due_wake_alarms(text) from public;
grant execute on function public.claim_due_wake_alarms(text) to anon, authenticated;

revoke all on function public.start_sleep(timestamptz) from public, anon;
grant execute on function public.start_sleep(timestamptz) to authenticated;
