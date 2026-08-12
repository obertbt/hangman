/**
 * Supabase Auth のエラーを、利用者が次に何をすればよいか分かる言葉にする。
 *
 * 原文をそのまま出すと英語で意味が分からない。
 * ただし「メールアドレスが存在しない」ことは伝えない（総当たりの手がかりになる）。
 */
export function translateAuthError(message: string): string {
  const normalized = message.toLowerCase();

  if (normalized.includes('invalid login credentials')) {
    return 'メールアドレスかパスワードが違います。';
  }
  if (normalized.includes('email not confirmed')) {
    return 'メールアドレスの確認が済んでいません。届いているメールを確認してください。';
  }
  if (normalized.includes('too many requests') || normalized.includes('rate limit')) {
    return '試行回数が多すぎます。しばらく待ってからもう一度お試しください。';
  }
  if (normalized.includes('password should be at least')) {
    return 'パスワードは8文字以上にしてください。';
  }
  if (normalized.includes('user already registered')) {
    return 'このメールアドレスは既に登録されています。ログイン画面からお進みください。';
  }
  if (normalized.includes('fetch failed') || normalized.includes('network')) {
    return 'サーバーに接続できませんでした。通信状況を確認してください。';
  }

  return 'ログインに失敗しました。時間をおいてもう一度お試しください。';
}
