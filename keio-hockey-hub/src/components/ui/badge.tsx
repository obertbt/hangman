import type { ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'action';

const toneClass: Record<Tone, string> = {
  neutral: 'bg-keio-100 text-keio-800 dark:bg-keio-800 dark:text-keio-100',
  info: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-100',
  success: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100',
  warning: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100',
  danger: 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100',
  action: 'bg-action-500/15 text-action-700 dark:text-action-400',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        toneClass[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
