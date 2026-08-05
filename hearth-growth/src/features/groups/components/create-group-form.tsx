'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Field, FormMessage, Input, Textarea } from '@/components/ui/field';
import { createGroupAction } from '@/features/groups/actions';
import { createGroupSchema, type CreateGroupInput } from '@/features/groups/schemas';

export function CreateGroupForm() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateGroupInput>({
    resolver: zodResolver(createGroupSchema),
    defaultValues: { name: '', description: '' },
  });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await createGroupAction(values);
      if (result.ok) {
        reset();
        setIsOpen(false);
        router.push(`/groups/${result.data}`);
      } else {
        setFormError(result.message);
      }
    });
  });

  if (!isOpen) {
    return <Button onClick={() => setIsOpen(true)}>グループを作る</Button>;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {formError ? <FormMessage>{formError}</FormMessage> : null}

      <Field
        label="グループ名"
        htmlFor="name"
        error={errors.name?.message}
        hint="家族、友人、勉強仲間など。あとから変えられます。"
      >
        <Input id="name" aria-invalid={Boolean(errors.name)} {...register('name')} />
      </Field>

      <Field label="説明（任意）" htmlFor="description" error={errors.description?.message}>
        <Textarea id="description" rows={2} {...register('description')} />
      </Field>

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? '作成しています…' : '作成する'}
        </Button>
        <Button type="button" variant="ghost" disabled={isPending} onClick={() => setIsOpen(false)}>
          やめる
        </Button>
      </div>
    </form>
  );
}
