import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { FinishSessionForm } from '@/features/activities/components/finish-session-form';
import { listReachableUsers } from '@/features/activities/queries';
import { requireProfile } from '@/features/auth/queries';
import { listMyGroups } from '@/features/groups/queries';
import { getLatestCompletedSession } from '@/features/timer/queries';

export const metadata: Metadata = { title: '活動を記録する' };
export const dynamic = 'force-dynamic';

/**
 * 活動終了画面（7.4）。
 * 直近で終了し、まだ記録になっていないセッションを対象にする。
 */
export default async function FinishSessionPage() {
  const [profile, lastCompleted] = await Promise.all([requireProfile(), getLatestCompletedSession()]);

  // 記録するものが無ければタイマー画面へ戻す
  if (!lastCompleted || lastCompleted.hasPost) {
    redirect('/timer');
  }

  const [groups, reachableUsers] = await Promise.all([listMyGroups(), listReachableUsers()]);

  return (
    <>
      <PageHeader title="活動を記録する" />
      <Card>
        <FinishSessionForm
          sessionId={lastCompleted.session.id}
          userId={profile.id}
          durationSeconds={lastCompleted.session.duration_seconds ?? 0}
          category={lastCompleted.category}
          defaultTitle={lastCompleted.session.title}
          defaultVisibility={profile.default_visibility}
          groups={groups.map(({ group }) => ({ id: group.id, name: group.name }))}
          reachableUsers={reachableUsers}
        />
      </Card>
    </>
  );
}
