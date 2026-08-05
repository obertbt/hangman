import { z } from 'zod';

import { uuidSchema } from '@/lib/validations/common';

export const categoryNameSchema = z
  .string()
  .trim()
  .min(1, 'カテゴリー名を入力してください')
  .max(30, 'カテゴリー名は30文字以内にしてください');

/** 絵文字1〜2文字を想定。長い文字列を入れても表示が崩れないよう上限を設ける。 */
export const categoryIconSchema = z
  .string()
  .trim()
  .min(1, 'アイコンを選んでください')
  .max(8, 'アイコンは短い記号か絵文字にしてください');

export const categoryColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, '色は #RRGGBB の形式で指定してください');

export const createCategorySchema = z.object({
  name: categoryNameSchema,
  icon: categoryIconSchema,
  color: categoryColorSchema,
  /** 指定するとグループ共通カテゴリーになる。管理者のみ作成できる。 */
  groupId: uuidSchema.nullable().optional(),
});

export const updateCategorySchema = z.object({
  categoryId: uuidSchema,
  name: categoryNameSchema,
  icon: categoryIconSchema,
  color: categoryColorSchema,
  isActive: z.boolean(),
});

export const reorderCategoriesSchema = z.object({
  /** 表示したい順に並べた ID */
  categoryIds: z.array(uuidSchema).min(1, '並び替える対象がありません').max(100),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type ReorderCategoriesInput = z.infer<typeof reorderCategoriesSchema>;

/** 新しいカテゴリーを作るときの色の候補。落ち着いた色だけを並べる。 */
export const CATEGORY_COLORS = [
  '#6B8E9F',
  '#7D7C84',
  '#9C8455',
  '#7FA37F',
  '#5F7FA3',
  '#8B7BA8',
  '#B08968',
  '#A3907F',
  '#8B8B8B',
] as const;

export const CATEGORY_ICONS = [
  '📚',
  '💼',
  '📖',
  '🏃',
  '🏒',
  '💻',
  '🎨',
  '🏠',
  '📝',
  '🎧',
  '🧘',
  '🍳',
] as const;
