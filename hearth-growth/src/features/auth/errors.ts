/**
 * Supabase Auth のエラーを、利用者に見せてよい日本語へ変換する。
 *
 * 原文をそのまま出すと内部の状態が漏れるため（20章）、
 * 対応表にない場合は一律の文言を返す。
 */
const MESSAGES: Record<string, string> = {
  invalid_credentials: 'メールアドレスまたはパスワードが違います。',
  email_not_confirmed: 'メールアドレスの確認が完了していません。届いたメールのリンクを開いてください。',
  user_already_exists: 'このメールアドレスは既に登録されています。',
  email_exists: 'このメールアドレスは既に登録されています。',
  weak_password: 'パスワードが簡単すぎます。8文字以上で、推測されにくいものにしてください。',
  same_password: '現在と同じパスワードは設定できません。',
  over_email_send_rate_limit: 'メールの送信が続いています。しばらく待ってからお試しください。',
  over_request_rate_limit: 'アクセスが集中しています。しばらく待ってからお試しください。',
  otp_expired: 'リンクの有効期限が切れています。もう一度お試しください。',
  session_not_found: 'ログインの有効期限が切れました。もう一度ログインしてください。',
  signup_disabled: '現在、新規登録を受け付けていません。',
};

const FALLBACK = 'うまく処理できませんでした。時間をおいてもう一度お試しください。';

export function toAuthErrorMessage(error: { code?: string | null; status?: number } | null): string {
  if (!error) return FALLBACK;
  if (error.code && MESSAGES[error.code]) return MESSAGES[error.code];
  if (error.status === 429) return MESSAGES.over_request_rate_limit;
  return FALLBACK;
}

export { FALLBACK as GENERIC_ERROR_MESSAGE };
