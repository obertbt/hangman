import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PageHeader } from '@/components/layout/page-header';
import { Card, CardTitle } from '@/components/ui/card';
import { getCurrentProfile } from '@/features/auth/queries';
import {
  DeleteGroupButton,
  GroupEditForm,
  LeaveGroupButton,
} from '@/features/groups/components/group-settings';
import { InvitationPanel } from '@/features/groups/components/invitation-panel';
import { MemberList } from '@/features/groups/components/member-list';
import { GroupWeekStatus } from '@/features/analytics/components/group-week-status';
import { getGroupWeekSummary } from '@/features/analytics/queries';
import { getGroupDetail, isGroupAdmin } from '@/features/groups/queries';
import { env } from '@/lib/env';

export const metadata: Metadata = { title: 'グループ' };

export default async function GroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [detail, profile] = await Promise.all([getGroupDetail(id), getCurrentProfile()]);

  // 参加していないグループは RLS が行を返さない。存在の有無も伝えない。
  if (!detail || !profile) {
    notFound();
  }

  const { group, myRole, members, invitations } = detail;
  const canManage = isGroupAdmin(myRole);
  const week = await getGroupWeekSummary(group.id, profile.timezone);

  return (
    <>
      <PageHeader title={group.name} description={group.description ?? undefined} />

      <div className="space-y-4">
        <Card>
          <CardTitle>メンバー（{members.length}人）</CardTitle>
          <div className="mt-3">
            <MemberList groupId={group.id} members={members} myUserId={profile.id} canManage={canManage} />
          </div>
        </Card>

        {canManage ? (
          <Card>
            <CardTitle>招待リンク</CardTitle>
            <div className="mt-3">
              <InvitationPanel
                groupId={group.id}
                invitations={invitations}
                siteUrl={env.NEXT_PUBLIC_SITE_URL}
              />
            </div>
          </Card>
        ) : null}

        <Card>
          <CardTitle>グループの今週</CardTitle>
          <div className="mt-3">
            <GroupWeekStatus members={week.members} weekStart={week.weekStart} myUserId={profile.id} />
          </div>
        </Card>

        {canManage ? (
          <Card>
            <CardTitle>グループの設定</CardTitle>
            <div className="mt-3">
              <GroupEditForm group={group} />
            </div>
          </Card>
        ) : null}

        {myRole === 'owner' ? (
          <Card>
            <CardTitle>グループの削除</CardTitle>
            <div className="mt-3">
              <DeleteGroupButton groupId={group.id} groupName={group.name} memberCount={members.length} />
            </div>
          </Card>
        ) : null}

        {myRole === 'owner' ? null : (
          <Card>
            <CardTitle>退会</CardTitle>
            <div className="mt-3">
              <LeaveGroupButton groupId={group.id} groupName={group.name} />
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
