'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { can, requirePermission, requireSession, type AppSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

import {
  actionDefinition,
  isActionAllowed,
  playerSkillStatusFor,
  type Actor,
  type SkillAction,
} from './lib/state';
import { skillApplicationActionSchema, skillApplicationSchema, skillReviewSchema } from './schemas';

/**
 * スキル申請の書き込み（30〜32章）。
 *
 * 守ること:
 *   * **選手が自分で自分を承認できない。** 0014 のトリガでも守っているが、
 *     ここで弾いたほうが「なぜできないか」を伝えられる。
 *   * 審査の記録は上書きしない。追記だけ（55章と同じ考え方）。
 *   * 到達状況（player_skills）と申請の状態は、必ず対で動かす。
 *     片方だけ動くと「承認されたのに一覧に出ない」が起きる。
 */

export interface SkillActionState {
  error?: string;
  success?: string;
}

function text(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === 'string' ? value : undefined;
}

function textList(formData: FormData, name: string): string[] {
  return formData.getAll(name).filter((value): value is string => typeof value === 'string' && value !== '');
}

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? '入力内容を確認してください。';
}

/** その申請に対して、いま自分がどの立場か。 */
function actorFor(session: AppSession, applicantMemberId: string): Actor {
  // 審査担当が自分の申請を出した場合、本人であることを優先する。
  // そうしないと自分で自分を承認できてしまう。
  if (applicantMemberId === session.teamMemberId) return 'owner';
  if (can(session, 'skill.review')) return 'reviewer';
  return 'observer';
}

/**
 * 到達状況を、申請の動きに合わせる。
 *
 * 行が無ければ作る。ただし作れるのは本人だけ（RLS）なので、
 * 申請を出した時点で必ず作っておく。コーチの審査時には必ず在る。
 */
async function syncPlayerSkill(
  session: AppSession,
  input: { memberId: string; skillId: string; action: SkillAction; canCreate: boolean },
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const status = playerSkillStatusFor(input.action);

  const { data: existing } = await supabase
    .from('player_skills')
    .select('id')
    .eq('team_member_id', input.memberId)
    .eq('skill_id', input.skillId)
    .is('deleted_at', null)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from('player_skills').update({ status }).eq('id', existing.id);
    // 承認の可否はトリガが決める。ここに来るのは想定外なので、そのまま伝える。
    return error ? { error: `到達状況を更新できませんでした: ${error.message}` } : {};
  }

  if (!input.canCreate) {
    return { error: 'この選手の到達状況が見つかりません。申請をやり直してください。' };
  }

  const { error } = await supabase.from('player_skills').insert({
    team_id: session.teamId,
    team_member_id: input.memberId,
    skill_id: input.skillId,
    status,
  });

  return error ? { error: `到達状況を作れませんでした: ${error.message}` } : {};
}

/**
 * 申請を出す（32章）。
 *
 * 根拠は0件でも出せる。「動画を撮らないと申請できない」にすると、
 * 言葉で説明できる選手まで止めてしまう。
 */
