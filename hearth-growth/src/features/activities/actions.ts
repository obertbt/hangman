'use server';

import { revalidatePath } from 'next/cache';

import { toActivityErrorMessage } from '@/features/activities/errors';
import {
  createFromSessionSchema,
  createManualSchema,
  updateActivitySchema,
  type CreateFromSessionInput,
  type CreateManualInput,
  type UpdateActivityInput,
} from '@/features/activities/schemas';
import { fail, ok, type ActionResult } from '@/lib/actions/result';
import { createClient } from '@/lib/supabase/server';
import { uuidSchema } from '@/lib/validations/common';

/**
 * 活動記録の作成・編集・削除。
 *
 * 公開範囲の判定と、閲覧許可ユーザーの入れ替えは DB の RPC が原子的に行う。
 * タイマー由来の記録では、活動時間をクライアントから受け取らない。
 */

function revalidateActivityViews() {
  revalidatePath('/activities');
  revalidatePath('/timeline');
  revalidatePath('/home');
  revalidatePath('/timer');
}

function firstIssue(error: { issues: { message: string; path: PropertyKey[] }[] }) {
  const issue = error.issues[0];
  return fail(issue.message, String(issue.path[0] ?? ''));
}

/** タイマー終了後の記録。 */
export async function createFromSessionAction(input: CreateFromSessionInput): Promise<ActionResult<string>> {
  const parsed = createFromSessionSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('create_activity_post', {
    p_session_id: parsed.data.sessionId,
    p_title: parsed.data.title || null,
    p_body: parsed.data.body || null,
    p_visibility: parsed.data.visibility,
    p_group_id: parsed.data.groupId ?? null,
    p_allowed_user_ids: parsed.data.allowedUserIds ?? null,
  });

  if (error || !data) return fail(toActivityErrorMessage(error));

  revalidateActivityViews();
  return ok(data);
}

/** タイマーを使わなかった活動の記録（6.2）。 */
export async function createManualAction(input: CreateManualInput): Promise<ActionResult<string>> {
  const parsed = createManualSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('create_activity_post', {
    p_category_id: parsed.data.categoryId,
    p_title: parsed.data.title || null,
    p_body: parsed.data.body || null,
    p_duration_seconds: parsed.data.durationSeconds,
    p_activity_date: parsed.data.activityDate,
    p_visibility: parsed.data.visibility,
    p_group_id: parsed.data.groupId ?? null,
    p_allowed_user_ids: parsed.data.allowedUserIds ?? null,
  });

  if (error || !data) return fail(toActivityErrorMessage(error));

  revalidateActivityViews();
  return ok(data);
}

export async function updateActivityAction(input: UpdateActivityInput): Promise<ActionResult> {
  const parsed = updateActivitySchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.rpc('update_activity_post', {
    p_post_id: parsed.data.postId,
    p_title: parsed.data.title || null,
    p_body: parsed.data.body || null,
    p_duration_seconds: parsed.data.durationSeconds ?? null,
    p_activity_date: parsed.data.activityDate ?? null,
    p_visibility: parsed.data.visibility,
    p_group_id: parsed.data.groupId ?? null,
    p_allowed_user_ids: parsed.data.allowedUserIds ?? null,
  });

  if (error) return fail(toActivityErrorMessage(error));

  revalidateActivityViews();
  revalidatePath(`/activities/${parsed.data.postId}`);
  return ok();
}

/** 論理削除。行は残す（20章）。 */
export async function deleteActivityAction(postId: string): Promise<ActionResult> {
  const parsed = uuidSchema.safeParse(postId);
  if (!parsed.success) return fail('この記録は見つかりませんでした。');

  const supabase = await createClient();
  const { error } = await supabase.rpc('delete_activity_post', { p_post_id: parsed.data });

  if (error) return fail(toActivityErrorMessage(error));

  revalidateActivityViews();
  return ok();
}
