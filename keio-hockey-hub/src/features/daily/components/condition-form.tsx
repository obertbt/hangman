'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Field, FormMessage, TextArea, TextInput } from '@/components/ui/field';
import { RatingField } from '@/components/ui/rating';
import { saveCondition, type DailyActionState } from '@/features/daily/actions';
import type { DailyConditionRow } from '@/types/database.types';

function SubmitButton({ isUpdate }: { isUpdate: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" block size="lg" variant="action" disabled={pending}>
      {pending ? '保存しています…' : isUpdate ? '入力を更新する' : '保存する'}
    </Button>
  );
}

/**
 * 練習前のコンディション（15章）。
 *
 * 練習前の慌ただしい時間に入力するものなので、
 * 指2〜3回で終わることを目指している。文章は任意。
 */
export function ConditionForm({
  date,
  eventId,
  existing,
}: {
  date: string;
  eventId: string | null;
  existing: DailyConditionRow | null;
}) {
  const [state, action] = useActionState<DailyActionState, FormData>(saveCondition, {});
  const [hasPain, setHasPain] = useState(existing?.has_pain ?? false);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="recorded_on" value={date} />
      <input type="hidden" name="event_id" value={eventId ?? ''} />

      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}

      <RatingField
        name="condition_level"
        label="今日の調子"
        lowLabel="よくない"
        highLabel="とても良い"
        defaultValue={existing?.condition_level ?? null}
      />

      <RatingField
        name="fatigue_level"
        label="疲労度"
        lowLabel="疲れていない"
        highLabel="とても疲れている"
        defaultValue={existing?.fatigue_level ?? null}
      />

      <Field label="睡眠時間" htmlFor="sleep_hours" hint="任意。0.5刻みで入力できます">
        <TextInput
          id="sleep_hours"
          name="sleep_hours"
          type="number"
          inputMode="decimal"
          step="0.5"
          min="0"
          max="24"
          defaultValue={existing?.sleep_hours ?? ''}
          placeholder="7"
        />
      </Field>

      <div className="space-y-2">
        <label className="flex min-h-12 items-center gap-3 rounded-lg border border-[--color-border] px-3 text-sm">
          <input
            type="checkbox"
            name="has_pain"
            className="size-5"
            checked={hasPain}
            onChange={(event) => setHasPain(event.target.checked)}
          />
          痛み・違和感がある
        </label>

        {hasPain ? (
          <Field label="どこが、どんなふうに" htmlFor="pain_note">
            <TextArea
              id="pain_note"
              name="pain_note"
              rows={2}
              defaultValue={existing?.pain_note ?? ''}
              placeholder="右足首の外側。切り返しのときに痛む。"
            />
          </Field>
        ) : null}
      </div>

      <Field label="そのほか伝えておきたいこと" htmlFor="note" hint="任意">
        <TextArea id="note" name="note" rows={2} defaultValue={existing?.note ?? ''} />
      </Field>

      <SubmitButton isUpdate={existing !== null} />

      <p className="text-xs text-[--color-muted]">
        コンディションはコーチが見られます。痛みや不調は、我慢せずそのまま書いてください。
      </p>
    </form>
  );
}
