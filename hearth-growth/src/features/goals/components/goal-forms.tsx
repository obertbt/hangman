'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Field, FormMessage, Input } from '@/components/ui/field';
import { setDailyGoalAction, setWeeklyGoalAction } from '@/features/goals/actions';
import { progressPercent } from '@/features/goals/schemas';
import { formatDuration } from '@/lib/date/duration';
import { cn } from '@/lib/utils/cn';

const DAILY_PRESETS = [15, 30, 60, 120];
const WEEKLY_PRESETS = [3, 5, 10, 20];

interface DailyGoalCardProps {
  goalDate: string;
  targetSeconds: number | null;
  message: string | null;
  achievedSeconds: number;
}

/** 今日の目標（7.2 クイックアクション）。 */
export function DailyGoalCard({ goalDate, targetSeconds, message, achievedSeconds }: DailyGoalCardProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [minutes, setMinutes] = useState(targetSeconds ? Math.round(targetSeconds / 60) : 30);
  const [text, setText] = useState(message ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const progress = progressPercent(achievedSeconds, targetSeconds);

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await setDailyGoalAction({ goalDate, targetMinutes: minutes, message: text });
      if (result.ok) {
        setIsEditing(false);
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  };

  if (!isEditing) {
    return (
      <div className="space-y-2">
        {targetSeconds ? (
          <>
            <div className="flex items-baseline justify-between text-sm">
              <span>{message || '今日の目標'}</span>
              <span className="text-xs text-[--color-muted]">
                {formatDuration(achievedSeconds)} / {formatDuration(targetSeconds)}
              </span>
            </div>
            <div
              className="bg-hearth-200 h-2 w-full overflow-hidden rounded-full"
              role="progressbar"
              aria-valuenow={progress ?? 0}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="今日の目標の進捗"
            >
              <div className="bg-ember-500 h-full rounded-full" style={{ width: `${progress ?? 0}%` }} />
            </div>
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="text-xs text-[--color-muted] underline underline-offset-4"
            >
              目標を変える
            </button>
          </>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => setIsEditing(true)}>
            今日の目標を決める
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error ? <FormMessage>{error}</FormMessage> : null}

      <fieldset>
        <legend className="pb-2 text-sm font-medium">今日はどのくらい？</legend>
        <div className="flex flex-wrap gap-2">
          {DAILY_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              aria-pressed={minutes === preset}
              onClick={() => setMinutes(preset)}
              className={cn(
                'min-h-9 rounded-full border px-3 text-xs',
                minutes === preset
                  ? 'border-ember-500 bg-ember-500/10 font-medium'
                  : 'border-[--color-border]',
              )}
            >
              {formatDuration(preset * 60)}
            </button>
          ))}
        </div>
      </fieldset>

      <Field label="ひとこと（任意）" htmlFor="daily-goal-message">
        <Input
          id="daily-goal-message"
          value={text}
          maxLength={200}
          placeholder="朝のうちに終わらせる"
          onChange={(event) => setText(event.target.value)}
        />
      </Field>

      <div className="flex gap-2">
        <Button size="sm" disabled={isPending} onClick={save}>
          {isPending ? '保存しています…' : '決める'}
        </Button>
        <Button size="sm" variant="ghost" disabled={isPending} onClick={() => setIsEditing(false)}>
          やめる
        </Button>
      </div>
    </div>
  );
}

interface WeeklyGoalFormProps {
  weekStartDate: string;
  targetSeconds: number | null;
  message: string | null;
}

/** 今週の目標（7.6 自分の目標）。 */
export function WeeklyGoalForm({ weekStartDate, targetSeconds, message }: WeeklyGoalFormProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [hours, setHours] = useState(targetSeconds ? Math.round(targetSeconds / 3600) : 5);
  const [text, setText] = useState(message ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await setWeeklyGoalAction({ weekStartDate, targetHours: hours, message: text });
      if (result.ok) {
        setIsEditing(false);
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  };

  if (!isEditing) {
    return (
      <div className="space-y-2">
        <p className="text-sm">
          {targetSeconds ? (
            <>
              今週の目標 <span className="font-medium">{formatDuration(targetSeconds)}</span>
              {message ? <span className="text-[--color-muted]">・{message}</span> : null}
            </>
          ) : (
            <span className="text-[--color-muted]">今週の目標はまだありません。</span>
          )}
        </p>
        <Button size="sm" variant="secondary" onClick={() => setIsEditing(true)}>
          {targetSeconds ? '目標を変える' : '今週の目標を決める'}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error ? <FormMessage>{error}</FormMessage> : null}

      <fieldset>
        <legend className="pb-2 text-sm font-medium">今週はどのくらい？</legend>
        <div className="flex flex-wrap gap-2">
          {WEEKLY_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              aria-pressed={hours === preset}
              onClick={() => setHours(preset)}
              className={cn(
                'min-h-9 rounded-full border px-3 text-xs',
                hours === preset ? 'border-ember-500 bg-ember-500/10 font-medium' : 'border-[--color-border]',
              )}
            >
              {preset}時間
            </button>
          ))}
        </div>
      </fieldset>

      <Field label="週間テーマ（任意）" htmlFor="weekly-goal-message">
        <Input
          id="weekly-goal-message"
          value={text}
          maxLength={200}
          placeholder="毎朝30分ずつ"
          onChange={(event) => setText(event.target.value)}
        />
      </Field>

      <div className="flex gap-2">
        <Button size="sm" disabled={isPending} onClick={save}>
          {isPending ? '保存しています…' : '決める'}
        </Button>
        <Button size="sm" variant="ghost" disabled={isPending} onClick={() => setIsEditing(false)}>
          やめる
        </Button>
      </div>
    </div>
  );
}
