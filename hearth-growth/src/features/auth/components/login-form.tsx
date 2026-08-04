'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Field, FormMessage, Input } from '@/components/ui/field';
import { signInAction } from '@/features/auth/actions';
import { signInSchema, type SignInInput } from '@/features/auth/schemas';

export function LoginForm({ next }: { next?: string }) {
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      // 成功時はサーバー側で redirect するため、戻り値が来るのは失敗したときだけ。
      const result = await signInAction(values, next);
      if (result && !result.ok) {
        setFormError(result.message);
      }
    });
  });

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

      <Field label="パスワード" htmlFor="password" error={errors.password?.message}>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={Boolean(errors.password)}
          {...register('password')}
        />
      </Field>

      <Button type="submit" block size="lg" disabled={isPending}>
        {isPending ? 'ログインしています…' : 'ログイン'}
      </Button>

      <div className="flex justify-between text-sm text-[--color-muted]">
        <Link href="/signup" className="underline underline-offset-4">
          新規登録
        </Link>
        <Link href="/reset-password" className="underline underline-offset-4">
          パスワードを忘れた
        </Link>
      </div>
    </form>
  );
}
