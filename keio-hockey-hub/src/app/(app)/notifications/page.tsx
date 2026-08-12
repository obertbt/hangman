import type { Metadata } from 'next';

import { Card, CardHeader } from '@/components/ui/card';
import { NotificationList } from '@/features/ops/components/notification-list';
import { listNotifications } from '@/features/ops/queries';
import { requireSession } from '@/lib/auth/session';
import { formatDateTimeInTokyo } from '@/lib/datetime';

export const metadata: Metadata = { title: 'お知らせ' };

/**
 * 自分宛の通知（57章）。
 *
 * Phase 6 から通知は記録されていたが、まとめて見る場所が無かった。
 * 未読を先に出し、押したものだけを既読にする。
 */
export default async function NotificationsPage() {
  const session = await requireSession();
  const items = await listNotifications(session);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold">お知らせ</h1>
        <p className="mt-1 text-sm text-[--color-muted]">
          回答や審査の結果など、自分に関わる知らせが届きます。
        </p>
      </header>

      <Card>
        <CardHeader title="届いているもの" description={`${items.length}件`} />
        <NotificationList
          items={items.map((item) => ({
            targetId: item.targetId,
            title: item.notification.title,
            body: item.notification.body,
            linkPath: item.notification.link_path,
            createdAt: formatDateTimeInTokyo(item.notification.created_at),
            readAt: item.readAt,
          }))}
        />
      </Card>
    </div>
  );
}
