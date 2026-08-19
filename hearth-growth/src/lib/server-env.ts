import 'server-only';

/**
 * サーバーでしか使わない設定。
 *
 * `NEXT_PUBLIC_` を付けないので、ブラウザへは配られない。
 * ここに置くのは通知の送信に要るものだけで、
 * サービスロールキーは相変わらず一切扱わない。
 *
 * 未設定でも起動は止めない。通知はあとから足す機能なので、
 * 設定していない人のアプリまで動かなくなるのは行き過ぎ。
 * 足りないときは /api/push/dispatch が何もせずに終わり、
 * /setup-check が「未設定」と表示する。
 */
export interface ServerEnv {
  /** 定期実行と共有する合言葉。DB の app_config と同じ値。 */
  cronSecret: string | null;
  vapidPublicKey: string | null;
  vapidPrivateKey: string | null;
  /** VAPID の連絡先。仕様上 mailto: か URL を求められる。 */
  vapidSubject: string;
}

export function serverEnv(): ServerEnv {
  return {
    cronSecret: process.env.CRON_SECRET || null,
    // 公開鍵はブラウザ側でも要るので NEXT_PUBLIC_ 側を正とする
    vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null,
    vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || null,
    vapidSubject: process.env.VAPID_SUBJECT || 'mailto:noreply@example.com',
  };
}

/** 通知を送れる状態か（/setup-check の表示に使う）。 */
export function isPushConfigured(): boolean {
  const config = serverEnv();
  return Boolean(config.cronSecret && config.vapidPublicKey && config.vapidPrivateKey);
}
