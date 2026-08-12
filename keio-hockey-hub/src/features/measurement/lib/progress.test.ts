import { describe, expect, it } from 'vitest';

import {
  bestValue,
  buildChart,
  buildSeries,
  compareValues,
  formatDelta,
  formatValue,
  totalChange,
  type MeasurementPoint,
} from './progress';

/**
 * 測定結果の見かた（3章の6）。
 *
 * ここが狂うと「速くなったのに落ちたと表示される」が起きる。
 * 記録は本人の努力の証拠なので、間違って伝えるのがいちばん困る。
 */

// 50m走: 小さいほど速い
const SPRINT: MeasurementPoint[] = [
  { measuredOn: '2026-04-01', value: 8.2 },
  { measuredOn: '2026-06-01', value: 8.0 },
  { measuredOn: '2026-08-01', value: 8.1 },
];

// YoYoテスト: 大きいほど良い
const YOYO: MeasurementPoint[] = [
  { measuredOn: '2026-04-01', value: 12 },
  { measuredOn: '2026-06-01', value: 14 },
  { measuredOn: '2026-08-01', value: 13 },
];

describe('良い方向は項目ごとに違う', () => {
  it('小さいほど良い項目では、減ったら良くなった', () => {
    expect(compareValues(8.2, 8.0, 'lower')).toBe('improved');
    expect(compareValues(8.0, 8.2, 'lower')).toBe('worse');
  });

  it('大きいほど良い項目では、増えたら良くなった', () => {
    expect(compareValues(12, 14, 'higher')).toBe('improved');
    expect(compareValues(14, 12, 'higher')).toBe('worse');
  });

  it('同じなら same', () => {
    expect(compareValues(8, 8, 'lower')).toBe('same');
    expect(compareValues(8, 8, 'higher')).toBe('same');
  });
});

describe('記録の並び', () => {
  it('前回比と自己ベストが付く（小さいほど良い）', () => {
    const series = buildSeries(SPRINT, 'lower');

    expect(series[0]?.trend).toBe('first');
    expect(series[0]?.delta).toBeNull();
    expect(series[0]?.isBest).toBe(true);

    expect(series[1]?.trend).toBe('improved');
    expect(series[1]?.delta).toBeCloseTo(-0.2);
    expect(series[1]?.isBest).toBe(true);

    // 8.1 は 8.0 より遅いので、ベストではない
    expect(series[2]?.trend).toBe('worse');
    expect(series[2]?.isBest).toBe(false);
  });

  it('前回比と自己ベストが付く（大きいほど良い）', () => {
    const series = buildSeries(YOYO, 'higher');

    expect(series[1]?.trend).toBe('improved');
    expect(series[1]?.delta).toBe(2);
    expect(series[1]?.isBest).toBe(true);

    expect(series[2]?.trend).toBe('worse');
    expect(series[2]?.isBest).toBe(false);
  });

  it('入力の順番が日付順でなくても並べ直す', () => {
    const shuffled = [SPRINT[2]!, SPRINT[0]!, SPRINT[1]!];
    const series = buildSeries(shuffled, 'lower');

    expect(series.map((point) => point.measuredOn)).toEqual(['2026-04-01', '2026-06-01', '2026-08-01']);
  });

  it('記録が1件でも壊れない', () => {
    const series = buildSeries([{ measuredOn: '2026-04-01', value: 8.2 }], 'lower');
    expect(series).toHaveLength(1);
    expect(series[0]?.trend).toBe('first');
    expect(series[0]?.isBest).toBe(true);
  });

  it('記録が無ければ空', () => {
    expect(buildSeries([], 'lower')).toEqual([]);
  });

  it('同じ値が続いても、最初のほうをベストのままにする', () => {
    const series = buildSeries(
      [
        { measuredOn: '2026-04-01', value: 8.0 },
        { measuredOn: '2026-06-01', value: 8.0 },
      ],
      'lower',
    );
    expect(series[0]?.isBest).toBe(true);
    // 同じ値は「更新」ではない
    expect(series[1]?.isBest).toBe(false);
    expect(series[1]?.trend).toBe('same');
  });
});

