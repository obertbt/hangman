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
