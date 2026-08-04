'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Field, FormMessage, Input } from '@/components/ui/field';
import { requestPasswordResetAction } from '@/features/auth/actions';
import { resetRequestSchema, type ResetRequestInput } from '@/features/auth/schemas';

export function ResetRequestForm() {
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetRequestInput>({
    resolver: zodResolver(resetRequestSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await requestPasswordResetAction(values);
      if (result.ok) {
        setSent(true);
      } else {
        setFormError(result.message);
      }
    });
  });

  if (sent) {
    return (
      <FormMessage tone="success">
        登録済みのメールアドレスであれば、再設定用のリンクを送りました。メールをご確認ください。
      </FormMessage>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {formError ? <FormMessage>{formError}</FormMessage> : null}

      <Field label="メールアドレス" htmlFor="email" error={errors.email?.message}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          aria-invalid={Boolean(errors.email)}
          {...register('email')}
        />
      </Field>

      <Button type="submit" block size="lg" disabled={isPending}>
        {isPending ? '送信しています…' : '再設定メールを送る'}
      </Button>

      <p className="text-center text-sm text-[--color-muted]">
        <Link href="/login" className="underline underline-offset-4">
          ログインへ戻る
        </Link>
      </p>
    </form>
  );
}