describe('自己ベスト', () => {
  it('小さいほど良い項目では最小値', () => {
    expect(bestValue(SPRINT, 'lower')).toBe(8.0);
  });

  it('大きいほど良い項目では最大値', () => {
    expect(bestValue(YOYO, 'higher')).toBe(14);
  });

  it('記録が無ければ null', () => {
    expect(bestValue([], 'lower')).toBeNull();
  });
});

describe('通しての変化', () => {
  it('最初から最後までの差', () => {
    expect(totalChange(SPRINT)).toBeCloseTo(-0.1);
    expect(totalChange(YOYO)).toBe(1);
  });

  it('1件だけなら比べられない', () => {
    expect(totalChange([{ measuredOn: '2026-04-01', value: 8.2 }])).toBeNull();
  });
});

describe('表示', () => {
  it('符号はごまかさない', () => {
    // 速くなった（−0.2秒）ことは、言葉と色で伝える。数字はそのまま。
    expect(formatDelta(-0.2, '秒')).toBe('−0.2秒');
    expect(formatDelta(2, 'level')).toBe('+2level');
  });

  it('差が無ければ ±0', () => {
    expect(formatDelta(0, '秒')).toBe('±0秒');
  });

  it('初回は何も出さない', () => {
    expect(formatDelta(null, '秒')).toBe('');
  });

  it('小数の誤差を持ち込まない', () => {
    // 8.1 - 8.2 は -0.09999999999999964 になる
    expect(formatDelta(8.1 - 8.2, '秒')).toBe('−0.1秒');
  });

  it('単位が無くても出せる', () => {
    expect(formatValue(12, null)).toBe('12');
    expect(formatValue(8.5, '秒')).toBe('8.5秒');
  });
});

describe('折れ線', () => {
  const size = { width: 100, height: 100, padding: 0 };

  it('良い方向が常に上になる（小さいほど良い項目）', () => {
    const series = buildSeries(
      [
        { measuredOn: '2026-04-01', value: 9 },
        { measuredOn: '2026-06-01', value: 8 },
      ],
      'lower',
    );
    const chart = buildChart(series, 'lower', size);

    // 8秒（速い）のほうが上＝y が小さい
    expect(chart.points[1]!.y).toBeLessThan(chart.points[0]!.y);
  });

  it('良い方向が常に上になる（大きいほど良い項目）', () => {
    const series = buildSeries(
      [
        { measuredOn: '2026-04-01', value: 12 },
        { measuredOn: '2026-06-01', value: 14 },
      ],
      'higher',
    );
    const chart = buildChart(series, 'higher', size);

    expect(chart.points[1]!.y).toBeLessThan(chart.points[0]!.y);
  });

  it('横は等間隔に置く', () => {
    const series = buildSeries(SPRINT, 'lower');
    const chart = buildChart(series, 'lower', size);

    expect(chart.points.map((point) => point.x)).toEqual([0, 50, 100]);
  });

  it('値が全部同じなら水平になる', () => {
    const series = buildSeries(
      [
        { measuredOn: '2026-04-01', value: 8 },
        { measuredOn: '2026-06-01', value: 8 },
      ],
      'lower',
    );
    const chart = buildChart(series, 'lower', size);

    expect(chart.points[0]!.y).toBe(chart.points[1]!.y);
  });

  it('点が1つなら線は引かない', () => {
    const series = buildSeries([{ measuredOn: '2026-04-01', value: 8 }], 'lower');
    const chart = buildChart(series, 'lower', size);

    expect(chart.path).toBe('');
    expect(chart.points).toHaveLength(1);
    // 真ん中に置く
    expect(chart.points[0]!.x).toBe(50);
  });

  it('記録が無ければ何も描かない', () => {
    expect(buildChart([], 'lower', size)).toEqual({ path: '', points: [] });
  });

  it('線は M から始まって L でつなぐ', () => {
    const series = buildSeries(SPRINT, 'lower');
    const chart = buildChart(series, 'lower', size);

    expect(chart.path.startsWith('M')).toBe(true);
    expect(chart.path.split(' ')).toHaveLength(3);
  });
});
