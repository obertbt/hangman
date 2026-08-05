import type { CategorySummaryItem, DailyTotal, PeriodSummary } from '@/features/analytics/queries';
import { progressPercent } from '@/features/goals/schemas';
import { formatDuration } from '@/lib/date/duration';
import { cn } from '@/lib/utils/cn';

const WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日'];

interface WeekSummaryProps {
  week: PeriodSummary;
  weekDays: DailyTotal[];
  categories: CategorySummaryItem[];
  todayDate: string;
  targetSeconds: number | null;
  message?: string | null;
}

/**
 * 今週のまとめ（7.6, 15.2）。
 *
 * 他人と比べる数字は出さない。自分の積み上がりだけを見せる。
 */
export function WeekSummary({
  week,
  weekDays,
  categories,
  todayDate,
  targetSeconds,
  message,
}: WeekSummaryProps) {
  const progress = progressPercent(week.totalSeconds, targetSeconds);
  // 棒の高さは、その週でいちばん長かった日を基準にする
  const peak = Math.max(...weekDays.map((day) => day.totalSeconds), 1);

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <p className="text-2xl font-bold">{formatDuration(week.totalSeconds)}</p>
        <p className="text-xs text-[--color-muted]">
          {week.activeDays}日 / {week.postCount}件
        </p>
      </div>

      {progress !== null ? (
        <div>
          <div className="flex items-baseline justify-between pb-1 text-xs text-[--color-muted]">
            <span>{message || '今週の目標'}</span>
            <span>
              {progress}%（{formatDuration(targetSeconds ?? 0)}）
            </span>
          </div>
          <div
            className="bg-hearth-200 h-2 w-full overflow-hidden rounded-full"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="今週の目標の進捗"
          >
            <div className="bg-ember-500 h-full rounded-full" style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : null}

      <div>
        <ul className="flex items-end justify-between gap-1" aria-label="曜日ごとの活動時間">
          {weekDays.map((day, index) => {
            const height = day.totalSeconds === 0 ? 2 : Math.max(4, (day.totalSeconds / peak) * 56);
            const isToday = day.date === todayDate;
            return (
              <li key={day.date} className="flex flex-1 flex-col items-center gap-1">
                <span className="sr-only">
                  {WEEKDAYS[index]}曜日 {formatDuration(day.totalSeconds)}
                </span>
                <span
                  aria-hidden
                  className={cn('w-full rounded-t', day.totalSeconds > 0 ? 'bg-ember-400' : 'bg-hearth-200')}
                  style={{ height }}
                />
                <span
                  aria-hidden
                  className={cn('text-[10px]', isToday ? 'text-ember-600 font-bold' : 'text-[--color-muted]')}
                >
                  {WEEKDAYS[index]}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {categories.length > 0 ? (
        <div>
          <p className="pb-2 text-xs text-[--color-muted]">カテゴリー別</p>
          <ul className="space-y-1.5">
            {categories.map((category) => {
              const share = Math.round((category.totalSeconds / Math.max(1, week.totalSeconds)) * 100);
              return (
                <li key={category.categoryId} className="flex items-center gap-2 text-sm">
                  <span aria-hidden>{category.icon}</span>
                  <span className="w-20 shrink-0 truncate text-xs">{category.name}</span>
                  <span className="bg-hearth-100 h-1.5 flex-1 overflow-hidden rounded-full">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${share}%`, backgroundColor: category.color }}
                    />
                  </span>
                  <span className="w-20 shrink-0 text-right text-xs tabular-nums">
                    {formatDuration(category.totalSeconds)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-[--color-muted]">今週はまだ記録がありません。</p>
      )}
    </div>
  );
}
