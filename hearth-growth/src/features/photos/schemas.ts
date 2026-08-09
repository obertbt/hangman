import { z } from 'zod';

import { uuidSchema } from '@/lib/validations/common';

/**
 * 活動記録に添える写真（24章「記録形式 → 写真」）。
 *
 * 枚数を絞っているのは容量のためではない。
 * 記録は「続けるための道具」であって作品ではないので、
 * 選ぶのに迷うほどの枚数を置けないほうがいい。
 */
export const MAX_PHOTOS_PER_POST = 4;

/** バケット側の上限と合わせる（supabase/migrations/0009）。 */
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

export const PHOTO_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/**
 * 縮小の目安。長辺をこの大きさまで落としてから送る。
 * スマートフォンの写真をそのまま送ると数MBになり、
 * 電波の弱い場所では記録そのものが失敗してしまう。
 */
export const PHOTO_MAX_EDGE = 1600;

export function validatePhotoFile(file: { type: string; size: number }): string | null {
  if (!PHOTO_ALLOWED_TYPES.includes(file.type as (typeof PHOTO_ALLOWED_TYPES)[number])) {
    return 'JPEG・PNG・WebP の画像を選んでください。';
  }
  if (file.size > PHOTO_MAX_BYTES) {
    return '写真は5MBまでです。';
  }
  return null;
}

/**
 * 保存先の形。`<自分のID>/<記録のID>/<乱数>.<拡張子>`
 *
 * この形を強制しておくと、記録と写真の対応がパスだけで分かる。
 * 実際に「自分のフォルダか」を決めるのは Storage のポリシー側で、
 * ここはその前に明らかな間違いを弾くための検査。
 */
export const storagePathSchema = z
  .string()
  .regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/, '写真の保存先が不正です');

export const attachPhotosSchema = z.object({
  postId: uuidSchema,
  paths: z.array(storagePathSchema).min(1).max(MAX_PHOTOS_PER_POST),
});

export type AttachPhotosInput = z.infer<typeof attachPhotosSchema>;

/** 画面へ渡す1枚ぶん。URL は期限付きなので、都度発行する。 */
export interface PhotoView {
  id: string;
  postId: string;
  /** 期限付きの閲覧 URL。発行に失敗した場合は null。 */
  url: string | null;
}
