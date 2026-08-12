import 'server-only';

import type { AppSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import type {
  FeedbackRequestRow,
  PlayerSkillRow,
  SkillApplicationItemRow,
  SkillApplicationRow,
  SkillCategoryRow,
  SkillReviewRow,
  SkillRow,
  SkillStatusHistoryRow,
  VideoClipRow,
  VideoRow,
} from '@/types/database.types';

import { overallProgress, summarizeProgress, type CategoryProgress } from './lib/state';

/**
 * スキルの読み取り（30〜32章）。
 *
 * 見えるかどうかは RLS が決める。
 *   到達状況・申請 … 本人とスタッフ
 *   スキル定義     … チームの全員
 */

/** 中目標と、その下の小目標。子が無ければ、それ自体が到達点。 */
export interface SkillNode {
  skill: SkillRow;
  children: SkillRow[];
}

export interface SkillCategoryNode {
  category: SkillCategoryRow;
  nodes: SkillNode[];
  progress: CategoryProgress;
}

export interface SkillOverview {
  categories: SkillCategoryNode[];
  /** skill_id → 到達状況。 */
  statusBySkill: Map<string, PlayerSkillRow>;
  /** skill_id → いま動いている申請。 */
  openApplicationBySkill: Map<string, SkillApplicationRow>;
  total: CategoryProgress;
}

/**
 * スキル階層と、その人の到達状況をまとめて引く。
 *
 * memberId を省くとログイン中の本人。コーチが選手の状況を見るときに渡す。
 */
export async function getSkillOverview(
  session: AppSession,
  memberId: string = session.teamMemberId,
): Promise<SkillOverview> {
  const supabase = await createClient();

  const [categoryResult, skillResult, playerSkillResult, applicationResult] = await Promise.all([
    supabase
      .from('skill_categories')
      .select('*')
      .eq('team_id', session.teamId)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true }),
    supabase
      .from('skills')
      .select('*')
      .eq('team_id', session.teamId)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true }),
    supabase.from('player_skills').select('*').eq('team_member_id', memberId).is('deleted_at', null),
    supabase
      .from('skill_applications')
      .select('*')
      .eq('team_member_id', memberId)
      .in('status', ['draft', 'submitted', 'reviewing'])
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
  ]);

  const categories = categoryResult.data ?? [];
  const skills = skillResult.data ?? [];
  const playerSkills = playerSkillResult.data ?? [];

  const progressByCategory = summarizeProgress(skills, playerSkills);

  const childrenByParent = new Map<string, SkillRow[]>();
  for (const skill of skills) {
    if (!skill.parent_id) continue;
    const list = childrenByParent.get(skill.parent_id) ?? [];
    list.push(skill);
    childrenByParent.set(skill.parent_id, list);
  }

  const emptyProgress = (categoryId: string): CategoryProgress => ({
    categoryId,
    total: 0,
    approved: 0,
    inProgress: 0,
    notStarted: 0,
    percent: 0,
  });

  const nodes: SkillCategoryNode[] = categories.map((category) => ({
    category,
    nodes: skills
      .filter((skill) => skill.skill_category_id === category.id && skill.parent_id === null)
      .map((skill) => ({ skill, children: childrenByParent.get(skill.id) ?? [] })),
    progress: progressByCategory.get(category.id) ?? emptyProgress(category.id),
  }));

  // いちばん新しい申請だけを残す（同じスキルに複数の下書きがある場合）
  const openApplicationBySkill = new Map<string, SkillApplicationRow>();
  for (const application of applicationResult.data ?? []) {
    if (!openApplicationBySkill.has(application.skill_id)) {
      openApplicationBySkill.set(application.skill_id, application);
    }
  }

  return {
    categories: nodes,
    statusBySkill: new Map(playerSkills.map((entry) => [entry.skill_id, entry])),
    openApplicationBySkill,
    total: overallProgress(progressByCategory),
  };
}

/** 申請1件を、画面に出すのに必要なものと一緒に。 */
export interface ApplicationDetail {
  application: SkillApplicationRow;
  skill: SkillRow | null;
  categoryName: string | null;
  items: SkillApplicationItemRow[];
  videos: Map<string, VideoRow>;
  clips: Map<string, VideoClipRow>;
  feedbacks: Map<string, FeedbackRequestRow>;
  reviews: SkillReviewRow[];
  reviewerNames: Map<string, string>;
  applicantName: string;
  playerSkill: PlayerSkillRow | null;
  histories: SkillStatusHistoryRow[];
}

