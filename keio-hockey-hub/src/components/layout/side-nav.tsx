'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import type { NavLink } from '@/components/layout/nav-links';
import { cn } from '@/lib/utils/cn';

/** PC 用の横のナビゲーション。モバイルでは下部ナビゲーションを使う。 */
export function SideNav({ links, appName }: { links: NavLink[]; appName: string }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-56 shrink-0 border-r border-[--color-border] bg-[--color-surface] md:block">
      <div className="sticky top-0 p-4">
        <p className="mb-4 px-2 text-sm font-bold">{appName}</p>
        <nav aria-label="メインナビゲーション">
          <ul className="space-y-1">
            {links.map((link) => {
              const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
              const Icon = link.icon;
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm',
                      active
                        ? 'bg-keio-100 text-keio-800 dark:bg-keio-800 dark:text-keio-100 font-medium'
                        : 'hover:bg-keio-100/60 text-[--color-muted]',
                    )}
                  >
                    <Icon size={18} aria-hidden />
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </aside>
  );
}
