import type { Metadata } from 'next';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Card, EmptyState } from '@/components/ui/card';
import { listMembers } from '@/features/members/queries';
import { can, requireSession } from '@/lib/auth/session';
import { ROLE_LABELS } from '@/lib/auth/permissions';
import { MEMBER_STATUS_LABELS, POSITION_LABELS } from '@/lib/labels';

export const metadata: Metadata = { title: '名簿' };

export default async function MembersPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const session = await requireSession();
  const { all } = await searchParams;
  const includeInactive = all === '1';

  const members = await listMembers(session.teamId, includeInactive);
  const canImport = can(session, 'import.execute');
  const isAdmin = session.role === 'system_admin';

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">名簿</h1>
          <p className="mt-1 text-sm text-[--color-muted]">{members.length} 名</p>
        </div>
        {canImport ? (
          <Link href="/admin/import" className="text-keio-700 dark:text-keio-300 text-sm underline">
            データ移行
          </Link>
        ) : null}
      </header>

      <p className="text-sm">
        <Link
          href={includeInactive ? '/members' : '/members?all=1'}
          className="text-keio-700 dark:text-keio-300 underline"
        >
          {includeInactive ? '在籍中だけを表示' : '卒業・退部も含めて表示'}
        </Link>
      </p>

      <Card>
        {members.length === 0 ? (
          <EmptyState>
            まだ選手が登録されていません。
            {canImport ? (
              <Link href="/admin/import" className="ml-1 underline">
                データ移行から取り込む
              </Link>
            ) : null}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-[--color-border]">
            {members.map((member) => (
              <li key={member.teamMemberId} className="flex items-center gap-3 py-3">
                <span className="w-9 shrink-0 text-center text-sm font-semibold tabular-nums">
                  {member.jerseyNumber ?? '—'}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {member.fullName}
                    {member.role !== 'player' ? (
                      <Badge tone="info" className="ml-2">
                        {ROLE_LABELS[member.role]}
                      </Badge>
                    ) : null}
                    {member.status !== 'active' ? (
                      <Badge tone="neutral" className="ml-2">
                        {MEMBER_STATUS_LABELS[member.status]}
                      </Badge>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-[--color-muted]">
                    {member.grade ? `${member.grade}年` : '学年未設定'}
                    {member.position ? ` / ${POSITION_LABELS[member.position]}` : ''}
                    {member.furigana ? ` / ${member.furigana}` : ''}
                  </p>
                </div>

                {!member.hasLogin ? <Badge tone="warning">未ログイン</Badge> : null}

                {/* 役割と権限を変えられるのは管理者だけ（13章） */}
                {isAdmin ? (
                  <Link
                    href={`/members/${member.teamMemberId}`}
                    className="text-keio-700 dark:text-keio-300 shrink-0 text-sm underline"
                  >
                    設定
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="text-xs text-[--color-muted]">
        「未ログイン」は、移行で登録したがまだアカウントを作っていない選手です。
      </p>

      {isAdmin ? (
        <p className="text-xs text-[--color-muted]">
          「設定」から役割と権限を変えられます。変更は操作の記録に残ります。
        </p>
      ) : null}
    </div>
  );
}