export async function getApplicationDetail(
  session: AppSession,
  applicationId: string,
): Promise<ApplicationDetail | null> {
  const supabase = await createClient();

  const { data: application } = await supabase
    .from('skill_applications')
    .select('*')
    .eq('team_id', session.teamId)
    .eq('id', applicationId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!application) return null;

  const [skillResult, itemResult, reviewResult, playerSkillResult] = await Promise.all([
    supabase.from('skills').select('*').eq('id', application.skill_id).maybeSingle(),
    supabase
      .from('skill_application_items')
      .select('*')
      .eq('skill_application_id', applicationId)
      .order('created_at', { ascending: true }),
    // 審査は上書きしない。やり取りの流れが分かるよう古い順に。
    supabase
      .from('skill_reviews')
      .select('*')
      .eq('skill_application_id', applicationId)
      .order('created_at', { ascending: true }),
    supabase
      .from('player_skills')
      .select('*')
      .eq('team_member_id', application.team_member_id)
      .eq('skill_id', application.skill_id)
      .is('deleted_at', null)
      .maybeSingle(),
  ]);

  const items = itemResult.data ?? [];
  const reviews = reviewResult.data ?? [];
  const skill = skillResult.data;

  const videoIds = ids(items, 'video_id');
  const clipIds = ids(items, 'video_clip_id');
  const feedbackIds = ids(items, 'feedback_request_id');

  const [videoResult, clipResult, feedbackResult, categoryResult, historyResult] = await Promise.all([
    videoIds.length > 0
      ? supabase.from('videos').select('*').in('id', videoIds).is('deleted_at', null)
      : Promise.resolve({ data: [] as VideoRow[] }),
    clipIds.length > 0
      ? supabase.from('video_clips').select('*').in('id', clipIds).is('deleted_at', null)
      : Promise.resolve({ data: [] as VideoClipRow[] }),
    feedbackIds.length > 0
      ? supabase.from('feedback_requests').select('*').in('id', feedbackIds).is('deleted_at', null)
      : Promise.resolve({ data: [] as FeedbackRequestRow[] }),
    skill
      ? supabase.from('skill_categories').select('name').eq('id', skill.skill_category_id).maybeSingle()
      : Promise.resolve({ data: null }),
    playerSkillResult.data
      ? supabase
          .from('skill_status_histories')
          .select('*')
          .eq('player_skill_id', playerSkillResult.data.id)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [] as SkillStatusHistoryRow[] }),
  ]);

  const [applicantName, reviewerNames] = await Promise.all([
    resolveMemberName(session, application.team_member_id),
    resolveProfileNames(reviews.map((review) => review.reviewer_id)),
  ]);

  return {
    application,
    skill: skill ?? null,
    categoryName: categoryResult.data?.name ?? null,
    items,
    videos: new Map((videoResult.data ?? []).map((video) => [video.id, video])),
    clips: new Map((clipResult.data ?? []).map((clip) => [clip.id, clip])),
    feedbacks: new Map((feedbackResult.data ?? []).map((request) => [request.id, request])),
    reviews,
    reviewerNames,
    applicantName,
    playerSkill: playerSkillResult.data ?? null,
    histories: historyResult.data ?? [],
  };
}

function ids(items: SkillApplicationItemRow[], key: keyof SkillApplicationItemRow): string[] {
  return [
    ...new Set(items.map((item) => item[key]).filter((value): value is string => typeof value === 'string')),
  ];
}

export interface ApplicationListItem {
  application: SkillApplicationRow;
  skillName: string;
  applicantName: string;
  /** 一度でも審査されているか。差し戻しの下書きと、出す前の下書きを分ける。 */
  hasReview: boolean;
}

async function decorate(
  session: AppSession,
  applications: SkillApplicationRow[],
): Promise<ApplicationListItem[]> {
  if (applications.length === 0) return [];

  const supabase = await createClient();
  const skillIds = [...new Set(applications.map((application) => application.skill_id))];
  const applicationIds = applications.map((application) => application.id);

  const [skillResult, reviewResult, names] = await Promise.all([
    supabase.from('skills').select('id, name').in('id', skillIds),
    supabase.from('skill_reviews').select('skill_application_id').in('skill_application_id', applicationIds),
    resolveMemberNames(
      session,
      applications.map((application) => application.team_member_id),
    ),
  ]);

  const nameById = new Map((skillResult.data ?? []).map((skill) => [skill.id, skill.name]));
  const reviewed = new Set((reviewResult.data ?? []).map((review) => review.skill_application_id));

  return applications.map((application) => ({
    application,
    skillName: nameById.get(application.skill_id) ?? '（削除されたスキル）',
    applicantName: names.get(application.team_member_id) ?? '不明',
    hasReview: reviewed.has(application.id),
  }));
}

/** コーチ向け: 審査を待っている申請。待たせている順（3章の4）。 */
export async function listAwaitingReview(session: AppSession): Promise<ApplicationListItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('skill_applications')
    .select('*')
    .eq('team_id', session.teamId)
    .in('status', ['submitted', 'reviewing'])
    .is('deleted_at', null)
    .order('submitted_at', { ascending: true, nullsFirst: false });

  return decorate(session, data ?? []);
}

