import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, EmptyState } from '@/components/ui/card';
import { ApplicationActions } from '@/features/skills/components/application-actions';
import { ReviewForm } from '@/features/skills/components/review-form';
import { availableActions, isBackToPlayer, type Actor } from '@/features/skills/lib/state';
import { getApplicationDetail } from '@/features/skills/queries';
import { can, requireSession } from '@/lib/auth/session';
import { formatDateTimeInTokyo } from '@/lib/datetime';
import {
  SKILL_APPLICATION_STATUS_LABELS,
  SKILL_REVIEW_DECISION_LABELS,
  SKILL_STATUS_LABELS,
} from '@/lib/labels';
import { formatSecondsToTimecode } from '@/lib/storage/validation';

export const metadata: Metadata = { title: 'スキル申請' };

/**
 * 申請1件（32章）。
 *
 * 選手には「いま何待ちか」と「次に何をすればいいか」を、
 * コーチには「何を根拠に、何を認めるか」を出す。
 */
export default async function SkillApplicationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ submitted?: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  const { submitted } = await searchParams;

  const detail = await getApplicationDetail(session, id);
  if (!detail) notFound();

  const { application, skill, items, reviews } = detail;

  // 審査担当が自分の申請を出した場合も、本人であることを優先する。
  // そうしないと自分で自分を承認できてしまう。
  const actor: Actor =
    application.team_member_id === session.teamMemberId
      ? 'owner'
      : can(session, 'skill.review')
        ? 'reviewer'
        : 'observer';

  const actions = availableActions(application.status, actor);
  const sentBack = isBackToPlayer(application.status, reviews.length > 0);
  const canReviewNow = actor === 'reviewer' && actions.some((entry) => entry.action !== 'start_review');

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <Link href="/skills/applications" className="text-keio-700 dark:text-keio-300 underline">
          ← 申請の一覧へ戻る
        </Link>
      </p>

      {submitted ? (
        <Card className="border-emerald-500">
          <p className="text-sm">申請しました。コーチからの返事をお待ちください。</p>
        </Card>
      ) : null}

      <header>
        <p className="flex flex-wrap items-center gap-2">
          <Badge tone={sentBack ? 'warning' : 'neutral'}>
            {sentBack ? '差し戻し' : SKILL_APPLICATION_STATUS_LABELS[application.status]}
          </Badge>
          {detail.playerSkill ? (
            <Badge tone={detail.playerSkill.status === 'approved' ? 'success' : 'info'}>
              到達状況: {SKILL_STATUS_LABELS[detail.playerSkill.status]}
            </Badge>
          ) : null}
        </p>
        <h1 className="mt-2 text-xl font-bold">{skill?.name ?? '（削除されたスキル）'}</h1>
        <p className="mt-1 text-sm text-[--color-muted]">
          {detail.categoryName ? `${detail.categoryName} / ` : ''}
          {detail.applicantName}
          {application.submitted_at ? ` / 提出 ${formatDateTimeInTokyo(application.submitted_at)}` : ''}
        </p>
        {skill?.criteria ? <p className="mt-1 text-sm">目安: {skill.criteria}</p> : null}
      </header>

      {sentBack && actor === 'owner' ? (
        <Card className="border-amber-400">
          <CardHeader
            title="コーチから返ってきています"
            description="下の「コーチの審査」を読んで、足りないものを足してから出し直してください。"
          />
        </Card>
      ) : null}

      <Card>
        <CardHeader title="申請の内容" />
        {application.comment ? (
          <p className="text-sm whitespace-pre-wrap">{application.comment}</p>
        ) : (
          <p className="text-sm text-[--color-muted]">（説明なし）</p>
        )}
      </Card>

      <Card>
        <CardHeader title="根拠" description={`${items.length}件`} />
        {items.length === 0 ? (
          <EmptyState>根拠は添えられていません。</EmptyState>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => {
              if (item.item_type === 'note') {
                return (
                  <li key={item.id} className="rounded-lg border border-[--color-border] px-3 py-2">
                    <p className="text-xs text-[--color-muted]">補足</p>
                    <p className="mt-1 text-sm whitespace-pre-wrap">{item.note}</p>
                  </li>
                );
              }

              if (item.video_id) {
                const video = detail.videos.get(item.video_id);
                return (
                  <li key={item.id} className="rounded-lg border border-[--color-border] px-3 py-2">
                    <p className="text-xs text-[--color-muted]">動画</p>
                    {video ? (
                      <Link
                        href={`/videos/${video.id}`}
                        className="text-keio-700 dark:text-keio-300 text-sm underline"
                      >
                        {video.title}
                      </Link>
                    ) : (
                      <p className="text-sm text-[--color-muted]">（見られない、または削除された動画）</p>
                    )}
                  </li>
                );
              }

              if (item.video_clip_id) {
                const clip = detail.clips.get(item.video_clip_id);
                return (
                  <li key={item.id} className="rounded-lg border border-[--color-border] px-3 py-2">
                    <p className="text-xs text-[--color-muted]">場面</p>
                    {clip ? (
                      <Link
                        href={`/videos/${clip.video_id}?clip=${clip.id}`}
                        className="text-keio-700 dark:text-keio-300 text-sm underline"
                      >
                        {clip.title ?? '指定した場面'}（{formatSecondsToTimecode(clip.start_seconds)}〜
                        {formatSecondsToTimecode(clip.end_seconds)}）
                      </Link>
                    ) : (
                      <p className="text-sm text-[--color-muted]">（見られない、または削除された場面）</p>
                    )}
                  </li>
                );
              }

              if (item.feedback_request_id) {
                const request = detail.feedbacks.get(item.feedback_request_id);
                return (
                  <li key={item.id} className="rounded-lg border border-[--color-border] px-3 py-2">
                    <p className="text-xs text-[--color-muted]">コーチの回答</p>
                    {request ? (
                      <Link
                        href={`/feedback/${request.id}`}
                        className="text-keio-700 dark:text-keio-300 text-sm underline"
                      >
                        {request.question.slice(0, 60)}
                      </Link>
                    ) : (
                      <p className="text-sm text-[--color-muted]">（見られない、または削除された質問）</p>
                    )}
                  </li>
                );
              }

              return null;
            })}
          </ul>
        )}
      </Card>

      {reviews.length > 0 ? (
        <Card>
          <CardHeader title="コーチの審査" description="上書きせず、やり取りをそのまま残しています。" />
          <ol className="space-y-3">
            {reviews.map((review) => (
              <li key={review.id} className="rounded-lg border border-[--color-border] px-3 py-2">
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge tone={review.decision === 'approved' ? 'success' : 'warning'}>
                    {SKILL_REVIEW_DECISION_LABELS[review.decision]}
                  </Badge>
                  <span className="font-medium">
                    {detail.reviewerNames.get(review.reviewer_id) ?? '不明'}
                  </span>
                  <span className="text-xs text-[--color-muted]">
                    {formatDateTimeInTokyo(review.created_at)}
                  </span>
                </p>
                {review.comment ? <p className="mt-1 text-sm whitespace-pre-wrap">{review.comment}</p> : null}
              </li>
            ))}
          </ol>
        </Card>
      ) : null}

      {canReviewNow ? (
        <Card>
          <CardHeader title="審査する" description="判断とことばを、まとめて選手へ返します。" />
          <ReviewForm applicationId={application.id} />
        </Card>
      ) : null}

      {actions.length > 0 ? (
        <Card>
          <CardHeader title="この申請にできること" />
          <ApplicationActions applicationId={application.id} actions={actions} />
        </Card>
      ) : null}

      {sentBack && actor === 'owner' ? (
        <Card>
          <CardHeader
            title="根拠を足す"
            description="いまの申請は取り下げずに、新しく出し直すこともできます。"
          />
          <p className="text-sm">
            動画や場面を新しく足したい場合は、
            <Link href="/videos" className="text-keio-700 dark:text-keio-300 mx-1 underline">
              動画
            </Link>
            から用意してから、
            <Link
              href={`/skills/apply/${application.skill_id}`}
              className="text-keio-700 dark:text-keio-300 mx-1 underline"
            >
              もう一度申請する
            </Link>
            を開いてください。
          </p>
        </Card>
      ) : null}

      {detail.histories.length > 0 ? (
        <Card>
          <CardHeader title="これまでの動き" description="到達状況が変わった記録です。" />
          <ol className="space-y-1 text-sm">
            {detail.histories.map((history) => (
              <li key={history.id} className="flex flex-wrap gap-2">
                <span className="text-xs text-[--color-muted]">
                  {formatDateTimeInTokyo(history.created_at)}
                </span>
                <span>
                  {history.from_status
                    ? `${statusLabel(history.from_status)} → ${statusLabel(history.to_status)}`
                    : statusLabel(history.to_status)}
                </span>
              </li>
            ))}
          </ol>
        </Card>
      ) : null}
    </div>
  );
}

function statusLabel(status: string): string {
  return status in SKILL_STATUS_LABELS
    ? SKILL_STATUS_LABELS[status as keyof typeof SKILL_STATUS_LABELS]
    : status;
}
