'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Field, FormMessage, Select, TextArea, TextInput } from '@/components/ui/field';
import {
  createMeasurementEvent,
  createMeasurementItem,
  type MeasurementActionState,
} from '@/features/measurement/actions';

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="action" block disabled={pending}>
      {pending ? '保存しています…' : label}
    </Button>
  );
}

/** 測定会を作る。 */
export function EventForm({ today }: { today: string }) {
  const [state, formAction] = useActionState<MeasurementActionState, FormData>(createMeasurementEvent, {});

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}

      <Field label="測定会の名前" htmlFor="name" required hint="「春の測定会」など">
        <TextInput id="name" name="name" required placeholder="春の測定会" />
      </Field>

      <Field label="実施日" htmlFor="measured_on" required>
        <TextInput id="measured_on" name="measured_on" type="date" required defaultValue={today} />
      </Field>

      <Field label="メモ" htmlFor="note" hint="天候や条件など。空でも構いません。">
        <TextArea id="note" name="note" rows={2} placeholder="雨天のため体育館で実施" />
      </Field>

      <SubmitButton label="測定会を作る" />
    </form>
  );
}

/**
 * 測定項目を足す。
 *
 * **良い方向をここで決める。** これを間違えると、
 * 速くなったのに「落ちた」と表示されてしまう。
 */
export function ItemForm() {
  const [state, formAction] = useActionState<MeasurementActionState, FormData>(createMeasurementItem, {});

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}

      <Field label="項目の名前" htmlFor="item_name" required>
        <TextInput id="item_name" name="name" required placeholder="50m走" />
      </Field>

      <Field label="単位" htmlFor="unit" hint="「秒」「回」「cm」など。無くても構いません。">
        <TextInput id="unit" name="unit" placeholder="秒" />
      </Field>

      <Field
        label="良い方向"
        htmlFor="better"
        required
        hint="ここを間違えると、伸びたのに「落ちた」と出てしまいます。"
      >
        <Select id="better" name="better" defaultValue="lower" required>
          <option value="lower">小さいほど良い（タイムなど）</option>
          <option value="higher">大きいほど良い（回数・距離など）</option>
        </Select>
      </Field>

      <SubmitButton label="項目を足す" />
    </form>
  );
}
