/**
 * リダイレクト先として受け取った文字列を、自サイト内のパスに限定する。
 *
 * `?next=` はログイン後の戻り先として便利だが、そのまま使うと
 * 外部サイトへ誘導するリンクを作られてしまう（オープンリダイレクト）。
 */
export function safeRedirectPath(next: string | null | undefined, fallback = '/home'): string {
  if (!next) return fallback;

  // 絶対 URL、プロトコル相対 URL、バックスラッシュ経由の回避を弾く
  if (!next.startsWith('/')) return fallback;
  if (next.startsWith('//') || next.startsWith('/\\')) return fallback;

  // 改行などの制御文字を含むものは扱わない
  if (/[\u0000-\u001f\u007f]/.test(next)) return fallback;

  return next;
}
