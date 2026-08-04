import { describe, expect, it } from 'vitest';

import { signInSchema, signUpSchema, updatePasswordSchema } from './schemas';

describe('signUpSchema', () => {
  const valid = { email: 'a@example.com', password: 'password123', displayName: 'あさひ' };

  it('正しい入力を通す', () => {
    expect(signUpSchema.parse(valid)).toEqual(valid);
  });

  it('メールアドレスの前後の空白を落とす', () => {
    expect(signUpSchema.parse({ ...valid, email: '  a@example.com  ' }).email).toBe('a@example.com');
  });

  it('8文字未満のパスワードを弾く', () => {
    const result = signUpSchema.safeParse({ ...valid, password: 'short12' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toContain('8文字以上');
  });

  it('表示名が空白だけの場合を弾く', () => {
    expect(signUpSchema.safeParse({ ...valid, displayName: '   ' }).success).toBe(false);
  });

  it('表示名の上限は50文字', () => {
    expect(signUpSchema.safeParse({ ...valid, displayName: 'あ'.repeat(50) }).success).toBe(true);
    expect(signUpSchema.safeParse({ ...valid, displayName: 'あ'.repeat(51) }).success).toBe(false);
  });
});

describe('signInSchema', () => {
  it('ログイン時はパスワードの長さを問わない（既存利用者を締め出さない）', () => {
    expect(signInSchema.safeParse({ email: 'a@example.com', password: 'old' }).success).toBe(true);
  });

  it('空のパスワードは弾く', () => {
    expect(signInSchema.safeParse({ email: 'a@example.com', password: '' }).success).toBe(false);
  });
});

describe('updatePasswordSchema', () => {
  it('一致しない確認入力を弾く', () => {
    const result = updatePasswordSchema.safeParse({
      password: 'password123',
      passwordConfirm: 'password124',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(['passwordConfirm']);
  });

  it('一致すれば通る', () => {
    expect(
      updatePasswordSchema.safeParse({ password: 'password123', passwordConfirm: 'password123' })
        .success,
    ).toBe(true);
  });
});
