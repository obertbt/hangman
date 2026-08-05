import Link from 'next/link';

import { Card } from '@/components/ui/card';
import type { ActivityListItem } from '@/features/activities/queries';
import { formatDuration } from '@/lib/date/duration';
import { formatDateLabel } from '@/lib/date/timezone';
import { VISIBILITY_LABELS } from '@/lib/permissions/visibility';

/** 自分の活動記録の一覧。日付ごとにまとめて表示する。 */
export function ActivityList({ activities }: { activities: ActivityListItem[] }) {
  if (activities.length === 0) {
    return (
      <Card className="text-center">
        <p className="text-sm font-medium">まだ記録がありません。</p>
        <p className="mt-1 text-sm text-[--color-muted]">
          タイマーを使うか、手動で記録すると、ここに積み上がっていきます。
        </p>
      </Card>
    );
  }

  const byDate = new Map<string, ActivityListItem[]>();
  for (const activity of activities) {
    const list = byDate.get(activity.activityDate) ?? [];
    list.push(activity);
    byDate.set(activity.activityDate, list);
  }

  return (
    <div className="space-y-5">
      {[...byDate.entries()].map(([date, items]) => {
        const total = items.reduce((sum, item) => sum + item.durationSeconds, 0);
        return (
          <section key={date}>
            <h2 className="flex items-baseline justify-between pb-2 text-sm text-[--color-muted]">
              <span>{formatDateLabel(date)}</span>
              <span>{formatDuration(total)}</span>
            </h2>
            <ul className="space-y-2">
              {items.map((activity) => (
                <li key={activity.id}>
                  <Link
                    href={`/activities/${activity.id}`}
                    className="hover:bg-hearth-100/40 flex items-center gap-3 rounded-2xl border border-[--color-border] bg-[--color-surface] p-3 transition-colors"
                  >
                    <span
                      aria-hidden
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg"
                      style={{ backgroundColor: `${activity.category?.color ?? '#8B8B8B'}22` }}
                    >
                      {activity.category?.icon ?? '📝'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {activity.title ?? activity.category?.name ?? '活動'}
                      </p>
                      <p className="text-xs text-[--color-muted]">
                        {activity.category?.name}・{formatDuration(activity.durationSeconds)}・
                        {VISIBILITY_LABELS[activity.visibility]}
                        {activity.fromTimer ? '・タイマー' : ''}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
