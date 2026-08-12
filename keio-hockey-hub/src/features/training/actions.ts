'use server';

import { revalidatePath } from 'next/cache';

import { requireSession } from '@/lib/auth/session';
import { todayInTokyo } from '@/lib/datetime';
import { createClient } from '@/lib/supabase/server';

import { durationFromTimes, expandWeightSets, paceSecondsPerKm } from './lib/training';
import { trainingRecordSchema, weightExerciseSchema } from './schemas';

/**
 * トレーニング記録の書き込み（17章）。
 *
 * 自分の記録なので RLS の `training_records_own` の下で動く。
 * ウェイトの種目・セットは親の記録に従う（`*_via_parent` ポリシー）。
 */

export interface TrainingActionState {
  error?: string;
  success?: string;
}

function text(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === 'string' ? value : undefined;
}

export async function saveTrainingRecord(
  _prevState: TrainingActionState,
  formData: FormData,
): Promise<TrainingActionState> {
  const session = await requireSession();

  const eventIdRaw = text(formData, 'event_id');
  const eventId = !eventIdRaw || eventIdRaw.trim() === '' ? null : eventIdRaw;

  const parsed = trainingRecordSchema.safeParse({
    performed_on: text(formData, 'performed_on') ?? todayInTokyo(),
    event_id: eventId,
    training_type: text(formData, 'training_type') ?? 'other',
    menu: text(formData, 'menu'),
    started_at: text(formData, 'started_at') ?? '',
    ended_at: text(formData, 'ended_at') ?? '',
    duration_minutes: text(formData, 'duration_minutes') ?? '',
    intensity: text(formData, 'intensity') ?? '',
    fatigue_level: text(formData, 'fatigue_level') ?? '',
    comment: text(formData, 'comment'),
    distance_km: text(formData, 'distance_km') ?? '',
    heart_rate_avg: text(formData, 'heart_rate_avg') ?? '',
    rep_count: text(formData, 'rep_count') ?? '',
    skill_theme: text(formData, 'skill_theme'),
    outcome: text(formData, 'outcome'),
    visibility: text(formData, 'visibility') ?? 'staff',
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '入力内容を確認してください。' };
  }

  const input = parsed.data;

  // 実施時間は、直接入れていなければ開始・終了から出す（入力の負担を減らす）
  const duration = input.duration_minutes ?? durationFromTimes(input.started_at, input.ended_at);

  // ペースは毎回手で計算させない
  const pace = input.training_type === 'running' ? paceSecondsPerKm(input.distance_km, duration) : null;

  const supabase = await createClient();

  const { data: record, error } = await supabase
    .from('training_records')
    .insert({
      team_id: session.teamId,
      team_member_id: session.teamMemberId,
      performed_on: input.performed_on,
      event_id: input.event_id ?? null,
      training_type: input.training_type,
      menu: input.menu,
      started_at: input.started_at,
      ended_at: input.ended_at,
      duration_minutes: duration,
      intensity: input.intensity,
      fatigue_level: input.fatigue_level,
      comment: input.comment,
      distance_km: input.training_type === 'running' ? input.distance_km : null,
      pace_seconds_per_km: pace,
      heart_rate_avg: input.training_type === 'running' ? input.heart_rate_avg : null,
      rep_count: input.training_type === 'running' ? input.rep_count : null,
      skill_theme: input.training_type === 'self_practice' ? input.skill_theme : null,
      outcome: input.training_type === 'self_practice' ? input.outcome : null,
      visibility: input.visibility,
    })
    .select('id')
    .single();

  if (error || !record) {
    return { error: `保存できませんでした: ${error?.message ?? '不明なエラー'}` };
  }

  // --- ウェイトの種目とセット ---
  if (input.training_type === 'weight') {
    const exerciseError = await saveWeightExercises(formData, session.teamId, record.id);
    if (exerciseError) {
      // 記録本体は残す。種目だけ入れ直せるようにする。
      return { error: exerciseError };
    }
  }

  revalidatePath('/today');
  revalidatePath('/training');
  return { success: 'トレーニング記録を保存しました。' };
}

/**
 * ウェイトの種目を保存する。
 * 画面からは name/weight/reps/sets が同じ添字で並んで届く。
 */
async function saveWeightExercises(
  formData: FormData,
  teamId: string,
  recordId: string,
): Promise<string | null> {
  const names = formData.getAll('exercise_name');
  if (names.length === 0) return null;

  const supabase = await createClient();

  const weights = formData.getAll('exercise_weight');
  const reps = formData.getAll('exercise_reps');
  const setCounts = formData.getAll('exercise_sets');

  for (const [index, rawName] of names.entries()) {
    const name = typeof rawName === 'string' ? rawName.trim() : '';
    if (name === '') continue; // 空の行は無視する

    const parsed = weightExerciseSchema.safeParse({
      name,
      weight_kg: asString(weights[index]),
      reps: asString(reps[index]),
      set_count: asString(setCounts[index]),
    });

    if (!parsed.success) {
      return `${name}: ${parsed.error.issues[0]?.message ?? '入力内容を確認してください。'}`;
    }

    const { data: exercise, error: exerciseError } = await supabase
      .from('training_exercises')
      .insert({
        team_id: teamId,
        training_record_id: recordId,
        name: parsed.data.name,
        sort_order: index,
      })
      .select('id')
      .single();

    if (exerciseError || !exercise) {
      return `種目を保存できませんでした: ${exerciseError?.message ?? '不明なエラー'}`;
    }

    const sets = expandWeightSets({
      name: parsed.data.name,
      weightKg: parsed.data.weight_kg,
      reps: parsed.data.reps,
      setCount: parsed.data.set_count,
    });

    if (sets.length > 0) {
      const { error: setError } = await supabase.from('training_sets').insert(
        sets.map((set) => ({
          team_id: teamId,
          training_exercise_id: exercise.id,
          set_number: set.setNumber,
          weight_kg: set.weightKg,
          reps: set.reps,
        })),
      );
      if (setError) return `セットを保存できませんでした: ${setError.message}`;
    }
  }

  return null;
}

function asString(value: FormDataEntryValue | undefined): string {
  return typeof value === 'string' ? value : '';
}

/**
 * 記録の取り消し。論理削除にする（60章: 記録は簡単に消さない）。
 *
 * 素朴な `update ... set deleted_at` では消せない。
 * 閲覧できる条件が `deleted_at is null` なので、
 * 更新後の行が見えなくなり弾かれる（0019。0013 の動画と同じ形）。
 * 「自分のものだけ」の判定は関数の中で行う。
 */
export async function deleteTrainingRecord(recordId: string): Promise<TrainingActionState> {
  await requireSession();
  const supabase = await createClient();

  const { error } = await supabase.rpc('soft_delete_training_record', { p_record_id: recordId });

  if (error) return { error: `削除できませんでした: ${error.message}` };

  revalidatePath('/today');
  revalidatePath('/training');
  return { success: '記録を削除しました。' };
}
