'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Field, FormMessage, Input, Textarea } from '@/components/ui/field';
import { leaveGroupAction, updateGroupAction } from '@/features/groups/actions';
import { updateGroupSchema, type UpdateGroupInput } from '@/features/groups/schemas';
import type { GroupRow } from '@/types/database.types';

export function GroupEditForm({ group }: { group: GroupRow }) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UpdateGroupInput>({
    resolver: zodResolver(updateGroupSchema),
    defaultValues: {
      groupId: group.id,
      name: group.name,
      description: group.description ?? '',
    },
  });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateGroupAction(values);
      if (result.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setFormError(result.message);
      }
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {formError ? <FormMessage>{formError}</FormMessage> : null}
      {saved ? <FormMessage tone="success">保存しました。</FormMessage> : null}

      <input type="hidden" {...register('groupId')} />

      <Field label="グループ名" htmlFor="group-name" error={errors.name?.message}>
        <Input id="group-name" aria-invalid={Boolean(errors.name)} {...register('name')} />
      </Field>

      <Field label="説明" htmlFor="group-description" error={errors.description?.message}>
        <Textarea id="group-description" rows={2} {...register('description')} />
      </Field>

      <Button type="submit" disabled={isPending}>
        {isPending ? '保存しています…' : '保存する'}
      </Button>
    </form>
  );
}

export function LeaveGroupButton({ groupId, groupName }: { groupId: string; groupName: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleLeave = () => {
    if (!window.confirm(`「${groupName}」から退会しますか？`)) return;
    setError(null);
    startTransition(async () => {
      const result = await leaveGroupAction(groupId);
      // 成功時はサーバー側で /groups へ遷移するため、戻り値が来るのは失敗したときだけ
      if (result && !result.ok) {
        setError(result.message);
      }
    });
  };

  return (
    <div className="space-y-2">
      {error ? <FormMessage>{error}</FormMessage> : null}
      <Button variant="outline" disabled={isPending} onClick={handleLeave}>
        {isPending ? '処理しています…' : 'このグループから退会する'}
      </Button>
    </div>
  );
}
