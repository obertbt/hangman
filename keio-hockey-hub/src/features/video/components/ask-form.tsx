'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field, FormMessage, Select, TextArea, TextInput } from '@/components/ui/field';
import { askQuestion, createClip, type VideoActionState } from '@/features/video/actions';
import { QUESTION_TEMPLATES } from '@/lib/labels';
import { formatSecondsToTimecode } from '@/lib/storage/validation';
import type { CoachOption } from '@/features/video/queries';
import type { VideoClipRow } from '@/types/database.types';

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" block variant="action" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

/**
 * 見てもらいたい場面を指定して、質問する（25章）。
 *
 *   動画 → 質問 → 関連スキル → 公開範囲 → 回答希望コーチ → 投稿
 *
 * 2段階に分けている。
 *   1. 場面を切り出す（仮想クリップ）
 *   2. その場面について質問する
 *
 * 場面を指定せず、動画全体について質問することもできる。
 */
export function AskForm({
  videoId,
  clips,
  coaches,
  canAsk,
}: {
  videoId: string;
  clips: VideoClipRow[];
  coaches: CoachOption[];
  /** video.feedback_request を持っているか。 */
  canAsk: boolean;
}) {
  const [clipState, clipAction] = useActionState<VideoActionState, FormData>(createClip, {});
  const [askState, askAction] = useActionState<VideoActionState, FormData>(askQuestion, {});
  const [showClipForm, setShowClipForm] = useState(false);

  // 作ったばかりの場面を、質問の対象として最初から選んでおく
  const defaultClipId = clipState.createdClipId ?? '';

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="見てもらいたい場面を指定する"
          description="動画は切り出しません。開始と終了の位置だけを覚えます。"
          action={
            <Button variant="ghost" size="sm" onClick={() => setShowClipForm((value) => !value)}>
              {showClipForm ? '閉じる' : '開く'}
            </Button>
          }
        />

        {showClipForm ? (
          <form action={clipAction} className="space-y-3">
            <input type="hidden" name="video_id" value={videoId} />

            {clipState.error ? <FormMessage tone="error">{clipState.error}</FormMessage> : null}
            {clipState.success ? <FormMessage tone="success">{clipState.success}</FormMessage> : null}

            <div className="grid grid-cols-2 gap-3">
              <Field label="開始位置" htmlFor="start" required hint="例: 12:34">
                <TextInput id="start" name="start" required placeholder="12:34" inputMode="numeric" />
              </Field>
              <Field label="終了位置" htmlFor="end" required hint="例: 12:48">
                <TextInput id="end" name="end" required placeholder="12:48" inputMode="numeric" />
              </Field>
            </div>

            <Field label="この場面の名前" htmlFor="clip-title" hint="任意">
              <TextInput id="clip-title" name="title" placeholder="右サイドの1対1" />
            </Field>

            <SubmitButton label="この場面を登録する" pendingLabel="登録しています…" />
          </form>
        ) : null}
      </Card>

      <Card>
        <CardHeader
          title="コーチに質問する"
          description={canAsk ? undefined : '質問するには権限が必要です。管理者へ連絡してください。'}
        />

        {canAsk ? (
          <form action={askAction} className="space-y-4">
            <input type="hidden" name="video_id" value={videoId} />

            {askState.error ? <FormMessage tone="error">{askState.error}</FormMessage> : null}
            {askState.success ? <FormMessage tone="success">{askState.success}</FormMessage> : null}

            <Field label="どの場面について" htmlFor="video_clip_id">
              <Select id="video_clip_id" name="video_clip_id" defaultValue={defaultClipId}>
                <option value="">動画全体について</option>
                {clips.map((clip) => (
                  <option key={clip.id} value={clip.id}>
                    {formatSecondsToTimecode(clip.start_seconds)}〜{formatSecondsToTimecode(clip.end_seconds)}
                    {clip.title ? ` ${clip.title}` : ''}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="聞きたいこと" htmlFor="question_type">
              <Select id="question_type" name="question_type" defaultValue="judgement">
                {QUESTION_TEMPLATES.map((template) => (
                  <option key={template.value} value={template.value}>
                    {template.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="質問の内容"
              htmlFor="question"
              required
              hint="何に迷ったのかを書くと、返ってくる答えが具体的になります"
            >
              <TextArea
                id="question"
                name="question"
                rows={3}
                required
                placeholder="内側に運ぶか、外に出すかで迷いました。この場面ではどちらがよかったですか。"
              />
            </Field>

            {coaches.length > 0 ? (
              <Field label="回答してほしいコーチ" htmlFor="assigned_coach_id" hint="任意">
                <Select id="assigned_coach_id" name="assigned_coach_id" defaultValue="">
                  <option value="">誰でも</option>
                  {coaches.map((coach) => (
                    <option key={coach.teamMemberId} value={coach.teamMemberId}>
                      {coach.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}

            <Field
              label="公開範囲"
              htmlFor="visibility"
              hint="初期値は「コーチとスタッフのみ」です。チームに共有するかどうかは、あとであなたが決められます"
            >
              <Select id="visibility" name="visibility" defaultValue="private_staff">
                <option value="private_staff">コーチとスタッフのみ</option>
                <option value="team">チーム全員</option>
              </Select>
            </Field>

            <SubmitButton label="質問を投稿する" pendingLabel="投稿しています…" />
          </form>
        ) : null}
      </Card>
    </div>
  );
}
