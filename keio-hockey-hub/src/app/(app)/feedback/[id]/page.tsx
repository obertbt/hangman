import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, EmptyState } from '@/components/ui/card';
import { AnswerForm, type SkillOption } from '@/features/feedback/components/answer-form';
import { FeedbackActions } from '@/features/feedback/components/feedback-actions';
import { MessageForm } from '@/features/feedback/components/message-form';
import { ShareDecision } from '@/features/feedback/components/share-decision';
import { availableActions, isActionAllowed, type Actor } from '@/features/feedback/lib/state';
import { getFeedbackDetail } from '@/features/feedback/queries';
import { R2Player } from '@/features/upload/components/r2-player';
import { VideoWatch } from '@/features/video/components/video-watch';
import { can, requireSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { formatDateTimeInTokyo } from '@/lib/datetime';
import { FEEDBACK_STATUS_LABELS, QUESTION_TEMPLATES } from '@/lib/labels';
import { formatSecondsToTimecode } from '@/lib/storage/validation';

export const metadata: Metadata = { title: '動画フィードバック' };

export default async function FeedbackDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  const detail = await getFeedbackDetail(session, id);
  if (!detail) notFound();

  const { request, video, clip, responses, messages, shareRequest, requesterName, responderNames } = detail;

  const actor: Actor =
    request.requester_id === session.teamMemberId
      ? 'requester'
      : can(session, 'video.feedback_answer')
        ? 'coach'
        : 'observer';

  const actions = availableActions(request.status, actor);
  const canAnswerNow = isActionAllowed(request.status, actor, 'answer');
  const canFollowUp = isActionAllowed(request.status, actor, 'follow_up');

  const skills = canAnswerNow ? await listSkillOptions(session.teamId) : [];
  const template = QUESTION_TEMPLATES.find((item) => item.value === request.question_type);

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <Link href="/feedback" className="text-keio-700 dark:text-keio-300 underline">
          ← 一覧へ戻る
        </Link>
      </p>

      <header>
        <p className="flex flex-wrap items-center gap-2">
          <Badge tone={request.status === 'answered' ? 'success' : 'info'}>
            {FEEDBACK_STATUS_LABELS[request.status]}
          </Badge>
          {request.visibility === 'team' ? (
            <Badge tone="neutral">チーム全員に公開中</Badge>
          ) : (
            <Badge tone="neutral">コーチとスタッフのみ</Badge>
          )}
        </p>
        <h1 className="mt-2 text-lg font-bold">{requesterName} さんからの質問</h1>
        {template ? <p className="mt-1 text-sm text-[--color-muted]">{template.label}</p> : null}
      </header>

      {/* 質問の対象になった場面 */}
      {video?.provider === 'youtube' && video.provider_video_id ? (
        <VideoWatch
          providerVideoId={video.provider_video_id}
          clips={clip ? [clip] : []}
          selectedClipId={clip?.id ?? null}
        />
      ) : video?.provider === 'r2' ? (
        <R2Player videoId={video.id} />
      ) : null}

      <Card>
        <CardHeader
          title="質問"
          description={
            clip
              ? `${video?.title ?? ''} ${formatSecondsToTimecode(clip.start_seconds)}〜${formatSecondsToTimecode(clip.end_seconds)}`
              : (video?.title ?? undefined)
          }
        />
        <p className="text-sm whitespace-pre-line">{request.question}</p>
        {request.submitted_at ? (
          <p className="mt-2 text-xs text-[--color-muted]">{formatDateTimeInTokyo(request.submitted_at)}</p>
        ) : null}
      </Card>

      {/* 55章: 回答は追記。古いものも残す。 */}
      <Card>
        <CardHeader
          title="コーチの回答"
          description={responses.length > 1 ? `${responses.length}件` : undefined}
        />
        {responses.length === 0 ? (
          <EmptyState>まだ回答はありません。</EmptyState>
        ) : (
          <ul className="space-y-4">
            {responses.map((response) => (
              <li key={response.id} className="border-b border-[--color-border] pb-4 last:border-0 last:pb-0">
                <p className="text-xs text-[--color-muted]">
                  {responderNames.get(response.responder_id) ?? 'コーチ'} /{' '}
                  {formatDateTimeInTokyo(response.created_at)}
                </p>

                <p className="mt-2 text-sm font-medium whitespace-pre-line">{response.conclusion}</p>

                <ResponseSection label="良かった点" value={response.positive_points} />
                <ResponseSection label="改善点" value={response.improvement_points} />
                <ResponseSection label="推奨プレー" value={response.recommended_action} />
                <ResponseSection label="技術的な修正" value={response.technical_correction} />

                {response.next_task ? (
                  <div className="bg-action-500/10 mt-3 rounded-lg px-3 py-2">
                    <p className="text-action-700 dark:text-action-400 text-xs font-medium">次回の課題</p>
                    <p className="mt-1 text-sm">{response.next_task}</p>
                    {actor === 'requester' ? (
                      <Link
                        href="/goal"
                        className="text-action-700 dark:text-action-400 mt-2 inline-block text-xs underline"
                      >
                        次の練習の目標にする
                      </Link>
                    ) : null}
                  </div>
                ) : null}

                {/* 32章: 回答がスキルに紐づいていたら、そのまま申請へ進めるようにする。
                    ここが「フィードバック → スキル承認」のつなぎ目。 */}
                {response.related_skill_id && actor === 'requester' ? (
                  <div className="mt-3 rounded-lg border border-[--color-border] px-3 py-2">
                    <p className="text-xs text-[--color-muted]">この回答はスキルに結び付いています</p>
                    <Link
                      href={`/skills/apply/${response.related_skill_id}`}
                      className="text-keio-700 dark:text-keio-300 mt-1 inline-block text-sm underline"
                    >
                      この回答を根拠にスキルを申請する
                    </Link>
                  </div>
                ) : null}

                {response.requires_in_person_review ? (
                  <p className="mt-2 text-xs text-[--color-muted]">※ 対面でも確認したい、とのことです</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* 29章: 共有の承認は質問した本人だけ */}
      {shareRequest && actor === 'requester' ? (
        <ShareDecision shareRequestId={shareRequest.id} reason={shareRequest.reason} />
      ) : null}

      {shareRequest && actor === 'coach' ? (
        <Card>
          <p className="text-sm text-[--color-muted]">
            チームへの共有を提案しました。選手が承認すると公開されます。
          </p>
        </Card>
      ) : null}

      {/* やり取り */}
      {messages.length > 0 ? (
        <Card>
          <CardHeader title="やり取り" />
          <ul className="space-y-3">
            {messages.map((message) => (
              <li key={message.id} className="border-b border-[--color-border] pb-3 last:border-0 last:pb-0">
                <p className="text-xs text-[--color-muted]">
                  {responderNames.get(message.sender_id) ??
                    (message.sender_id === request.requester_id ? requesterName : '')}
                  {message.message_type === 'follow_up_question' ? '（再質問）' : ''} /{' '}
                  {formatDateTimeInTokyo(message.created_at)}
                </p>
                <p className="mt-1 text-sm whitespace-pre-line">{message.body}</p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* いまできる操作 */}
      {actions.length > 0 ? (
        <Card>
          <CardHeader title="次にできること" />
          <FeedbackActions requestId={request.id} actions={actions} />
        </Card>
      ) : null}

      {/* コーチの回答フォーム */}
      {canAnswerNow ? (
        <AnswerForm requestId={request.id} skills={skills} isFollowUp={request.status === 'follow_up'} />
      ) : null}

      {/* 再質問・コメント */}
      {actor !== 'observer' && responses.length > 0 ? (
        <Card>
          <CardHeader title={canFollowUp ? 'まだ分からないことがあれば' : 'コメント'} />
          <MessageForm requestId={request.id} canFollowUp={canFollowUp} />
        </Card>
      ) : null}
    </div>
  );
}

function ResponseSection({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="mt-2">
      <p className="text-xs font-medium text-[--color-muted]">{label}</p>
      <p className="text-sm whitespace-pre-line">{value}</p>
    </div>
  );
}

/** 回答に紐づけられるスキル（32章）。小目標だけを出す。 */
async function listSkillOptions(teamId: string): Promise<SkillOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('skills')
    .select('id, name, skill_categories(name)')
    .eq('team_id', teamId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .limit(200);

  return (data ?? []).map((skill) => {
    const category = Array.isArray(skill.skill_categories)
      ? skill.skill_categories[0]
      : skill.skill_categories;
    const categoryName =
      category && typeof category === 'object' && 'name' in category
        ? String((category as { name: unknown }).name)
        : '';
    return { id: skill.id, label: categoryName ? `${categoryName} / ${skill.name}` : skill.name };
  });
}
