'use client';

import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/field';
import { captureStorageUsage, expireStaleUploads, runStorageCleanup } from '@/features/ops/actions';

/**
 * 容量まわりの操作（59章・60章）。
 *
 * 本当は日次で自動的に走らせたい。
 * だが動かす仕組み（cron）を1つ増やすと、そのぶん運用が重くなる。
 * まずは「押せば動く」形にして、必要になったら外から叩けるようにする。
 */
export function StorageActions({
  dueCount,
  staleCount,
  storageConfigured,
}: {
  dueCount: number;
  staleCount: number;
  storageConfigured: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  function run(action: () => Promise<{ error?: string; success?: string }>) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setMessage({ tone: 'error', text: result.error });
      else if (result.success) setMessage({ tone: 'success', text: result.success });
    });
  }

  return (
    <div className="space-y-3">
      {message ? <FormMessage tone={message.tone}>{message.text}</FormMessage> : null}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => run(captureStorageUsage)} disabled={pending}>
          いまの容量を数える
        </Button>

        <Button
          variant="outline"
          onClick={() => run(runStorageCleanup)}
          disabled={pending || dueCount === 0 || !storageConfigured}
          title={!storageConfigured ? 'R2 が設定されていません' : undefined}
        >
          期限の来たファイルを消す（{dueCount}件）
        </Button>

        <Button
          variant="outline"
          onClick={() => run(expireStaleUploads)}
          disabled={pending || staleCount === 0}
        >
          途中でやめたアップロードを片付ける（{staleCount}件）
        </Button>
      </div>

      <p className="text-xs text-[--color-muted]">
        削除は元に戻せません。論理削除から30日を過ぎたものだけが対象です。
      </p>
    </div>
  );
}
