'use client';

import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/field';
import { loadMoreTimelineAction } from '@/features/timeline/actions';
import { PostCard } from '@/features/timeline/components/post-card';
import type { TimelinePage } from '@/features/timeline/queries';

interface TimelineFeedProps {
  initialPage: TimelinePage;
  timeZone: string;
  emptyMessage?: string;
}

/**
 * タイムライン本体（7.5, 21章）。
 *
 * 最初の20件はサーバー側で描画し、続きだけを取りに行く。
 * 無限スクロールではなく「さらに読み込む」にしているのは、
 * 読み込みが止まらない画面より、自分で区切れる方が静かなため（16.1）。
 */
export function TimelineFeed({ initialPage, timeZone, emptyMessage }: TimelineFeedProps) {
  const [items, setItems] = useState(initialPage.items);
  const [cursor, setCursor] = useState(initialPage.nextCursor);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadMore = () => {
    if (!cursor) return;
    setError(null);
    startTransition(async () => {
      try {
        const next = await loadMoreTimelineAction(cursor);
        setItems((current) => [...current, ...next.items]);
        setCursor(next.nextCursor);
      } catch {
        setError('続きを読み込めませんでした。もう一度お試しください。');
      }
    });
  };

  if (items.length === 0) {
    return (
      <Card className="text-center">
        <p className="text-sm font-medium">まだ投稿がありません。</p>
        <p className="mt-1 text-sm text-[--color-muted]">
          {emptyMessage ?? '活動を記録すると、ここに並びます。'}
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {error ? <FormMessage>{error}</FormMessage> : null}

      {items.map((item) => (
        <PostCard key={item.id} item={item} timeZone={timeZone} />
      ))}

      {cursor ? (
        <Button variant="outline" block disabled={isPending} onClick={loadMore}>
          {isPending ? '読み込んでいます…' : 'さらに読み込む'}
        </Button>
      ) : (
        <p className="py-2 text-center text-xs text-[--color-muted]">ここまでです。</p>
      )}
    </div>
  );
}
