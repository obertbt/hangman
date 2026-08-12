'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Field, FormMessage, Select, TextArea, TextInput } from '@/components/ui/field';
import { RatingField } from '@/components/ui/rating';
import { saveTrainingRecord, type TrainingActionState } from '@/features/training/actions';
import { sectionFor } from '@/features/training/lib/training';
import { REPORT_VISIBILITY_LABELS, TRAINING_TYPE_LABELS } from '@/lib/labels';
import type { TrainingType } from '@/types/database.types';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" block size="lg" variant="action" disabled={pending}>
      {pending ? '保存しています…' : '記録する'}
    </Button>
  );
}

interface ExerciseRow {
  key: number;
}

/**
 * トレーニング記録（17章）。
 *
 * 種別を選ぶと、その種別に要る項目だけが出る。
 * 全部の項目を最初から見せると、入力の前に諦めてしまうため。
 */
export function TrainingForm({ date, eventId }: { date: string; eventId: string | null }) {
  const [state, action] = useActionState<TrainingActionState, FormData>(saveTrainingRecord, {});
  const [trainingType, setTrainingType] = useState<TrainingType>('self_practice');
  const [exercises, setExercises] = useState<ExerciseRow[]>([{ key: 0 }]);

  const section = sectionFor(trainingType);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="performed_on" value={date} />
      <input type="hidden" name="event_id" value={eventId ?? ''} />

      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}

      <Field label="種別" htmlFor="training_type" required>
        <Select
          id="training_type"
          name="training_type"
          value={trainingType}
          onChange={(event) => setTrainingType(event.target.value as TrainingType)}
        >
          {Object.entries(TRAINING_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="メニュー" htmlFor="menu" hint="何をしたか。ひとことで構いません">
        <TextArea id="menu" name="menu" rows={2} placeholder="ジョグ + 流し5本" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="開始時刻" htmlFor="started_at">
          <TextInput id="started_at" name="started_at" type="time" />
        </Field>
        <Field label="終了時刻" htmlFor="ended_at">
          <TextInput id="ended_at" name="ended_at" type="time" />
        </Field>
      </div>

      <Field
        label="実施時間（分）"
        htmlFor="duration_minutes"
        hint="空欄なら開始・終了時刻から自動で計算します"
      >
        <TextInput
          id="duration_minutes"
          name="duration_minutes"
          type="number"
          inputMode="numeric"
          min="0"
          placeholder="60"
        />
      </Field>

      {/* --- ランニング --- */}
      {section === 'running' ? (
        <div className="space-y-4 rounded-lg border border-[--color-border] p-3">
          <p className="text-sm font-medium">ランニングの記録</p>

          <div className="grid grid-cols-2 gap-3">
            <Field label="距離（km）" htmlFor="distance_km">
              <TextInput
                id="distance_km"
                name="distance_km"
                type="number"
                inputMode="decimal"
                step="0.1"
                min="0"
                placeholder="5"
              />
            </Field>
            <Field label="本数" htmlFor="rep_count">
              <TextInput id="rep_count" name="rep_count" type="number" inputMode="numeric" min="0" />
            </Field>
          </div>

          <Field label="平均心拍" htmlFor="heart_rate_avg" hint="測っていれば">
            <TextInput
              id="heart_rate_avg"
              name="heart_rate_avg"
              type="number"
              inputMode="numeric"
              min="0"
              max="300"
            />
          </Field>

          <p className="text-xs text-[--color-muted]">ペースは距離と実施時間から自動で計算します。</p>
        </div>
      ) : null}

      {/* --- ウェイト --- */}
      {section === 'weight' ? (
        <div className="space-y-3 rounded-lg border border-[--color-border] p-3">
          <p className="text-sm font-medium">種目</p>

          {exercises.map((exercise, index) => (
            <div key={exercise.key} className="space-y-2 border-b border-[--color-border] pb-3 last:border-0">
              <Field label={`種目 ${index + 1}`} htmlFor={`exercise_name_${exercise.key}`}>
                <TextInput
                  id={`exercise_name_${exercise.key}`}
                  name="exercise_name"
                  placeholder="スクワット"
                />
              </Field>

              <div className="grid grid-cols-3 gap-2">
                <Field label="重量(kg)" htmlFor={`exercise_weight_${exercise.key}`}>
                  <TextInput
                    id={`exercise_weight_${exercise.key}`}
                    name="exercise_weight"
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    min="0"
                  />
                </Field>
                <Field label="回数" htmlFor={`exercise_reps_${exercise.key}`}>
                  <TextInput
                    id={`exercise_reps_${exercise.key}`}
                    name="exercise_reps"
                    type="number"
                    inputMode="numeric"
                    min="0"
                  />
                </Field>
                <Field label="セット" htmlFor={`exercise_sets_${exercise.key}`}>
                  <TextInput
                    id={`exercise_sets_${exercise.key}`}
                    name="exercise_sets"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    max="20"
                  />
                </Field>
              </div>
            </div>
          ))}

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExercises((rows) => [...rows, { key: Date.now() }])}
            >
              種目を追加
            </Button>
            {exercises.length > 1 ? (
              <Button variant="ghost" size="sm" onClick={() => setExercises((rows) => rows.slice(0, -1))}>
                最後の種目を消す
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* --- 自主練 --- */}
      {section === 'self_practice' ? (
        <div className="space-y-4 rounded-lg border border-[--color-border] p-3">
          <p className="text-sm font-medium">自主練の記録</p>

          <Field label="技術テーマ" htmlFor="skill_theme">
            <TextInput id="skill_theme" name="skill_theme" placeholder="インドドリブル" />
          </Field>

          <Field label="成果" htmlFor="outcome" hint="やってみてどうだったか">
            <TextArea id="outcome" name="outcome" rows={2} />
          </Field>

          <p className="text-xs text-[--color-muted]">
            自主練の動画からコーチに質問できるようにする機能は Phase 7 で追加します。
          </p>
        </div>
      ) : null}

      <RatingField name="intensity" label="強度" lowLabel="軽い" highLabel="とてもきつい" />
      <RatingField
        name="fatigue_level"
        label="終わったあとの疲労度"
        lowLabel="疲れていない"
        highLabel="とても疲れている"
      />

      <Field label="コメント" htmlFor="comment" hint="任意">
        <TextArea id="comment" name="comment" rows={2} />
      </Field>

      <Field label="公開範囲" htmlFor="visibility">
        <Select id="visibility" name="visibility" defaultValue="staff">
          {Object.entries(REPORT_VISIBILITY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>

      <SubmitButton />
    </form>
  );
}
