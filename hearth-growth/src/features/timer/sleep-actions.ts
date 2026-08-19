'use server';

import { revalidatePath } from 'next/cache';

import { z } from 'zod';

import { toTimerErrorMessage } from '@/features/timer/errors';
import { fail, ok, type ActionResult } from '@/lib/actions/result';
import { createClient } from '@/lib/supabase/server';

/**
 * 就寝と起床。
 *
 * 寝る前と寝起きに、入力欄を出さない。押すのは1回だけにする。
 * 中身はタイマーの開始・終了そのもので、
 * 経過時間はサーバーの時刻で測られる（端末の時計に頼らない）。
 *
 * 睡眠は記録として残るが、活動時間の合計には数えない（0014）。
 */

/**
 * 起床予定時刻。
 *
 * 「今より先で、24時間以内」。同じ条件を DB の start_sleep でも見ている。
 * 過去を許すと通知がすぐ飛び、遠すぎる値は入力の間違い。
 */
const wakeAtSchema = z
  .string()
  .datetime({ message: '起床予定の時刻が正しくありません' })
  .nullable()
  .refine(
    (value) => value === null || Date.parse(value) > Date.now(),
    '起床予定は今より後の時刻にしてください',
  )
  .refine(
    (value) => value === null || Date.parse(value) <= Date.now() + 24 * 60 * 60 * 1000,
    '起床予定は24時間以内にしてください',
  );

function revalidateSleepViews() {
  revalidatePath('/home');
  revalidatePath('/timer');
  revalidatePath('/activities');
  revalidatePath('/timeline');
}

/**
 * 就寝。睡眠のタイマーを始める。
 *
 * 起床予定時刻を渡すと、その時刻に「起きていますか？」の通知を送る。
 * 通知が要らなければ渡さなくてよい。
 */
export async function startSleepAction(wakeAt?: string | null): Promise<ActionResult> {
  const parsed = wakeAtSchema.safeParse(wakeAt ?? null);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const supabase = await createClient();
  const { error } = await supabase.rpc('start_sleep', { p_wake_at: parsed.data });

  if (error) {
    console.error('startSleep failed', error);
    if (error.message?.includes('wake_at in the past')) {
      return fail('起床予定は今より後の時刻にしてください。');
    }
    if (error.message?.includes('wake_at too far')) {
      return fail('起床予定は24時間以内にしてください。');
    }
    return fail(toTimerErrorMessage(error));
  }

  revalidateSleepViews();
  return ok();
}

/** 起床。睡眠のタイマーを終え、そのまま記録にする。 */
export async function wakeUpAction(): Promise<ActionResult<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('wake_up');

  if (error || !data) {
    console.error('wakeUp failed', error);
    if (error?.message?.includes('not sleeping')) {
      return fail('就寝の記録が見つかりませんでした。');
    }
    return fail(toTimerErrorMessage(error));
  }

  revalidateSleepViews();
  return ok(data);
}
