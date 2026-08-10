'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { GENERIC_ERROR_MESSAGE } from '@/features/auth/errors';
import { notificationSettingsSchema, type NotificationSettingsInput } from '@/features/notifications/schemas';
import { fail, ok, type ActionResult } from '@/lib/actions/result';
import { createClient } from '@/lib/supabase/server';
import { uuidSchema } from '@/lib/validations/common';

/**
 * お知らせを既読にする。
 *
 * 作る側の操作はここに無い。お知らせの行を作るのは DB のトリガーだけで、
 * 利用者側からは INSERT できないようにしている（0010）。
 */

const markReadSchema = z.object({
  /** 指定しなければ、自分の未読をすべて既読にする。 */
  ids: z.array(uuidSchema).max(200).nullable().optional(),
});

export async function markNotificationsReadAction(ids?: string[] | null): Promise<ActionResult<number>> {
  const parsed = markReadSchema.safeParse({ ids });
  if (!parsed.success) return fail('お知らせを既読にできませんでした。');

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('mark_notifications_read', {
    p_ids: parsed.data.ids ?? null,
  });

  if (error) {
    console.error('markNotificationsRead failed', error);
    return fail('お知らせを既読にできませんでした。時間をおいてお試しください。');
  }

  revalidatePath('/notifications');
  // ベルの数字はどの画面にも出るため、まとめて作り直す
  revalidatePath('/', 'layout');
  return ok(data ?? 0);
}

/**
 * 受け取り方の設定。
 *
 * 判定するのは DB のトリガー側なので、ここは profiles を書き換えるだけ。
 * user_id はクライアントから受け取らず、必ず auth.uid() を使う（20章）。
 */
export async function updateNotificationSettingsAction(
  input: NotificationSettingsInput,
): Promise<ActionResult> {
  const parsed = notificationSettingsSchema.safeParse(input);
  if (!parsed.success) return fail('設定を保存できませんでした。');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail('ログインの有効期限が切れました。もう一度ログインしてください。');

  const { error } = await supabase
    .from('profiles')
    .update({
      notify_reaction: parsed.data.notifyReaction,
      notify_comment: parsed.data.notifyComment,
      notify_group_join: parsed.data.notifyGroupJoin,
    })
    .eq('id', user.id);

  if (error) {
    console.error('updateNotificationSettings failed', error);
    return fail(GENERIC_ERROR_MESSAGE);
  }

  revalidatePath('/settings');
  return ok();
}
