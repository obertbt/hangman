import { Bell } from 'lucide-react';
import Link from 'next/link';

/**
 * ベル。未読があるときだけ数字を出す。
 *
 * 数字は控えめに。9件を超えたら「9+」で止め、
 * 溜まった数そのものが負担にならないようにする。
 */
export function NotificationBell({ unreadCount }: { unreadCount: number }) {
  const label = unreadCount > 0 ? `お知らせ（未読 ${unreadCount}件）` : 'お知らせ';

  return (
    <Link
      href="/notifications"
      aria-label={label}
      className="hover:bg-hearth-100/60 relative flex size-11 items-center justify-center rounded-full"
    >
      <Bell aria-hidden size={20} />
      {unreadCount > 0 ? (
        <span
          aria-hidden
          className="bg-ember-700 absolute top-1.5 right-1 min-w-4 rounded-full px-1 text-center text-[10px] leading-4 font-medium text-white"
        >
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      ) : null}
    </Link>
  );
}
