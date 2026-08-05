import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { requireProfile } from '@/features/auth/queries';
import { TimelineFeed } from '@/features/timeline/components/timeline-feed';
import { getTimeline } from '@/features/timeline/queries';

export const metadata: Metadata = { title: 'タイムライン' };

// 投稿は常に最新を見せる
export const dynamic = 'force-dynamic';

export default async function TimelinePage() {
  const profile = await requireProfile();
  const page = await getTimeline();

  return (
    <>
      <PageHeader title="タイムライン" description="仲間の積み重ねが並びます。" />
      <TimelineFeed
        initialPage={page}
        timeZone={profile.timezone}
        emptyMessage="グループに参加して活動を記録すると、ここに並びます。"
      />
    </>
  );
}
