'use client';

import { useEffect } from 'react';

import { Button } from '@/components/ui/button';

/**
 * 想定外の例外を受け止める。
 * 利用者には原因の詳細を出さず、次にできることだけを示す。
 */
export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    // サーバー側のログに残す（本番では監視サービスへ送る）
    console.error('画面でエラーが発生しました', error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 text-center">
      <h1 className="text-lg font-bold">画面を表示できませんでした</h1>
      <p className="mt-2 text-sm text-[--color-muted]">
        時間をおいてもう一度お試しください。続く場合は管理者へ連絡してください。
      </p>
      <div className="mt-6">
        <Button onClick={reset}>もう一度読み込む</Button>
      </div>
    </main>
  );
}
