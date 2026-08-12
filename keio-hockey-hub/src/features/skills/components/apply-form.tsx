'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Field, FormMessage, TextArea } from '@/components/ui/field';
import { submitSkillApplication, type SkillActionState } from '@/features/skills/actions';
import { formatSecondsToTimecode } from '@/lib/storage/validation';

/**
 * スキル申請（32章）。
 *
 * 根拠は選ばなくても出せる。
 * 「動画が無いと申請できない」にすると、言葉で説明できる選手まで止めてしまう。
 * ただし、根拠があるほうが早く承認されることは画面で伝える。
 */

export interface EvidenceOption {
  id: string;
  label: string;
  sub?: string;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="action" size="lg" block disabled={pending}>
      {pending ? '送っています…' : 'この内容で申請する'}
    </Button>
  );
}

function EvidenceGroup({
  name,
  title,
  hint,
  options,
  emptyText,
}: {
  name: string;
  title: string;
  hint: string;
  options: EvidenceOption[];
  emptyText: string;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">{title}</legend>
      <p className="mt-0.5 text-xs text-[--color-muted]">{hint}</p>

      {options.length === 0 ? (
        <p className="mt-2 text-xs text-[--color-muted]">{emptyText}</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {options.map((option) => (
            <li key={option.id}>
              {/* タップ領域を確保するため、ラベル全体を押せるようにする */}
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-[--color-border] px-3 py-2">
                <input type="checkbox" name={name} value={option.id} className="size-4 shrink-0" />
                <span className="min-w-0">
                  <span className="block truncate text-sm">{option.label}</span>
                  {option.sub ? (
                    <span className="block truncate text-xs text-[--color-muted]">{option.sub}</span>
                  ) : null}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}

export function ApplyForm({
  skillId,
  skillName,
  criteria,
  videos,
  clips,
  feedbacks,
}: {
  skillId: string;
  skillName: string;
  criteria: string | null;
  videos: EvidenceOption[];
  clips: (EvidenceOption & { startSeconds: number; endSeconds: number })[];
  feedbacks: EvidenceOption[];
}) {
  const [state, formAction] = useActionState<SkillActionState, FormData>(submitSkillApplication, {});

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="skill_id" value={skillId} />

      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}

      <div className="rounded-lg border border-[--color-border] px-3 py-2">
        <p className="text-sm font-medium">{skillName}</p>
        {criteria ? <p className="mt-1 text-xs text-[--color-muted]">目安: {criteria}</p> : null}
      </div>

      <Field
        label="できるようになったこと"
        htmlFor="comment"
        hint="いつ・どんな場面で・何回できたかを書くと、コーチが判断しやすくなります。"
      >
        <TextArea
          id="comment"
          name="comment"
          rows={4}
          placeholder="先週の練習で、対人の場面で3回中3回かわせました。"
        />
      </Field>

      <EvidenceGroup
        name="video_ids"
        title="根拠にする動画"
        hint="自分が登録・投稿した動画から選べます。"
        options={videos}
        emptyText="まだ動画がありません。動画がなくても申請できます。"
      />

      <EvidenceGroup
        name="video_clip_ids"
        title="根拠にする場面"
        hint="動画の中で、見てもらいたい範囲を指定したものです。"
        options={clips.map((clip) => ({
          id: clip.id,
          label: clip.label,
          sub: `${formatSecondsToTimecode(clip.startSeconds)}〜${formatSecondsToTimecode(clip.endSeconds)}${clip.sub ? ` / ${clip.sub}` : ''}`,
        }))}
        emptyText="まだ場面を指定していません。"
      />

      <EvidenceGroup
        name="feedback_request_ids"
        title="根拠にするコーチの回答"
        hint="回答が済んだ自分の質問から選べます。"
        options={feedbacks}
        emptyText="まだ回答済みの質問がありません。"
      />

      <Field
        label="そのほかに伝えたいこと"
        htmlFor="evidence_note"
        hint="測定の結果や、練習量など。空でも構いません。"
      >
        <TextArea
          id="evidence_note"
          name="evidence_note"
          rows={2}
          placeholder="自主練で1日100本、2週間続けました。"
        />
      </Field>

      <SubmitButton />

      <p className="text-xs text-[--color-muted]">
        申請するとコーチへ通知が届きます。
        足りないところがあれば差し戻されるので、そのときは根拠を足して出し直してください。
      </p>
    </form>
  );
}
