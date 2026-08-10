'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Field, FormMessage, Input, Textarea } from '@/components/ui/field';
import { deleteActivityAction, updateActivityAction } from '@/features/activities/actions';
import { VisibilityPicker, type VisibilityState } from '@/features/activities/components/visibility-picker';
import type { ActivityDetail } from '@/features/activities/queries';
import { fromDurationSeconds, toDurationSeconds } from '@/features/activities/schemas';
import { formatDuration } from '@/lib/date/duration';

interface EditActivityFormProps {
  activity: ActivityDetail;
  today: string;
  groups: { id: string; name: string }[];
  reachableUsers: { userId: string; displayName: string; avatarUrl: string | null }[];
}

export function EditActivityForm({ activity, today, groups, reachableUsers }: EditActivityFormProps) {
  const router = useRouter();
  const initialDuration = fromDurationSeconds(activity.durationSeconds);

  const [title, setTitle] = useState(activity.title ?? '');
  const [body, setBody] = useState(activity.body ?? '');
  const [hours, setHours] = useState(initialDuration.hours);
  const [minutes, setMinutes] = useState(initialDuration.minutes);
  const [activityDate, setActivityDate] = useState(activity.activityDate);
  const [target, setTarget] = useState<VisibilityState>({
    visibility: activity.visibility,
    groupIds: activity.groupIds,
    allowedUserIds: activity.allowedUserIds,
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSave = () => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateActivityAction({
        postId: activity.id,
        title,
        body,
        // タイマー由来の記録では DB 側が時間と日付を据え置く
        durationSeconds: activity.fromTimer ? undefined : toDurationSeconds(hours, minutes),
        activityDate: activity.fromTimer ? undefined : activityDate,
        visibility: target.visibility,
        groupIds: target.groupIds,
        allowedUserIds: target.allowedUserIds,
      });
      if (result.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  };

  const handleDelete = () => {
    if (!window.confirm('この記録を削除しますか？')) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteActivityAction(activity.id);
      if (result.ok) {
        router.push('/activities');
      } else {
        setError(result.message);
      }
    });
  };

  return (
    <div className="space-y-5">
      {error ? <FormMessage>{error}</FormMessage> : null}
      {saved ? <FormMessage tone="success">保存しました。</FormMessage> : null}

      <Field label="活動タイトル" htmlFor="edit-title">
        <Input
          id="edit-title"
          value={title}
          maxLength={100}
          onChange={(event) => setTitle(event.target.value)}
        />
      </Field>

      <Field label="振り返り" htmlFor="edit-body">
        <Textarea
          id="edit-body"
          rows={5}
          value={body}
          maxLength={5000}
          onChange={(event) => setBody(event.target.value)}
        />
      </Field>

      {activity.fromTimer ? (
        <div className="rounded-xl bg-[--color-background] p-3">
          <p className="text-sm">
            活動時間 <span className="font-medium">{formatDuration(activity.durationSeconds)}</span>
          </p>
          <p className="mt-1 text-xs text-[--color-muted]">
            タイマーで計った記録のため、時間と日付は変更できません。
          </p>
        </div>
      ) : (
        <>
          <fieldset>
            <legend className="pb-2 text-sm font-medium">活動時間</legend>
            <div className="flex items-end gap-2">
              <Field label="時間" htmlFor="edit-hours">
                <Input
                  id="edit-hours"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={24}
                  value={hours}
                  onChange={(event) => setHours(Number(event.target.value))}
                />
              </Field>
              <Field label="分" htmlFor="edit-minutes">
                <Input
                  id="edit-minutes"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={59}
                  value={minutes}
                  onChange={(event) => setMinutes(Number(event.target.value))}
                />
              </Field>
            </div>
          </fieldset>

          <Field label="活動日" htmlFor="edit-date">
            <Input
              id="edit-date"
              type="date"
              value={activityDate}
              max={today}
              onChange={(event) => setActivityDate(event.target.value)}
            />
          </Field>
        </>
      )}

      <VisibilityPicker value={target} onChange={setTarget} groups={groups} reachableUsers={reachableUsers} />

      <div className="flex flex-col gap-2">
        <Button disabled={isPending} onClick={handleSave}>
          {isPending ? '保存しています…' : '保存する'}
        </Button>
        <Button variant="ghost" disabled={isPending} onClick={handleDelete}>
          この記録を削除する
        </Button>
      </div>
    </div>
  );
}
