import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHeader } from '@/components/layout/page-header';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { requireProfile } from '@/features/auth/queries';
import { WeekSummary } from '@/features/analytics/components/week-summary';
import { getDashboardSummary } from '@/features/analytics/queries';
import { DailyGoalCard } from '@/features/goals/components/goal-forms';
import { getGoals } from '@/features/goals/queries';
import { ActiveMembers } from '@/features/timeline/components/active-members';
import { AutoRefresh } from '@/features/timeline/components/auto-refresh';
import { TimelineFeed } from '@/features/timeline/components/timeline-feed';
import { getActiveMembers, getTimeline } from '@/features/timeline/queries';
import { getActiveSession } from '@/features/timer/queries';
import { formatDuration } from '@/lib/date/duration';
import { formatDateLabel, getToday } from '@/lib/date/timezone';
import { cn } from '@/lib/utils/cn';

export const metadata: Metadata = { title: 'ホーム' };

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const profile = await requireProfile();
  // 「今日」はユーザーのタイムゾーンで決める（15.1）
  const today = getToday(profile.timezone);

  // 合計と連続記録は SQL 側で出す（15章）
  const summary = await getDashboardSummary(profile.timezone);

  const [activeSession, active, timeline, goals] = await Promise.all([
    getActiveSession(),
    getActiveMembers(),
    getTimeline(),
    getGoals(summary.todayDate, summary.weekStart),
  ]);

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
          <p className="mt-1 text-2xl font-bold">{formatDuration(summary.today.totalSeconds)}</p>
          <p className="mt-1 text-xs text-[--color-muted]">{summary.today.postCount}件の記録</p>
        </Card>
        <Card>
          <CardTitle>連続記録</CardTitle>
          <p className="mt-1 text-2xl font-bold">
            {summary.streak}
            <span className="ml-1 text-sm font-normal text-[--color-muted]">日</span>
          </p>
          <p className="mt-1 text-xs text-[--color-muted]">
            {summary.streak === 0 ? '今日から始められます' : '続いています'}
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
          <CardTitle>今日の目標</CardTitle>
          <div className="mt-3">
            <DailyGoalCard
              goalDate={summary.todayDate}
              targetSeconds={goals.daily?.target_seconds ?? null}
              message={goals.daily?.message ?? null}
              achievedSeconds={summary.today.totalSeconds}
            />
          </div>
        </Card>

        <Card>
          <CardTitle>今、頑張っている人</CardTitle>
          <div className="mt-3">
            <ActiveMembers members={active.members} serverNow={active.serverNow} />
          </div>
        </Card>

        <Card>
          <CardTitle>今週のまとめ</CardTitle>
          <div className="mt-3">
            <WeekSummary
              week={summary.week}
              weekDays={summary.weekDays}
              categories={summary.categories}
              todayDate={summary.todayDate}
              targetSeconds={goals.weekly?.target_seconds ?? null}
              message={goals.weekly?.message ?? null}
            />
          </div>
        </Card>

        <section aria-label="タイムライン">
          <h2 className="pb-2 text-sm font-medium text-[--color-muted]">みんなの記録</h2>
          <TimelineFeed initialPage={timeline} timeZone={profile.timezone} />
        </section>
      </div>
    </>
  );
}
