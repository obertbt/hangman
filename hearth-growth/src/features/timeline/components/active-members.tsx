import { Avatar } from '@/components/ui/avatar';
import type { ActiveMemberView } from '@/features/timeline/queries';
import { calculateElapsedSeconds, formatDuration } from '@/lib/date/duration';

interface ActiveMembersProps {
  members: ActiveMemberView[];
  serverNow: string;
}

/**
 * 「今、頑張っている人」（7.2）。
 *
 * 出すのはカテゴリーと経過時間だけ。活動タイトルは出さない。
 * 経過時間は分単位で十分なので、ここでは毎秒の更新をしない（16.3）。
 */
export function ActiveMembers({ members, serverNow }: ActiveMembersProps) {
  if (members.length === 0) {
    return (
      <p className="text-sm text-[--color-muted]">
        今は誰も活動していません。最初のひとりになってみませんか。
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {members.map((member) => {
        const elapsed = calculateElapsedSeconds({
          startedAt: member.started_at,
          // 休憩中は、止めた時刻で時間も止まる
          pausedAt: member.paused_at,
          totalPausedSeconds: member.total_paused_seconds,
          now: new Date(serverNow),
        });

        return (
          <li key={member.user_id} className="flex items-center gap-3">
            <span className="relative">
              <Avatar src={member.avatar_url} name={member.display_name} size={40} />
              {member.status === 'running' ? (
                <span
                  aria-hidden
                  className="bg-ember-500 absolute right-0 bottom-0 h-3 w-3 rounded-full ring-2 ring-[--color-surface]"
                />
              ) : null}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {member.display_name}
                {member.isMe ? <span className="ml-1 text-xs text-[--color-muted]">(自分)</span> : null}
              </p>
              <p className="text-xs" style={{ color: member.category_color }}>
                <span aria-hidden className="mr-1">
                  {member.category_icon}
                </span>
                {member.category_name}
                {member.status === 'paused' ? '（休憩中）' : ''}
              </p>
            </div>

            <span className="shrink-0 text-sm tabular-nums">{formatDuration(elapsed)}</span>
          </li>
        );
      })}
    </ul>
  );
}
