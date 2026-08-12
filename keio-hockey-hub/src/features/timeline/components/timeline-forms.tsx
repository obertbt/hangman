'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field, FormMessage, Select, TextArea, TextInput } from '@/components/ui/field';
import { createEvent, createSeason, createWeek, type TimelineActionState } from '@/features/timeline/actions';
import { EVENT_TYPE_LABELS, SEASON_STATUS_LABELS } from '@/lib/labels';
import type { SeasonRow } from '@/types/database.types';

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} block>
      {pending ? '保存しています…' : label}
    </Button>
  );
}

function Messages({ state }: { state: TimelineActionState }) {
  return (
    <>
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}
    </>
  );
}

/** 開いたり閉じたりできる作成フォーム。普段は畳んでおく。 */
function Collapsible({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardHeader
        title={title}
        action={
          <Button variant="ghost" size="sm" onClick={() => setOpen((value) => !value)}>
            {open ? '閉じる' : '開く'}
          </Button>
        }
      />
      {open ? children : null}
    </Card>
  );
}

export function CreateSeasonForm() {
  const [state, action] = useActionState<TimelineActionState, FormData>(createSeason, {});
  const thisYear = new Date().getFullYear();

  return (
    <Collapsible title="シーズンを作る">
      <form action={action} className="space-y-3">
        <Messages state={state} />

        <Field label="シーズン名" htmlFor="season-name" required>
          <TextInput id="season-name" name="name" required placeholder={`${thisYear}シーズン`} />
        </Field>

        <Field label="年度" htmlFor="season-year" required>
          <TextInput
            id="season-year"
            name="fiscal_year"
            type="number"
            inputMode="numeric"
            defaultValue={thisYear}
            required
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="開始日" htmlFor="season-start" required>
            <TextInput id="season-start" name="start_date" type="date" required />
          </Field>
          <Field label="終了日" htmlFor="season-end" required>
            <TextInput id="season-end" name="end_date" type="date" required />
          </Field>
        </div>

        <Field label="シーズン目標" htmlFor="season-goal">
          <TextArea id="season-goal" name="goal" rows={2} />
        </Field>

        <Field label="シーズンテーマ" htmlFor="season-theme">
          <TextInput id="season-theme" name="theme" />
        </Field>

        <Field label="状態" htmlFor="season-status">
          <Select id="season-status" name="status" defaultValue="active">
            {Object.entries(SEASON_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="is_published" defaultChecked className="size-4" />
          選手に公開する
        </label>

        <SaveButton label="シーズンを作成" />
      </form>
    </Collapsible>
  );
}

export function CreateWeekForm({ seasons }: { seasons: SeasonRow[] }) {
  const [state, action] = useActionState<TimelineActionState, FormData>(createWeek, {});

  if (seasons.length === 0) {
    return (
      <Card>
        <CardHeader title="週を作る" />
        <p className="text-sm text-[--color-muted]">先にシーズンを作ってください。</p>
      </Card>
    );
  }

  return (
    <Collapsible title="今週のテーマを作る">
      <form action={action} className="space-y-3">
        <Messages state={state} />

        <Field label="シーズン" htmlFor="week-season" required>
          <Select id="week-season" name="season_id" required defaultValue={seasons[0]?.id}>
            {seasons.map((season) => (
              <option key={season.id} value={season.id}>
                {season.name}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="週の開始日" htmlFor="week-start" required hint="月曜など、週の始まりの日">
            <TextInput id="week-start" name="start_date" type="date" required />
          </Field>
          <Field label="週の終了日" htmlFor="week-end" required>
            <TextInput id="week-end" name="end_date" type="date" required />
          </Field>
        </div>

        <Field label="今週のテーマ" htmlFor="week-theme" hint="選手が最初に見る一言">
          <TextInput id="week-theme" name="theme" placeholder="奪ってから3本目までを速く" />
        </Field>

        <Field label="今週の課題" htmlFor="week-focus">
          <TextArea id="week-focus" name="focus_task" rows={2} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="重点技術" htmlFor="week-skill">
            <TextInput id="week-skill" name="key_skill" />
          </Field>
          <Field label="戦術テーマ" htmlFor="week-tactical">
            <TextInput id="week-tactical" name="tactical_theme" />
          </Field>
        </div>

        <Field label="週間メッセージ" htmlFor="week-message">
          <TextArea id="week-message" name="weekly_message" rows={2} />
        </Field>

        <Field label="前週からの継続課題" htmlFor="week-carried">
          <TextArea id="week-carried" name="carried_over_task" rows={2} />
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="is_published" defaultChecked className="size-4" />
          選手に公開する
        </label>

        <SaveButton label="週を作成" />
      </form>
    </Collapsible>
  );
}

export function CreateEventForm() {
  const [state, action] = useActionState<TimelineActionState, FormData>(createEvent, {});

  return (
    <Collapsible title="練習予定を作る">
      <form action={action} className="space-y-3">
        <Messages state={state} />

        <Field label="タイトル" htmlFor="event-title" required>
          <TextInput id="event-title" name="title" required placeholder="全体練習" />
        </Field>

        <Field label="種別" htmlFor="event-type">
          <Select id="event-type" name="event_type" defaultValue="practice">
            {Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="日付" htmlFor="event-date" required>
          <TextInput id="event-date" name="event_date" type="date" required />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="開始時刻" htmlFor="event-start">
            <TextInput id="event-start" name="start_time" type="time" />
          </Field>
          <Field label="終了時刻" htmlFor="event-end">
            <TextInput id="event-end" name="end_time" type="time" />
          </Field>
        </div>

        <Field label="場所" htmlFor="event-location">
          <TextInput id="event-location" name="location" placeholder="日吉グラウンド" />
        </Field>

        <Field label="今日のテーマ" htmlFor="event-theme">
          <TextInput id="event-theme" name="theme" />
        </Field>

        <Field label="目的" htmlFor="event-purpose">
          <TextArea id="event-purpose" name="purpose" rows={2} />
        </Field>

        <Field label="練習メニュー" htmlFor="event-menu">
          <TextArea id="event-menu" name="menu" rows={4} placeholder={'1. アップ 20分\n2. ...'} />
        </Field>

        <Field label="持ち物" htmlFor="event-items">
          <TextInput id="event-items" name="items_to_bring" />
        </Field>

        <Field label="注意事項" htmlFor="event-notes">
          <TextArea id="event-notes" name="notes" rows={2} />
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="is_published" defaultChecked className="size-4" />
          選手に公開する
        </label>

        <SaveButton label="予定を作成" />
      </form>
    </Collapsible>
  );
}
