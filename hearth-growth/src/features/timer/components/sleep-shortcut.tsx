'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/field';
import { startSleepAction, wakeUpAction } from '@/features/timer/sleep-actions';
import { formatDuration } from '@/lib/date/duration';

interface SleepShortcutProps {
  /** 睡眠のタイマーが動いていれば、その開始時刻。 */
  sleepingSince: string | null;
  /** 睡眠以外のタイマーが動いているか。動いていれば就寝を始められない。 */
  otherTimerName: string | null;
  /** サーバーが描画した時刻。経過の目安をここから出す（端末の時計を使わない）。 */
  serverNow: string;
  timeZone: string;
}

/**
 * 就寝・起床のショートカット（24章）。
 *
 * 寝る前と寝起きに、カテゴリーを選ばせたり文章を書かせたりしない。
 * 押すのは1回だけにする。
 *
 * 中身は睡眠カテゴリーのタイマーそのもの。
 * 記録としては残るが、活動時間の合計には数えない。
 */
export function SleepShortcut({ sleepingSince, otherTimerName, serverNow, timeZone }: SleepShortcutProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const run = (action: () => Promise<{ ok: boolean; message?: string }>) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.message ?? null);
      }
    });
  };

  if (sleepingSince) {
    const since = new Date(sleepingSince);
    const label = since.toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone,
    });
    // 目安だけ見せる。秒単位で動かすと、寝起きに落ち着かない。
    // 描画中に現在時刻を読まず、サーバーが渡した時刻から求める。
    const elapsed = Math.max(0, Math.floor((new Date(serverNow).getTime() - since.getTime()) / 1000));

    return (
      <div className="space-y-3">
        {error ? <FormMessage>{error}</FormMessage> : null}
        <div>
          <p className="text-sm font-medium">
            <span aria-hidden className="mr-1">
              😴
            </span>
            {label} から就寝中
          </p>
          <p className="mt-1 text-xs text-[--color-muted]">
            今のところ {formatDuration(elapsed)} ほど。起きたら押してください。
          </p>
        </div>
        <Button size="lg" block disabled={isPending} onClick={() => run(wakeUpAction)}>
          {isPending ? '記録しています…' : '起床'}
        </Button>
      </div>
    );
  }

  if (otherTimerName) {
    return (
      <p className="text-sm text-[--color-muted]">
        「{otherTimerName}」のタイマーが動いています。終えてから就寝を記録できます。
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {error ? <FormMessage>{error}</FormMessage> : null}
      <Button variant="secondary" block disabled={isPending} onClick={() => run(startSleepAction)}>
        <span aria-hidden className="mr-1">
          😴
        </span>
        {isPending ? '記録しています…' : '就寝'}
      </Button>
      <p className="text-xs text-[--color-muted]">
        起きたときにもう一度押すと、睡眠時間が残ります。活動時間の合計には入りません。
      </p>
    </div>
  );
}
