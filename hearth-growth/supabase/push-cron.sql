-- =============================================================================
-- Hearth Growth : 「起きていますか？」を送る定期実行の設定
-- =============================================================================
-- ★ 実行する前に、下の2か所を自分の値に書き換えてください。★
--
--   1. アプリの URL   … https://ここを書き換える.vercel.app
--   2. 合言葉         … Vercel の CRON_SECRET と「まったく同じ文字列」
--
-- 書き換えたら、Supabase の SQL Editor に貼って実行します。
-- 何度実行しても大丈夫です（古い設定を消してから作り直します）。
--
-- 止めたくなったら、いちばん下の「止めるとき」だけを実行してください。
-- =============================================================================

-- 定期実行と、そこから外へ問い合わせるための拡張
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- -----------------------------------------------------------------------------
-- 合言葉。Vercel の CRON_SECRET と同じ値にすること。
-- -----------------------------------------------------------------------------
insert into public.app_config (key, value)
values ('cron_secret', 'ここに合言葉を書く')
on conflict (key) do update set value = excluded.value;

-- -----------------------------------------------------------------------------
-- 1分ごとにアプリを呼ぶ
-- -----------------------------------------------------------------------------
-- 同じ名前の設定が残っていたら先に消す（作り直しても増えないように）
select cron.unschedule(jobid) from cron.job where jobname = 'hearth-growth-wake-alarms';

select cron.schedule(
  'hearth-growth-wake-alarms',
  '* * * * *',
  $job$
  select net.http_post(
    url     := 'https://ここにアプリのURLを書く.vercel.app/api/push/dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'ここに合言葉を書く'
    ),
    body    := '{}'::jsonb
  );
  $job$
);

-- 動いているか確認する
select jobname, schedule, active from cron.job where jobname = 'hearth-growth-wake-alarms';

-- =============================================================================
-- 止めるとき（普段は実行しなくてよい）
-- =============================================================================
-- select cron.unschedule(jobid) from cron.job where jobname = 'hearth-growth-wake-alarms';
