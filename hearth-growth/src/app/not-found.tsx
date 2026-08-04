import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-lg font-medium">ページが見つかりませんでした。</p>
      <Link href="/home" className="text-sm underline underline-offset-4">
        ホームへ戻る
      </Link>
    </div>
  );
}
