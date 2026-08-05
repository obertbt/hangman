'use server';

import { revalidatePath } from 'next/cache';

import { GENERIC_ERROR_MESSAGE } from '@/features/auth/errors';
import {
  setDailyGoalSchema,
  setWeeklyGoalSchema,
  type SetDailyGoalInput,
  type SetWeeklyGoalInput,
} from '@/features/goals/schemas';
import { fail, ok, type ActionResult } from '@/lib/actions/result';
import { getWeekStartDate } from '@/lib/date/timezone';
import { createClient } from '@/lib/supabase/server';

/**
 * 目標の設定。
 * 同じ日・同じ週の目標は上書きする（一意制約に当てて upsert する）。
 */

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function setDailyGoalAction(input: SetDailyGoalInput): Promise<ActionResult> {
  const parsed = setDailyGoalSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const { supabase, user } = await requireUser();
  if (!user) return fail('ログインの有効期限が切れました。もう一度ログインしてください。');

  const { error } = await supabase.from('daily_goals').upsert(
    {
      user_id: user.id,
      goal_date: parsed.data.goalDate,
      target_seconds: parsed.data.targetMinutes * 60,
      message: parsed.data.message || null,
    },
    { onConflict: 'user_id,goal_date' },
  );

  if (error) {
    console.error('setDailyGoalAction failed', error);
    return fail(GENERIC_ERROR_MESSAGE);
  }

  revalidatePath('/home');
  return ok();
}

export async function setWeeklyGoalAction(input: SetWeeklyGoalInput): Promise<ActionResult> {
  const parsed = setWeeklyGoalSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  // 週の開始が月曜でないと DB の CHECK 制約に弾かれる。ここでそろえる。
  const weekStart = getWeekStartDate(parsed.data.weekStartDate);

  const { supabase, user } = await requireUser();
  if (!user) return fail('ログインの有効期限が切れました。もう一度ログインしてください。');

  const { error } = await supabase.from('weekly_goals').upsert(
    {
      user_id: user.id,
      week_start_date: weekStart,
      category_id: null,
      target_seconds: parsed.data.targetHours * 3600,
      message: parsed.data.message || null,
    },
    { onConflict: 'user_id,week_start_date,category_id' },
  );

  if (error) {
    console.error('setWeeklyGoalAction failed', error);
    return fail(GENERIC_ERROR_MESSAGE);
  }

  revalidatePath('/home');
  revalidatePath('/profile');
  return ok();
}
