'use client';

import { useElapsedSeconds } from '@/hooks/use-elapsed-seconds';
import { formatClock, formatDuration } from '@/lib/date/duration';

interface ElapsedClockProps {
  startedAt: string;
  pausedAt: string | null;
  totalPausedSeconds: number;
  serverNow: string;
}

/**
 * 経過時間の表示だけを受け持つ。
 *
 * 呼び出し側で `key` に停止状態を含めること。
 * 一時停止・再開のたびに作り直され、サーバーが返した値から表示が始まる。
 */
export function ElapsedClock(props: ElapsedClockProps) {
  const elapsed = useElapsedSeconds(props);

  return (
    <p
      className="mt-4 font-mono text-5xl font-bold tabular-nums"
      role="timer"
      // 毎秒読み上げられると邪魔になるため、変化は通知しない
      aria-live="off"
      aria-label={`経過時間 ${formatDuration(elapsed)}`}
    >
      {formatClock(elapsed)}
    </p>
  );
}
