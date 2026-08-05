'use client';

import { BookOpen, Home, ListChecks, Play, User } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils/cn';

/** 16.2 下部ナビゲーション。中央の「活動開始」を最も押しやすい位置に置く。 */
const NAV_ITEMS = [
  { href: '/home', label: 'ホーム', icon: Home },
  { href: '/timeline', label: 'タイムライン', icon: BookOpen },
  { href: '/timer', label: '活動開始', icon: Play, primary: true },
  { href: '/activities', label: '記録', icon: ListChecks },
  { href: '/profile', label: 'マイページ', icon: User },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="メインナビゲーション"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[--color-border] bg-[--color-surface] pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="mx-auto flex max-w-2xl items-end justify-around">
        {NAV_ITEMS.map(({ href, label, icon: Icon, ...item }) => {
          const isPrimary = 'primary' in item && item.primary;
          const isActive = pathname === href || pathname.startsWith(`${href}/`);

          if (isPrimary) {
            return (
              <li key={href} className="-mt-5">
                <Link
                  href={href}
                  aria-label={label}
                  className="bg-ember-700 hover:bg-ember-800 flex h-16 w-16 flex-col items-center justify-center rounded-full text-white shadow-lg transition-colors"
                >
                  <Icon aria-hidden size={22} />
                  <span className="mt-0.5 text-[10px] font-medium">{label}</span>
                </Link>
              </li>
            );
          }

          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex min-h-14 w-16 flex-col items-center justify-center gap-1 text-[10px]',
                  isActive ? 'text-ember-600' : 'text-[--color-muted]',
                )}
              >
                <Icon aria-hidden size={20} />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export { NAV_ITEMS };
