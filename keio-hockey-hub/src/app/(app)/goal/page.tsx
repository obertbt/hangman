import type { Metadata } from 'next';
import Link from 'next/link';

import { Card } from '@/components/ui/card';
import { GoalForm } from '@/features/daily/components/goal-form';
import { findCarriedOverTask, findRecordableEvent, getPracticeGoalFor } from '@/features/daily/queries';
import { getCurrentWeek } from '@/features/timeline/queries';
import { requireSession } from '@/lib/auth/session';
import { formatDateLabel, todayInTokyo } from '@/lib/datetime';

export const metadata: Metadata = { title: '今日の個人目標' };

export default async function GoalPage() {
  const session = await requireSession();
  const date = todayInTokyo();

  const [event, existing, week, suggestedGoal] = await Promise.all([
    findRecordableEvent(session.teamId, date),
    getPracticeGoalFor(session, date),
    getCurrentWeek(session.teamId, date),
    findCarriedOverTask(session, date),
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
        <h1 className="mt-1 text-xl font-bold">今日の個人目標</h1>
        {event ? <p className="mt-1 text-sm text-[--color-muted]">{event.title}</p> : null}
      </header>

      <Card>
        <GoalForm
          date={date}
          eventId={event?.id ?? null}
          existing={existing}
          suggestedGoal={suggestedGoal}
          weekTheme={week?.theme ?? null}
        />
      </Card>
    </div>
  );
}
