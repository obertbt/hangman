import { describe, expect, it } from 'vitest';

import { AVATAR_MAX_BYTES, updateProfileSchema, validateAvatarFile } from './schemas';

describe('updateProfileSchema', () => {
  const valid = {
    displayName: 'あさひ',
    bio: '毎朝30分だけ',
    timezone: 'Asia/Tokyo',
    defaultVisibility: 'group' as const,
  };

  it('正しい入力を通す', () => {
    expect(updateProfileSchema.safeParse(valid).success).toBe(true);
  });

  it('自己紹介は空でもよい', () => {
    expect(updateProfileSchema.safeParse({ ...valid, bio: '' }).success).toBe(true);
  });

  it('500文字を超える自己紹介を弾く', () => {
    expect(updateProfileSchema.safeParse({ ...valid, bio: 'あ'.repeat(501) }).success).toBe(false);
  });

  it('存在しないタイムゾーンを弾く', () => {
    expect(updateProfileSchema.safeParse({ ...valid, timezone: 'Asia/Nowhere' }).success).toBe(false);
  });

  it('公開範囲は3種類だけ', () => {
    expect(updateProfileSchema.safeParse({ ...valid, defaultVisibility: 'public' }).success).toBe(false);
  });
});

describe('validateAvatarFile', () => {
  it('許可された画像形式を通す', () => {
    expect(validateAvatarFile({ type: 'image/png', size: 1000 })).toBeNull();
    expect(validateAvatarFile({ type: 'image/webp', size: 1000 })).toBeNull();
  });

  it('許可されていない形式を弾く', () => {
    expect(validateAvatarFile({ type: 'image/gif', size: 1000 })).toContain('JPEG');
    expect(validateAvatarFile({ type: 'application/pdf', size: 1000 })).toContain('JPEG');
  });

  it('2MBを超える画像を弾く', () => {
    expect(validateAvatarFile({ type: 'image/png', size: AVATAR_MAX_BYTES })).toBeNull();
    expect(validateAvatarFile({ type: 'image/png', size: AVATAR_MAX_BYTES + 1 })).toContain('2MB');
  });
});
