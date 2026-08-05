'use server';

import { revalidatePath } from 'next/cache';

import { GENERIC_ERROR_MESSAGE } from '@/features/auth/errors';
import { setReactionSchema, type SetReactionInput } from '@/features/reactions/schemas';
import { fail, ok, type ActionResult } from '@/lib/actions/result';
import { createClient } from '@/lib/supabase/server';
import { uuidSchema } from '@/lib/validations/common';

/**
 * リアクション（10.1）。
 * 1ユーザーにつき1投稿1件。付け替えは既存の行を書き換える。
 */

function toReactionErrorMessage(error: { code?: string } | null): string {
  if (error?.code === '42501' || error?.code === 'PGRST301') {
    // 閲覧できない投稿へのリアクションは RLS が拒否する
    return 'この投稿には反応できません。';
  }
  return GENERIC_ERROR_MESSAGE;
}

/** 付ける、または種類を変える。 */
export async function setReactionAction(input: SetReactionInput): Promise<ActionResult> {
  const parsed = setReactionSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail('ログインの有効期限が切れました。もう一度ログインしてください。');

  // (post_id, user_id) の一意制約に当てて、あれば書き換える
  const { error } = await supabase.from('reactions').upsert(
    {
      post_id: parsed.data.postId,
      user_id: user.id,
      reaction_type: parsed.data.reactionType,
    },
    { onConflict: 'post_id,user_id' },
  );

  if (error) {
    console.error('setReactionAction failed', error);
    return fail(toReactionErrorMessage(error));
  }

  revalidatePath('/timeline');
  revalidatePath('/home');
  return ok();
}

export async function removeReactionAction(postId: string): Promise<ActionResult> {
  const parsed = uuidSchema.safeParse(postId);
  if (!parsed.success) return fail(GENERIC_ERROR_MESSAGE);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail('ログインの有効期限が切れました。もう一度ログインしてください。');

  const { error } = await supabase
    .from('reactions')
    .delete()
    .eq('post_id', parsed.data)
    .eq('user_id', user.id);

  if (error) {
    console.error('removeReactionAction failed', error);
    return fail(toReactionErrorMessage(error));
  }

  revalidatePath('/timeline');
  revalidatePath('/home');
  return ok();
}
