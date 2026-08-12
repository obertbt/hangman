'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import type { NavLink } from '@/components/layout/nav-links';
import { cn } from '@/lib/utils/cn';

/**
 * スマートフォン用の下部ナビゲーション（モバイルファースト）。
 * 片手で届く位置に置く。
 */
export function BottomNav({ links }: { links: NavLink[] }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="メインナビゲーション"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[--color-border] bg-[--color-surface] pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="flex">
        {links.map((link) => {
          const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
          const Icon = link.icon;
          return (
            <li key={link.href} className="flex-1">
              <Link
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-[4.25rem] flex-col items-center justify-center gap-1 text-[11px]',
                  active ? 'text-keio-700 dark:text-keio-200' : 'text-[--color-muted]',
                )}
              >
                <Icon size={20} aria-hidden />
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
