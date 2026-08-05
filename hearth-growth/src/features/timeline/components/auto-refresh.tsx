'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * 「今、頑張っている人」を定期的に取り直す（14章）。
 *
 * MVP では Realtime を使わず、これで十分としている。
 * 画面が見えていないときは何もしないので、無駄な通信は起きない。
 */
export function AutoRefresh({ intervalMs = 60_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') {
        router.refresh();
      }
    };

    const timer = window.setInterval(tick, intervalMs);
    // 別のタブから戻ってきた直後にも取り直す
    document.addEventListener('visibilitychange', tick);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [router, intervalMs]);

  return null;
}
