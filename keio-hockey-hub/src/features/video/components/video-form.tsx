'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field, FormMessage, Select, TextArea, TextInput } from '@/components/ui/field';
import { registerVideo, type VideoActionState } from '@/features/video/actions';
import type { EventRow } from '@/types/database.types';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" block disabled={pending}>
      {pending ? '登録しています…' : '動画を登録する'}
    </Button>
  );
}

/**
 * YouTube 動画の登録（18章 A）。
 *
 * 動画そのものは YouTube に置いたままにする。
 * ここで登録するのは「どの動画か」と「どの練習のものか」だけ。
 */
export function VideoForm({ events }: { events: EventRow[] }) {
  const [state, action] = useActionState<VideoActionState, FormData>(registerVideo, {});

  return (
    <Card>
      <CardHeader
        title="動画を登録する"
        description="YouTube に限定公開でアップロードしてから、その URL を貼り付けてください。"
      />

      <form action={action} className="space-y-4">
        {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
        {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}

        <Field label="YouTube の URL" htmlFor="source" required>
          <TextInput
            id="source"
            name="source"
            required
            inputMode="url"
            placeholder="https://www.youtube.com/watch?v=..."
          />
        </Field>

        <Field label="タイトル" htmlFor="title" required>
          <TextInput id="title" name="title" required placeholder="2026/08/10 練習試合 vs 早稲田" />
        </Field>

        <Field
          label="動画の長さ"
          htmlFor="duration"
          hint="「1:02:03」または秒数。入れておくと、範囲を指定するときに間違いを防げます"
        >
          <TextInput id="duration" name="duration" placeholder="1:02:03" />
        </Field>

        <Field label="撮影日" htmlFor="recorded_on">
          <TextInput id="recorded_on" name="recorded_on" type="date" />
        </Field>

        {events.length > 0 ? (
          <Field label="どの予定の動画か" htmlFor="event_id" hint="任意">
            <Select id="event_id" name="event_id" defaultValue="">
              <option value="">選ばない</option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.event_date} {event.title}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <Field label="説明" htmlFor="description">
          <TextArea id="description" name="description" rows={2} />
        </Field>

        <Field label="公開範囲" htmlFor="visibility">
          <Select id="visibility" name="visibility" defaultValue="team">
            <option value="team">チーム全員</option>
            <option value="private_staff">コーチとスタッフのみ</option>
          </Select>
        </Field>

        <SubmitButton />
      </form>
    </Card>
  );
}
