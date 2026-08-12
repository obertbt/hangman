import type { Metadata } from 'next';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, EmptyState } from '@/components/ui/card';
import { ProgressChart } from '@/features/measurement/components/progress-chart';
import { formatDelta, formatValue, TREND_LABELS, type Trend } from '@/features/measurement/lib/progress';
import { getProgress, listMeasurementEvents } from '@/features/measurement/queries';
import { isStaff, requireSession } from '@/lib/auth/session';
import { formatDateLabel } from '@/lib/datetime';

export const metadata: Metadata = { title: '測定' };

/**
 * 自分の記録の推移（3章の6: 過去から現在までの成長を確認できる）。
 *
 * 数字の一覧ではなく「良くなったのか」を先に出す。
 * 項目によって良い方向が逆なので、増減ではなく言葉で伝える。
 */
export default async function MeasurementsPage() {
  const session = await requireSession();
  const staff = isStaff(session);

  const [progress, events] = await Promise.all([getProgress(session), listMeasurementEvents(session, 10)]);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold">測定</h1>
        <p className="mt-1 text-sm text-[--color-muted]">
          {staff
            ? '測定会の記録と、選手それぞれの伸びを見られます。'
            : '自分の記録の伸びです。数字が積み上がると、続けてきたことが形になります。'}
        </p>
      </header>

      {progress.length === 0 ? (
        <Card>
          <CardHeader title="自分の記録" />
          <EmptyState>
            まだ記録がありません。
            {staff ? '測定会を作って記録を入れると、ここに推移が出ます。' : '測定会の後に出てきます。'}
          </EmptyState>
        </Card>
      ) : (
        progress.map(({ item, series, best, change }) => {
          const latest = series[series.length - 1];
          if (!latest) return null;

          return (
            <Card key={item.id}>
              <CardHeader
                title={item.name}
                description={item.better === 'lower' ? '小さいほど良い項目' : '大きいほど良い項目'}
                action={<Badge tone={toneFor(latest.trend)}>{TREND_LABELS[latest.trend]}</Badge>}
              />

              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <p className="text-2xl font-bold">{formatValue(latest.value, item.unit)}</p>
                {latest.delta !== null ? (
                  <p className={`text-sm ${textToneFor(latest.trend)}`}>
                    前回比 {formatDelta(latest.delta, item.unit)}
                  </p>
                ) : null}
                {best !== null ? (
                  <p className="text-sm text-[--color-muted]">
                    自己ベスト {formatValue(best, item.unit)}
                    {latest.isBest ? '（今回更新）' : ''}
                  </p>
                ) : null}
              </div>

              <ProgressChart series={series} better={item.better} unit={item.unit} label={item.name} />

              {change !== null ? (
                <p className="mt-2 text-sm">はじめの記録から {formatDelta(change, item.unit)}</p>
              ) : null}

              <details className="mt-3">
                <summary className="cursor-pointer text-sm text-[--color-muted]">
                  記録をすべて見る（{series.length}件）
                </summary>
                <ul className="mt-2 space-y-1 text-sm">
                  {[...series].reverse().map((point) => (
                    <li
                      key={`${point.measuredOn}-${point.value}`}
                      className="flex items-center justify-between gap-3"
                    >
                      <span className="text-[--color-muted]">{formatDateLabel(point.measuredOn)}</span>
                      <span className="flex items-center gap-2">
                        {point.isBest ? <Badge tone="success">ベスト</Badge> : null}
                        {formatValue(point.value, item.unit)}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            </Card>
          );
        })
      )}

      <Card>
        <CardHeader
          title="測定会"
          description={staff ? '記録を入れる場所です。' : '直近の測定会です。'}
          action={
            staff ? (
              <Link href="/measurements/new" className="text-keio-700 dark:text-keio-300 text-sm underline">
                新しく作る
              </Link>
            ) : undefined
          }
        />
        {events.length === 0 ? (
          <EmptyState>測定会はまだありません。</EmptyState>
        ) : (
          <ul className="divide-y divide-[--color-border]">
            {events.map((event) => (
              <li key={event.id} className="py-3">
                <Link href={`/measurements/${event.id}`} className="block">
                  <p className="text-sm font-medium">{event.name}</p>
                  <p className="mt-1 text-xs text-[--color-muted]">{formatDateLabel(event.measured_on)}</p>
                  {event.note ? <p className="mt-1 text-sm">{event.note}</p> : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function toneFor(trend: Trend): 'success' | 'warning' | 'neutral' | 'info' {
  switch (trend) {
    case 'improved':
      return 'success';
    case 'worse':
      return 'warning';
    case 'first':
      return 'info';
    default:
      return 'neutral';
  }
}

function textToneFor(trend: Trend): string {
  switch (trend) {
    case 'improved':
      return 'text-emerald-700 dark:text-emerald-400';
    case 'worse':
      return 'text-amber-700 dark:text-amber-400';
    default:
      return 'text-[--color-muted]';
  }
}
