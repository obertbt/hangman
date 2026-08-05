'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Field, FormMessage, Input } from '@/components/ui/field';
import { startSessionAction } from '@/features/timer/actions';
import { cn } from '@/lib/utils/cn';
import type { CategoryRow } from '@/types/database.types';

/**
 * 活動の開始。
 * 16.4「入力を必須にしすぎない」に従い、カテゴリーを選ぶだけで開始できる。
 * タイトルとメモは任意。
 */
export function StartTimerForm({ categories }: { categories: CategoryRow[] }) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState<string | null>(categories[0]?.id ?? null);
  const [title, setTitle] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleStart = () => {
    if (!categoryId) {
      setError('カテゴリーを選んでください。');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await startSessionAction({ categoryId, title, note });
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  };

  if (categories.length === 0) {
    return (
      <div className="space-y-3 text-center">
        <p className="text-sm text-[--color-muted]">
          使えるカテゴリーがありません。設定から追加してください。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error ? <FormMessage>{error}</FormMessage> : null}

      <fieldset>
        <legend className="pb-2 text-sm font-medium">何をしますか？</legend>
        <div className="grid grid-cols-3 gap-2">
          {categories.map((category) => {
            const isSelected = category.id === categoryId;
            return (
              <button
                key={category.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setCategoryId(category.id)}
                className={cn(
                  'flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl border p-2 text-xs transition-colors',
                  isSelected
                    ? 'border-transparent text-white'
                    : 'border-[--color-border] bg-[--color-surface]',
                )}
                style={isSelected ? { backgroundColor: category.color } : undefined}
              >
                <span aria-hidden className="text-xl">
                  {category.icon}
                </span>
                <span className="line-clamp-1">{category.name}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {showDetails ? (
        <div className="space-y-3">
          <Field label="活動タイトル（任意）" htmlFor="title">
            <Input
              id="title"
              value={title}
              maxLength={100}
              placeholder="英単語、朝ラン、など"
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
          <Field label="メモ（任意）" htmlFor="note">
            <Input
              id="note"
              value={note}
              maxLength={1000}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowDetails(true)}
          className="text-sm text-[--color-muted] underline underline-offset-4"
        >
          タイトルとメモを書く
        </button>
      )}

      <Button size="lg" block disabled={isPending} onClick={handleStart}>
        {isPending ? '開始しています…' : '活動を始める'}
      </Button>
    </div>
  );
}
