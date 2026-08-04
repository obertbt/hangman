'use client';

import { useEffect } from 'react';

import { Button } from '@/components/ui/button';

/**
 * 予期しない例外の受け皿。
 * 画面には原因を出さず（20章: 内部情報を漏らさない）、ログにだけ残す。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-lg font-medium">うまく読み込めませんでした。</p>
      <p className="text-sm text-[--color-muted]">時間をおいてもう一度お試しください。</p>
      <Button onClick={reset}>再読み込み</Button>
    </div>
  );
}
