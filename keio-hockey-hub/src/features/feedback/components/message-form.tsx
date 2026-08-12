'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Field, FormMessage, TextArea } from '@/components/ui/field';
import { postFeedbackMessage, type FeedbackActionState } from '@/features/feedback/actions';

function SubmitButton({ isFollowUp }: { isFollowUp: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} block variant={isFollowUp ? 'action' : 'secondary'}>
      {pending ? '送っています…' : isFollowUp ? 'もう一度聞く' : '書き込む'}
    </Button>
  );
}

/**
 * 再質問・補足のやり取り（56章）。
 *
 * 選手からは「分からなかったところ」をもう一度聞ける。
 * 一度の回答で終わらせず、納得するまで続けられるようにする。
 */
export function MessageForm({
  requestId,
  canFollowUp,
}: {
  requestId: string;
  /** いま再質問できる状態か。 */
  canFollowUp: boolean;
}) {
  const [state, formAction] = useActionState<FeedbackActionState, FormData>(postFeedbackMessage, {});

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="feedback_request_id" value={requestId} />
      <input type="hidden" name="message_type" value={canFollowUp ? 'follow_up_question' : 'comment'} />

      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}

      <Field
        label={canFollowUp ? 'もう一度聞きたいこと' : 'コメント'}
        htmlFor="body"
        hint={canFollowUp ? '分からなかったところを、そのまま書いてください' : undefined}
      >
        <TextArea id="body" name="body" rows={3} required />
      </Field>

      <SubmitButton isFollowUp={canFollowUp} />
    </form>
  );
}
