import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 text-center">
      <h1 className="text-lg font-bold">お探しの画面は見つかりませんでした</h1>
      <p className="mt-2 text-sm text-[--color-muted]">
        すでに削除されたか、閲覧できる権限がない可能性があります。
      </p>
      <p className="mt-6">
        <Link href="/today" className="text-keio-700 dark:text-keio-300 underline">
          今日の画面へ戻る
        </Link>
      </p>
    </main>
  );
}
