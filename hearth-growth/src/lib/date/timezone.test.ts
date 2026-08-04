import { describe, expect, it } from 'vitest';

import {
  addDays,
  calculateStreak,
  diffInDays,
  endOfDayUtc,
  formatDateLabel,
  getToday,
  getWeekStartDate,
  startOfDayUtc,
  toDateString,
} from './timezone';

describe('toDateString', () => {
  it('ユーザーのタイムゾーンで日付を決める', () => {
    // UTC では 8/4 だが、東京では 8/5 の朝
    const date = new Date('2026-08-04T23:30:00Z');
    expect(toDateString(date, 'Asia/Tokyo')).toBe('2026-08-05');
    expect(toDateString(date, 'UTC')).toBe('2026-08-04');
    expect(toDateString(date, 'America/New_York')).toBe('2026-08-04');
  });

  it('深夜0時をまたぐ境界を取り違えない', () => {
    // 東京の 8/5 00:00 ちょうど
    expect(toDateString(new Date('2026-08-04T15:00:00Z'), 'Asia/Tokyo')).toBe('2026-08-05');
    // その1ミリ秒前はまだ 8/4
    expect(toDateString(new Date('2026-08-04T14:59:59.999Z'), 'Asia/Tokyo')).toBe('2026-08-04');
  });
});

describe('startOfDayUtc / endOfDayUtc', () => {
  it('東京の1日は UTC の 15:00 から始まる', () => {
    expect(startOfDayUtc('2026-08-05', 'Asia/Tokyo').toISOString()).toBe('2026-08-04T15:00:00.000Z');
    expect(endOfDayUtc('2026-08-05', 'Asia/Tokyo').toISOString()).toBe('2026-08-05T15:00:00.000Z');
  });

  it('夏時間のある地域でもずれない', () => {
    // ニューヨークは夏時間中 UTC-4
    expect(startOfDayUtc('2026-08-05', 'America/New_York').toISOString()).toBe('2026-08-05T04:00:00.000Z');
    // 冬時間は UTC-5
    expect(startOfDayUtc('2026-01-05', 'America/New_York').toISOString()).toBe('2026-01-05T05:00:00.000Z');
  });

  it('夏時間の切り替え当日でもその日の始まりを正しく返す', () => {
    // 2026-03-08 が米国の夏時間開始日（02:00 → 03:00）
    expect(startOfDayUtc('2026-03-08', 'America/New_York').toISOString()).toBe('2026-03-08T05:00:00.000Z');
    // 切り替え日は23時間しかない
    const start = startOfDayUtc('2026-03-08', 'America/New_York').getTime();
    const end = endOfDayUtc('2026-03-08', 'America/New_York').getTime();
    expect((end - start) / 3_600_000).toBe(23);
  });
});

describe('getWeekStartDate', () => {
  it('週の始まりは月曜日', () => {
    expect(getWeekStartDate('2026-08-05')).toBe('2026-08-03'); // 水 → 月
    expect(getWeekStartDate('2026-08-03')).toBe('2026-08-03'); // 月 → そのまま
  });

  it('日曜日は前週の月曜に戻る', () => {
    expect(getWeekStartDate('2026-08-09')).toBe('2026-08-03');
  });

  it('月をまたぐ週も扱える', () => {
    expect(getWeekStartDate('2026-08-01')).toBe('2026-07-27');
  });
});

describe('addDays / diffInDays', () => {
  it('月末と年末をまたげる', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('うるう年を扱える', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('日数差を返す', () => {
    expect(diffInDays('2026-08-05', '2026-08-01')).toBe(4);
    expect(diffInDays('2026-08-01', '2026-08-05')).toBe(-4);
  });
});

describe('calculateStreak', () => {
  it('今日から連続している日数を数える', () => {
    const dates = ['2026-08-04', '2026-08-03', '2026-08-02'];
    expect(calculateStreak(dates, '2026-08-04')).toBe(3);
  });

  it('今日まだ記録が無くても、昨日まで続いていれば途切れない', () => {
    const dates = ['2026-08-03', '2026-08-02'];
    expect(calculateStreak(dates, '2026-08-04')).toBe(2);
  });

  it('2日以上空いていたら0', () => {
    expect(calculateStreak(['2026-08-01'], '2026-08-04')).toBe(0);
  });

  it('記録が無ければ0', () => {
    expect(calculateStreak([], '2026-08-04')).toBe(0);
  });

  it('間が抜けている日で止まる', () => {
    const dates = ['2026-08-04', '2026-08-03', '2026-08-01'];
    expect(calculateStreak(dates, '2026-08-04')).toBe(2);
  });
});

describe('getToday', () => {
  it('タイムゾーンごとに今日が変わる', () => {
    const now = new Date('2026-08-04T22:00:00Z');
    expect(getToday('Asia/Tokyo', now)).toBe('2026-08-05');
    expect(getToday('UTC', now)).toBe('2026-08-04');
  });
});

describe('formatDateLabel', () => {
  it('曜日つきで表示する', () => {
    expect(formatDateLabel('2026-08-04')).toBe('8月4日(火)');
  });
});
