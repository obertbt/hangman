import { describe, expect, it } from 'vitest';

import { formatTimeOfDay, formatTimeRange, nextOccurrenceOf } from './time-of-day';

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

describe('nextOccurrenceOf', () => {
  const tz = 'Asia/Tokyo';

  it('まだ今日のうちなら今日を指す', () => {
    // 2026-08-11 10:00 JST に「22:00」→ 同日 22:00 JST
    const now = new Date('2026-08-11T01:00:00Z');
    expect(nextOccurrenceOf('22:00', tz, now).toISOString()).toBe('2026-08-11T13:00:00.000Z');
  });

  /** 就寝ではこちらが普通。23:30 に「7:00」と入れたら翌朝。 */
  it('過ぎていれば翌日を指す', () => {
    // 2026-08-11 23:30 JST = 14:30Z
    const now = new Date('2026-08-11T14:30:00Z');
    // 翌 2026-08-12 07:00 JST = 2026-08-11T22:00Z
    expect(nextOccurrenceOf('07:00', tz, now).toISOString()).toBe('2026-08-11T22:00:00.000Z');
  });

  it('ちょうど同じ時刻なら翌日にする', () => {
    // すぐ通知が飛ぶのを避ける
    const now = new Date('2026-08-11T22:00:00Z'); // 8/12 07:00 JST
    expect(nextOccurrenceOf('07:00', tz, now).toISOString()).toBe('2026-08-12T22:00:00.000Z');
  });

  it('タイムゾーンを見て決める', () => {
    const now = new Date('2026-08-11T14:30:00Z');
    // UTC では 11日 14:30。まだ 22:00 は来ていないので同日。
    expect(nextOccurrenceOf('22:00', 'UTC', now).toISOString()).toBe('2026-08-11T22:00:00.000Z');
  });

  it('形式が違えば例外にする', () => {
    expect(() => nextOccurrenceOf('あさ', tz)).toThrow();
  });
});
