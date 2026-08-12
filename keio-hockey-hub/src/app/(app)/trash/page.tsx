import type { Metadata } from 'next';

import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, EmptyState } from '@/components/ui/card';
import { RestoreButton } from '@/features/ops/components/restore-button';
import { DELETED_KIND_LABELS, listDeletedItems } from '@/features/ops/restore';
import { requireSession } from '@/lib/auth/session';
import { formatDateTimeInTokyo } from '@/lib/datetime';
import { limits } from '@/lib/env';

export const metadata: Metadata = { title: '消したもの' };

/**
 * 消したものを戻す（60章の考え方を他の記録にも広げたもの）。
 *
 * 出るのは **自分が戻せるものだけ**。
 * 他の人が消したものは、ここにも出ないし戻せない。
 *
 * 記録は本人の努力の証拠なので、消えたら戻せないのは怖い。
 * 気軽に消せて、間違えたら戻せるのがいちばんよい。
 */
export default async function TrashPage() {
  const session = await requireSession();
  const items = await listDeletedItems(session);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold">消したもの</h1>
        <p className="mt-1 text-sm text-[--color-muted]">
          間違えて消したものを戻せます。ここに出るのは、自分が戻せるものだけです。
        </p>
      </header>

      <Card>
        <CardHeader title="戻せるもの" description={`${items.length}件`} />
        {items.length === 0 ? (
          <EmptyState>消したものはありません。</EmptyState>
        ) : (
          <ul className="divide-y divide-[--color-border]">
            {items.map((item) => (
              <li key={`${item.kind}-${item.itemId}`} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge tone="neutral">{DELETED_KIND_LABELS[item.kind]}</Badge>
                    <span className="font-medium">{item.label}</span>
                  </p>
                  <p className="mt-1 text-xs text-[--color-muted]">
                    {formatDateTimeInTokyo(item.deletedAt)} に削除
                  </p>
                  {item.note ? (
                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{item.note}</p>
                  ) : null}
                </div>

                <RestoreButton kind={item.kind} itemId={item.itemId} restorable={item.restorable} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="いつまで戻せるか" />
        <p className="text-sm">
          動画は、消してから <strong>{limits.deletedFileRetentionDays}日</strong>{' '}
          のあいだ戻せます。それを過ぎて実体が消されると、戻せません。
        </p>
        <p className="mt-2 text-sm text-[--color-muted]">
          トレーニング記録とスキルの目標は、実体を持たないので期限はありません。
        </p>
        <ul className="mt-3 space-y-1 text-sm text-[--color-muted]">
          <li>・場面を戻すには、元の動画が消えていないことが要ります</li>
          <li>・小目標を戻すには、先に中目標を戻してください</li>
          <li>・動画を戻すと、30日後の実体削除の予約も取り消されます</li>
        </ul>
      </Card>
    </div>
  );
}
