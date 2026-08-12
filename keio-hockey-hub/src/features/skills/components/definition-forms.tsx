'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Field, FormMessage, Select, TextArea, TextInput } from '@/components/ui/field';
import {
  createSkill,
  createSkillCategory,
  deleteSkill,
  type SkillAdminState,
} from '@/features/skills/admin-actions';

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="action" block disabled={pending}>
      {pending ? '保存しています…' : label}
    </Button>
  );
}

/** 大分類（30章の一番上）。 */
export function CategoryForm() {
  const [state, formAction] = useActionState<SkillAdminState, FormData>(createSkillCategory, {});

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}

      <Field label="大分類の名前" htmlFor="category_name" required hint="「ドリブル」「トラップ」など">
        <TextInput id="category_name" name="name" required placeholder="ドリブル" />
      </Field>

      <Field label="説明" htmlFor="category_description" hint="空でも構いません。">
        <TextArea id="category_description" name="description" rows={2} />
      </Field>

      <SubmitButton label="大分類を作る" />
    </form>
  );
}

export interface CategoryOption {
  id: string;
  name: string;
  /** その大分類の中目標。小目標を作るときに選ぶ。 */
  parents: { id: string; name: string }[];
}

/**
 * 中目標・小目標を作る。
 *
 * どこにぶら下げるかを1つのフォームで選ばせる。
 * 「中目標を作る」「小目標を作る」で画面を分けると、
 * 階層の考え方を先に理解しないと使えなくなる。
 */
export function SkillForm({ categories }: { categories: CategoryOption[] }) {
  const [state, formAction] = useActionState<SkillAdminState, FormData>(createSkill, {});

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}

      <Field label="どの大分類か" htmlFor="skill_category_id" required>
        <Select id="skill_category_id" name="skill_category_id" required defaultValue="">
          <option value="" disabled>
            選んでください
          </option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="どの中目標の下か"
        htmlFor="parent_id"
        hint="選ばなければ、中目標として作られます。選ぶと、その下の小目標になります。"
      >
        <Select id="parent_id" name="parent_id" defaultValue="">
          <option value="">中目標として作る</option>
          {categories.flatMap((category) =>
            category.parents.map((parent) => (
              <option key={parent.id} value={parent.id}>
                {category.name} / {parent.name}
              </option>
            )),
          )}
        </Select>
      </Field>

      <Field label="目標の名前" htmlFor="skill_name" required>
        <TextInput id="skill_name" name="name" required placeholder="オープンドリブルで10m運ぶ" />
      </Field>

      <Field
        label="できたと言える目安"
        htmlFor="criteria"
        hint="「3回中3回、ボールを見ずに運べる」のように、数えられる形にすると審査が早くなります。"
      >
        <TextArea id="criteria" name="criteria" rows={2} placeholder="3回中3回、ボールを見ずに運べる" />
      </Field>

      <SubmitButton label="目標を足す" />
    </form>
  );
}

/** 目標を消す。押し間違いが効かないよう、一度確認を挟む。 */
export function DeleteSkillButton({ skillId, name }: { skillId: string; name: string }) {
  const [state, formAction] = useActionState<SkillAdminState, FormData>(deleteSkill, {});
  const { pending } = useFormStatus();

  return (
    <form action={formAction}>
      <input type="hidden" name="skill_id" value={skillId} />
      {state.error ? (
        <p role="alert" className="mb-1 text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pending}
        aria-label={`${name}を消す`}
        className="px-2 text-xs"
      >
        消す
      </Button>
    </form>
  );
}
