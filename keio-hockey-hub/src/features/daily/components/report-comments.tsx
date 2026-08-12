'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Field, FormMessage, TextArea } from '@/components/ui/field';
import {
  deleteReportComment,
  postReportComment,
  type ReportCommentState,
} from '@/features/daily/feedback-actions';

/**
 * 日報へのコーチのコメント（16章）。
 *
 * 短くていい、ということを画面でも伝える。
 * 「ちゃんと書かないと」と思わせると、忙しい日にコメントが止まる。
 */

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="action" block disabled={pending}>
      {pending ? '送っています…' : 'コメントを書く'}
    </Button>
  );
}

export function ReportCommentForm({ reportId }: { reportId: string }) {
  const [state, formAction] = useActionState<ReportCommentState, FormData>(postReportComment, {});

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="daily_report_id" value={reportId} />

      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}

      <Field
        label="選手へのことば"
        htmlFor="body"
        hint="ひとことで構いません。次の練習で何を試すか、が伝わると効きます。"
      >
        <TextArea
          id="body"
          name="body"
          rows={3}
          required
          placeholder="切り替えが速くなっています。次は逆足も。"
        />
      </Field>

      <SubmitButton />
    </form>
  );
}

/**
 * 自分の書いたコメントを取り消す。
 *
 * 一度押しただけでは消さない。
 * 選手が読んだかもしれないものが、指の滑りで消えるのは避けたい。
 */
export function DeleteCommentButton({ feedbackId, reportId }: { feedbackId: string; reportId: string }) {
  const [state, formAction] = useActionState<ReportCommentState, FormData>(deleteReportComment, {});
  const [confirming, setConfirming] = useState(false);

  return (
    <form action={formAction} className="shrink-0 text-right">
      <input type="hidden" name="feedback_id" value={feedbackId} />
      <input type="hidden" name="daily_report_id" value={reportId} />

      {confirming ? (
        <Button type="submit" variant="danger" size="sm">
          本当に取り消す
        </Button>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
          取り消す
        </Button>
      )}

      {state.error ? (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
