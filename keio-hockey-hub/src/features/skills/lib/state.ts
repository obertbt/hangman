import type { PlayerSkillStatus, SkillApplicationStatus } from '@/types/database.types';

/**
 * スキル申請の状態遷移と、到達状況への反映（30〜32章）。
 *
 * 2つの状態を扱う。
 *
 *   skill_applications.status … その「申請」がいまどこにあるか
 *   player_skills.status      … その選手がそのスキルにどこまで届いているか
 *
 * 申請は何度でも出せるが、到達状況はスキルごとに1つしかない。
 * 「申請を動かしたとき、到達状況をどうするか」を1か所にまとめる。
 * DB のトリガ（0014）とここは**同じ規則**にする。片方だけ直すとズレる。
 */

/** 誰として操作しているか。 */
export type Actor =
  /** 申請した本人 */
  | 'owner'
  /** 審査できる立場（skill.review を持つ） */
  | 'reviewer'
  /** どちらでもない */
  | 'observer';

export type SkillAction = 'submit' | 'start_review' | 'approve' | 'reject' | 'need_more' | 'withdraw';

export interface ActionDefinition {
  action: SkillAction;
  label: string;
  /** 申請の移り先。 */
  to: SkillApplicationStatus;
  /** 到達状況の移り先。 */
  playerSkillTo: PlayerSkillStatus;
  /** 戻せない操作は画面で一度確認を挟む。 */
  destructive?: boolean;
}

const ACTIONS: Record<SkillAction, Omit<ActionDefinition, 'action'>> = {
  submit: { label: 'この内容で申請する', to: 'submitted', playerSkillTo: 'applied' },
  start_review: { label: '審査を始める', to: 'reviewing', playerSkillTo: 'applied' },
  approve: { label: '承認する', to: 'approved', playerSkillTo: 'approved' },
  // 差し戻しは「不合格」ではない。選手の手元へ戻して、根拠を足してもらう。
  need_more: { label: '根拠を足してもらう', to: 'draft', playerSkillTo: 'feedback' },
  reject: { label: '今回は見送る', to: 'rejected', playerSkillTo: 'not_started', destructive: true },
  withdraw: { label: '取り下げる', to: 'withdrawn', playerSkillTo: 'not_started', destructive: true },
};

/**
 * 「その状態から、どの操作を、誰ができるか」。
 *
 * approved で終わりにしている。承認したスキルをこの画面から取り消せない。
 * 一度「できる」と言われたものが黙って消えると、選手は記録を信じなくなる。
 * 誤って承認した場合は、コーチが理由を添えて手で直す（監査ログに残る）。
 */
const TRANSITIONS: Record<SkillApplicationStatus, { action: SkillAction; actors: Actor[] }[]> = {
  draft: [
    { action: 'submit', actors: ['owner'] },
    { action: 'withdraw', actors: ['owner'] },
  ],
  submitted: [
    { action: 'start_review', actors: ['reviewer'] },
    { action: 'approve', actors: ['reviewer'] },
    { action: 'need_more', actors: ['reviewer'] },
    { action: 'reject', actors: ['reviewer'] },
    { action: 'withdraw', actors: ['owner'] },
  ],
  reviewing: [
    { action: 'approve', actors: ['reviewer'] },
    { action: 'need_more', actors: ['reviewer'] },
    { action: 'reject', actors: ['reviewer'] },
    { action: 'withdraw', actors: ['owner'] },
  ],
  approved: [],
  rejected: [],
  withdrawn: [],
};

/** いまこの人ができる操作。画面のボタンはここから作る。 */
export function availableActions(status: SkillApplicationStatus, actor: Actor): ActionDefinition[] {
  return TRANSITIONS[status]
    .filter((entry) => entry.actors.includes(actor))
    .map((entry) => ({ action: entry.action, ...ACTIONS[entry.action] }));
}

/** Server Action の入口で使う。 */
export function isActionAllowed(status: SkillApplicationStatus, actor: Actor, action: SkillAction): boolean {
  return availableActions(status, actor).some((entry) => entry.action === action);
}

export function applicationStatusFor(action: SkillAction): SkillApplicationStatus {
  return ACTIONS[action].to;
}

/** その操作のあと、到達状況をどうするか。 */
export function playerSkillStatusFor(action: SkillAction): PlayerSkillStatus {
  return ACTIONS[action].playerSkillTo;
}

export function actionDefinition(action: SkillAction): ActionDefinition {
  return { action, ...ACTIONS[action] };
}

