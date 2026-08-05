'use client';

import { useEffect, useRef, useState } from 'react';

import { calculateElapsedSeconds } from '@/lib/date/duration';

interface Options {
  startedAt: string;
  pausedAt: string | null;
  totalPausedSeconds: number;
  /** サーバーが返した現在時刻。端末の時計とのずれを補正する（13.1）。 */
  serverNow: string;
}

/**
 * タイマーの経過秒数。
 *
 * 秒数をカウントアップして保持することはしない。
 * 毎回 started_at から計算し直すため、タブを閉じても端末がスリープしても、
 * 戻ってきた瞬間に正しい値になる。
 *
 * 初期値はサーバー時刻から求める。描画中に `Date.now()` を呼ばないことで、
 * サーバーとクライアントの初回描画が食い違わないようにしている。
 * 端末の時計とのずれは、マウント後に測って以降の更新へ反映する。
 *
 * 状態（running / paused）が変わったときは、呼び出し側で `key` を変えて
 * 作り直すこと。初期値は再マウント時にしか読まれない。
 */
export function useElapsedSeconds({ startedAt, pausedAt, totalPausedSeconds, serverNow }: Options) {
  const [elapsed, setElapsed] = useState(() =>
    calculateElapsedSeconds({ startedAt, pausedAt, totalPausedSeconds, now: new Date(serverNow) }),
  );
  const offsetRef = useRef(0);

  useEffect(() => {
    offsetRef.current = new Date(serverNow).getTime() - Date.now();
  }, [serverNow]);

  useEffect(() => {
    // 一時停止中は時間が進まないので、更新もしない
    if (pausedAt) return;

    const update = () => {
      setElapsed(
        calculateElapsedSeconds({
          startedAt,
          pausedAt,
          totalPausedSeconds,
          now: new Date(Date.now() + offsetRef.current),
        }),
      );
    };

    const timer = window.setInterval(update, 1000);
    // 復帰直後にすぐ正しい値へ戻す
    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('focus', update);
    };
  }, [startedAt, pausedAt, totalPausedSeconds]);

  return elapsed;
}
