import type { FeedbackStatus } from '@/types/database.types';

/**
 * 動画フィードバックの状態遷移（27章）。
 *
 * ここは DB のトリガ `app.is_valid_feedback_transition()` と**同じ規則**にする。
 * 片方だけ直すとズレるので、変更時は必ず両方を直すこと。
 *
 * DB 側は「その遷移が許されるか」だけを見る。
 * こちらは加えて「いま誰がその操作をできるか」を決める。
 * 画面は「押せるボタン」をここから作る。
 */

/** 誰として操作しているか。 */
export type Actor =
  /** 質問した本人 */
  | 'requester'
  /** 回答できる立場（video.feedback_answer を持つ） */
  | 'coach'
  /** どちらでもない（見ているだけ） */
  | 'observer';

/** 画面に出す操作。 */
export type FeedbackAction =
  'assign' | 'start_review' | 'answer' | 'acknowledge' | 'follow_up' | 'close' | 'withdraw';

export interface ActionDefinition {
  action: FeedbackAction;
  label: string;
  /** この操作で移る先の状態。 */
  to: FeedbackStatus;
  /** 押した結果が戻せないものは、画面で一度確認を挟む。 */
  destructive?: boolean;
}

const ACTIONS: Record<FeedbackAction, Omit<ActionDefinition, 'action'>> = {
  assign: { label: 'この質問を担当する', to: 'assigned' },
  start_review: { label: '確認中にする', to: 'reviewing' },
  answer: { label: '回答する', to: 'answered' },
  acknowledge: { label: '回答を確認した', to: 'acknowledged' },
  follow_up: { label: 'もう一度聞く', to: 'follow_up' },
  close: { label: '完了にする', to: 'closed', destructive: true },
  withdraw: { label: '取り下げる', to: 'withdrawn', destructive: true },
};

/**
 * 遷移の表。DB の CASE 文と同じ内容。
 * 「その状態から、どの操作を、誰ができるか」を1か所にまとめる。
 */
const TRANSITIONS: Record<FeedbackStatus, { action: FeedbackAction; actors: Actor[] }[]> = {
  draft: [
    { action: 'withdraw', actors: ['requester'] },
    // draft → submitted は投稿フォームが行うので、ここには出さない
  ],
  submitted: [
    { action: 'assign', actors: ['coach'] },
    { action: 'start_review', actors: ['coach'] },
    { action: 'withdraw', actors: ['requester'] },
  ],
  assigned: [
    { action: 'start_review', actors: ['coach'] },
    { action: 'answer', actors: ['coach'] },
    { action: 'withdraw', actors: ['requester'] },
  ],
  reviewing: [
    { action: 'answer', actors: ['coach'] },
    { action: 'assign', actors: ['coach'] },
    { action: 'withdraw', actors: ['requester'] },
  ],
  answered: [
    { action: 'acknowledge', actors: ['requester'] },
    { action: 'follow_up', actors: ['requester'] },
    { action: 'close', actors: ['requester', 'coach'] },
  ],
  acknowledged: [
    { action: 'follow_up', actors: ['requester'] },
    { action: 'close', actors: ['requester', 'coach'] },
  ],
  follow_up: [
    { action: 'start_review', actors: ['coach'] },
    { action: 'answer', actors: ['coach'] },
    { action: 'close', actors: ['requester', 'coach'] },
  ],
  closed: [],
  withdrawn: [],
};

/** その遷移が許されるか（DB のトリガと同じ判定）。 */
export function canTransition(from: FeedbackStatus, to: FeedbackStatus): boolean {
  if (from === 'draft' && to === 'submitted') return true; // 投稿
  return TRANSITIONS[from].some((entry) => ACTIONS[entry.action].to === to);
}

/** いまこの人ができる操作を並べる。 */
export function availableActions(status: FeedbackStatus, actor: Actor): ActionDefinition[] {
  return TRANSITIONS[status]
    .filter((entry) => entry.actors.includes(actor))
    .map((entry) => ({ action: entry.action, ...ACTIONS[entry.action] }));
}

export function transitionFor(action: FeedbackAction): FeedbackStatus {
  return ACTIONS[action].to;
}

/** その操作を、その人が、その状態で行えるか。Server Action の入口で使う。 */
export function isActionAllowed(status: FeedbackStatus, actor: Actor, action: FeedbackAction): boolean {
  return availableActions(status, actor).some((entry) => entry.action === action);
}

/**
 * まだ回答が済んでいないか。
 * コーチの一覧で「対応が要るもの」を絞るのに使う。
 */
export function isAwaitingCoach(status: FeedbackStatus): boolean {
  return status === 'submitted' || status === 'assigned' || status === 'reviewing' || status === 'follow_up';
}

/** 選手がまだ回答を見ていないか。今日のダッシュボードの件数に使う。 */
export function isAwaitingPlayer(status: FeedbackStatus): boolean {
  return status === 'answered';
}

/** もう動かない状態か。 */
export function isFinished(status: FeedbackStatus): boolean {
  return status === 'closed' || status === 'withdrawn';
}

/**
 * 何日待たせているか（12章: 3日以上未回答を見落とさない）。
 * 提出時刻が無い場合は 0 とみなす。
 */
export function daysWaiting(submittedAt: string | null, now: Date = new Date()): number {
  if (!submittedAt) return 0;
  const submitted = new Date(submittedAt);
  if (Number.isNaN(submitted.getTime())) return 0;
  const diffMs = now.getTime() - submitted.getTime();
  if (diffMs < 0) return 0;
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

/** 3日以上待たせているか。 */
export function isOverdue(status: FeedbackStatus, submittedAt: string | null, now?: Date): boolean {
  return isAwaitingCoach(status) && daysWaiting(submittedAt, now) >= 3;
}
