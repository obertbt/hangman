import type { Metadata } from 'next';
import Link from 'next/link';

import { MOBILE_EXTRA_LINKS } from '@/components/layout/nav-links';
import { PageHeader } from '@/components/layout/page-header';
import { Avatar } from '@/components/ui/avatar';
import { Card, CardTitle } from '@/components/ui/card';
import { ActivityList } from '@/features/activities/components/activity-list';
import { listMyActivities } from '@/features/activities/queries';
import { WeekSummary } from '@/features/analytics/components/week-summary';
import { getDashboardSummary } from '@/features/analytics/queries';
import { requireProfile } from '@/features/auth/queries';
import { WeeklyGoalForm } from '@/features/goals/components/goal-forms';
import { getGoals } from '@/features/goals/queries';
import { formatDuration } from '@/lib/date/duration';
import { VISIBILITY_LABELS } from '@/lib/permissions/visibility';

export const metadata: Metadata = { title: 'マイページ' };

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const profile = await requireProfile();
  const summary = await getDashboardSummary(profile.timezone);

  const [goals, activities] = await Promise.all([
    getGoals(summary.todayDate, summary.weekStart),
    listMyActivities({ limit: 20 }),
  ]);

  return (
    <>
      <PageHeader title="マイページ" settingsLink />

      <div className="space-y-4">
        <Card>
          <div className="flex items-start gap-4">
            <Avatar src={profile.avatar_url} name={profile.display_name} size={64} />
            <div className="min-w-0 flex-1">
              <p className="text-lg font-bold">{profile.display_name}</p>
              {profile.bio ? (
                <p className="mt-1 text-sm whitespace-pre-wrap text-[--color-muted]">{profile.bio}</p>
              ) : (
                <p className="mt-1 text-sm text-[--color-muted]">
                  自己紹介はまだありません。
                  <Link href="/settings" className="ml-1 underline underline-offset-4">
                    設定から書く
                  </Link>
                </p>
              )}
              <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[--color-muted]">
                <div className="flex gap-1">
                  <dt>タイムゾーン</dt>
                  <dd>{profile.timezone}</dd>
                </div>
                <div className="flex gap-1">
                  <dt>既定の公開範囲</dt>
                  <dd>{VISIBILITY_LABELS[profile.default_visibility]}</dd>
                </div>
              </dl>
            </div>
          </div>
        </Card>

        <section aria-label="今日と連続記録" className="grid grid-cols-2 gap-3">
          <Card>
            <CardTitle>今日</CardTitle>
            <p className="mt-1 text-xl font-bold">{formatDuration(summary.today.totalSeconds)}</p>
          </Card>
          <Card>
            <CardTitle>連続記録</CardTitle>
            <p className="mt-1 text-xl font-bold">
              {summary.streak}
              <span className="ml-1 text-sm font-normal text-[--color-muted]">日</span>
            </p>
          </Card>
        </section>

        <Card>
          <CardTitle>今週</CardTitle>
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

        {/*
         * 下部ナビに載らない行き先。
         * 横のナビは幅が広いときしか出ないため、ここが無いと
         * スマートフォンの縦画面からグループへ辿り着けない。
         */}
        <Card>
          <CardTitle>そのほか</CardTitle>
          <ul className="mt-2 divide-y divide-[--color-border]">
            {MOBILE_EXTRA_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="hover:bg-hearth-100/40 -mx-2 flex min-h-12 items-center justify-between gap-3 rounded-xl px-2 transition-colors"
                >
                  <span>
                    <span className="block text-sm font-medium">{link.label}</span>
                    <span className="block text-xs text-[--color-muted]">{link.description}</span>
                  </span>
                  <span aria-hidden className="text-[--color-muted]">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardTitle>今週の目標</CardTitle>
          <div className="mt-3">
            <WeeklyGoalForm
              weekStartDate={summary.weekStart}
              targetSeconds={goals.weekly?.target_seconds ?? null}
              message={goals.weekly?.message ?? null}
            />
          </div>
        </Card>

        <section aria-label="過去の記録">
          <h2 className="pb-2 text-sm font-medium text-[--color-muted]">過去の記録</h2>
          <ActivityList activities={activities} />
        </section>
      </div>
    </>
  );
}
