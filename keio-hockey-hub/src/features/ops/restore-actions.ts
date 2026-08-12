'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

/**
 * 消したものを戻す（0020）。
 *
 * 権限の確認は関数の中で行う。
 * ここは「どの関数を呼ぶか」を種別から選ぶだけ。
 */

export interface RestoreState {
  error?: string;
  success?: string;
}

const schema = z.object({
  kind: z.enum(['video', 'video_clip', 'training_record', 'skill'], {
    message: '種別が正しくありません。',
  }),
  item_id: z.guid('対象が正しくありません。'),
});

export async function restoreItem(_prevState: RestoreState, formData: FormData): Promise<RestoreState> {
  await requireSession();

  const parsed = schema.safeParse({
    kind: formData.get('kind'),
    item_id: formData.get('item_id'),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '入力内容を確認してください。' };
  }

  const supabase = await createClient();
  const { kind, item_id: itemId } = parsed.data;

  const { error } =
    kind === 'video'
      ? await supabase.rpc('restore_video', { p_video_id: itemId })
      : kind === 'video_clip'
        ? await supabase.rpc('restore_video_clip', { p_clip_id: itemId })
        : kind === 'training_record'
          ? await supabase.rpc('restore_training_record', { p_record_id: itemId })
          : await supabase.rpc('restore_skill', { p_skill_id: itemId });

  if (error) return { error: error.message };

  revalidatePath('/trash');
  revalidatePath('/videos');
  revalidatePath('/training');
  revalidatePath('/skills');
  revalidatePath('/admin/skills');
  revalidatePath('/today');

  return { success: '戻しました。' };
}
