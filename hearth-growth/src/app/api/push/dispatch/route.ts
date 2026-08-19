import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import webpush from 'web-push';

import { env } from '@/lib/env';
import { serverEnv } from '@/lib/server-env';
import type { Database } from '@/types/database.types';

/**
 * 予定時刻の来た「起きていますか？」を送る。
 *
 * 1分ごとに Supabase の定期実行（pg_cron）から叩かれる。
 * 手順は supabase/setup/updates/ の 0015 と docs/DEPLOY.md を参照。
 *
 * サービスロールキーは使わない。
 * 対象を取り出すのは合言葉で守った関数1つだけで、返るのは通知の宛先だけ。
 * 記録の中身はここを通らない。
 */
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const config = serverEnv();

  if (!config.cronSecret || !config.vapidPublicKey || !config.vapidPrivateKey) {
    // 設定が済んでいないうちは、黙って何もしない（定期実行を失敗させ続けない）
    return NextResponse.json({ ok: true, skipped: '未設定' });
  }

  // 合言葉が合わなければ、何が設定されているかも漏らさない
  if (request.headers.get('x-cron-secret') !== config.cronSecret) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // 匿名鍵で、合言葉付きの関数だけを呼ぶ
  const supabase = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase.rpc('claim_due_wake_alarms', { p_secret: config.cronSecret });

  if (error) {
    console.error('claim_due_wake_alarms failed', error);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }

  const targets = data ?? [];
  if (targets.length === 0) return NextResponse.json({ ok: true, sent: 0 });

  webpush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);

  const payload = JSON.stringify({
    title: '起きていますか？',
    body: '「起きている」を押すと、睡眠の記録を終えます。',
    tag: 'wake-alarm',
  });

  const results = await Promise.allSettled(
    targets.map((target) =>
      webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        payload,
        // 端末が寝ていても起こしてもらう。10分過ぎたら配らなくてよい。
        { urgency: 'high', TTL: 600 },
      ),
    ),
  );

  /*
   * 消えた宛先は片付ける。
   *
   * 通知を切られたり端末を初期化されたりすると 404 / 410 が返る。
   * 残しておくと毎分そこへ送り続けることになる。
   */
  const gone = targets.filter((_, index) => {
    const result = results[index];
    if (result.status !== 'rejected') return false;
    const statusCode = (result.reason as { statusCode?: number })?.statusCode;
    return statusCode === 404 || statusCode === 410;
  });

  if (gone.length > 0) {
    // 宛先の削除は本人しかできないので、ここでは記録に残すだけにする
    console.warn('push endpoints gone', gone.length);
  }

  const sent = results.filter((result) => result.status === 'fulfilled').length;
  const failed = results.length - sent;
  if (failed > 0) {
    console.error('push send failures', failed);
  }

  return NextResponse.json({ ok: true, sent, failed });
}
