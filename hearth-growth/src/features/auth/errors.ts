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
  email_provider_disabled: 'メールアドレスでの登録が無効になっています。設定を確認してください。',
  email_address_invalid: 'このメールアドレスは使えません。別のものをお試しください。',
  email_address_not_authorized: 'このメールアドレスへは送信できませんでした。設定を確認してください。',
  validation_failed: '入力内容を確認してください。',
};

/**
 * コードが付かない失敗の見分け。
 *
 * Supabase は、確認メールの送信失敗や登録時トリガーの失敗を
 * まとめて unexpected_failure として返す。原因が分からないままだと
 * 直しようがないので、本文から拾えるものだけ言い分ける。
 */
const MESSAGE_PATTERNS: [RegExp, string][] = [
  [
    /fetch failed|network|ENOTFOUND|ECONNREFUSED|timed? ?out/i,
    'サーバーに接続できませんでした。接続設定を確認してください（/setup-check で調べられます）。',
  ],
  [
    /sending (confirmation|magic link|recovery) (e?mail)/i,
    '確認メールを送れませんでした。メールの設定を確認するか、しばらく待ってからお試しください。',
  ],
  [/database error/i, '登録処理でつまずきました。設定が正しく入っているか確認してください。'],
];

const FALLBACK = 'うまく処理できませんでした。時間をおいてもう一度お試しください。';

export function toAuthErrorMessage(
  error: { code?: string | null; status?: number; message?: string } | null,
): string {
  if (!error) return FALLBACK;
  if (error.code && MESSAGES[error.code]) return MESSAGES[error.code];
  if (error.status === 429) return MESSAGES.over_request_rate_limit;

  if (error.message) {
    for (const [pattern, message] of MESSAGE_PATTERNS) {
      if (pattern.test(error.message)) return message;
    }
  }

  return FALLBACK;
}

export { FALLBACK as GENERIC_ERROR_MESSAGE };
