'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/field';
import { acceptInvitationAction } from '@/features/groups/actions';

export function AcceptInvitationButton({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleAccept = () => {
    setError(null);
    startTransition(async () => {
      const result = await acceptInvitationAction(token);
      if (result.ok) {
        router.push(`/groups/${result.data}`);
      } else {
        setError(result.message);
      }
    });
  };

  return (
    <div className="space-y-3">
      {error ? <FormMessage>{error}</FormMessage> : null}
      <Button block size="lg" disabled={isPending} onClick={handleAccept}>
        {isPending ? '参加しています…' : 'このグループに参加する'}
      </Button>
    </div>
  );
}
