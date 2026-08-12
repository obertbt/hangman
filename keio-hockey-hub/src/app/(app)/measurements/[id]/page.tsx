import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Card, CardHeader, EmptyState } from '@/components/ui/card';
import { ResultCell } from '@/features/measurement/components/result-cell';
import { getEventSheet } from '@/features/measurement/queries';
import { isStaff, requireSession } from '@/lib/auth/session';
import { formatDateLabel } from '@/lib/datetime';

export const metadata: Metadata = { title: '測定会' };

/**
 * 測定会1件（3章の6・7）。
 *
 * スタッフには全員ぶんの入力欄を、選手には自分の行だけを出す。
 * 記録会では次々に入れるので、1件ごとに保存ボタンは押させない。
 */
export default async function MeasurementEventPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  const sheet = await getEventSheet(session, id);
  if (!sheet) notFound();

  const staff = isStaff(session);

  // 選手には自分の行だけ。他人の記録はそもそも RLS で引けていない。
  const rows = staff ? sheet.members : sheet.members.filter((member) => member.id === session.teamMemberId);

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <Link href="/measurements" className="text-keio-700 dark:text-keio-300 underline">
          ← 測定へ戻る
        </Link>
      </p>

      <header>
        <h1 className="text-xl font-bold">{sheet.event.name}</h1>
        <p className="mt-1 text-sm text-[--color-muted]">{formatDateLabel(sheet.event.measured_on)}</p>
        {sheet.event.note ? <p className="mt-2 text-sm">{sheet.event.note}</p> : null}
      </header>

      {sheet.items.length === 0 ? (
        <Card>
          <EmptyState>
            測定項目がまだありません。
            {staff ? (
              <Link href="/measurements/new" className="ml-1 underline">
                項目を足す
              </Link>
            ) : null}
          </EmptyState>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState>この測定会に、あなたの記録欄はありません。</EmptyState>
        </Card>
      ) : (
        <Card>
          <CardHeader
            title="記録"
            description={
              staff
                ? '欄から離れると保存されます。空にすると記録を消します。'
                : '自分の記録です。欄から離れると保存されます。'
            }
          />

          <div className="space-y-4">
            {rows.map((member) => (
              <div key={member.id} className="border-b border-[--color-border] pb-4 last:border-0 last:pb-0">
                <p className="text-sm font-medium">{member.name}</p>

                <div className="mt-2 flex flex-wrap gap-4">
                  {sheet.items.map((item) => {
                    const result = sheet.resultByCell.get(`${member.id}:${item.id}`);
                    return (
                      <div key={item.id}>
                        <p className="mb-1 text-xs text-[--color-muted]">{item.name}</p>
                        <ResultCell
                          eventId={sheet.event.id}
                          itemId={item.id}
                          memberId={member.id}
                          defaultValue={result?.value === null ? null : (result?.value ?? null)}
                          unit={item.unit}
                          label={`${member.name}の${item.name}`}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {staff ? (
        <Card>
          <CardHeader title="入力の状況" />
          <ul className="space-y-1 text-sm">
            {sheet.items.map((item) => {
              const filled = sheet.members.filter((member) =>
                sheet.resultByCell.has(`${member.id}:${item.id}`),
              ).length;

              return (
                <li key={item.id} className="flex items-center justify-between gap-3">
                  <span>{item.name}</span>
                  <span className={filled === sheet.members.length ? 'text-emerald-700' : ''}>
                    {filled} / {sheet.members.length} 人
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-[--color-muted]">
            空欄は「測っていない」として扱います。0 は記録として残ります。
          </p>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="測定項目" />
        <ul className="space-y-1 text-sm">
          {sheet.items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3">
              <span>{item.name}</span>
              <span className="text-[--color-muted]">
                {item.unit ? `${item.unit} / ` : ''}
                {item.better === 'lower' ? '小さいほど良い' : '大きいほど良い'}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