export async function submitSkillApplication(
  _prevState: SkillActionState,
  formData: FormData,
): Promise<SkillActionState> {
  const session = await requireSession();

  const parsed = skillApplicationSchema.safeParse({
    skill_id: text(formData, 'skill_id') ?? '',
    comment: text(formData, 'comment'),
    video_ids: textList(formData, 'video_ids'),
    video_clip_ids: textList(formData, 'video_clip_ids'),
    feedback_request_ids: textList(formData, 'feedback_request_ids'),
    evidence_note: text(formData, 'evidence_note'),
  });

  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const input = parsed.data;

  const supabase = await createClient();

  // 別チームのスキルに申請できないことは 0014 のトリガでも守っているが、
  // ここで弾いたほうが理由を伝えられる。
  const { data: skill } = await supabase
    .from('skills')
    .select('id, name')
    .eq('team_id', session.teamId)
    .eq('id', input.skill_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!skill) return { error: 'そのスキルは見つかりません。' };

  // すでに承認されているものに、もう一度申請させない
  const { data: current } = await supabase
    .from('player_skills')
    .select('status')
    .eq('team_member_id', session.teamMemberId)
    .eq('skill_id', input.skill_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (current?.status === 'approved') {
    return { error: 'このスキルはすでに承認されています。' };
  }

  const { data: application, error } = await supabase
    .from('skill_applications')
    .insert({
      team_id: session.teamId,
      team_member_id: session.teamMemberId,
      skill_id: input.skill_id,
      comment: input.comment ?? null,
      status: 'submitted',
    })
    .select('id')
    .single();

  if (error || !application) {
    return { error: `申請できませんでした: ${error?.message ?? '不明なエラー'}` };
  }

  const items = [
    ...input.video_ids.map((id) => ({ item_type: 'video' as const, video_id: id })),
    ...input.video_clip_ids.map((id) => ({ item_type: 'video_clip' as const, video_clip_id: id })),
    ...input.feedback_request_ids.map((id) => ({
      item_type: 'feedback_request' as const,
      feedback_request_id: id,
    })),
    ...(input.evidence_note ? [{ item_type: 'note' as const, note: input.evidence_note }] : []),
  ];

  if (items.length > 0) {
    const { error: itemError } = await supabase.from('skill_application_items').insert(
      items.map((item) => ({
        team_id: session.teamId,
        skill_application_id: application.id,
        ...item,
      })),
    );

    if (itemError) {
      return { error: `根拠を保存できませんでした: ${itemError.message}` };
    }
  }

  const synced = await syncPlayerSkill(session, {
    memberId: session.teamMemberId,
    skillId: input.skill_id,
    action: 'submit',
    canCreate: true,
  });

  if (synced.error) return { error: synced.error };

  await notifyReviewers(session, {
    applicationId: application.id,
    title: 'スキルの申請が届きました',
    body: `${session.displayName}さんが「${skill.name}」を申請しました。`,
  });

  revalidatePath('/skills');
  revalidatePath('/skills/applications');
  revalidatePath('/today');

  redirect(`/skills/applications/${application.id}?submitted=1`);
}

/** 出し直す・取り下げる・審査を始める。 */
export async function transitionSkillApplication(
  _prevState: SkillActionState,
  formData: FormData,
): Promise<SkillActionState> {
  const session = await requireSession();

  const parsed = skillApplicationActionSchema.safeParse({
    application_id: text(formData, 'application_id') ?? '',
    action: text(formData, 'action') ?? '',
  });

  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { application_id: applicationId, action } = parsed.data;

  const supabase = await createClient();

  const { data: application } = await supabase
    .from('skill_applications')
    .select('id, status, team_member_id, skill_id')
    .eq('team_id', session.teamId)
    .eq('id', applicationId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!application) return { error: '対象の申請が見つかりません。' };

  const actor = actorFor(session, application.team_member_id);
  if (!isActionAllowed(application.status, actor, action)) {
    return { error: 'いまその操作はできません。画面を読み込み直してください。' };
  }

  const { error } = await supabase
    .from('skill_applications')
    .update({ status: actionDefinition(action).to })
    .eq('id', applicationId);

  if (error) return { error: `更新できませんでした: ${error.message}` };

  const synced = await syncPlayerSkill(session, {
    memberId: application.team_member_id,
    skillId: application.skill_id,
    action,
    canCreate: actor === 'owner',
  });

  if (synced.error) return { error: synced.error };

  revalidatePath('/skills');
  revalidatePath('/skills/applications');
  revalidatePath(`/skills/applications/${applicationId}`);
  revalidatePath('/today');

  const labels: Record<string, string> = {
    submit: '申請を出し直しました。',
    start_review: '審査を始めました。',
    withdraw: '申請を取り下げました。',
  };

  return { success: labels[action] ?? '更新しました。' };
}

/**
 * 審査する（31章）。
 *
 * 承認・差し戻し・見送りのどれでも、必ず記録を1件残す。
 * 「なぜそう判断したか」が残らないと、選手は次に何をすればいいか分からない。
 */
export async function reviewSkillApplication(
  _prevState: SkillActionState,
  formData: FormData,
): Promise<SkillActionState> {
  const session = await requirePermission('skill.review');

  const parsed = skillReviewSchema.safeParse({
    application_id: text(formData, 'application_id') ?? '',
    decision: text(formData, 'decision') ?? '',
    comment: text(formData, 'comment'),
  });

  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const input = parsed.data;

  const supabase = await createClient();

  const { data: application } = await supabase
    .from('skill_applications')
    .select('id, status, team_member_id, skill_id')
    .eq('team_id', session.teamId)
    .eq('id', input.application_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!application) return { error: '対象の申請が見つかりません。' };

  const actor = actorFor(session, application.team_member_id);
  if (actor === 'owner') {
    return { error: '自分の申請は自分で審査できません。' };
  }

  const action: SkillAction =
    input.decision === 'approve' ? 'approve' : input.decision === 'reject' ? 'reject' : 'need_more';

  if (!isActionAllowed(application.status, actor, action)) {
    return { error: 'いまこの申請は審査できません。画面を読み込み直してください。' };
  }

  // 差し戻しは理由が要る。何が足りないか分からないまま返されるのが一番困る。
  if (action !== 'approve' && !input.comment) {
    return { error: '差し戻す・見送るときは、理由を書いてください。' };
  }

  const decision = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'needs_more';

  const { error: reviewError } = await supabase.from('skill_reviews').insert({
    team_id: session.teamId,
    skill_application_id: input.application_id,
    reviewer_id: session.profileId,
    decision,
    comment: input.comment ?? null,
  });

  if (reviewError) return { error: `審査を保存できませんでした: ${reviewError.message}` };

  const { error: statusError } = await supabase
    .from('skill_applications')
    .update({ status: actionDefinition(action).to })
    .eq('id', input.application_id);

  if (statusError) {
    return { error: `審査は保存しましたが、状態を変えられませんでした: ${statusError.message}` };
  }

  const synced = await syncPlayerSkill(session, {
    memberId: application.team_member_id,
    skillId: application.skill_id,
    action,
    canCreate: false,
  });

  if (synced.error) return { error: synced.error };

  const messages: Record<SkillAction, { title: string; body: string; success: string }> = {
    approve: {
      title: 'スキルが承認されました',
      body: input.comment ?? 'おめでとうございます。',
      success: '承認しました。',
    },
    need_more: {
      title: 'スキル申請が差し戻されました',
      body: input.comment ?? '根拠を足してください。',
      success: '差し戻しました。選手が根拠を足して出し直せます。',
    },
    reject: {
      title: 'スキル申請は今回見送りになりました',
      body: input.comment ?? '',
      success: '見送りにしました。',
    },
    submit: { title: '', body: '', success: '' },
    start_review: { title: '', body: '', success: '' },
    withdraw: { title: '', body: '', success: '' },
  };

  await notifyMember(session, {
    applicationId: input.application_id,
    targetMemberId: application.team_member_id,
    title: messages[action].title,
    body: messages[action].body.slice(0, 120),
  });

  revalidatePath('/skills');
  revalidatePath('/skills/applications');
  revalidatePath(`/skills/applications/${input.application_id}`);
  revalidatePath('/today');

  return { success: messages[action].success };
}

/**
 * アプリ内通知（57章）。失敗しても本来の処理は止めない。
 *
 * ただし**黙って捨てない**。
 * Phase 6 で通知の INSERT ポリシーが無いことに長く気付けなかったのは、
 * ここで失敗を握りつぶしていたためだった（0015）。
 */
function warnIfFailed(where: string, error: { message: string } | null): void {
  if (error) {
    console.warn(`[skills] 通知を作れませんでした (${where}): ${error.message}`);
  }
}

async function notifyMember(
  session: AppSession,
  input: { applicationId: string; targetMemberId: string; title: string; body: string },
): Promise<void> {
  try {
    const supabase = await createClient();

    const { data: notification, error } = await supabase
      .from('notifications')
      .insert({
        team_id: session.teamId,
        notification_type: 'skill_application_updated',
        title: input.title,
        body: input.body,
        link_path: `/skills/applications/${input.applicationId}`,
        related_table: 'skill_applications',
        related_id: input.applicationId,
        created_by: session.profileId,
      })
      .select('id')
      .single();

    warnIfFailed('審査の通知', error);
    if (notification) {
      const { error: targetError } = await supabase.from('notification_targets').insert({
        notification_id: notification.id,
        team_member_id: input.targetMemberId,
      });
      warnIfFailed('審査の通知の宛先', targetError);
    }
  } catch (unexpected) {
    // 通知は本筋ではない。落ちても審査は成立させる。
    console.warn('[skills] 通知で予期しない失敗', unexpected);
  }
}

/** 審査できる人みんなへ。誰が担当と決まっていないため。 */
async function notifyReviewers(
  session: AppSession,
  input: { applicationId: string; title: string; body: string },
): Promise<void> {
  try {
    const supabase = await createClient();

    const { data: staff } = await supabase
      .from('team_members')
      .select('id, role_code')
      .eq('team_id', session.teamId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .in('role_code', ['coach', 'system_admin']);

    const targets = staff ?? [];
    if (targets.length === 0) return;

    const { data: notification, error } = await supabase
      .from('notifications')
      .insert({
        team_id: session.teamId,
        notification_type: 'skill_applied',
        title: input.title,
        body: input.body,
        link_path: `/skills/applications/${input.applicationId}`,
        related_table: 'skill_applications',
        related_id: input.applicationId,
        created_by: session.profileId,
      })
      .select('id')
      .single();

    warnIfFailed('申請の通知', error);
    if (notification) {
      const { error: targetError } = await supabase.from('notification_targets').insert(
        targets.map((member) => ({
          notification_id: notification.id,
          team_member_id: member.id,
        })),
      );
      warnIfFailed('申請の通知の宛先', targetError);
    }
  } catch (unexpected) {
    console.warn('[skills] 通知で予期しない失敗', unexpected);
  }
}
