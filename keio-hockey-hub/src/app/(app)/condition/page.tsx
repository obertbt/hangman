import type { Metadata } from 'next';
import Link from 'next/link';

import { Card } from '@/components/ui/card';
import { ConditionForm } from '@/features/daily/components/condition-form';
import { findRecordableEvent, getConditionFor } from '@/features/daily/queries';
import { requireSession } from '@/lib/auth/session';
import { formatDateLabel, todayInTokyo } from '@/lib/datetime';

export const metadata: Metadata = { title: '練習前コンディション' };

export default async function ConditionPage() {
  const session = await requireSession();
  const date = todayInTokyo();

  const [event, existing] = await Promise.all([
    findRecordableEvent(session.teamId, date),
    getConditionFor(session, date),
  ]);

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <Link href="/today" className="text-keio-700 dark:text-keio-300 underline">
          ← 今日へ戻る
        </Link>
      </p>

      <header>
        <p className="text-xs text-[--color-muted]">{formatDateLabel(date)}</p>
        <h1 className="mt-1 text-xl font-bold">練習前コンディション</h1>
        {event ? <p className="mt-1 text-sm text-[--color-muted]">{event.title}</p> : null}
      </header>

      <Card>
        <ConditionForm date={date} eventId={event?.id ?? null} existing={existing} />
      </Card>
    </div>
  );
}
