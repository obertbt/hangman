'use client';

import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { rollbackImport } from '@/features/import/actions';

/**
 * 取り込みの取り消し（48章）。
 * 消す操作なので、必ず一度確認を挟む。
 */
export function RollbackButton({ sessionId }: { sessionId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (message) {
    return <span className="text-xs text-[--color-muted]">{message}</span>;
  }

  if (!confirming) {
    return (
      <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
        取り消す
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-[--color-muted]">この取り込みで追加した選手を削除します</span>
      <Button
        variant="danger"
        size="sm"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const result = await rollbackImport(sessionId);
            setMessage(result.error ?? `${result.removed ?? 0} 名を削除しました`);
          })
        }
      >
        {isPending ? '取り消しています…' : '削除する'}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        やめる
      </Button>
    </div>
  );
}
