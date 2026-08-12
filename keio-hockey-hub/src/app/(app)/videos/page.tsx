import type { Metadata } from 'next';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, EmptyState } from '@/components/ui/card';
import { listEventsInRange } from '@/features/timeline/queries';
import { VideoForm } from '@/features/video/components/video-form';
import { listVideos } from '@/features/video/queries';
import { can, requireSession } from '@/lib/auth/session';
import { addDaysToDateOnly, formatDateTimeInTokyo, todayInTokyo } from '@/lib/datetime';
import { formatSecondsToTimecode } from '@/lib/storage/validation';

export const metadata: Metadata = { title: '動画' };

export default async function VideosPage() {
  const session = await requireSession();
  const canUpload = can(session, 'video.upload');

  const today = todayInTokyo();
  const [videos, events] = await Promise.all([
    listVideos(session),
    // 直近の予定に結び付けられるようにする
    canUpload
      ? listEventsInRange(session.teamId, addDaysToDateOnly(today, -60), addDaysToDateOnly(today, 7))
      : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold">動画</h1>
        <p className="mt-1 text-sm text-[--color-muted]">
          練習や試合の動画から、見てもらいたい場面を指定して質問できます。
        </p>
      </header>

      {canUpload ? (
        <Card>
          <CardHeader
            title="スマートフォンから短い動画を投稿する"
            description="自主練や切り抜いた動画は、YouTube を経由せずそのまま投稿できます。"
            action={
              <Link href="/videos/upload" className="text-keio-700 dark:text-keio-300 text-sm underline">
                投稿する
              </Link>
            }
          />
        </Card>
      ) : null}

      {canUpload ? <VideoForm events={events} /> : null}

      <Card>
        <CardHeader title="登録されている動画" description={`${videos.length}件`} />
        {videos.length === 0 ? (
          <EmptyState>
            まだ動画がありません。
            {canUpload ? '上のフォームから登録してください。' : ''}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-[--color-border]">
            {videos.map((video) => (
              <li key={video.id} className="py-3">
                <Link href={`/videos/${video.id}`} className="flex items-start gap-3">
                  {video.thumbnail_url ? (
                    // YouTube のサムネイル。next/image を通さない（外部ホストを許可しないため）。
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={video.thumbnail_url}
                      alt=""
                      className="h-14 w-24 shrink-0 rounded object-cover"
                      loading="lazy"
                    />
                  ) : null}

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{video.title}</p>
                    <p className="mt-1 text-xs text-[--color-muted]">
                      {video.recorded_at
                        ? formatDateTimeInTokyo(video.recorded_at).split(' ')[0]
                        : '撮影日未設定'}
                      {video.duration_seconds ? ` / ${formatSecondsToTimecode(video.duration_seconds)}` : ''}
                    </p>
                    {video.visibility !== 'team' ? (
                      <Badge tone="warning" className="mt-1">
                        コーチとスタッフのみ
                      </Badge>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="text-xs text-[--color-muted]">
        長時間の動画は YouTube に限定公開で置いてください。
        このシステムは動画そのものを預かりません。見てもらいたい場面は、
        切り出さずに「開始と終了の位置」だけを覚えます。
      </p>
    </div>
  );
}
