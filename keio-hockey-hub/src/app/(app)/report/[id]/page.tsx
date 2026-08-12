import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, EmptyState } from '@/components/ui/card';
import { DeleteCommentButton, ReportCommentForm } from '@/features/daily/components/report-comments';
import { getReportDetail } from '@/features/daily/feedback-queries';
import { can, requireSession } from '@/lib/auth/session';
import { formatDateLabel, formatDateTimeInTokyo } from '@/lib/datetime';
import { REPORT_VISIBILITY_LABELS } from '@/lib/labels';

export const metadata: Metadata = { title: '日報' };

/**
 * 日報1件と、そこに付いたコーチのコメント（16章）。
 *
 * 選手は「自分の日報に何が返ってきたか」を、
 * コーチは「読んで、ひとこと返す」をここで済ませる。
 *
 * 見えるかどうかは RLS が決める（0022）。
 * 「自分だけ」にした日報は、コーチが URL を直接開いても出てこない。
 */
export default async function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  const detail = await getReportDetail(session, id);
  if (!detail) notFound();

  const { report, authorName, comments } = detail;
  const isOwn = report.team_member_id === session.teamMemberId;

  // 書けるのは「全員の日報を見る権限がある人」だけ。
  // 「自分だけ」の日報はそもそもここまで来ないが、念のため画面でも閉じる。
  const canComment = can(session, 'report.view_all') && report.visibility !== 'private';

  const sections: { label: string; value: string | null }[] = [
    { label: '今日の目標', value: report.personal_goal },
    { label: 'やったこと', value: report.what_happened },
    { label: 'できたこと', value: report.what_went_well },
    { label: 'できなかったこと', value: report.what_went_wrong },
    { label: '原因', value: report.cause },
    { label: '改善すること', value: report.improvement },
    { label: '次に防ぐには', value: report.prevention },
    { label: 'その場での対応', value: report.response_taken },
    { label: '次回取り組むこと', value: report.next_action },
    { label: '自由記述', value: report.free_note },
  ].filter((section) => section.value !== null && section.value !== '');

  const ratings: { label: string; value: number | null }[] = [
    { label: '自己評価', value: report.self_rating },
    { label: '強度', value: report.intensity },
    { label: '疲労', value: report.fatigue_level },
    { label: '気分', value: report.mood },
    { label: '調子', value: report.condition_level },
  ].filter((rating) => rating.value !== null);

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <Link
          href={isOwn ? '/report' : '/admin/submissions'}
          className="text-keio-700 dark:text-keio-300 underline"
        >
          {isOwn ? '← 日報へ戻る' : '← 提出状況へ戻る'}
        </Link>
      </p>

      <header>
        <p className="text-xs text-[--color-muted]">{formatDateLabel(report.report_date)}</p>
        <h1 className="mt-1 text-xl font-bold">{isOwn ? '自分の日報' : `${authorName}さんの日報`}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-2">
          {report.status === 'submitted' ? (
            <Badge tone="success">提出済み</Badge>
          ) : (
            <Badge tone="warning">下書き</Badge>
          )}
          <Badge tone="neutral">{REPORT_VISIBILITY_LABELS[report.visibility]}</Badge>
          {report.submitted_at ? (
            <span className="text-xs text-[--color-muted]">
              提出 {formatDateTimeInTokyo(report.submitted_at)}
            </span>
          ) : null}
        </p>
      </header>

      <Card>
        <CardHeader title="内容" />
        {sections.length === 0 ? (
          <EmptyState>まだ何も書かれていません。</EmptyState>
        ) : (
          <dl className="space-y-3">
            {sections.map((section) => (
              <div key={section.label}>
                <dt className="text-xs text-[--color-muted]">{section.label}</dt>
                <dd className="mt-0.5 text-sm whitespace-pre-wrap">{section.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {ratings.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-2 border-t border-[--color-border] pt-3">
            {ratings.map((rating) => (
              <li key={rating.label} className="text-xs text-[--color-muted]">
                {rating.label}{' '}
                <span className="text-sm font-medium text-[--color-foreground]">{rating.value}</span>
                /5
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      <Card>
        <CardHeader
          title="コーチからのコメント"
          description={
            comments.length > 0
              ? '上書きせず、届いた順に残しています。'
              : isOwn
                ? 'まだ届いていません。'
                : undefined
          }
        />

        {comments.length === 0 ? (
          <EmptyState>
            {isOwn
              ? 'コメントが付くと、通知でお知らせします。'
              : 'まだ誰もコメントしていません。ひとことで構いません。'}
          </EmptyState>
        ) : (
          <ol className="space-y-3">
            {comments.map((entry) => (
              <li key={entry.comment.id} className="rounded-lg border border-[--color-border] px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">{entry.authorName}</span>
                    <span className="text-xs text-[--color-muted]">
                      {formatDateTimeInTokyo(entry.comment.created_at)}
                    </span>
                  </p>
                  {entry.comment.author_id === session.profileId ? (
                    <DeleteCommentButton feedbackId={entry.comment.id} reportId={report.id} />
                  ) : null}
                </div>
                <p className="mt-1 text-sm whitespace-pre-wrap">{entry.comment.body}</p>
              </li>
            ))}
          </ol>
        )}
      </Card>

      {canComment ? (
        <Card>
          <CardHeader title="コメントする" description="選手の通知に届きます。" />
          <ReportCommentForm reportId={report.id} />
        </Card>
      ) : null}

      {isOwn && report.visibility === 'private' ? (
        <p className="text-xs text-[--color-muted]">
          この日報は「自分だけ」に設定されています。コーチには表示されないため、コメントも付きません。
          意見がほしいときは、公開範囲を「コーチまで」に変えてください。
        </p>
      ) : null}

      {isOwn && report.next_action ? (
        <Card>
          <CardHeader
            title="次に取り組むこと"
            description="ここに書いたことが、次の日の「今日やること」に出ます。"
          />
          <p className="text-sm whitespace-pre-wrap">{report.next_action}</p>
          <p className="mt-2 text-sm">
            <Link href="/goal" className="text-keio-700 dark:text-keio-300 underline">
              今日の目標として書く
            </Link>
          </p>
        </Card>
      ) : null}
    </div>
  );
}
