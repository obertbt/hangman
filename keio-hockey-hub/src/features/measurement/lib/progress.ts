/**
 * 測定結果の見かた（依頼書3章の6: 過去から現在までの成長を確認できる）。
 *
 * ここは DB もネットワークも触らない。
 * 「良くなったのか」「自己ベストか」「どう伸びてきたか」を1か所にまとめ、
 * テストで固める。
 *
 * いちばん気をつけるのは **項目によって良い方向が逆**なこと。
 * 50m走は小さいほど良く、YoYoテストは大きいほど良い。
 * 数字の増減だけを見せると、速くなったのに「下がった」と読めてしまう。
 */

export type Better = 'higher' | 'lower';

export type Trend =
  /** 前回より良くなった */
  | 'improved'
  /** 前回より落ちた */
  | 'worse'
  /** 変わらない */
  | 'same'
  /** 比べる相手がいない（初回） */
  | 'first';

export interface MeasurementPoint {
  /** 'YYYY-MM-DD'（Asia/Tokyo）。 */
  measuredOn: string;
  value: number;
}

export interface SeriesPoint extends MeasurementPoint {
  /** 前回との差（現在 − 前回）。初回は null。 */
  delta: number | null;
  trend: Trend;
  /** その時点までで自己ベストか。 */
  isBest: boolean;
}

/** 2つの値を比べる。良い方向は項目ごとに違う。 */
export function compareValues(previous: number, current: number, better: Better): Trend {
  if (current === previous) return 'same';
  const rose = current > previous;
  return (better === 'higher') === rose ? 'improved' : 'worse';
}

/**
 * 記録の並びに、前回比と自己ベストを足す。
 *
 * 日付順に並べ直してから見る。入力の順番は当てにしない。
 * 同じ日に2件ある場合は、渡された順を保つ（安定ソート）。
 */
export function buildSeries(points: MeasurementPoint[], better: Better): SeriesPoint[] {
  const sorted = [...points].sort((left, right) => left.measuredOn.localeCompare(right.measuredOn));

  let best: number | null = null;
  const result: SeriesPoint[] = [];

  for (const [index, point] of sorted.entries()) {
    const previous = index === 0 ? null : (sorted[index - 1]?.value ?? null);

    // 初回は「その時点での自己ベスト」。比べる相手がいないので当然そうなる。
    const isBest = best === null || compareValues(best, point.value, better) === 'improved';
    if (isBest) best = point.value;

    result.push({
      ...point,
      delta: previous === null ? null : point.value - previous,
      trend: previous === null ? 'first' : compareValues(previous, point.value, better),
      isBest,
    });
  }

  return result;
}

/** 全期間の自己ベスト。記録が無ければ null。 */
export function bestValue(points: MeasurementPoint[], better: Better): number | null {
  let best: number | null = null;
  for (const point of points) {
    if (best === null || compareValues(best, point.value, better) === 'improved') {
      best = point.value;
    }
  }
  return best;
}

/** 最初から最後までで、どれだけ良くなったか。記録が2件未満なら null。 */
export function totalChange(points: MeasurementPoint[]): number | null {
  if (points.length < 2) return null;
  const sorted = [...points].sort((left, right) => left.measuredOn.localeCompare(right.measuredOn));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return null;
  return last.value - first.value;
}

/** 画面に出す言葉。数字の増減ではなく「良くなったか」で書く。 */
export const TREND_LABELS: Record<Trend, string> = {
  improved: '前回より良い',
  worse: '前回より落ちた',
  same: '前回と同じ',
  first: 'はじめての記録',
};

/**
 * 差の書き方。
 *
 * 符号はそのまま出す（0.2 秒縮んだなら −0.2）。
 * ごまかすと、あとで元の数字と突き合わせたときに混乱する。
 * 良し悪しは言葉と色で伝える。
 */
export function formatDelta(delta: number | null, unit: string | null): string {
  if (delta === null) return '';
  if (delta === 0) return `±0${unit ?? ''}`;

  // 小数の誤差で「-0.30000000000000004」と出さない
  const rounded = Math.round(delta * 1000) / 1000;
  const sign = rounded > 0 ? '+' : '−';
  return `${sign}${Math.abs(rounded)}${unit ?? ''}`;
}

/** 値そのものの書き方。整数はそのまま、小数は余分な0を落とす。 */
export function formatValue(value: number, unit: string | null): string {
  const rounded = Math.round(value * 1000) / 1000;
  return `${rounded}${unit ?? ''}`;
}

// -------------------------------------------------------------
// 折れ線（外部ライブラリを足さずに描く）
// -------------------------------------------------------------

/**
 * SVG の線にする。
 *
 * グラフ用のライブラリを入れていないのは、
 * 「特定のものへの依存を増やさない」（3章の10）ため。
 * 折れ線1本にライブラリは要らない。
 *
 * 上下の向きは **良い方向が常に上**になるようにする。
 * 50m走で速くなったのに線が下がると、直感と食い違う。
 */
export interface ChartGeometry {
  /** `<path d="...">` に入れる文字列。点が1つ以下なら空。 */
  path: string;
  /** 丸を打つ位置。 */
  points: { x: number; y: number; value: number; measuredOn: string; isBest: boolean }[];
}

export function buildChart(
  series: SeriesPoint[],
  better: Better,
  size: { width: number; height: number; padding: number } = { width: 320, height: 120, padding: 8 },
): ChartGeometry {
  if (series.length === 0) return { path: '', points: [] };

  const values = series.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;

  const innerWidth = size.width - size.padding * 2;
  const innerHeight = size.height - size.padding * 2;

  const points = series.map((point, index) => {
    // 点が1つだけなら真ん中に置く（0除算を避ける）
    const ratioX = series.length === 1 ? 0.5 : index / (series.length - 1);

    // 値が全部同じなら真ん中。線は水平になる。
    const ratioValue = span === 0 ? 0.5 : (point.value - min) / span;
    // 良い方向を上に向ける
    const ratioY = better === 'higher' ? 1 - ratioValue : ratioValue;

    return {
      x: size.padding + ratioX * innerWidth,
      y: size.padding + ratioY * innerHeight,
      value: point.value,
      measuredOn: point.measuredOn,
      isBest: point.isBest,
    };
  });

  const path =
    points.length < 2
      ? ''
      : points
          .map((point, index) => `${index === 0 ? 'M' : 'L'}${round(point.x)},${round(point.y)}`)
          .join(' ');

  return { path, points };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
