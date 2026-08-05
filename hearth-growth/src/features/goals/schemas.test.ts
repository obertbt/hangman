import { describe, expect, it } from 'vitest';

import { progressPercent, setDailyGoalSchema, setWeeklyGoalSchema } from './schemas';

describe('setDailyGoalSchema', () => {
  const base = { goalDate: '2026-08-05', targetMinutes: 30, message: '' };

  it('目標時間と日付があれば通る', () => {
    expect(setDailyGoalSchema.safeParse(base).success).toBe(true);
  });

  it('短すぎる・長すぎる目標を弾く', () => {
    expect(setDailyGoalSchema.safeParse({ ...base, targetMinutes: 4 }).success).toBe(false);
    expect(setDailyGoalSchema.safeParse({ ...base, targetMinutes: 1441 }).success).toBe(false);
  });
});

describe('setWeeklyGoalSchema', () => {
  const base = { weekStartDate: '2026-08-03', targetHours: 5, message: '' };

  it('時間単位で受け取る', () => {
    expect(setWeeklyGoalSchema.safeParse(base).success).toBe(true);
  });

  it('0時間や100時間超は弾く', () => {
    expect(setWeeklyGoalSchema.safeParse({ ...base, targetHours: 0 }).success).toBe(false);
    expect(setWeeklyGoalSchema.safeParse({ ...base, targetHours: 101 }).success).toBe(false);
  });
});

describe('progressPercent', () => {
  it('達成率を百分率で返す', () => {
    expect(progressPercent(1800, 3600)).toBe(50);
    expect(progressPercent(3600, 3600)).toBe(100);
  });

  it('超過しても100で止める（もっとやれと迫らない）', () => {
    expect(progressPercent(7200, 3600)).toBe(100);
  });

  it('目標が無ければ null', () => {
    expect(progressPercent(1800, null)).toBeNull();
    expect(progressPercent(1800, 0)).toBeNull();
  });

  it('記録が無ければ0', () => {
    expect(progressPercent(0, 3600)).toBe(0);
  });
});
