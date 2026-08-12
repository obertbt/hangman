'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { isStaff, requireSession, type AppSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

import { measurementEventSchema, measurementItemSchema, measurementResultSchema } from './schemas';

/**
 * 測定の書き込み（3章の6）。
 *
 * 守ること:
 *   * 測定会と項目を作れるのはスタッフだけ
 *   * 記録は、本人かスタッフだけが入れられる（RLS でも守っている）
 *   * 空欄は「測っていない」。0 と区別する
 */

export interface MeasurementActionState {
  error?: string;
  success?: string;
}

function text(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === 'string' ? value : undefined;
}

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? '入力内容を確認してください。';
}

function requireStaff(session: AppSession): string | null {
  return isStaff(session) ? null : 'この操作はスタッフだけが行えます。';
}

/** 測定会を作る。 */
export async function createMeasurementEvent(
  _prevState: MeasurementActionState,
  formData: FormData,
): Promise<MeasurementActionState> {
  const session = await requireSession();

  const denied = requireStaff(session);
  if (denied) return { error: denied };

  const parsed = measurementEventSchema.safeParse({
    name: text(formData, 'name') ?? '',
    measured_on: text(formData, 'measured_on') ?? '',
    note: text(formData, 'note'),
  });

  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();

  const { data: event, error } = await supabase
    .from('measurement_events')
    .insert({
      team_id: session.teamId,
      name: parsed.data.name,
      measured_on: parsed.data.measured_on,
      note: parsed.data.note ?? null,
    })
    .select('id')
    .single();

  if (error || !event) {
    return { error: `作成できませんでした: ${error?.message ?? '不明なエラー'}` };
  }

  revalidatePath('/measurements');
  redirect(`/measurements/${event.id}`);
}

/** 測定項目を足す。 */
export async function createMeasurementItem(
  _prevState: MeasurementActionState,
  formData: FormData,
): Promise<MeasurementActionState> {
  const session = await requireSession();

  const denied = requireStaff(session);
  if (denied) return { error: denied };

  const parsed = measurementItemSchema.safeParse({
    name: text(formData, 'name') ?? '',
    unit: text(formData, 'unit'),
    better: text(formData, 'better') ?? '',
  });

  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();

  const { error } = await supabase.from('measurement_items').insert({
    team_id: session.teamId,
    name: parsed.data.name,
    unit: parsed.data.unit ?? null,
    better: parsed.data.better,
  });

  if (error) {
    // 同じ名前の項目は作れない（unique）
    if (error.code === '23505') {
      return { error: 'その名前の項目はすでにあります。' };
    }
    return { error: `作成できませんでした: ${error.message}` };
  }

  revalidatePath('/measurements');
  return { success: `「${parsed.data.name}」を足しました。` };
}

/**
 * 記録を入れる（1マスぶん）。
 *
 * 空欄で送られたら「測っていない」とみなして、あれば消す。
 * 0 は立派な記録なので消さない。
 */
export async function saveMeasurementResult(
  _prevState: MeasurementActionState,
  formData: FormData,
): Promise<MeasurementActionState> {
  const session = await requireSession();

  const parsed = measurementResultSchema.safeParse({
    measurement_event_id: text(formData, 'measurement_event_id') ?? '',
    measurement_item_id: text(formData, 'measurement_item_id') ?? '',
    team_member_id: text(formData, 'team_member_id') ?? '',
    value: text(formData, 'value') ?? '',
    note: text(formData, 'note'),
  });

  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const input = parsed.data;

  // 他人の記録を入れられるのはスタッフだけ（RLS でも守っている）
  if (input.team_member_id !== session.teamMemberId && !isStaff(session)) {
    return { error: '他の人の記録は入れられません。' };
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from('measurement_results')
    .select('id')
    .eq('measurement_event_id', input.measurement_event_id)
    .eq('measurement_item_id', input.measurement_item_id)
    .eq('team_member_id', input.team_member_id)
    .maybeSingle();

  // 空欄にした = 記録を取り消す
  if (input.value === null) {
    if (existing) {
      const { error } = await supabase.from('measurement_results').delete().eq('id', existing.id);
      if (error) return { error: `消せませんでした: ${error.message}` };
    }
    revalidatePath(`/measurements/${input.measurement_event_id}`);
    revalidatePath('/measurements');
    return { success: '記録を消しました。' };
  }

  const payload = {
    team_id: session.teamId,
    measurement_event_id: input.measurement_event_id,
    measurement_item_id: input.measurement_item_id,
    team_member_id: input.team_member_id,
    value: input.value,
    note: input.note ?? null,
  };

  const { error } = existing
    ? await supabase.from('measurement_results').update(payload).eq('id', existing.id)
    : await supabase.from('measurement_results').insert(payload);

  if (error) return { error: `保存できませんでした: ${error.message}` };

  revalidatePath(`/measurements/${input.measurement_event_id}`);
  revalidatePath('/measurements');
  revalidatePath('/today');

  return { success: '記録しました。' };
}
