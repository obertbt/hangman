'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/field';
import { transitionFeedback, type FeedbackActionState } from '@/features/feedback/actions';
import type { ActionDefinition } from '@/features/feedback/lib/state';

function ActionButton({ definition }: { definition: ActionDefinition }) {
  const { pending } = useFormStatus();
  const [confirming, setConfirming] = useState(false);

  // 戻せない操作は一度確認を挟む
  if (definition.destructive && !confirming) {
    return (
      <Button variant="outline" size="sm" onClick={() => setConfirming(true)} disabled={pending}>
        {definition.label}
      </Button>
    );
  }

  return (
    <Button
      type="submit"
      name="action"
      value={definition.action}
      size="sm"
      variant={definition.destructive ? 'danger' : 'primary'}
      disabled={pending}
    >
      {pending ? '処理しています…' : definition.destructive ? `本当に${definition.label}` : definition.label}
    </Button>
  );
}

/**
 * いまできる操作だけを並べる（27章）。
 *
 * 何を出すかは状態遷移の表が決める。
 * 画面側で条件を書かないので、規則を変えるときは1か所だけ直せばよい。
 */
export function FeedbackActions({ requestId, actions }: { requestId: string; actions: ActionDefinition[] }) {
  const [state, formAction] = useActionState<FeedbackActionState, FormData>(transitionFeedback, {});

  if (actions.length === 0 && !state.success && !state.error) return null;

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="feedback_request_id" value={requestId} />

      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}

      {actions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {actions.map((definition) => (
            <ActionButton key={definition.action} definition={definition} />
          ))}
        </div>
      ) : null}
    </form>
  );
}
