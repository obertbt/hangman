'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { FormMessage, Input } from '@/components/ui/field';
import { startSleepAction, wakeUpAction } from '@/features/timer/sleep-actions';
import { formatDuration } from '@/lib/date/duration';
import { formatTimeOfDay, nextOccurrenceOf } from '@/lib/date/time-of-day';

interface SleepShortcutProps {
  /** 睡眠のタイマーが動いていれば、その開始時刻。 */
  sleepingSince: string | null;
  /** 起床予定の時刻。設定していなければ null。 */
  wakeAt: string | null;
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
 * 起床予定を入れておくと、その時刻に「起きていますか？」の通知が届く。
 * ただし**目覚まし時計の代わりにはならない**。
 * Web の通知は省電力で遅れることがあり、マナーモードも越えない。
 * 起こす役目は端末のアラームアプリのもので、ここは記録のための呼びかけ。
 */
export function SleepShortcut({
  sleepingSince,
  wakeAt,
  otherTimerName,
  serverNow,
  timeZone,
}: SleepShortcutProps) {
  const router = useRouter();
  const [wakeTime, setWakeTime] = useState('07:00');
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
            {formatTimeOfDay(sleepingSince, timeZone)} から就寝中
          </p>
          <p className="mt-1 text-xs text-[--color-muted]">
            今のところ {formatDuration(elapsed)} ほど。
            {wakeAt ? `${formatTimeOfDay(wakeAt, timeZone)} にお知らせします。` : '起きたら押してください。'}
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
    <div className="space-y-3">
      {error ? <FormMessage>{error}</FormMessage> : null}

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label htmlFor="wake-time" className="block pb-1 text-sm font-medium">
            起こしてほしい時刻
          </label>
          <Input
            id="wake-time"
            type="time"
            value={wakeTime}
            onChange={(event) => setWakeTime(event.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Button
          variant="secondary"
          block
          disabled={isPending}
          onClick={() => run(() => startSleepAction(nextOccurrenceOf(wakeTime, timeZone).toISOString()))}
        >
          <span aria-hidden className="mr-1">
            😴
          </span>
          {isPending ? '記録しています…' : `就寝（${wakeTime} に呼びかけ）`}
        </Button>
        <Button variant="ghost" disabled={isPending} onClick={() => run(() => startSleepAction(null))}>
          呼びかけなしで就寝
        </Button>
      </div>

      <p className="text-xs text-[--color-muted]">
        起きたら「起床」を押すと睡眠時間が残ります。活動時間の合計には入りません。
        <br />
        通知は<strong>目覚ましの代わりにはなりません</strong>。
        音で起こすのは端末のアラームに任せ、こちらは記録のための呼びかけです。
      </p>
    </div>
  );
}
