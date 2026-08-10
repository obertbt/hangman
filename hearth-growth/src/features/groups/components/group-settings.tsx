'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Field, FormMessage, Input, Textarea } from '@/components/ui/field';
import { deleteGroupAction, leaveGroupAction, updateGroupAction } from '@/features/groups/actions';
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

/**
 * グループの削除。作成者だけが押せる。
 *
 * 消えるのは入れ物だけで、記録は誰のものであっても残る。
 * とはいえ取り消せない操作なので、グループ名を打ってもらってから実行する。
 */
export function DeleteGroupButton({
  groupId,
  groupName,
  memberCount,
}: {
  groupId: string;
  groupName: string;
  memberCount: number;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    setError(null);
    startTransition(async () => {
      const result = await deleteGroupAction(groupId);
      // 成功時はサーバー側で /groups へ遷移するため、戻り値が来るのは失敗したときだけ
      if (result && !result.ok) {
        setError(result.message);
      }
    });
  };

  if (!isOpen) {
    return (
      <div className="space-y-2">
        <Button variant="outline" onClick={() => setIsOpen(true)}>
          このグループを削除する
        </Button>
        <p className="text-xs text-[--color-muted]">
          記録は消えません。このグループにだけ公開していた記録は「自分だけ」に戻ります。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error ? <FormMessage>{error}</FormMessage> : null}

      <div className="rounded-xl bg-[--color-background] p-3 text-sm">
        <p className="font-medium">「{groupName}」を削除します。</p>
        <ul className="mt-2 space-y-1 text-xs text-[--color-muted]">
          <li>・{memberCount}人のメンバーは、このグループから外れます</li>
          <li>・招待リンクはすべて使えなくなります</li>
          <li>・記録は誰のものも消えません（このグループにだけ公開していたものは「自分だけ」に戻ります）</li>
          <li>・取り消せません</li>
        </ul>
      </div>

      <Field label={`確認のため「${groupName}」と入力してください`} htmlFor="confirm-group-name">
        <Input
          id="confirm-group-name"
          value={typed}
          autoComplete="off"
          onChange={(event) => setTyped(event.target.value)}
        />
      </Field>

      <div className="flex gap-2">
        <Button variant="outline" disabled={isPending || typed !== groupName} onClick={handleDelete}>
          {isPending ? '削除しています…' : '削除する'}
        </Button>
        <Button
          variant="ghost"
          disabled={isPending}
          onClick={() => {
            setIsOpen(false);
            setTyped('');
            setError(null);
          }}
        >
          やめる
        </Button>
      </div>
    </div>
  );
}
