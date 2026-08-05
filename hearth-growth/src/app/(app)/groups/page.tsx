import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { CreateGroupForm } from '@/features/groups/components/create-group-form';
import { listMyGroups } from '@/features/groups/queries';

export const metadata: Metadata = { title: 'グループ' };

const ROLE_LABELS = { owner: '作成者', admin: '管理者', member: 'メンバー' } as const;

export default async function GroupsPage() {
  const groups = await listMyGroups();

  return (
    <>
      <PageHeader title="グループ" description="親しい人だけの場所です。" />

      {groups.length === 0 ? (
        <Card className="space-y-4 text-center">
          <div>
            <p className="text-sm font-medium">まだグループがありません。</p>
            <p className="mt-1 text-sm text-[--color-muted]">
              グループを作って、招待リンクを親しい人に渡してください。
            </p>
          </div>
          <CreateGroupForm />
        </Card>
      ) : (
        <div className="space-y-3">
          <ul className="space-y-3">
            {groups.map(({ group, role, memberCount }) => (
              <li key={group.id}>
                <Link
                  href={`/groups/${group.id}`}
                  className="hover:bg-hearth-100/40 block rounded-2xl border border-[--color-border] bg-[--color-surface] p-4 transition-colors"
                >
                  <p className="font-medium">{group.name}</p>
                  {group.description ? (
                    <p className="mt-1 line-clamp-2 text-sm text-[--color-muted]">{group.description}</p>
                  ) : null}
                  <p className="mt-2 text-xs text-[--color-muted]">
                    {memberCount}人 / {ROLE_LABELS[role]}
                  </p>
                </Link>
              </li>
            ))}
          </ul>

          <Card>
            <CreateGroupForm />
          </Card>
        </div>
      )}
    </>
  );
}
