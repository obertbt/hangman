'use server';

import { revalidatePath } from 'next/cache';

import { GENERIC_ERROR_MESSAGE } from '@/features/auth/errors';
import {
  updateAvatarSchema,
  updateProfileSchema,
  type UpdateProfileInput,
} from '@/features/profile/schemas';
import { fail, ok, type ActionResult } from '@/lib/actions/result';
import { createClient } from '@/lib/supabase/server';

/**
 * プロフィールの更新。
 * user_id はクライアントから受け取らず、必ず auth.uid() を使う（20章）。
 */
export async function updateProfileAction(input: UpdateProfileInput): Promise<ActionResult> {
  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0].message, String(parsed.error.issues[0].path[0] ?? ''));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return fail('ログインの有効期限が切れました。もう一度ログインしてください。');
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      display_name: parsed.data.displayName,
      bio: parsed.data.bio.length > 0 ? parsed.data.bio : null,
      timezone: parsed.data.timezone,
      default_visibility: parsed.data.defaultVisibility,
    })
    .eq('id', user.id);

  if (error) {
    console.error('updateProfileAction failed', error);
    return fail(GENERIC_ERROR_MESSAGE);
  }

  revalidatePath('/', 'layout');
  return ok();
}

/**
 * プロフィール画像の URL を保存する。
 * 実ファイルのアップロードはブラウザから Storage へ直接行い、
 * 保存できる場所は Storage 側のポリシーが `avatars/<uid>/` に限定している。
 */
export async function updateAvatarAction(avatarUrl: string | null): Promise<ActionResult> {
  const parsed = updateAvatarSchema.safeParse({ avatarUrl });
  if (!parsed.success) {
    return fail(parsed.error.issues[0].message);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return fail('ログインの有効期限が切れました。もう一度ログインしてください。');
  }

  // 他人のフォルダの URL を保存させない
  if (parsed.data.avatarUrl && !parsed.data.avatarUrl.includes(`/avatars/${user.id}/`)) {
    return fail(GENERIC_ERROR_MESSAGE);
  }

  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: parsed.data.avatarUrl })
    .eq('id', user.id);

  if (error) {
    console.error('updateAvatarAction failed', error);
    return fail(GENERIC_ERROR_MESSAGE);
  }

  revalidatePath('/', 'layout');
  return ok();
}