/** 審査を待たせているか。コーチの一覧で先に出す。 */
export function isAwaitingReview(status: SkillApplicationStatus): boolean {
  return status === 'submitted' || status === 'reviewing';
}

/** 選手の手元に戻っているか（根拠を足す番）。 */
export function isBackToPlayer(status: SkillApplicationStatus, hasReview: boolean): boolean {
  return status === 'draft' && hasReview;
}

/** もう動かない状態か。 */
export function isFinished(status: SkillApplicationStatus): boolean {
  return status === 'approved' || status === 'rejected' || status === 'withdrawn';
}

// -------------------------------------------------------------
// 進捗の集計（31章）
// -------------------------------------------------------------

/** 集計に必要なぶんだけ。行の型そのものには依存させない。 */
export interface SkillLike {
  id: string;
  skill_category_id: string;
  parent_id: string | null;
}

export interface PlayerSkillLike {
  skill_id: string;
  status: PlayerSkillStatus;
}

export interface CategoryProgress {
  categoryId: string;
  /** 小目標の数（数えるのは末端だけ）。 */
  total: number;
  approved: number;
  /** 申請中・差し戻し中の合計。 */
  inProgress: number;
  notStarted: number;
  /** 0〜100 の整数。total が 0 なら 0。 */
  percent: number;
}

/**
 * 大分類ごとの到達度。
 *
 * **数えるのは小目標（末端）だけ。** 中目標は小目標の入れ物なので、
 * 一緒に数えると「中目標を承認しただけで進捗が跳ねる」ことになる。
 */
export function summarizeProgress(
  skills: SkillLike[],
  playerSkills: PlayerSkillLike[],
): Map<string, CategoryProgress> {
  const statusBySkill = new Map(playerSkills.map((entry) => [entry.skill_id, entry.status]));
  const hasChild = new Set(skills.map((skill) => skill.parent_id).filter((id): id is string => id !== null));

  const result = new Map<string, CategoryProgress>();

  for (const skill of skills) {
    // 子を持つものは入れ物。数えない。
    if (hasChild.has(skill.id)) continue;

    const current = result.get(skill.skill_category_id) ?? {
      categoryId: skill.skill_category_id,
      total: 0,
      approved: 0,
      inProgress: 0,
      notStarted: 0,
      percent: 0,
    };

    current.total += 1;

    switch (statusBySkill.get(skill.id) ?? 'not_started') {
      case 'approved':
        current.approved += 1;
        break;
      case 'applied':
      case 'feedback':
        current.inProgress += 1;
        break;
      default:
        current.notStarted += 1;
    }

    result.set(skill.skill_category_id, current);
  }

  for (const progress of result.values()) {
    progress.percent = progress.total === 0 ? 0 : Math.round((progress.approved / progress.total) * 100);
  }

  return result;
}

/** チーム全体でも同じ数え方をする。 */
export function overallProgress(progress: Map<string, CategoryProgress>): CategoryProgress {
  const total = { categoryId: '', total: 0, approved: 0, inProgress: 0, notStarted: 0, percent: 0 };

  for (const entry of progress.values()) {
    total.total += entry.total;
    total.approved += entry.approved;
    total.inProgress += entry.inProgress;
    total.notStarted += entry.notStarted;
  }

  total.percent = total.total === 0 ? 0 : Math.round((total.approved / total.total) * 100);
  return total;
}

/**
 * 次に取り組むとよいスキル（3章の1: 何をすればいいか迷わせない）。
 *
 * 並べ方:
 *   1. 差し戻し中（コーチが待っている。放置させない）
 *   2. 申請中
 *   3. まだ手を付けていないもの
 *
 * 承認済みは出さない。同じ順位のものは、定義された並び順のまま。
 */
const PRIORITY: Record<PlayerSkillStatus, number> = {
  feedback: 0,
  applied: 1,
  not_started: 2,
  approved: 3,
};

export function nextSkills<T extends SkillLike>(
  skills: T[],
  playerSkills: PlayerSkillLike[],
  limit = 3,
): T[] {
  const statusBySkill = new Map(playerSkills.map((entry) => [entry.skill_id, entry.status]));
  const hasChild = new Set(skills.map((skill) => skill.parent_id).filter((id): id is string => id !== null));

  return skills
    .filter((skill) => !hasChild.has(skill.id))
    .map((skill, index) => ({ skill, index, status: statusBySkill.get(skill.id) ?? 'not_started' }))
    .filter((entry) => entry.status !== 'approved')
    .sort((a, b) => PRIORITY[a.status] - PRIORITY[b.status] || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.skill);
}
