import { describe, expect, it } from 'vitest';

import { completeSessionSchema, startSessionSchema } from './schemas';

const categoryId = '00000000-0000-4000-8000-000000000001';
const sessionId = '00000000-0000-4000-8000-000000000002';

describe('startSessionSchema', () => {
  it('カテゴリーだけで開始できる（タイトルとメモは任意）', () => {
    expect(startSessionSchema.safeParse({ categoryId, title: '', note: '' }).success).toBe(true);
  });

  it('タイトルの前後の空白を落とす', () => {
    expect(startSessionSchema.parse({ categoryId, title: '  英単語 ', note: '' }).title).toBe('英単語');
  });

  it('カテゴリーが未指定なら弾く', () => {
    expect(startSessionSchema.safeParse({ categoryId: '', title: '', note: '' }).success).toBe(false);
  });

  it('長すぎるタイトルを弾く', () => {
    expect(startSessionSchema.safeParse({ categoryId, title: 'あ'.repeat(101), note: '' }).success).toBe(
      false,
    );
  });
});

describe('completeSessionSchema', () => {
  it('終了時刻を省略できる', () => {
    expect(completeSessionSchema.safeParse({ sessionId }).success).toBe(true);
  });

  it('タイムゾーン付きの日時を受け付ける', () => {
    expect(completeSessionSchema.safeParse({ sessionId, endedAt: '2026-08-05T10:00:00.000Z' }).success).toBe(
      true,
    );
  });

  it('形式が違う終了時刻を弾く', () => {
    expect(completeSessionSchema.safeParse({ sessionId, endedAt: '2026-08-05 10:00' }).success).toBe(false);
  });
});
