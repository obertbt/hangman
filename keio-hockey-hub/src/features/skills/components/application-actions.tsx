'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/field';
import { transitionSkillApplication, type SkillActionState } from '@/features/skills/actions';
import type { ActionDefinition } from '@/features/skills/lib/state';

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
 * いまできる操作だけを並べる（32章）。
 *
 * 審査（承認・差し戻し・見送り）は ReviewForm が受け持つ。
 * ここは出し直す・取り下げる・審査を始める、の3つだけ。
 */
export function ApplicationActions({
  applicationId,
  actions,
}: {
  applicationId: string;
  actions: ActionDefinition[];
}) {
  const [state, formAction] = useActionState<SkillActionState, FormData>(transitionSkillApplication, {});

  const shown = actions.filter(
    (definition) =>
      definition.action === 'submit' ||
      definition.action === 'withdraw' ||
      definition.action === 'start_review',
  );

  if (shown.length === 0 && !state.success && !state.error) return null;

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="application_id" value={applicationId} />

      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}

      {shown.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {shown.map((definition) => (
            <ActionButton key={definition.action} definition={definition} />
          ))}
        </div>
      ) : null}
    </form>
  );
}
