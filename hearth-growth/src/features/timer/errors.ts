import { GENERIC_ERROR_MESSAGE } from '@/features/auth/errors';

/**
 * タイマー RPC が投げる例外を日本語へ変換する。
 * 二重起動だけは、利用者が次に何をすればよいか分かる文言にする。
 */
const MESSAGES: Record<string, string> = {
  'session already active': 'すでに活動中のタイマーがあります。先に終了してください。',
  'category not available': 'そのカテゴリーは使えません。選び直してください。',
  'session not running': 'このタイマーは動いていません。画面を更新してください。',
  'session not paused': 'このタイマーは一時停止していません。画面を更新してください。',
  'session not active': 'このタイマーはすでに終了しています。画面を更新してください。',
  'ended_at before started_at': '終了時刻を開始時刻より前にはできません。',
  'ended_at in the future': '終了時刻に未来の時刻は指定できません。',
  'authentication required': 'ログインの有効期限が切れました。もう一度ログインしてください。',
};

export function toTimerErrorMessage(error: { message?: string; code?: string } | null): string {
  if (!error?.message) return GENERIC_ERROR_MESSAGE;

  for (const [needle, message] of Object.entries(MESSAGES)) {
    if (error.message.includes(needle)) return message;
  }

  // 部分一意インデックス（二重起動の最終防衛線）に当たった場合
  if (error.code === '23505') return MESSAGES['session already active'];

  return GENERIC_ERROR_MESSAGE;
}
