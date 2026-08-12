'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Field, FormMessage, TextArea } from '@/components/ui/field';
import { savePracticeGoal, type DailyActionState } from '@/features/daily/actions';
import type { PracticeGoalRow } from '@/types/database.types';

function SubmitButton({ isUpdate }: { isUpdate: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" block size="lg" variant="action" disabled={pending}>
      {pending ? '保存しています…' : isUpdate ? '目標を更新する' : '目標を決める'}
    </Button>
  );
}

/**
 * 今日の個人目標（15章）。
 *
 * 前回のフィードバックから引き継いだ課題があれば、最初から入れておく。
 * 「フィードバックが次の練習課題につながる」ための入口（依頼書3章の5）。
 */
export function GoalForm({
  date,
  eventId,
  existing,
  suggestedGoal,
  weekTheme,
}: {
  date: string;
  eventId: string | null;
  existing: PracticeGoalRow | null;
  /** 前回のコーチ回答から引き継いだ課題。 */
  suggestedGoal: string | null;
  weekTheme: string | null;
}) {
  const [state, action] = useActionState<DailyActionState, FormData>(savePracticeGoal, {});
  const defaultGoal = existing?.goal ?? suggestedGoal ?? '';

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="target_date" value={date} />
      <input type="hidden" name="event_id" value={eventId ?? ''} />

      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}

      {weekTheme ? (
        <p className="bg-keio-50 dark:bg-keio-800/40 rounded-lg px-3 py-2 text-sm">
          今週のテーマ: <span className="font-semibold">{weekTheme}</span>
        </p>
      ) : null}

      {suggestedGoal && !existing ? (
        <p className="bg-action-500/10 text-action-700 dark:text-action-400 rounded-lg px-3 py-2 text-sm">
          前回のフィードバックから引き継いだ課題を入れてあります。変えても構いません。
        </p>
      ) : null}

      <Field
        label="今日の個人目標"
        htmlFor="goal"
        required
        hint="ひとつだけ。「今日はこれを意識する」と言い切れる形にすると振り返りやすくなります"
      >
        <TextArea
          id="goal"
          name="goal"
          rows={3}
          required
          defaultValue={defaultGoal}
          placeholder="1対1で、まず前を向くことを3回試す"
        />
      </Field>

      {existing ? (
        <>
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">達成できましたか</legend>
            <div className="flex gap-2">
              {[
                { value: 'true', label: 'できた' },
                { value: 'false', label: 'できなかった' },
                { value: '', label: 'まだ' },
              ].map((option) => (
                <label
                  key={option.label}
                  className="has-[:checked]:border-keio-600 has-[:checked]:bg-keio-600 flex min-h-12 flex-1 cursor-pointer items-center justify-center rounded-lg border border-[--color-border] bg-[--color-surface] text-sm has-[:checked]:text-white"
                >
                  <input
                    type="radio"
                    name="achieved"
                    value={option.value}
                    defaultChecked={
                      option.value === ''
                        ? existing.achieved === null
                        : String(existing.achieved) === option.value
                    }
                    className="sr-only"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>

          <Field label="振り返り" htmlFor="reflection" hint="任意">
            <TextArea id="reflection" name="reflection" rows={2} defaultValue={existing.reflection ?? ''} />
          </Field>
        </>
      ) : null}

      <SubmitButton isUpdate={existing !== null} />
    </form>
  );
}
