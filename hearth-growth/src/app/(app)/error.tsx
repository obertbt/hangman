'use client';

import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

/**
 * ログイン後の画面で起きた例外の受け皿。
 * 原因は画面に出さず、ログにだけ残す（20章）。
 */
export default function AppError({
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
    <Card className="space-y-3 text-center">
      <p className="text-base font-medium">うまく読み込めませんでした。</p>
      <p className="text-sm text-[--color-muted]">
        通信の調子が悪いのかもしれません。少し待ってからもう一度お試しください。
      </p>
      <div className="pt-1">
        <Button onClick={reset}>もう一度読み込む</Button>
      </div>
    </Card>
  );
}
