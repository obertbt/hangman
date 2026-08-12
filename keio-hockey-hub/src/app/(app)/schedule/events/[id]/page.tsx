import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { getEvent, getCurrentWeek } from '@/features/timeline/queries';
import { requireSession } from '@/lib/auth/session';
import { formatDateLabel, formatTimeLabel } from '@/lib/datetime';
import { EVENT_TYPE_LABELS } from '@/lib/labels';

export const metadata: Metadata = { title: '予定の詳細' };

/** Next.js 16 では params が Promise になっている。 */
export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  const event = await getEvent(session.teamId, id);
  if (!event) notFound();

  const week = await getCurrentWeek(session.teamId, event.event_date);

  const start = formatTimeLabel(event.start_time);
  const end = formatTimeLabel(event.end_time);

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <Link href="/schedule" className="text-keio-700 dark:text-keio-300 underline">
          ← 予定へ戻る
        </Link>
      </p>

      <header>
        <div className="flex items-center gap-2">
          <Badge tone={event.event_type === 'match' ? 'action' : 'info'}>
            {EVENT_TYPE_LABELS[event.event_type]}
          </Badge>
          {!event.is_published ? <Badge tone="warning">下書き</Badge> : null}
        </div>
        <h1 className="mt-2 text-xl font-bold">{event.title}</h1>
        <p className="mt-1 text-sm text-[--color-muted]">
          {formatDateLabel(event.event_date)}
          {start ? ` ${start}${end ? `〜${end}` : ''}` : ' 時刻未定'}
          {event.location ? ` / ${event.location}` : ''}
        </p>
      </header>

      {week?.theme ? (
        <Card>
          <CardHeader title="今週のテーマ" />
          <p className="text-sm font-semibold">{week.theme}</p>
          {week.focus_task ? <p className="mt-1 text-sm text-[--color-muted]">{week.focus_task}</p> : null}
        </Card>
      ) : null}

      {event.theme ? (
        <Card>
          <CardHeader title="今日のテーマ" />
          <p className="text-sm">{event.theme}</p>
        </Card>
      ) : null}

      {event.purpose ? (
        <Card>
          <CardHeader title="目的" />
          <p className="text-sm whitespace-pre-line">{event.purpose}</p>
        </Card>
      ) : null}

      {event.menu ? (
        <Card>
          <CardHeader title="練習メニュー" />
          <p className="text-sm whitespace-pre-line">{event.menu}</p>
        </Card>
      ) : null}

      {event.items_to_bring ? (
        <Card>
          <CardHeader title="持ち物" />
          <p className="text-sm whitespace-pre-line">{event.items_to_bring}</p>
        </Card>
      ) : null}

      {event.notes ? (
        <Card>
          <CardHeader title="注意事項" />
          <p className="text-sm whitespace-pre-line">{event.notes}</p>
        </Card>
      ) : null}
    </div>
  );
}
