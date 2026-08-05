'use server';

import { revalidatePath } from 'next/cache';

import { GENERIC_ERROR_MESSAGE } from '@/features/auth/errors';
import {
  createCategorySchema,
  reorderCategoriesSchema,
  updateCategorySchema,
  type CreateCategoryInput,
  type ReorderCategoriesInput,
  type UpdateCategoryInput,
} from '@/features/categories/schemas';
import { toGroupErrorMessage } from '@/features/groups/errors';
import { fail, ok, type ActionResult } from '@/lib/actions/result';
import { createClient } from '@/lib/supabase/server';

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function revalidateCategoryViews() {
  revalidatePath('/settings');
  revalidatePath('/timer');
  revalidatePath('/activities');
}

export async function createCategoryAction(input: CreateCategoryInput): Promise<ActionResult> {
  const parsed = createCategorySchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0].message, String(parsed.error.issues[0].path[0] ?? ''));
  }

  const { supabase, user } = await requireUser();
  if (!user) return fail('ログインの有効期限が切れました。もう一度ログインしてください。');

  // 末尾に追加する
  const { data: last } = await supabase
    .from('categories')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from('categories').insert({
    // グループカテゴリーは user_id を持たない（CHECK 制約でどちらか一方に限定している）
    user_id: parsed.data.groupId ? null : user.id,
    group_id: parsed.data.groupId ?? null,
    name: parsed.data.name,
    icon: parsed.data.icon,
    color: parsed.data.color,
    sort_order: (last?.sort_order ?? 0) + 10,
  });

  if (error) {
    if (error.code === '23505') {
      return fail('同じ名前のカテゴリーがすでにあります。', 'name');
    }
    console.error('createCategoryAction failed', error);
    return fail(toGroupErrorMessage(error));
  }

  revalidateCategoryViews();
  return ok();
}

export async function updateCategoryAction(input: UpdateCategoryInput): Promise<ActionResult> {
  const parsed = updateCategorySchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0].message, String(parsed.error.issues[0].path[0] ?? ''));
  }

  const { supabase, user } = await requireUser();
  if (!user) return fail('ログインの有効期限が切れました。もう一度ログインしてください。');

  const { error } = await supabase
    .from('categories')
    .update({
      name: parsed.data.name,
      icon: parsed.data.icon,
      color: parsed.data.color,
      is_active: parsed.data.isActive,
    })
    .eq('id', parsed.data.categoryId);

  if (error) {
    if (error.code === '23505') {
      return fail('同じ名前のカテゴリーがすでにあります。', 'name');
    }
    console.error('updateCategoryAction failed', error);
    return fail(toGroupErrorMessage(error));
  }

  revalidateCategoryViews();
  return ok();
}

/**
 * 並び替え。
 * 渡された順に 10, 20, 30 ... を振り直す。
 * 権限のないカテゴリーは RLS が黙って弾くため、件数は変わりうる。
 */
export async function reorderCategoriesAction(input: ReorderCategoriesInput): Promise<ActionResult> {
  const parsed = reorderCategoriesSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const { supabase, user } = await requireUser();
  if (!user) return fail('ログインの有効期限が切れました。もう一度ログインしてください。');

  const results = await Promise.all(
    parsed.data.categoryIds.map((categoryId, index) =>
      supabase
        .from('categories')
        .update({ sort_order: (index + 1) * 10 })
        .eq('id', categoryId),
    ),
  );

  const failed = results.find((result) => result.error);
  if (failed?.error) {
    console.error('reorderCategoriesAction failed', failed.error);
    return fail(GENERIC_ERROR_MESSAGE);
  }

  revalidateCategoryViews();
  return ok();
}
