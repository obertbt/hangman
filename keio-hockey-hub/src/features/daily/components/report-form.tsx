'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FormMessage, Select, TextArea } from '@/components/ui/field';
import { RatingField } from '@/components/ui/rating';
import { saveDailyReport, type DailyActionState } from '@/features/daily/actions';
import { REPORT_VISIBILITY_LABELS } from '@/lib/labels';
import type { DailyReportRow } from '@/types/database.types';

function ActionButtons({ isSubmitted }: { isSubmitted: boolean }) {
  const { pending } = useFormStatus();
  return (
    <div className="space-y-2">
      <Button type="submit" name="intent" value="submit" block size="lg" variant="action" disabled={pending}>
        {pending ? '保存しています…' : isSubmitted ? '提出内容を更新する' : '提出する'}
      </Button>
      <Button type="submit" name="intent" value="draft" block variant="outline" disabled={pending}>
        下書きとして保存
      </Button>
    </div>
  );
}

/**
 * 日報（16章）。
 *
 * 項目は多いが、必須はひとつも無い。
 * 「できたこと」だけ書いて出しても構わない、と伝わる作りにしている（依頼書3章の7）。
 *
 * 深掘りの項目（原因・改善方法・再発防止・対処）は普段は畳んでおく。
 * 何かあった日だけ開けばよい。
 */
export function ReportForm({
  date,
  eventId,
  existing,
  personalGoal,
}: {
  date: string;
  eventId: string | null;
  existing: DailyReportRow | null;
  /** 今日の個人目標。最初から入れておく。 */
  personalGoal: string | null;
}) {
  const [state, action] = useActionState<DailyActionState, FormData>(saveDailyReport, {});
  const [showDetail, setShowDetail] = useState(
    Boolean(existing?.cause || existing?.improvement || existing?.prevention || existing?.response_taken),
  );

  const isSubmitted = existing?.status === 'submitted';

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="report_date" value={date} />
      <input type="hidden" name="event_id" value={eventId ?? ''} />

      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}

      {existing ? (
        <p className="text-sm">
          {isSubmitted ? <Badge tone="success">提出済み</Badge> : <Badge tone="warning">下書き</Badge>}
        </p>
      ) : null}

      <Field label="今日の個人目標" htmlFor="personal_goal" hint="朝に決めたものが入っています">
        <TextArea
          id="personal_goal"
          name="personal_goal"
          rows={2}
          defaultValue={existing?.personal_goal ?? personalGoal ?? ''}
        />
      </Field>

      <Field label="できたこと" htmlFor="what_went_well">
        <TextArea
          id="what_went_well"
          name="what_went_well"
          rows={3}
          defaultValue={existing?.what_went_well ?? ''}
          placeholder="3対2で、2回は前を向いてから運べた"
        />
      </Field>

      <Field label="できなかったこと" htmlFor="what_went_wrong">
        <TextArea
          id="what_went_wrong"
          name="what_went_wrong"
          rows={3}
          defaultValue={existing?.what_went_wrong ?? ''}
        />
      </Field>

      <Field label="次回取り組むこと" htmlFor="next_action" hint="次の練習の目標にそのまま使えます">
        <TextArea id="next_action" name="next_action" rows={2} defaultValue={existing?.next_action ?? ''} />
      </Field>

      {/* --- 深掘り。何かあった日だけ開く --- */}
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
            <Field label="起きたこと" htmlFor="what_happened">
              <TextArea
                id="what_happened"
                name="what_happened"
                rows={2}
                defaultValue={existing?.what_happened ?? ''}
              />
            </Field>
            <Field label="原因" htmlFor="cause">
              <TextArea id="cause" name="cause" rows={2} defaultValue={existing?.cause ?? ''} />
            </Field>
            <Field label="改善方法" htmlFor="improvement">
              <TextArea
                id="improvement"
                name="improvement"
                rows={2}
                defaultValue={existing?.improvement ?? ''}
              />
            </Field>
            <Field label="再発防止" htmlFor="prevention">
              <TextArea
                id="prevention"
                name="prevention"
                rows={2}
                defaultValue={existing?.prevention ?? ''}
              />
            </Field>
            <Field label="起きた後の対処" htmlFor="response_taken">
              <TextArea
                id="response_taken"
                name="response_taken"
                rows={2}
                defaultValue={existing?.response_taken ?? ''}
              />
            </Field>
          </div>
        ) : null}
      </div>

      {/* --- 段階評価 --- */}
      <div className="space-y-4">
        <RatingField
          name="self_rating"
          label="自己評価"
          lowLabel="よくなかった"
          highLabel="とても良かった"
          defaultValue={existing?.self_rating ?? null}
        />
        <RatingField
          name="intensity"
          label="練習強度"
          lowLabel="軽い"
          highLabel="とてもきつい"
          defaultValue={existing?.intensity ?? null}
        />
        <RatingField
          name="fatigue_level"
          label="疲労度"
          lowLabel="疲れていない"
          highLabel="とても疲れている"
          defaultValue={existing?.fatigue_level ?? null}
        />
        <RatingField
          name="mood"
          label="気分"
          lowLabel="沈んでいる"
          highLabel="良い"
          defaultValue={existing?.mood ?? null}
        />
        <RatingField
          name="condition_level"
          label="体の状態"
          lowLabel="よくない"
          highLabel="とても良い"
          defaultValue={existing?.condition_level ?? null}
        />
      </div>

      <Field label="自由記述" htmlFor="free_note" hint="任意">
        <TextArea id="free_note" name="free_note" rows={3} defaultValue={existing?.free_note ?? ''} />
      </Field>

      <Field label="公開範囲" htmlFor="visibility" hint="初期値は「コーチまで」です。あとから変えられます">
        <Select id="visibility" name="visibility" defaultValue={existing?.visibility ?? 'staff'}>
          {Object.entries(REPORT_VISIBILITY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>

      <ActionButtons isSubmitted={isSubmitted} />

      <p className="text-xs text-[--color-muted]">
        全部埋める必要はありません。ひとつでも書いてあれば提出できます。
      </p>
    </form>
  );
}
