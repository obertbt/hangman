import type { EventType } from '@/types/database.types';

/**
 * 「今この瞬間に何をすべきか」を決める（10章・11章）。
 *
 * このシステムの中心。選手が今日何をすればいいか迷わないようにする。
 * 画面に業務ロジックを書かないため、判定はここに閉じ込めて単体テストで守る。
 */

export type ActionKey = 'condition' | 'goal' | 'report' | 'training' | 'feedback_unread' | 'feedback_pending';

export interface PendingAction {
  key: ActionKey;
  label: string;
  href: string;
  /** 締め切りが近い・過ぎているものを上に出す。小さいほど先。 */
  priority: number;
}

/** 練習前後で「今やること」が変わる。 */
export type DayPhase = 'before_event' | 'during_event' | 'after_event' | 'no_event';

export interface TodayEventLike {
  id: string;
  event_type: EventType;
  start_time: string | null;
  end_time: string | null;
}

export interface TodayState {
  events: TodayEventLike[];
  /** 現在時刻 'HH:MM'（Asia/Tokyo）。 */
  nowTime: string;
  hasCondition: boolean;
  hasGoal: boolean;
  hasReport: boolean;
  hasTraining: boolean;
  unreadFeedbackCount: number;
  /** 選手が出した質問のうち、まだ回答が来ていない数。 */
  waitingFeedbackCount: number;
}

/** 記録を求めるイベントかどうか。オフやミーティングでは日報を迫らない。 */
function requiresRecords(eventType: EventType): boolean {
  return eventType === 'practice' || eventType === 'match' || eventType === 'training';
}

function toMinutes(time: string | null): number | null {
  if (!time) return null;
  const parts = time.split(':');
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

/**
 * 今日のどの段階にいるか（6章の練習前 / 練習中 / 練習直後 / 帰宅後）。
 *
 * 時刻が入っていないイベントは「終わったかどうか」を判断できないため、
 * 練習前として扱い、選手の入力を妨げない。
 */
export function resolveDayPhase(state: TodayState): DayPhase {
  const target = state.events.find((event) => requiresRecords(event.event_type));
  if (!target) return 'no_event';

  const now = toMinutes(state.nowTime);
  const start = toMinutes(target.start_time);
  const end = toMinutes(target.end_time);

  if (now === null || start === null) return 'before_event';
  if (now < start) return 'before_event';
  if (end !== null && now >= end) return 'after_event';
  if (end === null) return 'during_event';
  return 'during_event';
}

/**
 * まだ終わっていないことを並べる。
 *
 * 練習前に日報を出せとは言わない。
 * 練習が終わってから、日報とトレーニング記録を求める。
 */
export function pendingActions(state: TodayState): PendingAction[] {
  const phase = resolveDayPhase(state);
  const actions: PendingAction[] = [];

  const hasRecordEvent = state.events.some((event) => requiresRecords(event.event_type));

  if (hasRecordEvent && phase === 'before_event') {
    if (!state.hasCondition) {
      actions.push({
        key: 'condition',
        label: '練習前のコンディションを入力する',
        href: '/condition',
        priority: 10,
      });
    }
    if (!state.hasGoal) {
      actions.push({ key: 'goal', label: '今日の個人目標を決める', href: '/goal', priority: 20 });
    }
  }

  if (hasRecordEvent && (phase === 'after_event' || phase === 'during_event')) {
    // 練習中でもコンディション未入力なら、まだ入れられることを伝える
    if (!state.hasCondition && phase === 'during_event') {
      actions.push({
        key: 'condition',
        label: '練習前のコンディションを入力する',
        href: '/condition',
        priority: 10,
      });
    }
    if (phase === 'after_event') {
      if (!state.hasReport) {
        actions.push({ key: 'report', label: '日報を提出する', href: '/report', priority: 30 });
      }
      if (!state.hasTraining) {
        actions.push({
          key: 'training',
          label: 'トレーニング結果を入力する',
          href: '/training',
          priority: 40,
        });
      }
    }
  }

  if (state.unreadFeedbackCount > 0) {
    actions.push({
      key: 'feedback_unread',
      label: `動画フィードバックを確認する（${state.unreadFeedbackCount}件）`,
      href: '/feedback',
      priority: 25,
    });
  }

  return actions.sort((left, right) => left.priority - right.priority);
}

/**
 * 画面の一番上に出す一言（11章の例）。
 * 「今日の練習は終了しました」のように、状況をまず伝える。
 */
export function todayHeadline(state: TodayState): string {
  const phase = resolveDayPhase(state);
  const remaining = pendingActions(state).length;

  switch (phase) {
    case 'no_event':
      return state.events.length > 0 ? '今日は予定があります' : '今日の予定はありません';
    case 'before_event':
      return '今日の練習はこれからです';
    case 'during_event':
      return '今日の練習中です';
    case 'after_event':
      return remaining === 0 ? '今日やることは全部終わりました' : '今日の練習は終了しました';
  }
}
