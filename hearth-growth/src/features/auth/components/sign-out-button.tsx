'use client';

import { useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { signOutAction } from '@/features/auth/actions';

export function SignOutButton() {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      disabled={isPending}
      onClick={() => startTransition(() => signOutAction())}
    >
      {isPending ? 'ログアウトしています…' : 'ログアウト'}
    </Button>
  );
}
