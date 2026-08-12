'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/field';
import { markAllNotificationsRead, markNotificationRead } from '@/features/ops/actions';

/**
 * 通知の一覧（57章）。
 *
 * 開いたら全部既読、にはしない。
 * 「まだ見ていないもの」が消えると、後で探せなくなる。
 * 押した通知だけを既読にし、まとめて既読にする手段は別に置く。
 */

export interface NotificationView {
  targetId: string;
  title: string;
  body: string | null;
  linkPath: string | null;
  createdAt: string;
  readAt: string | null;
}

export function NotificationList({ items }: { items: NotificationView[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // サーバーから返ってくるまでの間、押したものを既読として見せる
  const [optimisticRead, setOptimisticRead] = useState<Set<string>>(new Set());

  const unread = items.filter((item) => item.readAt === null && !optimisticRead.has(item.targetId));

  function handleRead(targetId: string) {
    setOptimisticRead((current) => new Set(current).add(targetId));
    startTransition(async () => {
      const result = await markNotificationRead(targetId);
      if (result.error) setError(result.error);
    });
  }

  function handleReadAll() {
    setOptimisticRead(new Set(items.map((item) => item.targetId)));
    startTransition(async () => {
      const result = await markAllNotificationsRead();
      if (result.error) setError(result.error);
    });
  }

  if (items.length === 0) {
    return <EmptyState>通知はまだありません。</EmptyState>;
  }

  return (
    <div className="space-y-3">
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}

      {unread.length > 0 ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm">未読 {unread.length} 件</p>
          <Button variant="outline" size="sm" onClick={handleReadAll} disabled={pending}>
            すべて既読にする
          </Button>
        </div>
      ) : null}

      <ul className="divide-y divide-[--color-border]">
        {items.map((item) => {
          const read = item.readAt !== null || optimisticRead.has(item.targetId);

          const content = (
            <>
              <p className="flex flex-wrap items-center gap-2 text-sm">
                {read ? null : <Badge tone="warning">未読</Badge>}
                <span className={read ? '' : 'font-medium'}>{item.title}</span>
              </p>
              {item.body ? <p className="mt-1 text-sm text-[--color-muted]">{item.body}</p> : null}
              <p className="mt-1 text-xs text-[--color-muted]">{item.createdAt}</p>
            </>
          );

          return (
            <li key={item.targetId} className="py-3">
              {item.linkPath ? (
                <Link
                  href={item.linkPath}
                  className="block"
                  onClick={() => !read && handleRead(item.targetId)}
                >
                  {content}
                </Link>
              ) : (
                <div>{content}</div>
              )}

              {!read ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1 px-0"
                  onClick={() => handleRead(item.targetId)}
                  disabled={pending}
                >
                  既読にする
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
