'use client';

import { Avatar } from '@/components/ui/avatar';
import { VISIBILITY_OPTIONS } from '@/lib/permissions/visibility';
import { cn } from '@/lib/utils/cn';
import type { Visibility } from '@/types/database.types';

export interface VisibilityState {
  visibility: Visibility;
  groupId: string | null;
  allowedUserIds: string[];
}

interface VisibilityPickerProps {
  value: VisibilityState;
  onChange: (next: VisibilityState) => void;
  groups: { id: string; name: string }[];
  reachableUsers: { userId: string; displayName: string; avatarUrl: string | null }[];
}

/**
 * 公開範囲の選択（9章）。
 *
 * ここでの出し分けは入力の補助であって、権限判定ではない。
 * 実際の閲覧可否は RLS が決める。
 */
export function VisibilityPicker({ value, onChange, groups, reachableUsers }: VisibilityPickerProps) {
  const select = (visibility: Visibility) => {
    onChange({
      visibility,
      // group 以外ではグループを持たない（DB の CHECK 制約と同じ条件）
      groupId: visibility === 'group' ? (value.groupId ?? groups[0]?.id ?? null) : null,
      allowedUserIds: visibility === 'selected' ? value.allowedUserIds : [],
    });
  };

  const toggleUser = (userId: string) => {
    const next = value.allowedUserIds.includes(userId)
      ? value.allowedUserIds.filter((id) => id !== userId)
      : [...value.allowedUserIds, userId];
    onChange({ ...value, allowedUserIds: next });
  };

  return (
    <div className="space-y-3">
      <fieldset>
        <legend className="pb-2 text-sm font-medium">誰に見せますか？</legend>
        <div className="grid grid-cols-3 gap-2">
          {VISIBILITY_OPTIONS.map((option) => {
            const isSelected = value.visibility === option.value;
            const isDisabled = option.value === 'group' && groups.length === 0;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={isSelected}
                disabled={isDisabled}
                onClick={() => select(option.value)}
                className={cn(
                  'min-h-11 rounded-xl border px-2 text-sm transition-colors',
                  isSelected
                    ? 'border-ember-500 bg-ember-500/10 font-medium'
                    : 'border-[--color-border] bg-[--color-surface]',
                  isDisabled && 'opacity-40',
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-[--color-muted]">
          {groups.length === 0 && value.visibility !== 'group'
            ? 'グループに参加すると、仲間に共有できるようになります。'
            : VISIBILITY_OPTIONS.find((option) => option.value === value.visibility)?.description}
        </p>
      </fieldset>

      {value.visibility === 'group' && groups.length > 1 ? (
        <fieldset>
          <legend className="pb-2 text-sm font-medium">どのグループへ</legend>
          <div className="flex flex-wrap gap-2">
            {groups.map((group) => (
              <button
                key={group.id}
                type="button"
                aria-pressed={value.groupId === group.id}
                onClick={() => onChange({ ...value, groupId: group.id })}
                className={cn(
                  'min-h-9 rounded-full border px-3 text-xs',
                  value.groupId === group.id
                    ? 'border-ember-500 bg-ember-500/10 font-medium'
                    : 'border-[--color-border]',
                )}
              >
                {group.name}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      {value.visibility === 'selected' ? (
        <fieldset>
          <legend className="pb-2 text-sm font-medium">見せる相手</legend>
          {reachableUsers.length === 0 ? (
            <p className="text-xs text-[--color-muted]">
              同じグループにいる人がまだいません。グループに招待してから選べます。
            </p>
          ) : (
            <ul className="space-y-1">
              {reachableUsers.map((user) => {
                const isSelected = value.allowedUserIds.includes(user.userId);
                return (
                  <li key={user.userId}>
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => toggleUser(user.userId)}
                      className={cn(
                        'flex min-h-11 w-full items-center gap-2 rounded-xl border px-3 text-sm',
                        isSelected ? 'border-ember-500 bg-ember-500/10' : 'border-[--color-border]',
                      )}
                    >
                      <Avatar src={user.avatarUrl} name={user.displayName} size={28} />
                      <span className="flex-1 truncate text-left">{user.displayName}</span>
                      {isSelected ? <span className="text-ember-600 text-xs">選択中</span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </fieldset>
      ) : null}
    </div>
  );
}
