import { describe, expect, it } from 'vitest';

import {
  CATEGORY_COLORS,
  createCategorySchema,
  reorderCategoriesSchema,
  updateCategorySchema,
} from './schemas';

const base = { name: '朝活', icon: '🌅', color: CATEGORY_COLORS[0] };

describe('createCategorySchema', () => {
  it('個人カテゴリーを作れる', () => {
    expect(createCategorySchema.safeParse(base).success).toBe(true);
  });

  it('色は #RRGGBB のみ', () => {
    expect(createCategorySchema.safeParse({ ...base, color: 'red' }).success).toBe(false);
    expect(createCategorySchema.safeParse({ ...base, color: '#ABC' }).success).toBe(false);
    expect(createCategorySchema.safeParse({ ...base, color: '#a1b2c3' }).success).toBe(true);
  });

  it('名前の前後の空白を落とす', () => {
    expect(createCategorySchema.parse({ ...base, name: ' 朝活 ' }).name).toBe('朝活');
  });

  it('30文字を超える名前を弾く', () => {
    expect(createCategorySchema.safeParse({ ...base, name: 'あ'.repeat(31) }).success).toBe(false);
  });

  it('長すぎるアイコンを弾く', () => {
    expect(createCategorySchema.safeParse({ ...base, icon: '🌅'.repeat(10) }).success).toBe(false);
  });
});

describe('updateCategorySchema', () => {
  it('有効・無効を切り替えられる', () => {
    const input = { categoryId: '00000000-0000-4000-8000-000000000001', ...base, isActive: false };
    expect(updateCategorySchema.safeParse(input).success).toBe(true);
  });
});

describe('reorderCategoriesSchema', () => {
  it('UUID の配列を受け取る', () => {
    expect(
      reorderCategoriesSchema.safeParse({
        categoryIds: ['00000000-0000-4000-8000-000000000001'],
      }).success,
    ).toBe(true);
  });

  it('空の配列を弾く', () => {
    expect(reorderCategoriesSchema.safeParse({ categoryIds: [] }).success).toBe(false);
  });

  it('UUID でない値を弾く', () => {
    expect(reorderCategoriesSchema.safeParse({ categoryIds: ['1'] }).success).toBe(false);
  });
});
