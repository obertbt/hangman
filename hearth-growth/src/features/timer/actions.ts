'use server';

import { revalidatePath } from 'next/cache';

import { toTimerErrorMessage } from '@/features/timer/errors';
import {
  completeSessionSchema,
  sessionIdSchema,
  startSessionSchema,
  type CompleteSessionInput,
  type StartSessionInput,
} from '@/features/timer/schemas';
import { fail, ok, type ActionResult } from '@/lib/actions/result';
import { createClient } from '@/lib/supabase/server';
import type { ActivitySessionRow } from '@/types/database.types';

/**
 * タイマー操作。
 *
 * 状態遷移と時刻の計算はすべて DB 側の RPC が行う（13章）。
 * ここではその呼び出しと、失敗時の文言変換だけを担当する。
 */

function revalidateTimerViews() {
  revalidatePath('/timer');
  revalidatePath('/home');
}

export async function startSessionAction(
  input: StartSessionInput,
): Promise<ActionResult<ActivitySessionRow>> {
  const parsed = startSessionSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0].message, String(parsed.error.issues[0].path[0] ?? ''));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('start_session', {
    p_category_id: parsed.data.categoryId,
    p_title: parsed.data.title || null,
    p_note: parsed.data.note || null,
  });

  if (error || !data) {
    return fail(toTimerErrorMessage(error));
  }

  revalidateTimerViews();
  return ok(data);
}

export async function pauseSessionAction(sessionId: string): Promise<ActionResult<ActivitySessionRow>> {
  const parsed = sessionIdSchema.safeParse({ sessionId });
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('pause_session', { p_session_id: parsed.data.sessionId });

  if (error || !data) return fail(toTimerErrorMessage(error));

  revalidateTimerViews();
  return ok(data);
}

export async function resumeSessionAction(sessionId: string): Promise<ActionResult<ActivitySessionRow>> {
  const parsed = sessionIdSchema.safeParse({ sessionId });
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('resume_session', { p_session_id: parsed.data.sessionId });

  if (error || !data) return fail(toTimerErrorMessage(error));

  revalidateTimerViews();
  return ok(data);
}

/**
 * 終了して活動時間を確定する。
 * この時点では投稿は作らない（Phase 4 の活動終了画面で作る）。
 */
export async function completeSessionAction(
  input: CompleteSessionInput,
): Promise<ActionResult<ActivitySessionRow>> {
  const parsed = completeSessionSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0].message, String(parsed.error.issues[0].path[0] ?? ''));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('complete_session', {
    p_session_id: parsed.data.sessionId,
    p_ended_at: parsed.data.endedAt ?? null,
  });

  if (error || !data) return fail(toTimerErrorMessage(error));

  revalidateTimerViews();
  revalidatePath('/activities');
  return ok(data);
}

export async function cancelSessionAction(sessionId: string): Promise<ActionResult> {
  const parsed = sessionIdSchema.safeParse({ sessionId });
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const supabase = await createClient();
  const { error } = await supabase.rpc('cancel_session', { p_session_id: parsed.data.sessionId });

  if (error) return fail(toTimerErrorMessage(error));

  revalidateTimerViews();
  return ok();
}
