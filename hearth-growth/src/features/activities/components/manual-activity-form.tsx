'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Field, FormMessage, Input, Textarea } from '@/components/ui/field';
import { createManualAction } from '@/features/activities/actions';
import { VisibilityPicker, type VisibilityState } from '@/features/activities/components/visibility-picker';
import { toDurationSeconds } from '@/features/activities/schemas';
import { formatDuration } from '@/lib/date/duration';
import { cn } from '@/lib/utils/cn';
import type { CategoryRow, Visibility } from '@/types/database.types';

interface ManualActivityFormProps {
  categories: CategoryRow[];
  today: string;
  defaultVisibility: Visibility;
  groups: { id: string; name: string }[];
  reachableUsers: { userId: string; displayName: string; avatarUrl: string | null }[];
}

/** よく使う長さ。毎回入力させないための近道。 */
const QUICK_MINUTES = [15, 30, 45, 60, 90, 120];

/** 手動記録（6.2）。タイマーを使わなかった活動もここから残せる。 */
export function ManualActivityForm({
  categories,
  today,
  defaultVisibility,
  groups,
  reachableUsers,
}: ManualActivityFormProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(30);
  const [activityDate, setActivityDate] = useState(today);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const initialVisibility: Visibility =
    defaultVisibility === 'group' && groups.length === 0 ? 'private' : defaultVisibility;

  const [target, setTarget] = useState<VisibilityState>({
    visibility: initialVisibility,
    groupId: initialVisibility === 'group' ? (groups[0]?.id ?? null) : null,
    allowedUserIds: [],
  });

  const durationSeconds = toDurationSeconds(hours, minutes);

  const handleSubmit = () => {
    setError(null);
    startTransition(async () => {
      const result = await createManualAction({
        categoryId,
        durationSeconds,
        activityDate,
        title,
        body,
        visibility: target.visibility,
        groupId: target.groupId,
        allowedUserIds: target.allowedUserIds,
      });
      if (result.ok) {
        setTitle('');
        setBody('');
        setIsOpen(false);
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  };

  if (categories.length === 0) {
    return (
      <p className="text-sm text-[--color-muted]">使えるカテゴリーがありません。設定から追加してください。</p>
    );
  }

  if (!isOpen) {
    return <Button onClick={() => setIsOpen(true)}>手動で記録する</Button>;
  }

  return (
    <div className="space-y-5">
      {error ? <FormMessage>{error}</FormMessage> : null}

      <fieldset>
        <legend className="pb-2 text-sm font-medium">何をしましたか？</legend>
        <div className="grid grid-cols-3 gap-2">
          {categories.map((category) => {
            const isSelected = category.id === categoryId;
            return (
              <button
                key={category.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setCategoryId(category.id)}
                // 選択中は色そのものではなく淡い面と枠で示す（読みやすさのため）
                className={cn(
                  'flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl border-2 p-2 text-xs',
                  isSelected ? 'border-current font-medium' : 'border-[--color-border]',
                )}
                style={
                  isSelected ? { backgroundColor: `${category.color}1f`, color: category.color } : undefined
                }
              >
                <span aria-hidden className="text-lg">
                  {category.icon}
                </span>
                <span className="line-clamp-1">{category.name}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="pb-2 text-sm font-medium">どのくらい？</legend>
        <div className="flex flex-wrap gap-2 pb-3">
          {QUICK_MINUTES.map((quick) => (
            <button
              key={quick}
              type="button"
              onClick={() => {
                setHours(Math.floor(quick / 60));
                setMinutes(quick % 60);
              }}
              className={cn(
                'min-h-9 rounded-full border px-3 text-xs',
                durationSeconds === quick * 60
                  ? 'border-ember-500 bg-ember-500/10 font-medium'
                  : 'border-[--color-border]',
              )}
            >
              {formatDuration(quick * 60)}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <Field label="時間" htmlFor="hours">
            <Input
              id="hours"
              type="number"
              inputMode="numeric"
              min={0}
              max={24}
              value={hours}
              onChange={(event) => setHours(Number(event.target.value))}
            />
          </Field>
          <Field label="分" htmlFor="minutes">
            <Input
              id="minutes"
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

      <Field label="いつ" htmlFor="activityDate">
        <Input
          id="activityDate"
          type="date"
          value={activityDate}
          max={today}
          onChange={(event) => setActivityDate(event.target.value)}
        />
      </Field>

      <Field label="活動タイトル（任意）" htmlFor="manual-title">
        <Input
          id="manual-title"
          value={title}
          maxLength={100}
          placeholder="ランニング、読書、など"
          onChange={(event) => setTitle(event.target.value)}
        />
      </Field>

      <Field label="振り返り（任意）" htmlFor="manual-body">
        <Textarea
          id="manual-body"
          rows={3}
          value={body}
          maxLength={5000}
          onChange={(event) => setBody(event.target.value)}
        />
      </Field>

      <VisibilityPicker value={target} onChange={setTarget} groups={groups} reachableUsers={reachableUsers} />

      <div className="flex gap-2">
        <Button disabled={isPending || durationSeconds === 0} onClick={handleSubmit}>
          {isPending ? '保存しています…' : '記録する'}
        </Button>
        <Button variant="ghost" disabled={isPending} onClick={() => setIsOpen(false)}>
          やめる
        </Button>
      </div>
    </div>
  );
}
