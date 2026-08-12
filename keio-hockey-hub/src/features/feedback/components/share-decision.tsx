'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/field';
import { decideTeamShare, type FeedbackActionState } from '@/features/feedback/actions';

function DecisionButtons() {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="submit" name="decision" value="approved" variant="action" disabled={pending}>
        {pending ? '送っています…' : 'チームに共有してよい'}
      </Button>
      <Button type="submit" name="decision" value="rejected" variant="outline" disabled={pending}>
        共有しない
      </Button>
    </div>
  );
}

/**
 * チーム共有の承認（29章）。
 *
 * **決められるのは質問した本人だけ。**
 * コーチが「みんなに見せたい」と思っても、選手が承認するまで公開されない。
 * 自分の失敗を全員に見られる前提だと、選手は質問しなくなるため。
 */
export function ShareDecision({ shareRequestId, reason }: { shareRequestId: string; reason: string | null }) {
  const [state, formAction] = useActionState<FeedbackActionState, FormData>(decideTeamShare, {});

  if (state.success) {
    return (
      <Card>
        <FormMessage tone="success">{state.success}</FormMessage>
      </Card>
    );
  }

  return (
    <Card className="border-action-500/40">
      <CardHeader
        title="コーチがチームへの共有を提案しています"
        description="あなたが決められます。共有しなくても、コーチとのやり取りはそのまま続けられます。"
      />

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="share_request_id" value={shareRequestId} />

        {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}

        {reason ? (
          <p className="bg-keio-50 dark:bg-keio-800/40 rounded-lg px-3 py-2 text-sm">{reason}</p>
        ) : null}

        <DecisionButtons />
      </form>
    </Card>
  );
}
