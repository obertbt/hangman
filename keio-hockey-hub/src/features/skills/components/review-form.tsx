'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Field, FormMessage, TextArea } from '@/components/ui/field';
import { reviewSkillApplication, type SkillActionState } from '@/features/skills/actions';

/**
 * コーチの審査（31章）。
 *
 * 3つの判断を1つのフォームにまとめる。押したボタンで判断が決まる。
 * 差し戻しと見送りは理由が要る（サーバー側でも確かめる）。
 * 何が足りないか分からないまま返されるのが、選手にとっていちばん困る。
 */

type Decision = 'approve' | 'need_more' | 'reject';

function DecisionButton({
  decision,
  label,
  variant,
  needsComment,
  hasComment,
}: {
  decision: Decision;
  label: string;
  variant: 'action' | 'outline' | 'danger';
  needsComment: boolean;
  hasComment: boolean;
}) {
  const { pending } = useFormStatus();
  const blocked = needsComment && !hasComment;

  return (
    <Button
      type="submit"
      name="decision"
      value={decision}
      variant={variant}
      disabled={pending || blocked}
      title={blocked ? '理由を書いてください' : undefined}
    >
      {pending ? '処理しています…' : label}
    </Button>
  );
}

export function ReviewForm({ applicationId }: { applicationId: string }) {
  const [state, formAction] = useActionState<SkillActionState, FormData>(reviewSkillApplication, {});
  const [comment, setComment] = useState('');

  const hasComment = comment.trim() !== '';

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="application_id" value={applicationId} />

      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}

      <Field
        label="選手へのことば"
        htmlFor="comment"
        hint="差し戻す・見送るときは必ず書いてください。承認のときは省略できます。"
      >
        <TextArea
          id="comment"
          name="comment"
          rows={3}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="対人の場面が見たいです。次の練習で撮って足してください。"
        />
      </Field>

      <div className="flex flex-wrap gap-2">
        <DecisionButton
          decision="approve"
          label="承認する"
          variant="action"
          needsComment={false}
          hasComment={hasComment}
        />
        <DecisionButton
          decision="need_more"
          label="根拠を足してもらう"
          variant="outline"
          needsComment
          hasComment={hasComment}
        />
        <DecisionButton
          decision="reject"
          label="今回は見送る"
          variant="danger"
          needsComment
          hasComment={hasComment}
        />
      </div>

      <p className="text-xs text-[--color-muted]">
        「根拠を足してもらう」は不合格ではありません。選手の手元へ戻り、足して出し直せます。
      </p>
    </form>
  );
}
