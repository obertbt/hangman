import type { Metadata } from 'next';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, EmptyState } from '@/components/ui/card';
import { findRecordableEvent } from '@/features/daily/queries';
import { TrainingForm } from '@/features/training/components/training-form';
import { formatDuration, formatPace } from '@/features/training/lib/training';
import { getExercisesFor, listRecentTraining, listTrainingFor } from '@/features/training/queries';
import { requireSession } from '@/lib/auth/session';
import { formatDateLabel, todayInTokyo } from '@/lib/datetime';
import { TRAINING_TYPE_LABELS } from '@/lib/labels';
import type { TrainingRecordRow } from '@/types/database.types';

export const metadata: Metadata = { title: 'トレーニング記録' };

export default async function TrainingPage() {
  const session = await requireSession();
  const date = todayInTokyo();

  const [event, todayRecords, recent] = await Promise.all([
    findRecordableEvent(session.teamId, date),
    listTrainingFor(session, date),
    listRecentTraining(session, 20),
  ]);

  const exercisesByRecord = await getExercisesFor(todayRecords.map((record) => record.id));
  const history = recent.filter((record) => record.performed_on !== date);

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <Link href="/today" className="text-keio-700 dark:text-keio-300 underline">
          ← 今日へ戻る
        </Link>
      </p>

      <header>
        <p className="text-xs text-[--color-muted]">{formatDateLabel(date)}</p>
        <h1 className="mt-1 text-xl font-bold">トレーニング記録</h1>
      </header>

      {todayRecords.length > 0 ? (
        <Card>
          <CardHeader title="今日の記録" description="1日に何回でも記録できます" />
          <ul className="divide-y divide-[--color-border]">
            {todayRecords.map((record) => (
              <li key={record.id} className="py-3">
                <TrainingSummary record={record} />
                {(exercisesByRecord.get(record.id) ?? []).map((exercise) => (
                  <p key={exercise.id} className="mt-1 text-sm text-[--color-muted]">
                    {exercise.name}
                    {exercise.sets.length > 0
                      ? ` — ${exercise.sets[0]?.weight_kg ?? '—'}kg × ${exercise.sets[0]?.reps ?? '—'}回 × ${exercise.sets.length}セット`
                      : ''}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardHeader title={todayRecords.length > 0 ? 'もう1件記録する' : '記録する'} />
        <TrainingForm date={date} eventId={event?.id ?? null} />
      </Card>

      <Card>
        <CardHeader title="これまでの記録" />
        {history.length === 0 ? (
          <EmptyState>まだありません。</EmptyState>
        ) : (
          <ul className="divide-y divide-[--color-border]">
            {history.map((record) => (
              <li key={record.id} className="py-3">
                <p className="text-xs text-[--color-muted]">{formatDateLabel(record.performed_on)}</p>
                <TrainingSummary record={record} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function TrainingSummary({ record }: { record: TrainingRecordRow }) {
  const parts: string[] = [];

  const duration = formatDuration(record.duration_minutes);
  if (duration) parts.push(duration);

  if (record.distance_km !== null) parts.push(`${record.distance_km}km`);

  const pace = formatPace(record.pace_seconds_per_km);
  if (pace) parts.push(pace);

  if (record.rep_count !== null) parts.push(`${record.rep_count}本`);
  if (record.heart_rate_avg !== null) parts.push(`心拍 ${record.heart_rate_avg}`);
  if (record.intensity !== null) parts.push(`強度 ${record.intensity}/5`);

  return (
    <>
      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
        <Badge tone="info">{TRAINING_TYPE_LABELS[record.training_type]}</Badge>
        {record.skill_theme ?? record.menu ?? '（メニュー未記入）'}
      </p>
      {parts.length > 0 ? <p className="mt-1 text-sm text-[--color-muted]">{parts.join(' / ')}</p> : null}
      {record.outcome ? <p className="mt-1 text-sm">{record.outcome}</p> : null}
      {record.comment ? <p className="mt-1 text-sm text-[--color-muted]">{record.comment}</p> : null}
    </>
  );
}
