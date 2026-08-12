import { describe, expect, it } from 'vitest';

import { translateAuthError } from './errors';

describe('translateAuthError', () => {
  it('よくある失敗を日本語にする', () => {
    expect(translateAuthError('Invalid login credentials')).toBe('メールアドレスかパスワードが違います。');
    expect(translateAuthError('Email not confirmed')).toContain('確認が済んでいません');
    expect(translateAuthError('Too many requests')).toContain('試行回数');
  });

  it('メールアドレスの有無を漏らさない', () => {
    // 「そのメールアドレスは存在しません」と言ってしまうと、登録の有無が調べられてしまう
    const message = translateAuthError('Invalid login credentials');
    expect(message).not.toContain('存在しません');
    expect(message).not.toContain('登録されていません');
  });

  it('知らないエラーでも英語のまま出さない', () => {
    const message = translateAuthError('Something exploded internally');
    expect(message).toBe('ログインに失敗しました。時間をおいてもう一度お試しください。');
  });

  it('通信不良を切り分けられる', () => {
    expect(translateAuthError('TypeError: fetch failed')).toContain('接続できませんでした');
  });
});
