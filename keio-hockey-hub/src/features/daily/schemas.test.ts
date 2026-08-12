import { describe, expect, it } from 'vitest';

import {
  conditionSchema,
  dailyReportSchema,
  hasEnoughToSubmit,
  practiceGoalSchema,
  reportCommentSchema,
} from './schemas';

describe('練習前コンディション（15章）', () => {
  const base = {
    recorded_on: '2026-08-12',
    condition_level: '4',
    fatigue_level: '2',
    sleep_hours: '7',
    has_pain: false,
  };

  it('普通の入力を受け入れる', () => {
    const result = conditionSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.condition_level).toBe(4);
      expect(result.data.sleep_hours).toBe(7);
    }
  });

  it('段階評価は未選択でもよい（負担を増やしすぎない）', () => {
    const result = conditionSchema.safeParse({ ...base, condition_level: '', fatigue_level: '' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.condition_level).toBeNull();
      expect(result.data.fatigue_level).toBeNull();
    }
  });

  it('範囲外の段階評価を弾く', () => {
    expect(conditionSchema.safeParse({ ...base, condition_level: '6' }).success).toBe(false);
    expect(conditionSchema.safeParse({ ...base, condition_level: '0' }).success).toBe(false);
  });

  it('睡眠時間は0.5刻みで入る', () => {
    const result = conditionSchema.safeParse({ ...base, sleep_hours: '6.5' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.sleep_hours).toBe(6.5);
  });

  it('あり得ない睡眠時間を弾く', () => {
    expect(conditionSchema.safeParse({ ...base, sleep_hours: '30' }).success).toBe(false);
    expect(conditionSchema.safeParse({ ...base, sleep_hours: '-1' }).success).toBe(false);
  });

  it('空欄の文章は null になる', () => {
    const result = conditionSchema.safeParse({ ...base, note: '   ' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.note).toBeNull();
  });

  it('日付の形式が違えば弾く', () => {
    expect(conditionSchema.safeParse({ ...base, recorded_on: '2026/8/12' }).success).toBe(false);
  });
});

describe('今日の個人目標（15章）', () => {
  const base = { target_date: '2026-08-12', goal: '1対1で前を向く' };

  it('目標があれば通る', () => {
    expect(practiceGoalSchema.safeParse(base).success).toBe(true);
  });

  it('目標が空なら弾く（これだけは必須）', () => {
    const result = practiceGoalSchema.safeParse({ ...base, goal: '' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toContain('今日の目標');
  });

  it('達成したかどうかは後から入れられる', () => {
    expect(practiceGoalSchema.safeParse({ ...base, achieved: null }).success).toBe(true);
    expect(practiceGoalSchema.safeParse({ ...base, achieved: true }).success).toBe(true);
  });
});

describe('日報（16章）', () => {
  const base = {
    report_date: '2026-08-12',
    visibility: 'staff' as const,
    status: 'draft' as const,
  };

  it('中身が空でも下書きとしては通る', () => {
    expect(dailyReportSchema.safeParse(base).success).toBe(true);
  });

  it('公開範囲の初期値は staff（コーチまで）', () => {
    const result = dailyReportSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.visibility).toBe('staff');
  });

  it('知らない公開範囲を弾く', () => {
    expect(dailyReportSchema.safeParse({ ...base, visibility: 'public' }).success).toBe(false);
  });

  it('段階評価を数値に直す', () => {
    const result = dailyReportSchema.safeParse({ ...base, self_rating: '3', mood: '' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.self_rating).toBe(3);
      expect(result.data.mood).toBeNull();
    }
  });
});

describe('提出できるかどうか', () => {
  const empty = {
    report_date: '2026-08-12',
    event_id: null,
    personal_goal: null,
    what_happened: null,
    what_went_well: null,
    what_went_wrong: null,
    cause: null,
    improvement: null,
    prevention: null,
    response_taken: null,
    next_action: null,
    self_rating: null,
    intensity: null,
    fatigue_level: null,
    mood: null,
    condition_level: null,
    free_note: null,
    visibility: 'staff' as const,
    status: 'submitted' as const,
  };

  it('何も書いていなければ提出させない', () => {
    expect(hasEnoughToSubmit(empty)).toBe(false);
  });

  it('ひとつでも書いてあれば提出できる', () => {
    expect(hasEnoughToSubmit({ ...empty, what_went_well: '前を向けた' })).toBe(true);
    expect(hasEnoughToSubmit({ ...empty, next_action: '明日はここを直す' })).toBe(true);
    expect(hasEnoughToSubmit({ ...empty, free_note: 'ひとこと' })).toBe(true);
  });

  it('目標だけでは提出させない（振り返りが無い）', () => {
    expect(hasEnoughToSubmit({ ...empty, personal_goal: '前を向く' })).toBe(false);
  });
});

describe('日報へのコメント（16章）', () => {
  const reportId = '11111111-1111-1111-1111-111111111111';

  it('ひとことでも通る', () => {
    const parsed = reportCommentSchema.safeParse({ daily_report_id: reportId, body: 'いいね' });
    expect(parsed.success).toBe(true);
  });

  it('前後の空白は落とす', () => {
    const parsed = reportCommentSchema.parse({ daily_report_id: reportId, body: '  よかった  ' });
    expect(parsed.body).toBe('よかった');
  });

  it('空では出せない（無言の既読に見えてしまう）', () => {
    expect(reportCommentSchema.safeParse({ daily_report_id: reportId, body: '' }).success).toBe(false);
    expect(reportCommentSchema.safeParse({ daily_report_id: reportId, body: '   ' }).success).toBe(false);
  });

  it('長すぎるものは断る', () => {
    const parsed = reportCommentSchema.safeParse({
      daily_report_id: reportId,
      body: 'あ'.repeat(2001),
    });
    expect(parsed.success).toBe(false);
  });

  it('対象の日報が UUID でなければ断る', () => {
    expect(reportCommentSchema.safeParse({ daily_report_id: 'abc', body: 'いいね' }).success).toBe(false);
    expect(reportCommentSchema.safeParse({ daily_report_id: '', body: 'いいね' }).success).toBe(false);
  });
});
