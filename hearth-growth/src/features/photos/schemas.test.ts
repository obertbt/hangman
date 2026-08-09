import { describe, expect, it } from 'vitest';

import {
  attachPhotosSchema,
  MAX_PHOTOS_PER_POST,
  PHOTO_MAX_BYTES,
  storagePathSchema,
  validatePhotoFile,
} from './schemas';

const UID = '11111111-1111-4111-8111-111111111111';
const POST = '22222222-2222-4222-8222-222222222222';
const FILE = '33333333-3333-4333-8333-333333333333';

describe('validatePhotoFile', () => {
  it('対応している形式は通す', () => {
    expect(validatePhotoFile({ type: 'image/jpeg', size: 1000 })).toBeNull();
    expect(validatePhotoFile({ type: 'image/png', size: 1000 })).toBeNull();
    expect(validatePhotoFile({ type: 'image/webp', size: 1000 })).toBeNull();
  });

  it('画像でないものを弾く', () => {
    expect(validatePhotoFile({ type: 'application/pdf', size: 1000 })).toContain('画像');
    // 拡張子を偽った動画なども MIME で止まる
    expect(validatePhotoFile({ type: 'video/mp4', size: 1000 })).toContain('画像');
  });

  it('大きすぎるファイルを弾く', () => {
    expect(validatePhotoFile({ type: 'image/jpeg', size: PHOTO_MAX_BYTES + 1 })).toContain('5MB');
    expect(validatePhotoFile({ type: 'image/jpeg', size: PHOTO_MAX_BYTES })).toBeNull();
  });
});

describe('storagePathSchema', () => {
  it('`<自分のID>/<記録のID>/<乱数>.<拡張子>` の形だけを通す', () => {
    expect(storagePathSchema.safeParse(`${UID}/${POST}/${FILE}.jpg`).success).toBe(true);
    expect(storagePathSchema.safeParse(`${UID}/${POST}/${FILE}.webp`).success).toBe(true);
  });

  it('別の場所を指す書き方を弾く', () => {
    // 階層をさかのぼる書き方
    expect(storagePathSchema.safeParse(`${UID}/../${POST}/${FILE}.jpg`).success).toBe(false);
    // 階層が足りない／多い
    expect(storagePathSchema.safeParse(`${UID}/${FILE}.jpg`).success).toBe(false);
    expect(storagePathSchema.safeParse(`x/${UID}/${POST}/${FILE}.jpg`).success).toBe(false);
    // 想定外の拡張子
    expect(storagePathSchema.safeParse(`${UID}/${POST}/${FILE}.svg`).success).toBe(false);
    expect(storagePathSchema.safeParse(`${UID}/${POST}/${FILE}.html`).success).toBe(false);
  });
});

describe('attachPhotosSchema', () => {
  const path = (n: number) => `${UID}/${POST}/${'0'.repeat(35)}${n}.jpg`;

  it('上限までは通す', () => {
    const paths = Array.from({ length: MAX_PHOTOS_PER_POST }, (_, index) => path(index));
    expect(attachPhotosSchema.safeParse({ postId: POST, paths }).success).toBe(true);
  });

  it('上限を超える枚数を弾く', () => {
    const paths = Array.from({ length: MAX_PHOTOS_PER_POST + 1 }, (_, index) => path(index));
    expect(attachPhotosSchema.safeParse({ postId: POST, paths }).success).toBe(false);
  });

  it('0枚では呼べない', () => {
    expect(attachPhotosSchema.safeParse({ postId: POST, paths: [] }).success).toBe(false);
  });
});
