'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/field';
import { markNotificationsReadAction } from '@/features/notifications/actions';

/**
 * すべて既読にする。
 *
 * 画面を開いただけでは既読にしない。
 * 眺めただけのものまで消えると、あとで読み返せなくなるため。
 */
export function MarkAllReadButton({ unreadCount }: { unreadCount: number }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (unreadCount === 0) return null;

  const handleClick = () => {
    setError(null);
    startTransition(async () => {
      const result = await markNotificationsReadAction();
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  };

  return (
    <div>
      <Button variant="ghost" size="sm" disabled={isPending} onClick={handleClick}>
        {isPending ? '処理しています…' : 'すべて既読にする'}
      </Button>
      {error ? <FormMessage>{error}</FormMessage> : null}
    </div>
  );
}
