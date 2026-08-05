import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { DailyGoalRow, WeeklyGoalRow } from '@/types/database.types';

/** 今日の目標と今週の目標。どちらも無ければ null。 */
export async function getGoals(
  todayDate: string,
  weekStart: string,
): Promise<{ daily: DailyGoalRow | null; weekly: WeeklyGoalRow | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { daily: null, weekly: null };

  const [daily, weekly] = await Promise.all([
    supabase.from('daily_goals').select('*').eq('user_id', user.id).eq('goal_date', todayDate).maybeSingle(),
    supabase
      .from('weekly_goals')
      .select('*')
      .eq('user_id', user.id)
      .eq('week_start_date', weekStart)
      // カテゴリー別の目標は将来対応。今は全体の目標だけを扱う。
      .is('category_id', null)
      .maybeSingle(),
  ]);

  return { daily: daily.data ?? null, weekly: weekly.data ?? null };
}
