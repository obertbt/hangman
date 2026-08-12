import type { Metadata } from 'next';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, EmptyState } from '@/components/ui/card';
import {
  CreateEventForm,
  CreateSeasonForm,
  CreateWeekForm,
} from '@/features/timeline/components/timeline-forms';
import { getCurrentWeek, listEventsInRange, listSeasons } from '@/features/timeline/queries';
import { can, requireSession } from '@/lib/auth/session';
import { addDaysToDateOnly, formatDateLabel, formatTimeLabel, todayInTokyo } from '@/lib/datetime';
import { EVENT_TYPE_LABELS } from '@/lib/labels';

export const metadata: Metadata = { title: '予定' };

export default async function SchedulePage() {
  const session = await requireSession();
  const canManage = can(session, 'event.manage');

  const today = todayInTokyo();
  const [seasons, week, events] = await Promise.all([
    listSeasons(session.teamId),
    getCurrentWeek(session.teamId, today),
    // 今日から4週間ぶんを見せる
    listEventsInRange(session.teamId, today, addDaysToDateOnly(today, 28)),
  ]);

  // 日付ごとにまとめる
  const byDate = new Map<string, typeof events>();
  for (const event of events) {
    const list = byDate.get(event.event_date) ?? [];
    list.push(event);
    byDate.set(event.event_date, list);
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold">予定</h1>
        <p className="mt-1 text-sm text-[--color-muted]">これから4週間ぶん</p>
      </header>

      {week ? (
        <Card>
          <CardHeader
            title="今週のテーマ"
            description={`${formatDateLabel(week.start_date)} 〜 ${formatDateLabel(week.end_date)}`}
          />
          <p className="text-base font-semibold">{week.theme ?? '未設定'}</p>
          {week.focus_task ? <p className="mt-2 text-sm">{week.focus_task}</p> : null}
        </Card>
      ) : null}

      {canManage ? (
        <>
          <CreateSeasonForm />
          <CreateWeekForm seasons={seasons} />
          <CreateEventForm />
        </>
      ) : null}

      <Card>
        <CardHeader title="これからの予定" />
        {byDate.size === 0 ? (
          <EmptyState>
            予定がまだありません。
            {canManage ? '上の「練習予定を作る」から追加してください。' : ''}
          </EmptyState>
        ) : (
          <div className="space-y-4">
            {[...byDate.entries()].map(([date, list]) => (
              <section key={date}>
                <h3 className="mb-2 text-xs font-semibold text-[--color-muted]">
                  {formatDateLabel(date)}
                  {date === todayInTokyo() ? (
                    <Badge tone="action" className="ml-2">
                      今日
                    </Badge>
                  ) : null}
                </h3>
                <ul className="space-y-2">
                  {list.map((event) => (
                    <li key={event.id}>
                      <Link
                        href={`/schedule/events/${event.id}`}
                        className="flex items-center gap-2 rounded-lg border border-[--color-border] px-3 py-2"
                      >
                        <Badge tone={event.event_type === 'match' ? 'action' : 'info'}>
                          {EVENT_TYPE_LABELS[event.event_type]}
                        </Badge>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{event.title}</span>
                        <span className="text-xs text-[--color-muted]">
                          {formatTimeLabel(event.start_time) ?? '時刻未定'}
                        </span>
                        {!event.is_published ? <Badge tone="warning">下書き</Badge> : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Card>

      {seasons.length > 0 ? (
        <Card>
          <CardHeader title="シーズン" />
          <ul className="space-y-2 text-sm">
            {seasons.map((season) => (
              <li key={season.id} className="flex items-center justify-between gap-2">
                <span>{season.name}</span>
                <span className="text-xs text-[--color-muted]">
                  {formatDateLabel(season.start_date)} 〜 {formatDateLabel(season.end_date)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
