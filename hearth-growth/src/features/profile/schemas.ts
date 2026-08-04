import { z } from 'zod';

import { displayNameSchema } from '@/features/auth/schemas';
import { timezoneSchema, visibilitySchema } from '@/lib/validations/common';

export const updateProfileSchema = z.object({
  displayName: displayNameSchema,
  bio: z.string().trim().max(500, '自己紹介は500文字以内にしてください'),
  timezone: timezoneSchema,
  defaultVisibility: visibilitySchema,
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/** アップロードできる画像（20章: 容量と MIME タイプを検証する）。 */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export function validateAvatarFile(file: { type: string; size: number }): string | null {
  if (!AVATAR_ALLOWED_TYPES.includes(file.type as (typeof AVATAR_ALLOWED_TYPES)[number])) {
    return 'JPEG・PNG・WebP の画像を選んでください。';
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return '画像は2MBまでです。';
  }
  return null;
}

export const updateAvatarSchema = z.object({
  /** Supabase Storage が返す公開 URL */
  avatarUrl: z.string().url('画像の URL が不正です').nullable(),
});
