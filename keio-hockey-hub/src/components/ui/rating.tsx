'use client';

import { cn } from '@/lib/utils/cn';

/**
 * 1〜5 の段階入力。
 *
 * スマートフォンから素早く入力できることを最優先にしている（依頼書3章の2）。
 *   * 数字を打たせない。指1本で選べる
 *   * タップ領域は44px以上
 *   * 両端に意味を書く（「5が良い」のか「5が悪い」のかは項目で違う）
 *   * 選び直せるように、選択済みでも押せる
 *
 * ラジオボタンとして作っているので、キーボードでも操作できる。
 */
export function RatingField({
  name,
  label,
  lowLabel,
  highLabel,
  defaultValue,
  hint,
}: {
  name: string;
  label: string;
  /** 1 の意味。例:「悪い」 */
  lowLabel: string;
  /** 5 の意味。例:「良い」 */
  highLabel: string;
  defaultValue?: number | null;
  hint?: string;
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">{label}</legend>
      {hint ? <p className="text-xs text-[--color-muted]">{hint}</p> : null}

      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((value) => (
          <label
            key={value}
            className={cn(
              'flex min-h-12 flex-1 cursor-pointer items-center justify-center rounded-lg border text-sm font-medium transition-colors',
              'border-[--color-border] bg-[--color-surface]',
              'has-[:checked]:border-keio-600 has-[:checked]:bg-keio-600 has-[:checked]:text-white',
              'has-[:focus-visible]:ring-keio-500/40 has-[:focus-visible]:ring-2',
            )}
          >
            <input
              type="radio"
              name={name}
              value={value}
              defaultChecked={defaultValue === value}
              className="sr-only"
            />
            {value}
          </label>
        ))}
      </div>

      <div className="flex justify-between text-[11px] text-[--color-muted]">
        <span>1 = {lowLabel}</span>
        <span>5 = {highLabel}</span>
      </div>
    </fieldset>
  );
}
