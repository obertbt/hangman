import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHeader } from '@/components/layout/page-header';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { PhasePlaceholder } from '@/components/ui/phase-placeholder';
import { listMyActivities } from '@/features/activities/queries';
import { requireProfile } from '@/features/auth/queries';
import { ActiveMembers } from '@/features/timeline/components/active-members';
import { AutoRefresh } from '@/features/timeline/components/auto-refresh';
import { TimelineFeed } from '@/features/timeline/components/timeline-feed';
import { getActiveMembers, getTimeline } from '@/features/timeline/queries';
import { getActiveSession } from '@/features/timer/queries';
import { formatDuration } from '@/lib/date/duration';
import { calculateStreak, formatDateLabel, getToday } from '@/lib/date/timezone';
import { cn } from '@/lib/utils/cn';

export const metadata: Metadata = { title: 'ホーム' };

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const profile = await requireProfile();
  // 「今日」はユーザーのタイムゾーンで決める（15.1）
  const today = getToday(profile.timezone);

  const [activeSession, active, timeline, myActivities] = await Promise.all([
    getActiveSession(),
    getActiveMembers(),
    getTimeline(),
    // 連続記録の判定に使うぶんだけ取る
    listMyActivities({ limit: 120 }),
  ]);

  const todaySeconds = myActivities
    .filter((activity) => activity.activityDate === today)
    .reduce((sum, activity) => sum + activity.durationSeconds, 0);
  const todayCount = myActivities.filter((activity) => activity.activityDate === today).length;
  const streak = calculateStreak(
    myActivities.map((activity) => activity.activityDate),
    today,
  );

  return (
    <>
      <AutoRefresh />

      <PageHeader
        title={formatDateLabel(today)}
        description={`${profile.display_name}さん、今日も少しずつ。`}
        settingsLink
      />

      <section aria-label="今日の自分" className="grid grid-cols-2 gap-3">
        <Card>
          <CardTitle>今日の活動時間</CardTitle>
          <p className="mt-1 text-2xl font-bold">{formatDuration(todaySeconds)}</p>
          <p className="mt-1 text-xs text-[--color-muted]">{todayCount}件の記録</p>
        </Card>
        <Card>
          <CardTitle>連続記録</CardTitle>
          <p className="mt-1 text-2xl font-bold">
            {streak}
            <span className="ml-1 text-sm font-normal text-[--color-muted]">日</span>
          </p>
          <p className="mt-1 text-xs text-[--color-muted]">
            {streak === 0 ? '今日から始められます' : '続いています'}
          </p>
        </Card>
      </section>

      {/* クイックアクション（7.2）。活動を始める導線を最優先に置く。 */}
      <div className="mt-3 flex gap-2">
        <Link href="/timer" className={cn(buttonVariants({ size: 'lg' }), 'flex-1')}>
          {activeSession ? '活動中のタイマーを見る' : '活動を始める'}
        </Link>
        <Link href="/activities" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}>
          手動で記録
        </Link>
      </div>

      <div className="mt-4 space-y-4">
        <Card>
          <CardTitle>今、頑張っている人</CardTitle>
          <div className="mt-3">
            <ActiveMembers members={active.members} serverNow={active.serverNow} />
          </div>
        </Card>

        <PhasePlaceholder
          phase={7}
          title="今週のまとめ"
          items={['今週の活動時間', 'カテゴリー別の内訳', '週間目標に対する進捗']}
        />

        <section aria-label="タイムライン">
          <h2 className="pb-2 text-sm font-medium text-[--color-muted]">みんなの記録</h2>
          <TimelineFeed initialPage={timeline} timeZone={profile.timezone} />
        </section>
      </div>
    </>
  );
}
