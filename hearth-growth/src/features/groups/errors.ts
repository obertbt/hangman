import { GENERIC_ERROR_MESSAGE } from '@/features/auth/errors';

/**
 * accept_invitation() が投げる例外を日本語へ変換する。
 * 対応表にないものは一律の文言にして、内部の状態を出さない（20章）。
 */
const INVITATION_MESSAGES: Record<string, string> = {
  'invitation not found': '招待リンクが見つかりませんでした。',
  'invitation revoked': 'この招待リンクは無効になっています。招待した人に確認してください。',
  'invitation expired': '招待リンクの有効期限が切れています。招待した人に確認してください。',
  'invitation exhausted': '招待リンクの利用回数が上限に達しています。',
  'authentication required': 'ログインの有効期限が切れました。もう一度ログインしてください。',
};

export function toInvitationErrorMessage(error: { message?: string } | null): string {
  if (!error?.message) return GENERIC_ERROR_MESSAGE;

  for (const [needle, message] of Object.entries(INVITATION_MESSAGES)) {
    if (error.message.includes(needle)) return message;
  }
  return GENERIC_ERROR_MESSAGE;
}

/** get_invitation_preview() が返す reason に対応する説明。 */
export const INVITATION_REASON_MESSAGES: Record<string, string> = {
  not_found: 'この招待リンクは見つかりませんでした。',
  revoked: 'この招待リンクは無効になっています。',
  expired: 'この招待リンクは有効期限が切れています。',
  exhausted: 'この招待リンクは利用回数の上限に達しています。',
};

/**
 * グループ操作の失敗。
 * RLS に弾かれた場合（権限不足）と、その他を区別して伝える。
 */
export function toGroupErrorMessage(error: { code?: string; message?: string } | null): string {
  if (!error) return GENERIC_ERROR_MESSAGE;

  // RLS 違反 / 権限不足
  if (error.code === '42501' || error.code === 'PGRST301') {
    return 'この操作を行う権限がありません。';
  }
  // 一意制約違反（すでに参加している等）
  if (error.code === '23505') {
    return 'すでに登録されています。';
  }
  return GENERIC_ERROR_MESSAGE;
}
