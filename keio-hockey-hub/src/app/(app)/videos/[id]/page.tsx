import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, EmptyState } from '@/components/ui/card';
import { AskForm } from '@/features/video/components/ask-form';
import { VideoWatch } from '@/features/video/components/video-watch';
import { listClips, listCoaches, listQuestionsForVideo, getVideo } from '@/features/video/queries';
import { can, requireSession } from '@/lib/auth/session';
import { formatDateTimeInTokyo } from '@/lib/datetime';
import { FEEDBACK_STATUS_LABELS, QUESTION_TEMPLATES } from '@/lib/labels';
import { formatSecondsToTimecode } from '@/lib/storage/validation';
import type { FeedbackStatus } from '@/types/database.types';

export const metadata: Metadata = { title: '動画' };

export default async function VideoDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ clip?: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  const { clip: clipParam } = await searchParams;

  const video = await getVideo(session, id);
  if (!video) notFound();

  const [clips, coaches, questions] = await Promise.all([
    listClips(session, id),
    listCoaches(session),
    listQuestionsForVideo(session, id),
  ]);

  const clipById = new Map(clips.map((clip) => [clip.id, clip]));

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <Link href="/videos" className="text-keio-700 dark:text-keio-300 underline">
          ← 動画一覧へ戻る
        </Link>
      </p>

      <header>
        <h1 className="text-xl font-bold">{video.title}</h1>
        <p className="mt-1 text-sm text-[--color-muted]">
          {video.recorded_at ? formatDateTimeInTokyo(video.recorded_at).split(' ')[0] : '撮影日未設定'}
          {video.duration_seconds ? ` / ${formatSecondsToTimecode(video.duration_seconds)}` : ''}
        </p>
        {video.description ? <p className="mt-2 text-sm whitespace-pre-line">{video.description}</p> : null}
      </header>

      {video.provider === 'youtube' && video.provider_video_id ? (
        <VideoWatch
          providerVideoId={video.provider_video_id}
          clips={clips}
          selectedClipId={clipParam ?? null}
        />
      ) : (
        <Card>
          <EmptyState>この動画は再生できません（保存先が YouTube ではありません）。</EmptyState>
        </Card>
      )}

      <AskForm
        videoId={video.id}
        clips={clips}
        coaches={coaches}
        canAsk={can(session, 'video.feedback_request')}
      />

      <Card>
        <CardHeader
          title="この動画への質問"
          description="自分が出した質問と、見てよい質問だけが表示されます"
        />
        {questions.length === 0 ? (
          <EmptyState>まだ質問はありません。</EmptyState>
        ) : (
          <ul className="divide-y divide-[--color-border]">
            {questions.map((question) => {
              const clip = question.video_clip_id ? clipById.get(question.video_clip_id) : null;
              const template = QUESTION_TEMPLATES.find((item) => item.value === question.question_type);

              return (
                <li key={question.id} className="py-3">
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge tone={statusTone(question.status)}>
                      {FEEDBACK_STATUS_LABELS[question.status]}
                    </Badge>
                    {clip ? (
                      <Link
                        href={`/videos/${video.id}?clip=${clip.id}`}
                        className="text-keio-700 dark:text-keio-300 font-mono text-xs underline"
                      >
                        {formatSecondsToTimecode(clip.start_seconds)}〜
                        {formatSecondsToTimecode(clip.end_seconds)}
                      </Link>
                    ) : (
                      <span className="text-xs text-[--color-muted]">動画全体</span>
                    )}
                    {template ? <span className="text-xs text-[--color-muted]">{template.label}</span> : null}
                  </p>
                  <p className="mt-1 text-sm">{question.question}</p>
                  <p className="mt-1 text-xs text-[--color-muted]">
                    {question.submitted_at ? formatDateTimeInTokyo(question.submitted_at) : ''}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <p className="text-xs text-[--color-muted]">
        コーチからの回答は Phase 6 で表示できるようになります。
        いま投稿した質問は保存され、回答待ちとして扱われます。
      </p>
    </div>
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
