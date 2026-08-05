'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Field, FormMessage, Input } from '@/components/ui/field';
import {
  createCategoryAction,
  reorderCategoriesAction,
  updateCategoryAction,
} from '@/features/categories/actions';
import { CATEGORY_COLORS, CATEGORY_ICONS } from '@/features/categories/schemas';
import { cn } from '@/lib/utils/cn';
import type { CategoryRow } from '@/types/database.types';

/**
 * カテゴリーの追加・編集・並び替え・有効無効。
 *
 * 並び替えはドラッグではなく上下ボタンにしている。
 * 片手でのスマートフォン操作で確実に押せることを優先した（16.2）。
 */
export function CategoryManager({ categories }: { categories: CategoryRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isPending, startTransition] = useTransition();

  const run = (action: () => Promise<{ ok: boolean; message?: string }>, onDone?: () => void) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        onDone?.();
        router.refresh();
      } else {
        setError(result.message ?? null);
      }
    });
  };

  const move = (index: number, direction: -1 | 1) => {
    const next = [...categories];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    run(() => reorderCategoriesAction({ categoryIds: next.map((category) => category.id) }));
  };

  return (
    <div className="space-y-4">
      {error ? <FormMessage>{error}</FormMessage> : null}

      <ul className="space-y-2">
        {categories.map((category, index) => (
          <li key={category.id} className="rounded-xl border border-[--color-border] p-3">
            {editingId === category.id ? (
              <CategoryForm
                initial={category}
                disabled={isPending}
                onCancel={() => setEditingId(null)}
                onSubmit={(values) =>
                  run(
                    () => updateCategoryAction({ categoryId: category.id, ...values }),
                    () => setEditingId(null),
                  )
                }
              />
            ) : (
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg"
                  style={{ backgroundColor: `${category.color}22` }}
                >
                  {category.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn('truncate text-sm', !category.is_active && 'text-[--color-muted]')}>
                    {category.name}
                    {category.group_id ? (
                      <span className="ml-2 text-xs text-[--color-muted]">グループ</span>
                    ) : null}
                    {!category.is_active ? (
                      <span className="ml-2 text-xs text-[--color-muted]">使わない</span>
                    ) : null}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label={`${category.name}を上へ`}
                    disabled={isPending || index === 0}
                    onClick={() => move(index, -1)}
                    className="flex h-9 w-9 items-center justify-center rounded-full disabled:opacity-30"
                  >
                    <ChevronUp size={18} aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={`${category.name}を下へ`}
                    disabled={isPending || index === categories.length - 1}
                    onClick={() => move(index, 1)}
                    className="flex h-9 w-9 items-center justify-center rounded-full disabled:opacity-30"
                  >
                    <ChevronDown size={18} aria-hidden />
                  </button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(category.id)}>
                    編集
                  </Button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      {isAdding ? (
        <div className="rounded-xl border border-dashed border-[--color-border] p-3">
          <CategoryForm
            disabled={isPending}
            onCancel={() => setIsAdding(false)}
            onSubmit={(values) =>
              run(
                () => createCategoryAction({ name: values.name, icon: values.icon, color: values.color }),
                () => setIsAdding(false),
              )
            }
          />
        </div>
      ) : (
        <Button variant="secondary" onClick={() => setIsAdding(true)}>
          カテゴリーを追加する
        </Button>
      )}
    </div>
  );
}

interface CategoryFormValues {
  name: string;
  icon: string;
  color: string;
  isActive: boolean;
}

function CategoryForm({
  initial,
  disabled,
  onSubmit,
  onCancel,
}: {
  initial?: CategoryRow;
  disabled: boolean;
  onSubmit: (values: CategoryFormValues) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? CATEGORY_ICONS[0]);
  const [color, setColor] = useState(initial?.color ?? CATEGORY_COLORS[0]);
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);

  return (
    <div className="space-y-3">
      <Field label="名前" htmlFor={`name-${initial?.id ?? 'new'}`}>
        <Input
          id={`name-${initial?.id ?? 'new'}`}
          value={name}
          maxLength={30}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>

      <fieldset>
        <legend className="pb-1.5 text-sm font-medium">アイコン</legend>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORY_ICONS.map((option) => (
            <button
              key={option}
              type="button"
              aria-label={`アイコン ${option}`}
              aria-pressed={icon === option}
              onClick={() => setIcon(option)}
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-full border text-lg',
                icon === option ? 'border-ember-500' : 'border-[--color-border]',
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="pb-1.5 text-sm font-medium">色</legend>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORY_COLORS.map((option) => (
            <button
              key={option}
              type="button"
              aria-label={`色 ${option}`}
              aria-pressed={color === option}
              onClick={() => setColor(option)}
              className={cn(
                'h-10 w-10 rounded-full border-2',
                color === option ? 'border-[--color-foreground]' : 'border-transparent',
              )}
              style={{ backgroundColor: option }}
            />
          ))}
        </div>
      </fieldset>

      {initial ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!isActive}
            onChange={(event) => setIsActive(!event.target.checked)}
            className="h-5 w-5"
          />
          このカテゴリーは使わない（選択肢から隠す）
        </label>
      ) : null}

      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={disabled || name.trim().length === 0}
          onClick={() => onSubmit({ name, icon, color, isActive })}
        >
          {initial ? '保存する' : '追加する'}
        </Button>
        <Button size="sm" variant="ghost" disabled={disabled} onClick={onCancel}>
          やめる
        </Button>
      </div>
    </div>
  );
}
