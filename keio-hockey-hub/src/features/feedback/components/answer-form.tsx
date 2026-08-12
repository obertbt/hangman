'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field, FormMessage, Select, TextArea } from '@/components/ui/field';
import { answerFeedback, type FeedbackActionState } from '@/features/feedback/actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" block size="lg" variant="action" disabled={pending}>
      {pending ? '送っています…' : '回答する'}
    </Button>
  );
}

export interface SkillOption {
  id: string;
  label: string;
}

/**
 * コーチの回答（28章）。
 *
 * 必須は「結論」だけにしている。
 * 全項目を埋めないと出せない作りにすると、忙しい時に回答そのものが後回しになる。
 * ひとことでも返ってくるほうが、選手にとっては価値がある。
 *
 * 「次回課題」は、そのまま選手の次の練習の個人目標になる。
 * ここが循環の要（依頼書3章の5）。
 */
export function AnswerForm({
  requestId,
  skills,
  isFollowUp,
}: {
  requestId: string;
  skills: SkillOption[];
  /** 再質問への回答か。 */
  isFollowUp: boolean;
}) {
  const [state, formAction] = useActionState<FeedbackActionState, FormData>(answerFeedback, {});
  const [showDetail, setShowDetail] = useState(false);

  if (state.success) {
    return (
      <Card>
        <FormMessage tone="success">{state.success}</FormMessage>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title={isFollowUp ? '再質問に答える' : '回答する'}
        description="結論だけでも構いません。まず返すことが大事です。"
      />

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="feedback_request_id" value={requestId} />

        {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}

        <Field label="結論" htmlFor="conclusion" required hint="この場面についての答え。ひとことで構いません">
          <TextArea
            id="conclusion"
            name="conclusion"
            rows={3}
            required
            placeholder="この状況なら、内側に運ぶ判断で合っています。"
          />
        </Field>

        <Field
          label="次回の課題"
          htmlFor="next_task"
          hint="ここに書いた内容が、選手の次の練習の個人目標の候補になります"
        >
          <TextArea
            id="next_task"
            name="next_task"
            rows={2}
            placeholder="受ける前に、内側を1回見る癖をつける"
          />
        </Field>

        <div className="rounded-lg border border-[--color-border]">
          <button
            type="button"
            onClick={() => setShowDetail((value) => !value)}
            className="flex min-h-12 w-full items-center justify-between px-3 text-sm font-medium"
            aria-expanded={showDetail}
          >
            もう少し詳しく書く
            <span className="text-[--color-muted]">{showDetail ? '閉じる' : '開く'}</span>
          </button>

          {showDetail ? (
            <div className="space-y-4 border-t border-[--color-border] p-3">
              <Field label="良かった点" htmlFor="positive_points">
                <TextArea id="positive_points" name="positive_points" rows={2} />
              </Field>
              <Field label="改善点" htmlFor="improvement_points">
                <TextArea id="improvement_points" name="improvement_points" rows={2} />
              </Field>
              <Field label="推奨プレー" htmlFor="recommended_action">
                <TextArea id="recommended_action" name="recommended_action" rows={2} />
              </Field>
              <Field label="技術的な修正" htmlFor="technical_correction">
                <TextArea id="technical_correction" name="technical_correction" rows={2} />
              </Field>

              {skills.length > 0 ? (
                <Field
                  label="関連するスキル"
                  htmlFor="related_skill_id"
                  hint="選んでおくと、選手がスキル申請に使えます"
                >
                  <Select id="related_skill_id" name="related_skill_id" defaultValue="">
                    <option value="">選ばない</option>
                    {skills.map((skill) => (
                      <option key={skill.id} value={skill.id}>
                        {skill.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
            </div>
          ) : null}
        </div>

        <label className="flex min-h-12 items-center gap-3 rounded-lg border border-[--color-border] px-3 text-sm">
          <input type="checkbox" name="requires_in_person_review" className="size-5" />
          対面でも確認したい
        </label>

        <label className="flex min-h-12 items-center gap-3 rounded-lg border border-[--color-border] px-3 text-sm">
          <input type="checkbox" name="suggests_team_share" className="size-5" />
          チーム全員に共有したい（選手の承認が要ります）
        </label>

        <SubmitButton />

        <p className="text-xs text-[--color-muted]">過去の回答は残ります。上書きではなく追記になります。</p>
      </form>
    </Card>
  );
}
