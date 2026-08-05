import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

/**
 * 見つからなかった場合。
 * 「権限が無い」と「存在しない」を区別して伝えない。
 * どちらかを言い当てられると、他人のデータの有無が分かってしまう（20章）。
 */
export default function AppNotFound() {
  return (
    <Card className="space-y-3 text-center">
      <p className="text-base font-medium">このページは見つかりませんでした。</p>
      <p className="text-sm text-[--color-muted]">削除されたか、閲覧できる範囲の外にあるようです。</p>
      <div className="pt-1">
        <Link href="/home" className={buttonVariants({ variant: 'outline' })}>
          ホームへ戻る
        </Link>
      </div>
    </Card>
  );
}
