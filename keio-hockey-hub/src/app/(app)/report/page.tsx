import type { Metadata } from 'next';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, EmptyState } from '@/components/ui/card';
import { ReportForm } from '@/features/daily/components/report-form';
import { countCommentsByReport } from '@/features/daily/feedback-queries';
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

  // 「返事が来ている」を一覧で分かるようにする（16章）
  const commentCounts = await countCommentsByReport(past.map((report) => report.id));
  const todayComments = existing ? (commentCounts.get(existing.id) ?? 0) : 0;

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

      {existing && todayComments > 0 ? (
        <Card className="border-emerald-500">
          <p className="text-sm">
            今日の日報にコーチからコメントが届いています。
            <Link href={`/report/${existing.id}`} className="text-keio-700 dark:text-keio-300 ml-1 underline">
              読む（{todayComments}件）
            </Link>
          </p>
        </Card>
      ) : null}

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
            {history.map((report) => {
              const comments = commentCounts.get(report.id) ?? 0;
              return (
                <li key={report.id} className="py-3">
                  <Link href={`/report/${report.id}`} className="block">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      <span className="text-keio-700 dark:text-keio-300 underline">
                        {formatDateLabel(report.report_date)}
                      </span>
                      {report.status === 'submitted' ? (
                        <Badge tone="success">提出済み</Badge>
                      ) : (
                        <Badge tone="warning">下書き</Badge>
                      )}
                      <Badge tone="neutral">{REPORT_VISIBILITY_LABELS[report.visibility]}</Badge>
                      {comments > 0 ? <Badge tone="action">コメント{comments}件</Badge> : null}
                    </p>
                    {report.what_went_well ? (
                      <p className="mt-1 line-clamp-2 text-sm text-[--color-muted]">
                        できたこと: {report.what_went_well}
                      </p>
                    ) : null}
                    {report.next_action ? (
                      <p className="mt-1 line-clamp-2 text-sm text-[--color-muted]">
                        次回: {report.next_action}
                      </p>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
