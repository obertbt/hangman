import Link from 'next/link';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
  /** 設定など、下部ナビに載せない画面への導線 */
  settingsLink?: boolean;
}

export function PageHeader({ title, description, action, settingsLink }: PageHeaderProps) {
  return (
    <header className="flex items-start justify-between gap-4 pb-4">
      <div>
        <h1 className="text-xl font-bold">{title}</h1>
        {description ? <p className="mt-1 text-sm text-[--color-muted]">{description}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {action}
        {settingsLink ? (
          <Link href="/settings" className="text-sm text-[--color-muted] underline underline-offset-4">
            設定
          </Link>
        ) : null}
      </div>
    </header>
  );
}
