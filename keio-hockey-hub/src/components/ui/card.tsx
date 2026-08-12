import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-xl border border-[--color-border] bg-[--color-surface] p-4', className)}
      {...props}
    />
  );
}

interface CardHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}

export function CardHeader({ title, description, action, icon }: CardHeaderProps) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          {icon}
          {title}
        </h2>
        {description ? <p className="mt-1 text-xs text-[--color-muted]">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** 何も無い時に、次にやることを伝える。 */
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-[--color-border] px-3 py-6 text-center text-sm text-[--color-muted]">
      {children}
    </p>
  );
}
