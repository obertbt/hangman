'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requirePermission } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

/**
 * スキル定義の管理（30章）。
 *
 * これが無いと、大分類も目標も SQL でしか作れず、
 * Phase 8 のスキル承認を使い始められない（3章の11: 自分たちで運用できる）。
 *
 * 触れるのは `skill.review` を持つ人（コーチと管理者）。RLS も同じ条件。
 */

export interface SkillAdminState {
  error?: string;
  success?: string;
}

const uuid = z.guid('選択内容が正しくありません。');

const categorySchema = z.object({
  name: z.string().trim().min(1, '大分類の名前を入れてください。').max(50),
  description: z
    .string()
    .trim()
    .max(500)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional(),
});

const skillSchema = z.object({
  skill_category_id: uuid,
  /** 空なら中目標、入っていればその下の小目標。 */
  parent_id: z
    .string()
    .trim()
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .refine((value) => value === null || z.guid().safeParse(value).success, {
      message: '選択内容が正しくありません。',
    }),
  name: z.string().trim().min(1, '目標の名前を入れてください。').max(100),
  criteria: z
    .string()
    .trim()
    .max(500)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional(),
});

function text(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === 'string' ? value : undefined;
}

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? '入力内容を確認してください。';
}

/** 大分類を作る（30章の「大分類 → 中目標 → 小目標」の一番上）。 */
export async function createSkillCategory(
  _prevState: SkillAdminState,
  formData: FormData,
): Promise<SkillAdminState> {
  const session = await requirePermission('skill.review');

  const parsed = categorySchema.safeParse({
    name: text(formData, 'name') ?? '',
    description: text(formData, 'description'),
  });

  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();

  // 末尾に足す。並び順を人に決めさせない。
  const { count } = await supabase
    .from('skill_categories')
    .select('id', { count: 'exact', head: true })
    .eq('team_id', session.teamId)
    .is('deleted_at', null);

  const { error } = await supabase.from('skill_categories').insert({
    team_id: session.teamId,
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    sort_order: (count ?? 0) + 1,
  });

  if (error) {
    if (error.code === '23505') return { error: 'その名前の大分類はすでにあります。' };
    return { error: `作成できませんでした: ${error.message}` };
  }

  revalidatePath('/admin/skills');
  revalidatePath('/skills');
  return { success: `「${parsed.data.name}」を作りました。` };
}

/**
 * 中目標・小目標を作る。
 *
 * `parent_id` が空なら中目標、入っていればその下の小目標。
 * `level` は 30章に合わせて 2 / 3 を入れる（大分類が 1）。
 */
export async function createSkill(_prevState: SkillAdminState, formData: FormData): Promise<SkillAdminState> {
  const session = await requirePermission('skill.review');

  const parsed = skillSchema.safeParse({
    skill_category_id: text(formData, 'skill_category_id') ?? '',
    parent_id: text(formData, 'parent_id') ?? '',
    name: text(formData, 'name') ?? '',
    criteria: text(formData, 'criteria'),
  });

  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const input = parsed.data;

  const supabase = await createClient();

  // 別チームの大分類にぶら下げない
  const { data: category } = await supabase
    .from('skill_categories')
    .select('id')
    .eq('team_id', session.teamId)
    .eq('id', input.skill_category_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!category) return { error: 'その大分類は見つかりません。' };

  if (input.parent_id) {
    const { data: parent } = await supabase
      .from('skills')
      .select('id, parent_id, skill_category_id')
      .eq('team_id', session.teamId)
      .eq('id', input.parent_id)
      .is('deleted_at', null)
      .maybeSingle();

    if (!parent) return { error: 'その中目標は見つかりません。' };

    // 30章の階層は3段まで。小目標の下にさらにぶら下げない。
    if (parent.parent_id !== null) {
      return { error: '小目標の下に、さらに目標は作れません。' };
    }
    if (parent.skill_category_id !== input.skill_category_id) {
      return { error: '中目標と大分類が食い違っています。' };
    }
  }

  const { data: nextOrder } = await supabase.rpc('next_skill_sort_order', {
    p_team_id: session.teamId,
    p_category_id: input.skill_category_id,
    p_parent_id: input.parent_id,
  });

  const { error } = await supabase.from('skills').insert({
    team_id: session.teamId,
    skill_category_id: input.skill_category_id,
    parent_id: input.parent_id,
    name: input.name,
    criteria: input.criteria ?? null,
    level: input.parent_id ? 3 : 2,
    sort_order: nextOrder ?? 1,
  });

  if (error) return { error: `作成できませんでした: ${error.message}` };

  revalidatePath('/admin/skills');
  revalidatePath('/skills');
  return { success: `「${input.name}」を足しました。` };
}

/**
 * 目標を消す（30章）。
 *
 * すでに誰かが到達している目標は消さない。
 * 記録が宙に浮くと、選手の積み上げが無かったことになる。
 */
export async function deleteSkill(_prevState: SkillAdminState, formData: FormData): Promise<SkillAdminState> {
  await requirePermission('skill.review');

  const parsed = uuid.safeParse(text(formData, 'skill_id') ?? '');
  if (!parsed.success) return { error: '対象が正しくありません。' };
  const skillId = parsed.data;

  const supabase = await createClient();

  // 素朴な `update ... set deleted_at` では消せない（0019）。
  // 到達者の有無・子の有無・権限の確認は、すべて関数の中で行う。
  const { error } = await supabase.rpc('soft_delete_skill', { p_skill_id: skillId });

  if (error) return { error: `消せませんでした: ${error.message}` };

  revalidatePath('/admin/skills');
  revalidatePath('/skills');
  return { success: '消しました。' };
}
