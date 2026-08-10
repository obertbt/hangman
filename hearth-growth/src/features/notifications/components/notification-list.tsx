import Link from 'next/link';

import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { notificationHref, notificationText } from '@/features/notifications/messages';
import type { NotificationItem } from '@/features/notifications/queries';
import { formatRelativeTime } from '@/lib/date/relative';
import { cn } from '@/lib/utils/cn';

/**
 * お知らせの一覧。
 *
 * 未読は左の細い線だけで示す。赤い点や大きな数字は使わない。
 * 「早く見なければ」と急かすためのものではないため。
 */
export function NotificationList({ items, timeZone }: { items: NotificationItem[]; timeZone: string }) {
  if (items.length === 0) {
    return (
      <Card className="text-center">
        <p className="text-sm font-medium">お知らせはまだありません。</p>
        <p className="mt-1 text-sm text-[--color-muted]">
          あなたの記録に応援やコメントが届くと、ここに出ます。
        </p>
      </Card>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const href = notificationHref(item);
        const body = (
          <>
            <Avatar src={item.actorAvatarUrl} name={item.actorName ?? 'メンバー'} size={36} />
            <div className="min-w-0 flex-1">
              <p className="text-sm">{notificationText(item)}</p>
              {item.postTitle ? (
                <p className="truncate text-xs text-[--color-muted]">{item.postTitle}</p>
              ) : null}
              <p className="mt-0.5 text-xs text-[--color-muted]">
                {formatRelativeTime(item.createdAt, { timeZone })}
                {item.isUnread ? <span className="sr-only">（未読）</span> : null}
              </p>
            </div>
          </>
        );

        const className = cn(
          'flex items-center gap-3 rounded-2xl border border-[--color-border] bg-[--color-surface] p-3',
          // 未読は左端の線で示す
          item.isUnread && 'border-l-ember-600 border-l-4',
        );

        return (
          <li key={item.id}>
            {href ? (
              <Link href={href} className={cn(className, 'hover:bg-hearth-100/40 transition-colors')}>
                {body}
              </Link>
            ) : (
              <div className={className}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
