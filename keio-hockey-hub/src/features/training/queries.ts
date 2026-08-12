import 'server-only';

import type { AppSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import type { TrainingExerciseRow, TrainingRecordRow, TrainingSetRow } from '@/types/database.types';

export interface TrainingRecordWithDetail extends TrainingRecordRow {
  exercises: (TrainingExerciseRow & { sets: TrainingSetRow[] })[];
}

/** その日の自分のトレーニング記録。1日に複数回入れられる。 */
export async function listTrainingFor(session: AppSession, dateOnly: string): Promise<TrainingRecordRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('training_records')
    .select('*')
    .eq('team_member_id', session.teamMemberId)
    .eq('performed_on', dateOnly)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  return data ?? [];
}

/** 直近のトレーニング記録。振り返り用。 */
export async function listRecentTraining(session: AppSession, limit = 20): Promise<TrainingRecordRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('training_records')
    .select('*')
    .eq('team_member_id', session.teamMemberId)
    .is('deleted_at', null)
    .order('performed_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  return data ?? [];
}

/** ウェイトの種目とセットをまとめて引く。 */
export async function getExercisesFor(
  recordIds: string[],
): Promise<Map<string, (TrainingExerciseRow & { sets: TrainingSetRow[] })[]>> {
  const result = new Map<string, (TrainingExerciseRow & { sets: TrainingSetRow[] })[]>();
  if (recordIds.length === 0) return result;

  const supabase = await createClient();

  const { data: exercises } = await supabase
    .from('training_exercises')
    .select('*')
    .in('training_record_id', recordIds)
    .order('sort_order', { ascending: true });

  const exerciseList = exercises ?? [];
  if (exerciseList.length === 0) return result;

  const { data: sets } = await supabase
    .from('training_sets')
    .select('*')
    .in(
      'training_exercise_id',
      exerciseList.map((exercise) => exercise.id),
    )
    .order('set_number', { ascending: true });

  const setsByExercise = new Map<string, TrainingSetRow[]>();
  for (const set of sets ?? []) {
    const list = setsByExercise.get(set.training_exercise_id) ?? [];
    list.push(set);
    setsByExercise.set(set.training_exercise_id, list);
  }

  for (const exercise of exerciseList) {
    const list = result.get(exercise.training_record_id) ?? [];
    list.push({ ...exercise, sets: setsByExercise.get(exercise.id) ?? [] });
    result.set(exercise.training_record_id, list);
  }

  return result;
}
