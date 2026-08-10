import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { requireProfile } from '@/features/auth/queries';
import { MarkAllReadButton } from '@/features/notifications/components/mark-all-read-button';
import { NotificationList } from '@/features/notifications/components/notification-list';
import { countUnreadNotifications, listNotifications } from '@/features/notifications/queries';

export const metadata: Metadata = { title: 'お知らせ' };
export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const [profile, items, unreadCount] = await Promise.all([
    requireProfile(),
    listNotifications(),
    countUnreadNotifications(),
  ]);

  return (
    <>
      <PageHeader
        title="お知らせ"
        description="あなたに向けられたものだけが届きます。"
        action={<MarkAllReadButton unreadCount={unreadCount} />}
      />
      <NotificationList items={items} timeZone={profile.timezone} />
    </>
  );
}
