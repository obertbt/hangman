'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/field';
import {
  cancelSessionAction,
  completeSessionAction,
  pauseSessionAction,
  resumeSessionAction,
} from '@/features/timer/actions';
import { ElapsedClock } from '@/features/timer/components/elapsed-clock';
import { calculateElapsedSeconds, formatDuration, isStaleSession } from '@/lib/date/duration';
import type { ActivitySessionRow, CategoryRow } from '@/types/database.types';

interface RunningTimerProps {
  session: ActivitySessionRow;
  category: Pick<CategoryRow, 'id' | 'name' | 'icon' | 'color'> | null;
  serverNow: string;
}

export function RunningTimer({ session, category, serverNow }: RunningTimerProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // 12時間判定に秒単位の精度は要らないので、サーバー時刻から素直に求める。
  // 描画中に Date.now() を呼ばないため、初回描画がサーバーと食い違わない。
  const elapsedAtRender = calculateElapsedSeconds({
    startedAt: session.started_at,
    pausedAt: session.paused_at,
    totalPausedSeconds: session.total_paused_seconds,
    now: new Date(serverNow),
  });

  const isPaused = session.status === 'paused';
  const isStale = isStaleSession(elapsedAtRender);

  const run = (
    action: () => Promise<{ ok: boolean; message?: string }>,
    /** 終了後は活動終了画面へ送る。取り消しや一時停止では、その場で更新する。 */
    nextPath?: string,
  ) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.message ?? null);
        return;
      }
      if (nextPath) {
        router.push(nextPath);
      } else {
        router.refresh();
      }
    });
  };

  const handleCancel = () => {
    if (!window.confirm('この活動を記録せずに取り消しますか？')) return;
    run(() => cancelSessionAction(session.id));
  };

  return (
    <div className="space-y-6">
      {error ? <FormMessage>{error}</FormMessage> : null}

      {/* 13.4 長時間続いているタイマーは、勝手に終了せず確認する */}
      {isStale ? (
        <StaleSessionNotice
          elapsed={elapsedAtRender}
          disabled={isPending}
          onFinishNow={() => run(() => completeSessionAction({ sessionId: session.id }), '/timer/finish')}
          onFinishAt={(endedAt) =>
            run(() => completeSessionAction({ sessionId: session.id, endedAt }), '/timer/finish')
          }
          startedAt={session.started_at}
        />
      ) : null}

      <div className="text-center">
        {category ? (
          <p className="text-sm" style={{ color: category.color }}>
            <span aria-hidden className="mr-1">
              {category.icon}
            </span>
            {category.name}
          </p>
        ) : null}
        {session.title ? <p className="mt-1 text-base font-medium">{session.title}</p> : null}

        {/* 停止状態が変わったら作り直す。初期値はサーバーが計算したものになる。 */}
        <ElapsedClock
          key={`${session.paused_at ?? 'running'}-${session.total_paused_seconds}`}
          startedAt={session.started_at}
          pausedAt={session.paused_at}
          totalPausedSeconds={session.total_paused_seconds}
          serverNow={serverNow}
        />
        <p className="mt-2 text-sm text-[--color-muted]">{isPaused ? '一時停止中' : '記録しています'}</p>
      </div>

      <div className="flex flex-col gap-3">
        {isPaused ? (
          <Button
            size="lg"
            block
            disabled={isPending}
            onClick={() => run(() => resumeSessionAction(session.id))}
          >
            再開する
          </Button>
        ) : (
          <Button
            size="lg"
            block
            variant="secondary"
            disabled={isPending}
            onClick={() => run(() => pauseSessionAction(session.id))}
          >
            一時停止
          </Button>
        )}

        <Button
          size="lg"
          block
          disabled={isPending}
          onClick={() => run(() => completeSessionAction({ sessionId: session.id }), '/timer/finish')}
        >
          終了する
        </Button>

        <Button variant="ghost" disabled={isPending} onClick={handleCancel}>
          記録せずに取り消す
        </Button>
      </div>

      {session.note ? (
        <p className="rounded-xl bg-[--color-background] p-3 text-sm whitespace-pre-wrap text-[--color-muted]">
          {session.note}
        </p>
      ) : null}

      <p className="text-center text-xs text-[--color-muted]">
        画面を閉じても記録は続きます。開いたときに正しい時間へ戻ります。
      </p>
    </div>
  );
}

interface StaleSessionNoticeProps {
  elapsed: number;
  startedAt: string;
  disabled: boolean;
  onFinishNow: () => void;
  onFinishAt: (endedAt: string) => void;
}

/**
 * 13.4 異常終了の確認。
 * 自動では終了させない。利用者に終了時刻を選んでもらう。
 */
function StaleSessionNotice({
  elapsed,
  startedAt,
  disabled,
  onFinishNow,
  onFinishAt,
}: StaleSessionNoticeProps) {
  const [customEnd, setCustomEnd] = useState('');
  // datetime-local の上限。描画のたびに変わらないよう、マウント時の値を使う。
  const [maxEnd] = useState(() => toLocalInputValue(new Date().toISOString()));

  return (
    <div className="border-ember-400 bg-ember-400/10 space-y-3 rounded-2xl border p-4">
      <p className="text-sm font-medium">前回のタイマーが{formatDuration(elapsed)}続いています。</p>
      <p className="text-sm text-[--color-muted]">終了し忘れかもしれません。実際に終えた時刻に直せます。</p>

      <div className="space-y-2">
        <label htmlFor="ended-at" className="block text-xs font-medium">
          終了した時刻
        </label>
        <input
          id="ended-at"
          type="datetime-local"
          value={customEnd}
          min={toLocalInputValue(startedAt)}
          max={maxEnd}
          onChange={(event) => setCustomEnd(event.target.value)}
          className="min-h-11 w-full rounded-xl border border-[--color-border] bg-[--color-surface] px-3"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={disabled || !customEnd}
          onClick={() => onFinishAt(new Date(customEnd).toISOString())}
        >
          この時刻で終了する
        </Button>
        <Button size="sm" variant="ghost" disabled={disabled} onClick={onFinishNow}>
          今の時刻で終了する
        </Button>
      </div>
    </div>
  );
}

/** ISO 文字列を datetime-local が受け付ける形（端末のローカル時刻）へ直す。 */
function toLocalInputValue(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}
