'use client';

import { useState, useTransition } from 'react';

import { removeReactionAction, setReactionAction } from '@/features/reactions/actions';
import { REACTION_OPTIONS } from '@/features/reactions/schemas';
import { cn } from '@/lib/utils/cn';
import type { ReactionType } from '@/types/database.types';

interface ReactionBarProps {
  postId: string;
  myReaction: ReactionType | null;
  totalCount: number;
}

/**
 * 応援を送る（10.1）。
 *
 * 1ユーザーにつき1つ。同じものをもう一度押すと取り消す。
 * 合計数は小さく添えるだけで、種類ごとの内訳は出さない。
 */
export function ReactionBar({ postId, myReaction, totalCount }: ReactionBarProps) {
  const [selected, setSelected] = useState<ReactionType | null>(myReaction);
  const [count, setCount] = useState(totalCount);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const choose = (reactionType: ReactionType) => {
    const previous = selected;
    const isUnsetting = previous === reactionType;

    // 押した瞬間に見た目を変える。失敗したら戻す。
    setSelected(isUnsetting ? null : reactionType);
    setCount((current) => {
      if (isUnsetting) return Math.max(0, current - 1);
      return previous ? current : current + 1;
    });
    setIsOpen(false);
    setError(null);

    startTransition(async () => {
      const result = isUnsetting
        ? await removeReactionAction(postId)
        : await setReactionAction({ postId, reactionType });

      if (!result.ok) {
        setSelected(previous);
        setCount(totalCount);
        setError(result.message);
      }
    });
  };

  const selectedOption = REACTION_OPTIONS.find((option) => option.value === selected);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-expanded={isOpen}
          disabled={isPending}
          onClick={() => setIsOpen((open) => !open)}
          className={cn(
            'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs',
            selected ? 'border-ember-500 bg-ember-500/10' : 'border-[--color-border]',
          )}
        >
          <span aria-hidden>{selectedOption?.emoji ?? '💬'}</span>
          {selectedOption?.label ?? '応援する'}
        </button>

        {count > 0 ? <span className="text-xs text-[--color-muted]">{count}人が応援しています</span> : null}
      </div>

      {isOpen ? (
        <ul className="flex flex-wrap gap-1.5">
          {REACTION_OPTIONS.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                aria-pressed={selected === option.value}
                disabled={isPending}
                onClick={() => choose(option.value)}
                className={cn(
                  'inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-xs',
                  selected === option.value
                    ? 'border-ember-500 bg-ember-500/10 font-medium'
                    : 'border-[--color-border]',
                )}
              >
                <span aria-hidden>{option.emoji}</span>
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
