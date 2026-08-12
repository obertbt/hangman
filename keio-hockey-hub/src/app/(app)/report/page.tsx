import type { Metadata } from 'next';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, EmptyState } from '@/components/ui/card';
import { ReportForm } from '@/features/daily/components/report-form';
import {
  findRecordableEvent,
  getPracticeGoalFor,
  getReportFor,
  listMyReports,
} from '@/features/daily/queries';
import { requireSession } from '@/lib/auth/session';
import { formatDateLabel, todayInTokyo } from '@/lib/datetime';
import { REPORT_VISIBILITY_LABELS } from '@/lib/labels';

export const metadata: Metadata = { title: '日報' };

export default async function ReportPage() {
  const session = await requireSession();
  const date = todayInTokyo();

  const [event, existing, goal, past] = await Promise.all([
    findRecordableEvent(session.teamId, date),
    getReportFor(session, date),
    getPracticeGoalFor(session, date),
    listMyReports(session, 10),
  ]);

  // 今日のぶんは上のフォームで扱うので、履歴からは外す
  const history = past.filter((report) => report.report_date !== date);

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <Link href="/today" className="text-keio-700 dark:text-keio-300 underline">
          ← 今日へ戻る
        </Link>
      </p>

      <header>
        <p className="text-xs text-[--color-muted]">{formatDateLabel(date)}</p>
        <h1 className="mt-1 text-xl font-bold">日報</h1>
        {event ? <p className="mt-1 text-sm text-[--color-muted]">{event.title}</p> : null}
      </header>

      <Card>
        <ReportForm
          date={date}
          eventId={event?.id ?? null}
          existing={existing}
          personalGoal={goal?.goal ?? null}
        />
      </Card>

      <Card>
        <CardHeader title="これまでの日報" description="自分の書いたものだけが並びます" />
        {history.length === 0 ? (
          <EmptyState>まだありません。</EmptyState>
        ) : (
          <ul className="divide-y divide-[--color-border]">
            {history.map((report) => (
              <li key={report.id} className="py-3">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {formatDateLabel(report.report_date)}
                  {report.status === 'submitted' ? (
                    <Badge tone="success">提出済み</Badge>
                  ) : (
                    <Badge tone="warning">下書き</Badge>
                  )}
                  <Badge tone="neutral">{REPORT_VISIBILITY_LABELS[report.visibility]}</Badge>
                </p>
                {report.what_went_well ? (
                  <p className="mt-1 line-clamp-2 text-sm text-[--color-muted]">
                    できたこと: {report.what_went_well}
                  </p>
                ) : null}
                {report.next_action ? (
                  <p className="mt-1 line-clamp-2 text-sm text-[--color-muted]">次回: {report.next_action}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
