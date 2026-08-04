import { describe, expect, it } from 'vitest';

import {
  calculateDurationSeconds,
  calculateElapsedSeconds,
  formatClock,
  formatDuration,
  isStaleSession,
} from './duration';

describe('formatDuration', () => {
  it('1時間未満は分だけを出す', () => {
    expect(formatDuration(12 * 60)).toBe('12分');
    expect(formatDuration(45 * 60)).toBe('45分');
  });

  it('1時間以上は時間と分を出す', () => {
    expect(formatDuration(85 * 60)).toBe('1時間25分');
  });

  it('ちょうどの時間は分を省く', () => {
    expect(formatDuration(2 * 3600)).toBe('2時間');
  });

  it('端数の秒は切り捨てる', () => {
    expect(formatDuration(59)).toBe('0分');
    expect(formatDuration(119)).toBe('1分');
  });

  it('負の値でも壊れない', () => {
    expect(formatDuration(-100)).toBe('0分');
  });
});

describe('formatClock', () => {
  it('1時間未満は mm:ss', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(65)).toBe('01:05');
  });

  it('1時間以上は h:mm:ss', () => {
    expect(formatClock(3661)).toBe('1:01:01');
  });
});

describe('calculateElapsedSeconds', () => {
  const startedAt = new Date('2026-08-04T09:00:00Z');

  it('開始時刻と現在時刻の差から求める', () => {
    const now = new Date('2026-08-04T09:30:00Z');
    expect(calculateElapsedSeconds({ startedAt, now })).toBe(1800);
  });

  it('累計停止時間を差し引く', () => {
    const now = new Date('2026-08-04T09:30:00Z');
    expect(calculateElapsedSeconds({ startedAt, totalPausedSeconds: 600, now })).toBe(1200);
  });

  it('一時停止中は停止した時刻で止まる', () => {
    const elapsed = calculateElapsedSeconds({
      startedAt,
      pausedAt: new Date('2026-08-04T09:10:00Z'),
      now: new Date('2026-08-04T23:00:00Z'),
    });
    expect(elapsed).toBe(600);
  });

  it('ブラウザを閉じている間も時間は進む（開始時刻から再計算できる）', () => {
    const afterReload = calculateElapsedSeconds({
      startedAt: '2026-08-04T09:00:00Z',
      now: new Date('2026-08-04T11:00:00Z'),
    });
    expect(afterReload).toBe(7200);
  });

  it('端末の時計がずれて過去を指しても負にならない', () => {
    expect(calculateElapsedSeconds({ startedAt, now: new Date('2026-08-04T08:00:00Z') })).toBe(0);
  });
});

describe('calculateDurationSeconds', () => {
  it('終了 - 開始 - 累計停止時間', () => {
    expect(calculateDurationSeconds('2026-08-04T09:00:00Z', '2026-08-04T11:00:00Z', 900)).toBe(6300);
  });

  it('停止時間が経過時間を超えても0で下げ止まる', () => {
    expect(calculateDurationSeconds('2026-08-04T09:00:00Z', '2026-08-04T09:10:00Z', 9999)).toBe(0);
  });
});

describe('isStaleSession', () => {
  it('12時間以上続いているセッションは確認対象にする', () => {
    expect(isStaleSession(11 * 3600)).toBe(false);
    expect(isStaleSession(12 * 3600)).toBe(true);
  });
});
