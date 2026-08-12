'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Field, FormMessage, TextInput } from '@/components/ui/field';
import { requestPasswordReset, type ActionState } from '@/features/auth/actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" block disabled={pending}>
      {pending ? '送信しています…' : '再設定メールを送る'}
    </Button>
  );
}

export default function ResetPasswordPage() {
  const [state, formAction] = useActionState<ActionState, FormData>(requestPasswordReset, {});

  return (
    <>
      <h2 className="mb-4 text-lg font-semibold">パスワードの再設定</h2>
      <form action={formAction} className="space-y-4">
        {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
        {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}

        <Field label="メールアドレス" htmlFor="email" required>
          <TextInput id="email" name="email" type="email" autoComplete="email" required />
        </Field>

        <SubmitButton />
      </form>

      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="text-keio-700 dark:text-keio-300 underline">
          ログイン画面へ戻る
        </Link>
      </p>
    </>
  );
}
