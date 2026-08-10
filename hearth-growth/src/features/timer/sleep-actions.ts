'use server';

import { revalidatePath } from 'next/cache';

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

function revalidateSleepViews() {
  revalidatePath('/home');
  revalidatePath('/timer');
  revalidatePath('/activities');
  revalidatePath('/timeline');
}

/** 就寝。睡眠のタイマーを始める。 */
export async function startSleepAction(): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('start_sleep');

  if (error) {
    console.error('startSleep failed', error);
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
