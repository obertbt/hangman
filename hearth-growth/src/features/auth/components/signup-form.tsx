'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Field, FormMessage, Input } from '@/components/ui/field';
import { signUpAction } from '@/features/auth/actions';
import { signUpSchema, type SignUpInput } from '@/features/auth/schemas';

export function SignupForm({ next }: { next?: string }) {
  const [formError, setFormError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { email: '', password: '', displayName: '' },
  });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await signUpAction(values, next);
      if (!result) return;
      if (result.ok) {
        // メール確認が必要な設定の場合はここに来る
        setNeedsConfirmation(true);
      } else {
        setFormError(result.message);
      }
    });
  });

  if (needsConfirmation) {
    return (
      <div className="space-y-4">
        <FormMessage tone="success">
          確認メールを送りました。メール内のリンクを開くと登録が完了します。
        </FormMessage>
        <p className="text-center text-sm text-[--color-muted]">
          <Link href="/login" className="underline underline-offset-4">
            ログインへ戻る
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {formError ? <FormMessage>{formError}</FormMessage> : null}

      <Field
        label="表示名"
        htmlFor="displayName"
        error={errors.displayName?.message}
        hint="グループのメンバーに表示される名前です。あとから変更できます。"
      >
        <Input
          id="displayName"
          autoComplete="nickname"
          aria-invalid={Boolean(errors.displayName)}
          {...register('displayName')}
        />
      </Field>

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

      <Field
        label="パスワード"
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

      <Button type="submit" block size="lg" disabled={isPending}>
        {isPending ? '登録しています…' : '登録する'}
      </Button>

      <p className="text-center text-sm text-[--color-muted]">
        すでにアカウントがある場合は{' '}
        <Link href="/login" className="underline underline-offset-4">
          ログイン
        </Link>
      </p>
    </form>
  );
}
