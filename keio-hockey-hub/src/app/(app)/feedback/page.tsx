import type { Metadata } from 'next';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, EmptyState } from '@/components/ui/card';
import {
  listAwaitingCoach,
  listAwaitingPlayerAck,
  listMyFeedback,
  type FeedbackListItem,
} from '@/features/feedback/queries';
import { daysWaiting, isOverdue } from '@/features/feedback/lib/state';
import { can, isStaff, requireSession } from '@/lib/auth/session';
import { formatDateTimeInTokyo } from '@/lib/datetime';
import { FEEDBACK_STATUS_LABELS, QUESTION_TEMPLATES } from '@/lib/labels';
import { formatSecondsToTimecode } from '@/lib/storage/validation';
import type { FeedbackStatus } from '@/types/database.types';

export const metadata: Metadata = { title: '動画フィードバック' };

export default async function FeedbackPage() {
  const session = await requireSession();
  const canAnswer = can(session, 'video.feedback_answer');

  const [mine, awaiting, awaitingAck] = await Promise.all([
    listMyFeedback(session),
    canAnswer ? listAwaitingCoach(session) : Promise.resolve([]),
    canAnswer ? listAwaitingPlayerAck(session) : Promise.resolve([]),
  ]);

  const overdue = awaiting.filter((item) => isOverdue(item.request.status, item.request.submitted_at));

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold">動画フィードバック</h1>
        <p className="mt-1 text-sm text-[--color-muted]">
          {canAnswer
            ? '選手からの質問と、その回答の状況です。'
            : '自分が出した質問と、コーチからの回答です。'}
        </p>
      </header>

      {canAnswer ? (
        <>
          {overdue.length > 0 ? (
            <Card className="border-amber-400">
              <CardHeader
                title={`3日以上お待たせしています（${overdue.length}件）`}
                description="ここから先に対応してください。"
              />
              <FeedbackList items={overdue} showWaiting />
            </Card>
          ) : null}

          <Card>
            <CardHeader title="回答待ち" description={`${awaiting.length}件`} />
            {awaiting.length === 0 ? (
              <EmptyState>対応が要る質問はありません。</EmptyState>
            ) : (
              <FeedbackList items={awaiting} showWaiting />
            )}
          </Card>

          <Card>
            <CardHeader
              title="選手がまだ見ていない回答"
              description={`${awaitingAck.length}件。声をかけると届きやすくなります。`}
            />
            {awaitingAck.length === 0 ? (
              <EmptyState>ありません。</EmptyState>
            ) : (
              <FeedbackList items={awaitingAck} />
            )}
          </Card>
        </>
      ) : null}

      <Card>
        <CardHeader
          title={isStaff(session) ? '自分が出した質問' : '出した質問'}
          description={`${mine.length}件`}
        />
        {mine.length === 0 ? (
          <EmptyState>
            まだ質問していません。
            <Link href="/videos" className="ml-1 underline">
              動画から質問する
            </Link>
          </EmptyState>
        ) : (
          <FeedbackList items={mine} />
        )}
      </Card>
    </div>
  );
}

function FeedbackList({ items, showWaiting = false }: { items: FeedbackListItem[]; showWaiting?: boolean }) {
  return (
    <ul className="divide-y divide-[--color-border]">
      {items.map(({ request, requesterName, videoTitle, clip }) => {
        const waiting = daysWaiting(request.submitted_at);
        const template = QUESTION_TEMPLATES.find((item) => item.value === request.question_type);

        return (
          <li key={request.id} className="py-3">
            <Link href={`/feedback/${request.id}`} className="block">
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <Badge tone={statusTone(request.status)}>{FEEDBACK_STATUS_LABELS[request.status]}</Badge>
                {showWaiting && waiting > 0 ? (
                  <Badge tone={waiting >= 3 ? 'danger' : 'warning'}>{waiting}日経過</Badge>
                ) : null}
                <span className="font-medium">{requesterName}</span>
                {template ? <span className="text-xs text-[--color-muted]">{template.label}</span> : null}
              </p>

              <p className="mt-1 line-clamp-2 text-sm">{request.question}</p>

              <p className="mt-1 text-xs text-[--color-muted]">
                {videoTitle ?? '動画なし'}
                {clip
                  ? ` / ${formatSecondsToTimecode(clip.start_seconds)}〜${formatSecondsToTimecode(clip.end_seconds)}`
                  : ''}
                {request.submitted_at ? ` / ${formatDateTimeInTokyo(request.submitted_at)}` : ''}
              </p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function statusTone(status: FeedbackStatus): 'neutral' | 'info' | 'success' | 'warning' {
  switch (status) {
    case 'answered':
    case 'acknowledged':
    case 'closed':
      return 'success';
    case 'submitted':
      return 'warning';
    case 'assigned':
    case 'reviewing':
    case 'follow_up':
      return 'info';
    default:
      return 'neutral';
  }
}