/** 選手向け: 自分の申請。 */
export async function listMyApplications(session: AppSession, limit = 50): Promise<ApplicationListItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('skill_applications')
    .select('*')
    .eq('team_member_id', session.teamMemberId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  return decorate(session, data ?? []);
}

/** 今日の画面で使う件数。 */
export async function countAwaitingReview(session: AppSession): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from('skill_applications')
    .select('id', { count: 'exact', head: true })
    .eq('team_id', session.teamId)
    .in('status', ['submitted', 'reviewing'])
    .is('deleted_at', null);
  return count ?? 0;
}

/** 選手向け: 差し戻されていて、まだ出し直していない申請の数。 */
export async function countSentBack(session: AppSession): Promise<number> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('skill_applications')
    .select('id')
    .eq('team_member_id', session.teamMemberId)
    .eq('status', 'draft')
    .is('deleted_at', null);

  const drafts = data ?? [];
  if (drafts.length === 0) return 0;

  // 一度でも審査されている下書き＝差し戻し
  const { data: reviews } = await supabase
    .from('skill_reviews')
    .select('skill_application_id')
    .in(
      'skill_application_id',
      drafts.map((draft) => draft.id),
    );

  return new Set((reviews ?? []).map((review) => review.skill_application_id)).size;
}

/**
 * 申請の根拠に使えるもの（32章）。
 *
 * 自分の動画・自分が作った場面・回答済みの自分の質問だけを出す。
 * 他人のものを根拠にはできない。
 */
export interface EvidenceCandidates {
  videos: VideoRow[];
  clips: (VideoClipRow & { videoTitle: string })[];
  feedbacks: FeedbackRequestRow[];
}

export async function getEvidenceCandidates(session: AppSession): Promise<EvidenceCandidates> {
  const supabase = await createClient();

  const [videoResult, clipResult, feedbackResult] = await Promise.all([
    supabase
      .from('videos')
      .select('*')
      .eq('team_id', session.teamId)
      .eq('created_by', session.profileId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(30),
    supabase
      .from('video_clips')
      .select('*')
      .eq('team_id', session.teamId)
      .eq('created_by', session.profileId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(30),
    supabase
      .from('feedback_requests')
      .select('*')
      .eq('requester_id', session.teamMemberId)
      .in('status', ['answered', 'acknowledged', 'closed'])
      .is('deleted_at', null)
      .order('answered_at', { ascending: false, nullsFirst: false })
      .limit(30),
  ]);

  const clips = clipResult.data ?? [];
  const videoIds = [...new Set(clips.map((clip) => clip.video_id))];

  const { data: clipVideos } = videoIds.length
    ? await supabase.from('videos').select('id, title').in('id', videoIds)
    : { data: [] as { id: string; title: string }[] };

  const titleById = new Map((clipVideos ?? []).map((video) => [video.id, video.title]));

  return {
    videos: videoResult.data ?? [],
    clips: clips.map((clip) => ({ ...clip, videoTitle: titleById.get(clip.video_id) ?? '動画' })),
    feedbacks: feedbackResult.data ?? [],
  };
}

async function resolveMemberNames(session: AppSession, memberIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(memberIds)];
  const result = new Map<string, string>();
  if (unique.length === 0) return result;

  const supabase = await createClient();
  const { data } = await supabase
    .from('team_members')
    .select('id, profiles(full_name, display_name)')
    .eq('team_id', session.teamId)
    .in('id', unique);

  for (const row of data ?? []) {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    result.set(row.id, pickName(profile));
  }
  return result;
}

async function resolveMemberName(session: AppSession, memberId: string): Promise<string> {
  const names = await resolveMemberNames(session, [memberId]);
  return names.get(memberId) ?? '不明';
}

/** 審査した人は profiles を直に指しているので、team_members とは別に引く。 */
async function resolveProfileNames(profileIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(profileIds)];
  const result = new Map<string, string>();
  if (unique.length === 0) return result;

  const supabase = await createClient();
  const { data } = await supabase.from('profiles').select('id, full_name, display_name').in('id', unique);

  for (const profile of data ?? []) {
    result.set(profile.id, pickName(profile));
  }
  return result;
}

function pickName(record: unknown): string {
  if (record && typeof record === 'object') {
    const display = 'display_name' in record ? (record as { display_name: unknown }).display_name : null;
    const full = 'full_name' in record ? (record as { full_name: unknown }).full_name : null;
    if (typeof display === 'string' && display !== '') return display;
    if (typeof full === 'string') return full;
  }
  return '不明';
}
