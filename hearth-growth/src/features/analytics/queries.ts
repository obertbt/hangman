import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { addDays, getToday, getWeekStartDate } from '@/lib/date/timezone';

export interface PeriodSummary {
  totalSeconds: number;
  postCount: number;
  activeDays: number;
}

export interface CategorySummaryItem {
  categoryId: string;
  name: string;
  icon: string;
  color: string;
  totalSeconds: number;
  postCount: number;
}

export interface DailyTotal {
  date: string;
  totalSeconds: number;
}

export interface DashboardSummary {
  today: PeriodSummary;
  week: PeriodSummary;
  /** 今週の月曜から日曜まで、記録が無い日も 0 で埋めた7日分。 */
  weekDays: DailyTotal[];
  categories: CategorySummaryItem[];
  streak: number;
  weekStart: string;
  todayDate: string;
}

const EMPTY_PERIOD: PeriodSummary = { totalSeconds: 0, postCount: 0, activeDays: 0 };

/**
 * ホームとマイページで使う集計（15章）。
 *
 * 合計は SQL 側で出す。全件を引いてから足すのは、記録が増えるほど無駄になる。
 * 「今日」「今週」の境目もユーザーのタイムゾーン次第なので、判断を DB に寄せている。
 */
export async function getDashboardSummary(timeZone: string): Promise<DashboardSummary> {
  const supabase = await createClient();
  const today = getToday(timeZone);
  const weekStart = getWeekStartDate(today);
  const weekEnd = addDays(weekStart, 6);

  const [todayResult, weekResult, dailyResult, categoryResult, streakResult] = await Promise.all([
    supabase.rpc('get_period_summary', { p_from: today, p_to: today }),
    supabase.rpc('get_period_summary', { p_from: weekStart, p_to: weekEnd }),
    supabase.rpc('get_daily_totals', { p_from: weekStart, p_to: weekEnd }),
    supabase.rpc('get_category_summary', { p_from: weekStart, p_to: weekEnd }),
    supabase.rpc('get_current_streak', {}),
  ]);

  const totalsByDate = new Map(
    (dailyResult.data ?? []).map((row) => [row.activity_date, Number(row.total_seconds)]),
  );

  return {
    today: toPeriod(todayResult.data?.[0]),
    week: toPeriod(weekResult.data?.[0]),
    // 記録が無い日も並べる。空いている日が見えることに意味がある。
    weekDays: Array.from({ length: 7 }, (_, index) => {
      const date = addDays(weekStart, index);
      return { date, totalSeconds: totalsByDate.get(date) ?? 0 };
    }),
    categories: (categoryResult.data ?? []).map((row) => ({
      categoryId: row.category_id,
      name: row.category_name,
      icon: row.category_icon,
      color: row.category_color,
      totalSeconds: Number(row.total_seconds),
      postCount: row.post_count,
    })),
    streak: streakResult.data ?? 0,
    weekStart,
    todayDate: today,
  };
}

function toPeriod(row?: { total_seconds: number; post_count: number; active_days: number }): PeriodSummary {
  if (!row) return EMPTY_PERIOD;
  return {
    totalSeconds: Number(row.total_seconds),
    postCount: row.post_count,
    activeDays: row.active_days,
  };
}

export interface GroupWeekMember {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  totalSeconds: number;
  activeDays: number;
}

/**
 * グループの今週（7.7）。
 *
 * 15.5 に従い、順位は付けない。表示名の順で並べる。
 * 数えるのは、そのグループへ公開された記録だけ。
 */
export async function getGroupWeekSummary(
  groupId: string,
  timeZone: string,
): Promise<{ members: GroupWeekMember[]; weekStart: string }> {
  const supabase = await createClient();
  const weekStart = getWeekStartDate(getToday(timeZone));

  const { data, error } = await supabase.rpc('get_group_week_summary', {
    p_group_id: groupId,
    p_week_start: weekStart,
  });

  if (error) {
    console.error('getGroupWeekSummary failed', error);
    return { members: [], weekStart };
  }

  return {
    members: (data ?? []).map((row) => ({
      userId: row.user_id,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      totalSeconds: Number(row.total_seconds),
      activeDays: row.active_days,
    })),
    weekStart,
  };
}
