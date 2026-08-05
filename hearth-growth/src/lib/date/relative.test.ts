import { describe, expect, it } from 'vitest';

import { formatRelativeTime } from './relative';

const now = new Date('2026-08-05T12:00:00Z');
const options = { now, timeZone: 'Asia/Tokyo' };

describe('formatRelativeTime', () => {
  it('1分未満はまとめて「たった今」', () => {
    expect(formatRelativeTime('2026-08-05T11:59:30Z', options)).toBe('たった今');
    expect(formatRelativeTime('2026-08-05T12:00:00Z', options)).toBe('たった今');
  });

  it('端末の時計が進んでいても負の時間を出さない', () => {
    expect(formatRelativeTime('2026-08-05T12:00:30Z', options)).toBe('たった今');
  });

  it('1時間未満は分', () => {
    expect(formatRelativeTime('2026-08-05T11:57:00Z', options)).toBe('3分前');
    expect(formatRelativeTime('2026-08-05T11:01:00Z', options)).toBe('59分前');
  });

  it('24時間未満は時間', () => {
    expect(formatRelativeTime('2026-08-05T10:00:00Z', options)).toBe('2時間前');
  });

  it('1週間未満は日', () => {
    expect(formatRelativeTime('2026-08-03T12:00:00Z', options)).toBe('2日前');
  });

  it('1週間以上前は日付にする', () => {
    expect(formatRelativeTime('2026-07-20T12:00:00Z', options)).toBe('7月20日');
  });

  it('年をまたぐと年も出す', () => {
    expect(formatRelativeTime('2025-12-20T12:00:00Z', options)).toBe('2025年12月20日');
  });

  it('日付はユーザーのタイムゾーンで決まる', () => {
    // UTC では 7/20 だが、東京では 7/21
    expect(formatRelativeTime('2026-07-20T16:00:00Z', { now, timeZone: 'Asia/Tokyo' })).toBe('7月21日');
    expect(formatRelativeTime('2026-07-20T16:00:00Z', { now, timeZone: 'UTC' })).toBe('7月20日');
  });
});
