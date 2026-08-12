'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Field, FormMessage, TextInput } from '@/components/ui/field';
import { login, type ActionState } from '@/features/auth/actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" block size="lg" disabled={pending}>
      {pending ? 'ログインしています…' : 'ログイン'}
    </Button>
  );
}

export function LoginForm({ next }: { next: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(login, {});

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />

      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}

      <Field label="メールアドレス" htmlFor="email" required>
        <TextInput
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          placeholder="you@example.com"
        />
      </Field>

      <Field label="パスワード" htmlFor="password" required>
        <TextInput id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>

      <SubmitButton />

      <p className="text-center text-sm">
        <Link href="/reset-password" className="text-keio-700 dark:text-keio-300 underline">
          パスワードを忘れた場合
        </Link>
      </p>
    </form>
  );
}
