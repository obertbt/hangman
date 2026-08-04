'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Field, FormMessage, Input } from '@/components/ui/field';
import { updatePasswordAction } from '@/features/auth/actions';
import { updatePasswordSchema, type UpdatePasswordInput } from '@/features/auth/schemas';

export function UpdatePasswordForm() {
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UpdatePasswordInput>({
    resolver: zodResolver(updatePasswordSchema),
    defaultValues: { password: '', passwordConfirm: '' },
  });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await updatePasswordAction(values);
      if (result && !result.ok) {
        setFormError(result.message);
      }
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {formError ? <FormMessage>{formError}</FormMessage> : null}

      <Field
        label="新しいパスワード"
        htmlFor="password"
        error={errors.password?.message}
        hint="8文字以上で設定してください。"
      >
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.password)}
          {...register('password')}
        />
      </Field>

      <Field label="確認のためもう一度" htmlFor="passwordConfirm" error={errors.passwordConfirm?.message}>
        <Input
          id="passwordConfirm"
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.passwordConfirm)}
          {...register('passwordConfirm')}
        />
      </Field>

      <Button type="submit" block size="lg" disabled={isPending}>
        {isPending ? '変更しています…' : 'パスワードを変更する'}
      </Button>
    </form>
  );
}
