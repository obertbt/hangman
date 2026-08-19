import { describe, expect, it } from 'vitest';

import { formatTimeOfDay, formatTimeRange } from './time-of-day';

describe('formatTimeOfDay', () => {
  it('ユーザーのタイムゾーンで時刻を出す', () => {
    // 14:30 UTC = 23:30 JST
    expect(formatTimeOfDay('2026-08-11T14:30:00Z', 'Asia/Tokyo')).toBe('23:30');
    expect(formatTimeOfDay('2026-08-11T14:30:00Z', 'UTC')).toBe('14:30');
  });

  it('分は2桁でそろえる', () => {
    expect(formatTimeOfDay('2026-08-11T22:05:00Z', 'UTC')).toBe('22:05');
  });

  it('深夜0時台を24時と書かない', () => {
    expect(formatTimeOfDay('2026-08-11T15:10:00Z', 'Asia/Tokyo')).toBe('0:10');
  });
});

describe('formatTimeRange', () => {
  it('同じ日なら時刻だけを並べる', () => {
    expect(formatTimeRange('2026-08-11T12:00:00Z', '2026-08-11T13:30:00Z', 'Asia/Tokyo')).toBe(
      '21:00 → 22:30',
    );
  });

  /**
   * 睡眠はここが本題。
   * 「23:30 → 7:05」だけだと 7時間半か 16時間半か読み取れない。
   */
  it('日をまたいだら「翌」を添える', () => {
    // 23:30 JST → 翌 7:05 JST
    expect(formatTimeRange('2026-08-11T14:30:00Z', '2026-08-11T22:05:00Z', 'Asia/Tokyo')).toBe(
      '23:30 → 翌7:05',
    );
  });

  it('2日以上あいたら日付を出す', () => {
    expect(formatTimeRange('2026-08-11T14:30:00Z', '2026-08-12T22:05:00Z', 'Asia/Tokyo')).toBe(
      '23:30 → 8月13日 7:05',
    );
  });

  it('タイムゾーンによって「翌」かどうかが変わる', () => {
    // 同じ瞬間でも、UTC では日付をまたがない
    expect(formatTimeRange('2026-08-11T14:30:00Z', '2026-08-11T22:05:00Z', 'UTC')).toBe('14:30 → 22:05');
  });
});
