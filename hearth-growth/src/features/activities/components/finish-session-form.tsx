'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Field, FormMessage, Input, Textarea } from '@/components/ui/field';
import { createFromSessionAction } from '@/features/activities/actions';
import { VisibilityPicker, type VisibilityState } from '@/features/activities/components/visibility-picker';
import { formatDuration } from '@/lib/date/duration';
import type { CategoryRow, Visibility } from '@/types/database.types';

interface FinishSessionFormProps {
  sessionId: string;
  durationSeconds: number;
  category: Pick<CategoryRow, 'name' | 'icon' | 'color'> | null;
  defaultTitle: string | null;
  defaultVisibility: Visibility;
  groups: { id: string; name: string }[];
  reachableUsers: { userId: string; displayName: string; avatarUrl: string | null }[];
}

/**
 * 活動終了画面（7.4）。
 *
 * 16.4 に従い、本文なしでも保存できる。
 * カテゴリーと活動時間だけで記録は完了する。
 */
export function FinishSessionForm({
  sessionId,
  durationSeconds,
  category,
  defaultTitle,
  defaultVisibility,
  groups,
  reachableUsers,
}: FinishSessionFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(defaultTitle ?? '');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // グループに入っていなければ group 公開は選べない
  const initialVisibility: Visibility =
    defaultVisibility === 'group' && groups.length === 0 ? 'private' : defaultVisibility;

  const [target, setTarget] = useState<VisibilityState>({
    visibility: initialVisibility,
    groupId: initialVisibility === 'group' ? (groups[0]?.id ?? null) : null,
    allowedUserIds: [],
  });

  const submit = (visibility: VisibilityState) => {
    setError(null);
    startTransition(async () => {
      const result = await createFromSessionAction({
        sessionId,
        title,
        body,
        visibility: visibility.visibility,
        groupId: visibility.groupId,
        allowedUserIds: visibility.allowedUserIds,
      });
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

      <div className="text-center">
        {category ? (
          <p className="text-sm" style={{ color: category.color }}>
            <span aria-hidden className="mr-1">
              {category.icon}
            </span>
            {category.name}
          </p>
        ) : null}
        <p className="mt-1 text-3xl font-bold">{formatDuration(durationSeconds)}</p>
        <p className="mt-1 text-sm text-[--color-muted]">おつかれさまでした。</p>
      </div>

      <Field label="活動タイトル（任意）" htmlFor="title">
        <Input id="title" value={title} maxLength={100} onChange={(event) => setTitle(event.target.value)} />
      </Field>

      <Field label="振り返り（任意）" htmlFor="body" hint="書かなくても記録は残ります。">
        <Textarea
          id="body"
          rows={4}
          value={body}
          maxLength={5000}
          placeholder="できたこと、気づいたこと"
          onChange={(event) => setBody(event.target.value)}
        />
      </Field>

      <VisibilityPicker value={target} onChange={setTarget} groups={groups} reachableUsers={reachableUsers} />

      <div className="flex flex-col gap-2">
        <Button size="lg" block disabled={isPending} onClick={() => submit(target)}>
          {isPending ? '保存しています…' : '記録する'}
        </Button>
        <Button
          variant="ghost"
          disabled={isPending}
          onClick={() => submit({ visibility: 'private', groupId: null, allowedUserIds: [] })}
        >
          非公開で保存する
        </Button>
      </div>
    </div>
  );
}
