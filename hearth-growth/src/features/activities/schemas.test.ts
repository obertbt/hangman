import { describe, expect, it } from 'vitest';

import {
  createManualSchema,
  fromDurationSeconds,
  sharePrivateActivitiesSchema,
  toDurationSeconds,
  updateActivitySchema,
  visibilityTargetSchema,
} from './schemas';

const uuid = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

describe('visibilityTargetSchema', () => {
  it('private はグループも宛先も要らない', () => {
    expect(visibilityTargetSchema.safeParse({ visibility: 'private' }).success).toBe(true);
  });

  it('group はグループの指定が要る', () => {
    expect(visibilityTargetSchema.safeParse({ visibility: 'group' }).success).toBe(false);
    expect(visibilityTargetSchema.safeParse({ visibility: 'group', groupId: uuid(1) }).success).toBe(true);
  });

  it('group 以外でグループを指定させない', () => {
    const result = visibilityTargetSchema.safeParse({ visibility: 'private', groupId: uuid(1) });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(['groupId']);
  });

  it('selected は宛先が1人以上要る', () => {
    expect(visibilityTargetSchema.safeParse({ visibility: 'selected', allowedUserIds: [] }).success).toBe(
      false,
    );
    expect(
      visibilityTargetSchema.safeParse({ visibility: 'selected', allowedUserIds: [uuid(2)] }).success,
    ).toBe(true);
  });
});

describe('createManualSchema', () => {
  const base = {
    categoryId: uuid(1),
    durationSeconds: 1800,
    activityDate: '2026-08-05',
    title: '',
    body: '',
    visibility: 'private' as const,
  };

  it('カテゴリーと時間だけで記録できる（本文は任意）', () => {
    expect(createManualSchema.safeParse(base).success).toBe(true);
  });

  it('0秒の記録は作れない', () => {
    expect(createManualSchema.safeParse({ ...base, durationSeconds: 0 }).success).toBe(false);
  });

  it('24時間を超える記録は作れない', () => {
    expect(createManualSchema.safeParse({ ...base, durationSeconds: 86_401 }).success).toBe(false);
  });

  it('日付の形式を検査する', () => {
    expect(createManualSchema.safeParse({ ...base, activityDate: '2026/08/05' }).success).toBe(false);
  });

  it('公開範囲の条件も同時に検査する', () => {
    expect(createManualSchema.safeParse({ ...base, visibility: 'group' }).success).toBe(false);
  });
});

describe('updateActivitySchema', () => {
  it('活動時間を省略できる（タイマー由来の記録では据え置く）', () => {
    expect(
      updateActivitySchema.safeParse({
        postId: uuid(1),
        title: 'a',
        body: '',
        visibility: 'private',
      }).success,
    ).toBe(true);
  });
});

describe('toDurationSeconds / fromDurationSeconds', () => {
  it('時間と分を秒に直す', () => {
    expect(toDurationSeconds(1, 25)).toBe(5100);
    expect(toDurationSeconds(0, 30)).toBe(1800);
  });

  it('負の値や不正な値は0として扱う', () => {
    expect(toDurationSeconds(-1, -5)).toBe(0);
    expect(toDurationSeconds(Number.NaN, 10)).toBe(600);
  });

  it('秒から時間と分へ戻せる', () => {
    expect(fromDurationSeconds(5100)).toEqual({ hours: 1, minutes: 25 });
    expect(fromDurationSeconds(0)).toEqual({ hours: 0, minutes: 0 });
  });

  it('往復しても値が変わらない', () => {
    for (const seconds of [0, 60, 1800, 5100, 86_400]) {
      const { hours, minutes } = fromDurationSeconds(seconds);
      expect(toDurationSeconds(hours, minutes)).toBe(seconds);
    }
  });
});

describe('sharePrivateActivitiesSchema', () => {
  const groupId = '00000000-0000-4000-8000-000000000001';

  it('件数とグループがそろっていれば通る', () => {
    expect(sharePrivateActivitiesSchema.safeParse({ groupId, expectedCount: 3 }).success).toBe(true);
  });

  it('0件では実行させない', () => {
    expect(sharePrivateActivitiesSchema.safeParse({ groupId, expectedCount: 0 }).success).toBe(false);
  });

  it('公開先の指定が無ければ弾く', () => {
    expect(sharePrivateActivitiesSchema.safeParse({ groupId: 'x', expectedCount: 3 }).success).toBe(false);
  });
});
