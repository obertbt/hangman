import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { ActivityList } from '@/features/activities/components/activity-list';
import { ManualActivityForm } from '@/features/activities/components/manual-activity-form';
import { listMyActivities, listReachableUsers } from '@/features/activities/queries';
import { requireProfile } from '@/features/auth/queries';
import { listCategories } from '@/features/categories/queries';
import { listMyGroups } from '@/features/groups/queries';
import { getToday } from '@/lib/date/timezone';

export const metadata: Metadata = { title: '記録' };

export default async function ActivitiesPage() {
  const profile = await requireProfile();

  const [activities, categories, groups, reachableUsers] = await Promise.all([
    listMyActivities(),
    listCategories(),
    listMyGroups(),
    listReachableUsers(),
  ]);

  return (
    <>
      <PageHeader title="記録" description="タイマーを使わなかった活動もここから残せます。" />

      <div className="space-y-4">
        <Card>
          <ManualActivityForm
            categories={categories}
            userId={profile.id}
            today={getToday(profile.timezone)}
            defaultVisibility={profile.default_visibility}
            groups={groups.map(({ group }) => ({ id: group.id, name: group.name }))}
            reachableUsers={reachableUsers}
          />
        </Card>

        <ActivityList activities={activities} />
      </div>
    </>
  );
}
