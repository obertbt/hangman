import { describe, expect, it } from 'vitest';

import { emptyToNull, eventSchema, seasonSchema, weekSchema } from './schemas';

describe('seasonSchema', () => {
  const base = {
    name: '2026シーズン',
    fiscal_year: 2026,
    start_date: '2026-04-01',
    end_date: '2027-03-31',
    status: 'active' as const,
    is_published: true,
  };

  it('妥当な入力を受け入れる', () => {
    expect(seasonSchema.safeParse(base).success).toBe(true);
  });

  it('終了日が開始日より前なら弾く', () => {
    const result = seasonSchema.safeParse({ ...base, end_date: '2026-03-01' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('終了日');
    }
  });

  it('同じ日は許す（1日だけのシーズン）', () => {
    expect(seasonSchema.safeParse({ ...base, end_date: base.start_date }).success).toBe(true);
  });

  it('名前が空なら弾く', () => {
    expect(seasonSchema.safeParse({ ...base, name: '' }).success).toBe(false);
  });

  it('日付の形式が違えば弾く', () => {
    expect(seasonSchema.safeParse({ ...base, start_date: '2026/4/1' }).success).toBe(false);
  });
});

describe('weekSchema', () => {
  const base = {
    season_id: '11111111-1111-1111-1111-111111111111',
    start_date: '2026-08-10',
    end_date: '2026-08-16',
    is_published: true,
  };

  it('妥当な入力を受け入れる', () => {
    expect(weekSchema.safeParse(base).success).toBe(true);
  });

  it('シーズンIDが UUID でなければ弾く', () => {
    expect(weekSchema.safeParse({ ...base, season_id: 'not-a-uuid' }).success).toBe(false);
    expect(weekSchema.safeParse({ ...base, season_id: '' }).success).toBe(false);
  });

  it('seed で使っている読みやすい UUID も受け入れる', () => {
    // z.uuid() はバージョン・バリアントのビットまで見るため、
    // 手で作った ID を弾いてしまう。開発中に週を作れなくなるので guid を使っている。
    for (const id of [
      '44444444-0000-0000-0000-000000000001',
      '11111111-1111-1111-1111-111111111111',
      '00000000-0000-0000-0000-000000000000',
    ]) {
      expect(weekSchema.safeParse({ ...base, season_id: id }).success, id).toBe(true);
    }
  });

  it('Postgres の gen_random_uuid() が作る形も受け入れる', () => {
    expect(weekSchema.safeParse({ ...base, season_id: '9f8e7d6c-5b4a-4938-a7b6-c5d4e3f2a1b0' }).success).toBe(
      true,
    );
  });

  it('終了日が開始日より前なら弾く', () => {
    expect(weekSchema.safeParse({ ...base, end_date: '2026-08-01' }).success).toBe(false);
  });
});

describe('eventSchema', () => {
  const base = {
    title: '全体練習',
    event_date: '2026-08-12',
    event_type: 'practice' as const,
    is_published: true,
  };

  it('時刻なしでも作れる（時間未定の予定）', () => {
    expect(eventSchema.safeParse(base).success).toBe(true);
  });

  it('開始と終了が揃っていれば前後関係を見る', () => {
    expect(eventSchema.safeParse({ ...base, start_time: '16:00', end_time: '19:00' }).success).toBe(true);

    const result = eventSchema.safeParse({ ...base, start_time: '19:00', end_time: '16:00' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toContain('終了時刻');
  });

  it('片方だけの時刻は許す（終了未定）', () => {
    expect(eventSchema.safeParse({ ...base, start_time: '16:00', end_time: '' }).success).toBe(true);
  });

  it('種別が一覧にないものは弾く', () => {
    expect(eventSchema.safeParse({ ...base, event_type: 'party' }).success).toBe(false);
  });

  it('タイトルが空なら弾く', () => {
    expect(eventSchema.safeParse({ ...base, title: '' }).success).toBe(false);
  });
});

describe('emptyToNull', () => {
  it('空文字と空白だけを null にする', () => {
    expect(emptyToNull('')).toBeNull();
    expect(emptyToNull('   ')).toBeNull();
    expect(emptyToNull(undefined)).toBeNull();
    expect(emptyToNull('内容')).toBe('内容');
  });
});
