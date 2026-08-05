import { Avatar } from '@/components/ui/avatar';
import type { GroupWeekMember } from '@/features/analytics/queries';
import { formatDuration } from '@/lib/date/duration';
import { formatDateLabel } from '@/lib/date/timezone';

interface GroupWeekStatusProps {
  members: GroupWeekMember[];
  weekStart: string;
  myUserId: string;
}

/**
 * グループの今週（7.7, 15.5）。
 *
 * 順位は付けない。並び順は表示名で、上位を目立たせる装飾もしない。
 * 比べるためではなく、続いている様子が分かるための表示にする。
 */
export function GroupWeekStatus({ members, weekStart, myUserId }: GroupWeekStatusProps) {
  const peak = Math.max(...members.map((member) => member.totalSeconds), 1);

  return (
    <div className="space-y-3">
      <p className="text-xs text-[--color-muted]">{formatDateLabel(weekStart)}から</p>

      <ul className="space-y-3">
        {members.map((member) => (
          <li key={member.userId} className="flex items-center gap-3">
            <Avatar src={member.avatarUrl} name={member.displayName} size={32} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">
                {member.displayName}
                {member.userId === myUserId ? (
                  <span className="ml-1 text-xs text-[--color-muted]">(自分)</span>
                ) : null}
              </p>
              <span className="bg-hearth-100 mt-1 block h-1.5 w-full overflow-hidden rounded-full">
                <span
                  className="bg-ember-400 block h-full rounded-full"
                  style={{ width: `${Math.round((member.totalSeconds / peak) * 100)}%` }}
                />
              </span>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm tabular-nums">{formatDuration(member.totalSeconds)}</p>
              <p className="text-xs text-[--color-muted]">{member.activeDays}日</p>
            </div>
          </li>
        ))}
      </ul>

      <p className="text-xs text-[--color-muted]">ここに出るのは、このグループへ公開された記録だけです。</p>
    </div>
  );
}
