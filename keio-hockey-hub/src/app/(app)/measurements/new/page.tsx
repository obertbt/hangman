import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Card, CardHeader, EmptyState } from '@/components/ui/card';
import { EventForm, ItemForm } from '@/features/measurement/components/event-form';
import { listMeasurementItems } from '@/features/measurement/queries';
import { isStaff, requireSession } from '@/lib/auth/session';
import { todayInTokyo } from '@/lib/datetime';

export const metadata: Metadata = { title: '測定会を作る' };

/**
 * 測定会と測定項目を作る（3章の6）。
 *
 * スタッフだけ。RLS も同じ条件で守っている。
 */
export default async function NewMeasurementPage() {
  const session = await requireSession();

  if (!isStaff(session)) {
    redirect('/measurements');
  }

  const items = await listMeasurementItems(session);

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <Link href="/measurements" className="text-keio-700 dark:text-keio-300 underline">
          ← 測定へ戻る
        </Link>
      </p>

      <header>
        <h1 className="text-xl font-bold">測定会を作る</h1>
        <p className="mt-1 text-sm text-[--color-muted]">
          作ったあと、その画面で全員ぶんの記録を入れられます。
        </p>
      </header>

      <Card>
        <CardHeader title="新しい測定会" />
        {items.length === 0 ? (
          <EmptyState>先に測定項目を足してください。項目が無いと記録を入れられません。</EmptyState>
        ) : (
          <EventForm today={todayInTokyo()} />
        )}
      </Card>

      <Card>
        <CardHeader title="いまある測定項目" description={`${items.length}件。すべての測定会で共通です。`} />
        {items.length === 0 ? (
          <EmptyState>まだありません。下から足してください。</EmptyState>
        ) : (
          <ul className="space-y-1 text-sm">
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3">
                <span>{item.name}</span>
                <span className="text-[--color-muted]">
                  {item.unit ? `${item.unit} / ` : ''}
                  {item.better === 'lower' ? '小さいほど良い' : '大きいほど良い'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="測定項目を足す" />
        <ItemForm />
      </Card>
    </div>
  );
}
