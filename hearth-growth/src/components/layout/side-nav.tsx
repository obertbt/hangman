'use client';

import { Settings, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { NAV_ITEMS } from '@/components/layout/bottom-nav';
import { cn } from '@/lib/utils/cn';

/** 画面が広いときだけ出す横のナビゲーション。モバイルでは下部ナビを使う。 */
const DESKTOP_ITEMS = [
  ...NAV_ITEMS,
  { href: '/groups', label: 'グループ', icon: Users },
  { href: '/settings', label: '設定', icon: Settings },
];

export function SideNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="メインナビゲーション"
      className="hidden w-56 shrink-0 border-r border-[--color-border] p-4 md:block"
    >
      <p className="px-3 pb-4 text-lg font-bold">Hearth Growth</p>
      <ul className="space-y-1">
        {DESKTOP_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 items-center gap-3 rounded-full px-3 text-sm',
                  isActive
                    ? 'bg-hearth-100 text-hearth-800 font-medium'
                    : 'hover:bg-hearth-100/60 text-[--color-muted]',
                )}
              >
                <Icon aria-hidden size={18} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
