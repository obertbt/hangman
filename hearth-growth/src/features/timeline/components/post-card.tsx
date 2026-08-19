import Link from 'next/link';

import { Avatar } from '@/components/ui/avatar';
import { CommentThread } from '@/features/comments/components/comment-thread';
import { PhotoGrid } from '@/features/photos/components/photo-grid';
import { ReactionBar } from '@/features/reactions/components/reaction-bar';
import type { TimelineItem } from '@/features/timeline/queries';
import { formatDuration } from '@/lib/date/duration';
import { formatTimeRange } from '@/lib/date/time-of-day';
import { formatRelativeTime } from '@/lib/date/relative';
import { VISIBILITY_LABELS } from '@/lib/permissions/visibility';

/**
 * タイムラインの投稿カード（7.5）。
 *
 * リアクション数は数字を大きく見せない（10.1）。
 * 競争ではなく、応援が届いていることが分かればよい。
 */
export function PostCard({ item, timeZone }: { item: TimelineItem; timeZone: string }) {
  return (
    <article className="rounded-2xl border border-[--color-border] bg-[--color-surface] p-4">
      <header className="flex items-center gap-3">
        <Avatar src={item.avatarUrl} name={item.displayName} size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {item.displayName}
            {item.isMine ? <span className="ml-1 text-xs text-[--color-muted]">(自分)</span> : null}
          </p>
          <p className="text-xs text-[--color-muted]">
            {formatRelativeTime(item.createdAt, { timeZone })}
            {/* 公開範囲は、自分の投稿にだけ出す */}
            {item.isMine ? `・${VISIBILITY_LABELS[item.visibility]}` : null}
          </p>
        </div>
      </header>

      <div className="mt-3 flex items-center gap-2">
        {item.categoryName ? (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs"
            style={{
              backgroundColor: `${item.categoryColor ?? '#8B8B8B'}22`,
              color: item.categoryColor ?? undefined,
            }}
          >
            <span aria-hidden>{item.categoryIcon}</span>
            {item.categoryName}
          </span>
        ) : null}
        <span className="text-sm font-medium">{formatDuration(item.durationSeconds)}</span>
        {/* タイマーで計った記録は、何時から何時までかも出す（睡眠でとくに要る） */}
        {item.startedAt && item.endedAt ? (
          <span className="text-xs text-[--color-muted]">
            {formatTimeRange(item.startedAt, item.endedAt, timeZone)}
          </span>
        ) : null}
      </div>

      {item.title ? <p className="mt-2 text-sm font-medium">{item.title}</p> : null}
      {item.body ? <p className="mt-1 text-sm whitespace-pre-wrap">{item.body}</p> : null}

      <PhotoGrid photos={item.photos} />

      <footer className="mt-3 space-y-3 border-t border-[--color-border] pt-3">
        {/* 自分の投稿には応援を送らない */}
        {item.isMine ? (
          <p className="text-xs text-[--color-muted]">
            {item.reactionCount > 0 ? `${item.reactionCount}人が応援しています` : '\u00a0'}
          </p>
        ) : (
          <ReactionBar postId={item.id} myReaction={item.myReaction} totalCount={item.reactionCount} />
        )}

        <div className="flex items-end justify-between gap-4">
          <CommentThread postId={item.id} commentCount={item.commentCount} timeZone={timeZone} />
          {item.isMine ? (
            <Link
              href={`/activities/${item.id}`}
              className="shrink-0 text-xs text-[--color-muted] underline underline-offset-4"
            >
              編集
            </Link>
          ) : null}
        </div>
      </footer>
    </article>
  );
}
