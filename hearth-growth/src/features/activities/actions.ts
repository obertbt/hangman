'use server';

import { revalidatePath } from 'next/cache';

import { toActivityErrorMessage } from '@/features/activities/errors';
import {
  createFromSessionSchema,
  createManualSchema,
  sharePrivateActivitiesSchema,
  updateActivitySchema,
  type CreateFromSessionInput,
  type CreateManualInput,
  type SharePrivateActivitiesInput,
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

/**
 * 「自分だけ」の記録を、まとめてグループへ公開する。
 *
 * グループを作る前に記録すると公開範囲は「自分だけ」になり、
 * あとから参加しても自動では共有されない。
 * それを手作業で1件ずつ直すのは現実的でないので、まとめて動かせるようにする。
 *
 * 公開範囲を広げる操作なので、次の3つで囲っておく。
 *   * 動かすのは `private` のものだけ（`selected` の宛先指定は壊さない）
 *   * 画面に出した件数と食い違ったら実行しない
 *   * 所属していないグループへは公開できない（RLS の with check）
 */
export async function sharePrivateActivitiesAction(
  input: SharePrivateActivitiesInput,
): Promise<ActionResult<number>> {
  const parsed = sharePrivateActivitiesSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail('ログインの有効期限が切れました。もう一度ログインしてください。');

  // 画面を出したあとに記録が増減していたら、意図しない件数を公開してしまう
  const { count } = await supabase
    .from('activity_posts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('visibility', 'private')
    .is('deleted_at', null);

  if ((count ?? 0) !== parsed.data.expectedCount) {
    return fail('記録の数が変わりました。画面を開き直してから、もう一度お試しください。');
  }

  const { data, error } = await supabase
    .from('activity_posts')
    .update({ visibility: 'group', group_id: parsed.data.groupId })
    .eq('user_id', user.id)
    .eq('visibility', 'private')
    .is('deleted_at', null)
    .select('id');

  if (error) return fail(toActivityErrorMessage(error));

  revalidateActivityViews();
  return ok(data?.length ?? 0);
}
