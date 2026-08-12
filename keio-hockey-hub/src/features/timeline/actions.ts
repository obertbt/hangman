'use server';

import { revalidatePath } from 'next/cache';

import { requirePermission } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

import { emptyToNull, eventSchema, seasonSchema, weekSchema } from './schemas';

/**
 * シーズン・週・イベントの作成（Phase 3）。
 * event.manage を持つ人だけが実行できる。RLS でも同じ条件で守っている。
 */

export interface TimelineActionState {
  error?: string;
  success?: string;
}

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? '入力内容を確認してください。';
}

export async function createSeason(
  _prevState: TimelineActionState,
  formData: FormData,
): Promise<TimelineActionState> {
  const session = await requirePermission('event.manage');

  const parsed = seasonSchema.safeParse({
    name: formData.get('name'),
    fiscal_year: formData.get('fiscal_year'),
    start_date: formData.get('start_date'),
    end_date: formData.get('end_date'),
    goal: formData.get('goal') ?? undefined,
    theme: formData.get('theme') ?? undefined,
    status: formData.get('status') ?? 'planning',
    is_published: formData.get('is_published') === 'on',
  });

  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.from('seasons').insert({
    team_id: session.teamId,
    name: parsed.data.name,
    fiscal_year: parsed.data.fiscal_year,
    start_date: parsed.data.start_date,
    end_date: parsed.data.end_date,
    goal: emptyToNull(parsed.data.goal),
    theme: emptyToNull(parsed.data.theme),
    status: parsed.data.status,
    is_published: parsed.data.is_published,
    created_by: session.profileId,
  });

  if (error) return { error: `保存できませんでした: ${error.message}` };

  revalidatePath('/schedule');
  revalidatePath('/today');
  return { success: 'シーズンを作成しました。' };
}

export async function createWeek(
  _prevState: TimelineActionState,
  formData: FormData,
): Promise<TimelineActionState> {
  const session = await requirePermission('event.manage');

  const parsed = weekSchema.safeParse({
    season_id: formData.get('season_id'),
    start_date: formData.get('start_date'),
    end_date: formData.get('end_date'),
    theme: formData.get('theme') ?? undefined,
    focus_task: formData.get('focus_task') ?? undefined,
    key_skill: formData.get('key_skill') ?? undefined,
    tactical_theme: formData.get('tactical_theme') ?? undefined,
    weekly_message: formData.get('weekly_message') ?? undefined,
    carried_over_task: formData.get('carried_over_task') ?? undefined,
    is_published: formData.get('is_published') === 'on',
  });

  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.from('weeks').insert({
    team_id: session.teamId,
    season_id: parsed.data.season_id,
    start_date: parsed.data.start_date,
    end_date: parsed.data.end_date,
    theme: emptyToNull(parsed.data.theme),
    focus_task: emptyToNull(parsed.data.focus_task),
    key_skill: emptyToNull(parsed.data.key_skill),
    tactical_theme: emptyToNull(parsed.data.tactical_theme),
    weekly_message: emptyToNull(parsed.data.weekly_message),
    carried_over_task: emptyToNull(parsed.data.carried_over_task),
    is_published: parsed.data.is_published,
    created_by: session.profileId,
  });

  if (error) {
    // 週の重複は unique 制約で弾かれる
    if (error.code === '23505') {
      return { error: 'その開始日の週は既に作成されています。' };
    }
    return { error: `保存できませんでした: ${error.message}` };
  }

  revalidatePath('/schedule');
  revalidatePath('/today');
  return { success: '週を作成しました。' };
}

export async function createEvent(
  _prevState: TimelineActionState,
  formData: FormData,
): Promise<TimelineActionState> {
  const session = await requirePermission('event.manage');

  const parsed = eventSchema.safeParse({
    title: formData.get('title'),
    event_date: formData.get('event_date'),
    start_time: formData.get('start_time') ?? '',
    end_time: formData.get('end_time') ?? '',
    location: formData.get('location') ?? undefined,
    event_type: formData.get('event_type') ?? 'practice',
    purpose: formData.get('purpose') ?? undefined,
    theme: formData.get('theme') ?? undefined,
    menu: formData.get('menu') ?? undefined,
    items_to_bring: formData.get('items_to_bring') ?? undefined,
    notes: formData.get('notes') ?? undefined,
    is_published: formData.get('is_published') === 'on',
  });

  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();

  // 日付から所属する週とシーズンを引き当てる（手で選ばせない）
  const { data: week } = await supabase
    .from('weeks')
    .select('id, season_id')
    .eq('team_id', session.teamId)
    .lte('start_date', parsed.data.event_date)
    .gte('end_date', parsed.data.event_date)
    .is('deleted_at', null)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from('events').insert({
    team_id: session.teamId,
    season_id: week?.season_id ?? null,
    week_id: week?.id ?? null,
    title: parsed.data.title,
    event_date: parsed.data.event_date,
    start_time: emptyToNull(parsed.data.start_time),
    end_time: emptyToNull(parsed.data.end_time),
    location: emptyToNull(parsed.data.location),
    event_type: parsed.data.event_type,
    purpose: emptyToNull(parsed.data.purpose),
    theme: emptyToNull(parsed.data.theme),
    menu: emptyToNull(parsed.data.menu),
    items_to_bring: emptyToNull(parsed.data.items_to_bring),
    notes: emptyToNull(parsed.data.notes),
    is_published: parsed.data.is_published,
    created_by: session.profileId,
  });

  if (error) return { error: `保存できませんでした: ${error.message}` };

  revalidatePath('/schedule');
  revalidatePath('/today');
  return {
    success: week
      ? '予定を作成しました。'
      : '予定を作成しました。ただし、この日を含む週がまだ無いため週テーマと結び付いていません。',
  };
}
