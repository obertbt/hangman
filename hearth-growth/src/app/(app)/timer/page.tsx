import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHeader } from '@/components/layout/page-header';
import { Card, CardTitle } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { listCategories } from '@/features/categories/queries';
import { RunningTimer } from '@/features/timer/components/running-timer';
import { StartTimerForm } from '@/features/timer/components/start-timer-form';
import { getActiveSession, getLatestCompletedSession } from '@/features/timer/queries';
import { formatDuration } from '@/lib/date/duration';
import { cn } from '@/lib/utils/cn';

export const metadata: Metadata = { title: 'タイマー' };

// タイマーの状態は常に最新を見せる
export const dynamic = 'force-dynamic';

export default async function TimerPage() {
  const active = await getActiveSession();

  if (active) {
    return (
      <>
        <PageHeader title="活動中" />
        <Card>
          <RunningTimer session={active.session} category={active.category} serverNow={active.serverNow} />
        </Card>
      </>
    );
  }

  const [categories, lastCompleted] = await Promise.all([listCategories(), getLatestCompletedSession()]);

  return (
    <>
      <PageHeader title="活動を始める" description="カテゴリーを選ぶだけで始められます。" />

      <div className="space-y-4">
        {lastCompleted && !lastCompleted.hasPost ? (
          <Card className="border-ember-400">
            <CardTitle>終わったばかりの活動</CardTitle>
            <p className="mt-2 text-sm">
              {lastCompleted.category ? `${lastCompleted.category.icon} ${lastCompleted.category.name} ` : ''}
              {formatDuration(lastCompleted.session.duration_seconds ?? 0)}
            </p>
            <p className="mt-1 text-xs text-[--color-muted]">まだ記録として残していません。</p>
            <Link href="/timer/finish" className={cn(buttonVariants({ size: 'sm' }), 'mt-3')}>
              記録として残す
            </Link>
          </Card>
        ) : null}

        <Card>
          <StartTimerForm categories={categories} />
        </Card>

        <Card>
          <CardTitle>カテゴリーを増やす</CardTitle>
          <p className="mt-2 text-sm text-[--color-muted]">
            <Link href="/settings" className="underline underline-offset-4">
              設定
            </Link>
            から、自分だけのカテゴリーを追加できます。
          </p>
        </Card>
      </div>
    </>
  );
}
