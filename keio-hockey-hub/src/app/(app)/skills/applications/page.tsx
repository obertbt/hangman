import type { Metadata } from 'next';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, EmptyState } from '@/components/ui/card';
import { daysWaiting } from '@/features/feedback/lib/state';
import { isBackToPlayer } from '@/features/skills/lib/state';
import { listAwaitingReview, listMyApplications, type ApplicationListItem } from '@/features/skills/queries';
import { can, isStaff, requireSession } from '@/lib/auth/session';
import { formatDateTimeInTokyo } from '@/lib/datetime';
import { SKILL_APPLICATION_STATUS_LABELS } from '@/lib/labels';
import type { SkillApplicationStatus } from '@/types/database.types';

export const metadata: Metadata = { title: 'スキル申請' };

export default async function SkillApplicationsPage() {
  const session = await requireSession();
  const canReview = can(session, 'skill.review');

  const [mine, awaiting] = await Promise.all([
    listMyApplications(session),
    canReview ? listAwaitingReview(session) : Promise.resolve([]),
  ]);

  const overdue = awaiting.filter((item) => daysWaiting(item.application.submitted_at) >= 3);
  const sentBack = mine.filter((item) => isBackToPlayer(item.application.status, item.hasReview));

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <Link href="/skills" className="text-keio-700 dark:text-keio-300 underline">
          ← スキル一覧へ戻る
        </Link>
      </p>

      <header>
        <h1 className="text-xl font-bold">スキル申請</h1>
        <p className="mt-1 text-sm text-[--color-muted]">
          {canReview ? '選手からの申請と、その審査の状況です。' : '自分が出した申請の状況です。'}
        </p>
      </header>

      {sentBack.length > 0 ? (
        <Card className="border-amber-400">
          <CardHeader
            title={`根拠を足してほしい申請が${sentBack.length}件あります`}
            description="コーチから返ってきています。足して出し直してください。"
          />
          <ApplicationList items={sentBack} />
        </Card>
      ) : null}

      {canReview ? (
        <>
          {overdue.length > 0 ? (
            <Card className="border-amber-400">
              <CardHeader
                title={`3日以上お待たせしています（${overdue.length}件）`}
                description="ここから先に見てください。"
              />
              <ApplicationList items={overdue} showApplicant showWaiting />
            </Card>
          ) : null}

          <Card>
            <CardHeader title="審査待ち" description={`${awaiting.length}件`} />
            {awaiting.length === 0 ? (
              <EmptyState>審査が要る申請はありません。</EmptyState>
            ) : (
              <ApplicationList items={awaiting} showApplicant showWaiting />
            )}
          </Card>
        </>
      ) : null}

      <Card>
        <CardHeader
          title={isStaff(session) ? '自分が出した申請' : '出した申請'}
          description={`${mine.length}件`}
        />
        {mine.length === 0 ? (
          <EmptyState>
            まだ申請していません。
            <Link href="/skills" className="ml-1 underline">
              スキル一覧から申請する
            </Link>
          </EmptyState>
        ) : (
          <ApplicationList items={mine} />
        )}
      </Card>
    </div>
  );
}

function ApplicationList({
  items,
  showApplicant = false,
  showWaiting = false,
}: {
  items: ApplicationListItem[];
  showApplicant?: boolean;
  showWaiting?: boolean;
}) {
  return (
    <ul className="divide-y divide-[--color-border]">
      {items.map(({ application, skillName, applicantName, hasReview }) => {
        const waiting = daysWaiting(application.submitted_at);
        const sentBack = isBackToPlayer(application.status, hasReview);

        return (
          <li key={application.id} className="py-3">
            <Link href={`/skills/applications/${application.id}`} className="block">
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <Badge tone={statusTone(application.status, sentBack)}>
                  {sentBack ? '差し戻し' : SKILL_APPLICATION_STATUS_LABELS[application.status]}
                </Badge>
                {showWaiting && waiting > 0 ? (
                  <Badge tone={waiting >= 3 ? 'danger' : 'warning'}>{waiting}日経過</Badge>
                ) : null}
                {showApplicant ? <span className="font-medium">{applicantName}</span> : null}
              </p>

              <p className="mt-1 text-sm font-medium">{skillName}</p>

              {application.comment ? (
                <p className="mt-1 line-clamp-2 text-sm text-[--color-muted]">{application.comment}</p>
              ) : null}

              <p className="mt-1 text-xs text-[--color-muted]">
                {application.submitted_at
                  ? `提出 ${formatDateTimeInTokyo(application.submitted_at)}`
                  : `作成 ${formatDateTimeInTokyo(application.created_at)}`}
              </p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function statusTone(
  status: SkillApplicationStatus,
  sentBack: boolean,
): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
  if (sentBack) return 'warning';
  switch (status) {
    case 'approved':
      return 'success';
    case 'submitted':
      return 'warning';
    case 'reviewing':
      return 'info';
    case 'rejected':
      return 'danger';
    default:
      return 'neutral';
  }
}
