import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { EditActivityForm } from '@/features/activities/components/edit-activity-form';
import { getActivityDetail, listReachableUsers } from '@/features/activities/queries';
import { requireProfile } from '@/features/auth/queries';
import { listMyGroups } from '@/features/groups/queries';
import { PhotoEditor } from '@/features/photos/components/photo-editor';
import { getPhotosForPost } from '@/features/photos/queries';
import { getToday } from '@/lib/date/timezone';

export const metadata: Metadata = { title: '記録を編集する' };

export default async function EditActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [profile, activity] = await Promise.all([requireProfile(), getActivityDetail(id)]);

  // 他人の記録も、削除済みの記録もここには来ない
  if (!activity) {
    notFound();
  }

  const [groups, reachableUsers, photos] = await Promise.all([
    listMyGroups(),
    listReachableUsers(),
    getPhotosForPost(activity.id),
  ]);

  return (
    <>
      <PageHeader title="記録を編集する" description={activity.category?.name ?? undefined} />
      <div className="space-y-4">
        <Card>
          <EditActivityForm
            activity={activity}
            today={getToday(profile.timezone)}
            groups={groups.map(({ group }) => ({ id: group.id, name: group.name }))}
            reachableUsers={reachableUsers}
          />
        </Card>

        <Card>
          <h2 className="pb-3 text-sm font-medium">写真</h2>
          <PhotoEditor postId={activity.id} userId={profile.id} photos={photos} />
        </Card>
      </div>
    </>
  );
}
