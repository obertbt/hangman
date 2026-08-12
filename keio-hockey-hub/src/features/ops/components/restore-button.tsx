'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { restoreItem, type RestoreState } from '@/features/ops/restore-actions';

function Inner({ restorable }: { restorable: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending || !restorable}>
      {pending ? '戻しています…' : '元に戻す'}
    </Button>
  );
}

export function RestoreButton({
  kind,
  itemId,
  restorable,
}: {
  kind: string;
  itemId: string;
  restorable: boolean;
}) {
  const [state, formAction] = useActionState<RestoreState, FormData>(restoreItem, {});

  return (
    <form action={formAction} className="shrink-0 text-right">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="item_id" value={itemId} />

      <Inner restorable={restorable} />

      {state.error ? (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">{state.success}</p>
      ) : null}
    </form>
  );
}
