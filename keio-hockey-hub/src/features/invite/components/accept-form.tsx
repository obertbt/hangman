'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Field, FormMessage, TextInput } from '@/components/ui/field';
import { acceptInvitation, type InviteState } from '@/features/invite/actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="action" size="lg" block disabled={pending}>
      {pending ? '登録しています…' : 'はじめる'}
    </Button>
  );
}

/**
 * 招待を受ける（受け取る側の唯一の画面）。
 *
 * この人はまだ部員でもログイン利用者でもない。
 * 入れてもらうのはパスワードだけにする。
 * 名前は名簿にあるので聞かない（初めての人にだけ聞く）。
 */
export function AcceptForm({
  token,
  email,
  needsName,
}: {
  token: string;
  email: string;
  needsName: boolean;
}) {
  const [state, formAction] = useActionState<InviteState, FormData>(acceptInvitation, {});

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}

      <Field label="メールアドレス" htmlFor="email_display">
        {/* 変えられない。招待した相手と別の人が入るのを防ぐ */}
        <TextInput id="email_display" value={email} readOnly disabled />
      </Field>

      {needsName ? (
        <Field label="氏名" htmlFor="full_name" required hint="名簿に載る名前です。">
          <TextInput id="full_name" name="full_name" required autoComplete="name" />
        </Field>
      ) : null}

      <Field
        label="パスワード"
        htmlFor="password"
        required
        hint="8文字以上。記号を混ぜる決まりはありません。覚えられるものにしてください。"
      >
        <TextInput
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </Field>

      <SubmitButton />

      <p className="text-xs text-[--color-muted]">
        登録するとそのままログインします。次からはメールアドレスとパスワードで入れます。
      </p>
    </form>
  );
}
