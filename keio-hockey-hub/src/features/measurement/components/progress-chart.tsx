import { buildChart, formatValue, type Better, type SeriesPoint } from '@/features/measurement/lib/progress';
import { formatDateLabel } from '@/lib/datetime';

/**
 * 記録の推移（3章の6）。
 *
 * グラフ用のライブラリは入れていない。折れ線1本に依存を増やさない（3章の10）。
 * 色は `currentColor` に寄せて、明るい配色でも暗い配色でも読めるようにする。
 *
 * **良い方向が常に上**になる。50m走で速くなったのに線が下がると、直感と食い違う。
 */
export function ProgressChart({
  series,
  better,
  unit,
  label,
}: {
  series: SeriesPoint[];
  better: Better;
  unit: string | null;
  label: string;
}) {
  const width = 320;
  const height = 120;
  const chart = buildChart(series, better, { width, height, padding: 12 });

  if (chart.points.length === 0) return null;

  const first = series[0];
  const last = series[series.length - 1];

  return (
    <figure className="mt-2">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="text-keio-600 dark:text-keio-300 h-auto w-full"
        role="img"
        aria-label={`${label}の推移。${series.length}件の記録。`}
        preserveAspectRatio="none"
      >
        {chart.path ? (
          <path
            d={chart.path}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}

        {chart.points.map((point) => (
          <circle
            key={`${point.measuredOn}-${point.value}`}
            cx={point.x}
            cy={point.y}
            r={point.isBest ? 5 : 3.5}
            // 自己ベストだけ塗りつぶす。どこが一番良かったか一目で分かる。
            fill={point.isBest ? 'currentColor' : 'var(--color-surface)'}
            stroke="currentColor"
            strokeWidth={2}
          />
        ))}
      </svg>

      <figcaption className="mt-1 flex justify-between text-xs text-[--color-muted]">
        <span>{first ? `${formatDateLabel(first.measuredOn)} ${formatValue(first.value, unit)}` : ''}</span>
        <span>
          {last && series.length > 1
            ? `${formatDateLabel(last.measuredOn)} ${formatValue(last.value, unit)}`
            : ''}
        </span>
      </figcaption>
    </figure>
  );
}
