'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { FormMessage, Select } from '@/components/ui/field';
import { removeMemberAction, updateMemberRoleAction } from '@/features/groups/actions';
import type { GroupMemberView } from '@/features/groups/queries';
import type { GroupRole } from '@/types/database.types';

const ROLE_LABELS: Record<GroupRole, string> = {
  owner: '作成者',
  admin: '管理者',
  member: 'メンバー',
};

interface MemberListProps {
  groupId: string;
  members: GroupMemberView[];
  myUserId: string;
  canManage: boolean;
}

export function MemberList({ groupId, members, myUserId, canManage }: MemberListProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleRoleChange = (userId: string, role: GroupRole) => {
    if (role === 'owner') return;
    setError(null);
    startTransition(async () => {
      const result = await updateMemberRoleAction({ groupId, userId, role });
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  };

  const handleRemove = (userId: string, displayName: string) => {
    if (!window.confirm(`${displayName}さんをグループから外しますか？`)) return;
    setError(null);
    startTransition(async () => {
      const result = await removeMemberAction({ groupId, userId });
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  };

  return (
    <div className="space-y-3">
      {error ? <FormMessage>{error}</FormMessage> : null}

      <ul className="space-y-3">
        {members.map((member) => {
          const isSelf = member.userId === myUserId;
          const isOwner = member.role === 'owner';
          // 作成者の権限は変更できない。自分自身の権限も、この画面からは変えない。
          const canEditThisMember = canManage && !isOwner && !isSelf;

          return (
            <li key={member.userId} className="flex items-center gap-3">
              <Avatar src={member.avatarUrl} name={member.displayName} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {member.displayName}
                  {isSelf ? <span className="ml-1 text-xs text-[--color-muted]">(自分)</span> : null}
                </p>
                <p className="text-xs text-[--color-muted]">{ROLE_LABELS[member.role]}</p>
              </div>

              {canEditThisMember ? (
                <div className="flex shrink-0 items-center gap-2">
                  <Select
                    aria-label={`${member.displayName}さんの権限`}
                    value={member.role}
                    disabled={isPending}
                    className="min-h-9 w-28 text-xs"
                    onChange={(event) => handleRoleChange(member.userId, event.target.value as GroupRole)}
                  >
                    <option value="member">メンバー</option>
                    <option value="admin">管理者</option>
                  </Select>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isPending}
                    onClick={() => handleRemove(member.userId, member.displayName)}
                  >
                    外す
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
