import { GENERIC_ERROR_MESSAGE } from '@/features/auth/errors';

/**
 * 活動記録の RPC が投げる例外を日本語へ変換する。
 * 対応表にないものは一律の文言にして、内部の状態を出さない（20章）。
 */
const MESSAGES: Record<string, string> = {
  'session not completed': 'この活動はまだ終わっていません。画面を更新してください。',
  'session already posted': 'この活動はすでに記録として残っています。',
  'category not available': 'そのカテゴリーは使えません。選び直してください。',
  'category required': 'カテゴリーを選んでください。',
  'duration required': '活動時間を入力してください。',
  'duration out of range': '1回の活動時間は24時間までです。',
  'activity_date in the future': '未来の日付は選べません。',
  'group required': '公開するグループを選んでください。',
  'group not allowed': 'この公開範囲ではグループを指定できません。',
  'not a group member': 'そのグループには公開できません。',
  'no allowed users': '見せる相手を1人以上選んでください。',
  'user not reachable': '同じグループにいない相手は選べません。',
  'invalid visibility': '公開範囲の指定が正しくありません。',
  'post not found': 'この記録は見つかりませんでした。すでに削除されている可能性があります。',
  'authentication required': 'ログインの有効期限が切れました。もう一度ログインしてください。',
};

export function toActivityErrorMessage(error: { message?: string; code?: string } | null): string {
  if (!error?.message) return GENERIC_ERROR_MESSAGE;

  for (const [needle, message] of Object.entries(MESSAGES)) {
    if (error.message.includes(needle)) return message;
  }

  // session_id の一意制約（同じセッションから二重に投稿しようとした）
  if (error.code === '23505') return MESSAGES['session already posted'];

  return GENERIC_ERROR_MESSAGE;
}
