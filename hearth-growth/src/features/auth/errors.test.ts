import { describe, expect, it } from 'vitest';

import { GENERIC_ERROR_MESSAGE, toAuthErrorMessage } from './errors';

describe('toAuthErrorMessage', () => {
  it('既知のコードは日本語の案内に変換する', () => {
    expect(toAuthErrorMessage({ code: 'invalid_credentials' })).toContain('メールアドレスまたはパスワード');
    expect(toAuthErrorMessage({ code: 'email_not_confirmed' })).toContain('確認');
  });

  it('知らないコードでは内部情報を出さない', () => {
    expect(toAuthErrorMessage({ code: 'some_internal_code' })).toBe(GENERIC_ERROR_MESSAGE);
    expect(toAuthErrorMessage(null)).toBe(GENERIC_ERROR_MESSAGE);
  });

  it('レート制限は待つよう案内する', () => {
    expect(toAuthErrorMessage({ status: 429 })).toContain('しばらく');
  });
});

describe('コードが付かない失敗', () => {
  it('確認メールの送信失敗を見分ける', () => {
    expect(
      toAuthErrorMessage({ code: 'unexpected_failure', message: 'Error sending confirmation email' }),
    ).toContain('確認メール');
  });

  it('登録時の内部エラーを見分ける', () => {
    expect(
      toAuthErrorMessage({ code: 'unexpected_failure', message: 'Database error saving new user' }),
    ).toContain('登録処理');
  });

  it('見分けられない本文では一律の文言に戻る', () => {
    expect(toAuthErrorMessage({ code: 'unexpected_failure', message: 'something else' })).toBe(
      GENERIC_ERROR_MESSAGE,
    );
  });
});

describe('接続そのものの失敗', () => {
  it('通信できていないことを言い分ける', () => {
    expect(toAuthErrorMessage({ message: 'fetch failed' })).toContain('接続');
    expect(toAuthErrorMessage({ message: 'Network request failed' })).toContain('接続');
  });
});
