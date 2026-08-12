import type { Metadata } from 'next';
import Link from 'next/link';
import { Check, Minus } from 'lucide-react';

import { Card, CardHeader, EmptyState } from '@/components/ui/card';
import { getSubmissionStatus } from '@/features/daily/queries';
import { listEventsOnDate } from '@/features/timeline/queries';
import { requirePermission } from '@/lib/auth/session';
import { formatDateLabel, todayInTokyo } from '@/lib/datetime';

export const metadata: Metadata = { title: '提出状況' };

/**
 * コーチ向けの提出状況（12章）。
 *
 * 見落としを減らすことが目的なので、
 * 「出している人」ではなく「出していない人」が上に来るようにしている。
 */
export default async function SubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await requirePermission('report.view_all');
  const { date: dateParam } = await searchParams;

  // 日付は 'YYYY-MM-DD' の形だけを受ける
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : todayInTokyo();

  const [rows, events] = await Promise.all([
    getSubmissionStatus(session.teamId, date),
    listEventsOnDate(session.teamId, date),
  ]);

  const missingCondition = rows.filter((row) => !row.hasCondition);
  const missingReport = rows.filter((row) => !row.hasReport);
  const missingTraining = rows.filter((row) => !row.hasTraining);

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <Link href="/today" className="text-keio-700 dark:text-keio-300 underline">
          ← 今日へ戻る
        </Link>
      </p>

      <header>
        <p className="text-xs text-[--color-muted]">{formatDateLabel(date)}</p>
        <h1 className="mt-1 text-xl font-bold">提出状況</h1>
        {events.length > 0 ? (
          <p className="mt-1 text-sm text-[--color-muted]">
            {events.map((event) => event.title).join(' / ')}
          </p>
        ) : (
          <p className="mt-1 text-sm text-[--color-muted]">この日の予定は登録されていません。</p>
        )}
      </header>

      <form className="flex items-end gap-2">
        <div className="flex-1">
          <label htmlFor="date" className="block text-sm font-medium">
            日付を変える
          </label>
          <input
            id="date"
            name="date"
            type="date"
            defaultValue={date}
            className="mt-1.5 w-full rounded-lg border border-[--color-border] bg-[--color-surface] px-3 py-2.5 text-sm"
          />
        </div>
        <button type="submit" className="bg-keio-700 min-h-11 rounded-lg px-4 text-sm font-medium text-white">
          表示
        </button>
      </form>

      <div className="grid grid-cols-3 gap-2 text-center">
        <SummaryCell label="コンディション未入力" value={missingCondition.length} total={rows.length} />
        <SummaryCell label="日報未提出" value={missingReport.length} total={rows.length} />
        <SummaryCell label="トレーニング未入力" value={missingTraining.length} total={rows.length} />
      </div>

      <Card>
        <CardHeader title="選手ごとの状況" description="出していない人を上に並べています" />
        {rows.length === 0 ? (
          <EmptyState>在籍中の選手が登録されていません。</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[--color-muted]">
                  <th className="pb-2">選手</th>
                  <th className="pb-2 text-center">コンディション</th>
                  <th className="pb-2 text-center">日報</th>
                  <th className="pb-2 text-center">トレーニング</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.teamMemberId} className="border-t border-[--color-border]">
                    <td className="py-2.5 pr-2">{row.name}</td>
                    <td className="py-2.5 text-center">
                      <StatusMark done={row.hasCondition} />
                    </td>
                    <td className="py-2.5 text-center">
                      <StatusMark done={row.hasReport} />
                    </td>
                    <td className="py-2.5 text-center">
                      <StatusMark done={row.hasTraining} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-xs text-[--color-muted]">
        日報の中身は、公開範囲が「コーチまで」以上のものだけが見られます。
        「自分だけ」にしている日報は、提出済みでもコーチには表示されません。
      </p>
    </div>
  );
}

function StatusMark({ done }: { done: boolean }) {
  return done ? (
    <span className="inline-flex text-emerald-600" title="提出済み">
      <Check size={18} aria-label="提出済み" />
    </span>
  ) : (
    <span className="inline-flex text-[--color-muted]" title="未提出">
      <Minus size={18} aria-label="未提出" />
    </span>
  );
}

function SummaryCell({ label, value, total }: { label: string; value: number; total: number }) {
  return (
    <div className="rounded-lg border border-[--color-border] bg-[--color-surface] px-2 py-3">
      <p className="text-[11px] text-[--color-muted]">{label}</p>
      <p className={`text-xl font-semibold ${value > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
        {value}
        <span className="ml-1 text-xs font-normal text-[--color-muted]">/ {total}</span>
      </p>
    </div>
  );
}
