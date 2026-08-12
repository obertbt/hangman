import { describe, expect, it } from 'vitest';

import {
  availableActions,
  canTransition,
  daysWaiting,
  isActionAllowed,
  isAwaitingCoach,
  isAwaitingPlayer,
  isFinished,
  isOverdue,
} from './state';

describe('遷移の表は DB のトリガと一致する（27章）', () => {
  it('仕様どおりの順路を許す', () => {
    expect(canTransition('draft', 'submitted')).toBe(true);
    expect(canTransition('submitted', 'assigned')).toBe(true);
    expect(canTransition('assigned', 'answered')).toBe(true);
    expect(canTransition('answered', 'acknowledged')).toBe(true);
    expect(canTransition('acknowledged', 'closed')).toBe(true);
  });

  it('飛ばしすぎる遷移を禁じる', () => {
    expect(canTransition('submitted', 'closed')).toBe(false);
    expect(canTransition('draft', 'answered')).toBe(false);
    expect(canTransition('submitted', 'acknowledged')).toBe(false);
  });

  it('終わった状態からは動かせない', () => {
    expect(canTransition('closed', 'reviewing')).toBe(false);
    expect(canTransition('withdrawn', 'submitted')).toBe(false);
    expect(availableActions('closed', 'coach')).toEqual([]);
    expect(availableActions('withdrawn', 'requester')).toEqual([]);
  });

  it('再質問から回答へ戻れる', () => {
    expect(canTransition('follow_up', 'answered')).toBe(true);
    expect(canTransition('follow_up', 'reviewing')).toBe(true);
  });
});

describe('誰が何をできるか', () => {
  it('回答できるのはコーチだけ', () => {
    expect(isActionAllowed('assigned', 'coach', 'answer')).toBe(true);
    expect(isActionAllowed('assigned', 'requester', 'answer')).toBe(false);
    expect(isActionAllowed('assigned', 'observer', 'answer')).toBe(false);
  });

  it('担当を引き受けられるのはコーチだけ', () => {
    expect(isActionAllowed('submitted', 'coach', 'assign')).toBe(true);
    expect(isActionAllowed('submitted', 'requester', 'assign')).toBe(false);
  });

  it('確認できるのは質問した本人だけ', () => {
    expect(isActionAllowed('answered', 'requester', 'acknowledge')).toBe(true);
    expect(isActionAllowed('answered', 'coach', 'acknowledge')).toBe(false);
  });

  it('再質問できるのは質問した本人だけ', () => {
    expect(isActionAllowed('answered', 'requester', 'follow_up')).toBe(true);
    expect(isActionAllowed('answered', 'coach', 'follow_up')).toBe(false);
  });

  it('取り下げられるのは質問した本人だけ', () => {
    expect(isActionAllowed('submitted', 'requester', 'withdraw')).toBe(true);
    expect(isActionAllowed('submitted', 'coach', 'withdraw')).toBe(false);
  });

  it('完了はどちらからでもできる', () => {
    expect(isActionAllowed('answered', 'requester', 'close')).toBe(true);
    expect(isActionAllowed('answered', 'coach', 'close')).toBe(true);
  });

  it('関係のない人には何もできない', () => {
    for (const status of ['submitted', 'assigned', 'answered'] as const) {
      expect(availableActions(status, 'observer')).toEqual([]);
    }
  });

  it('回答前に確認や再質問はできない', () => {
    expect(isActionAllowed('submitted', 'requester', 'acknowledge')).toBe(false);
    expect(isActionAllowed('reviewing', 'requester', 'follow_up')).toBe(false);
  });
});

describe('画面に出す操作', () => {
  it('回答待ちのコーチには担当と確認中が出る', () => {
    const actions = availableActions('submitted', 'coach').map((entry) => entry.action);
    expect(actions).toEqual(['assign', 'start_review']);
  });

  it('回答済みの選手には確認・再質問・完了が出る', () => {
    const actions = availableActions('answered', 'requester').map((entry) => entry.action);
    expect(actions).toEqual(['acknowledge', 'follow_up', 'close']);
  });

  it('戻せない操作には印を付ける', () => {
    const close = availableActions('answered', 'coach').find((entry) => entry.action === 'close');
    expect(close?.destructive).toBe(true);
  });

  it('操作には日本語のラベルが付く', () => {
    for (const entry of availableActions('answered', 'requester')) {
      expect(entry.label.length).toBeGreaterThan(0);
    }
  });
});

describe('対応が要るかどうか', () => {
  it('コーチの対応待ちを判別する', () => {
    expect(isAwaitingCoach('submitted')).toBe(true);
    expect(isAwaitingCoach('assigned')).toBe(true);
    expect(isAwaitingCoach('reviewing')).toBe(true);
    expect(isAwaitingCoach('follow_up')).toBe(true);
    expect(isAwaitingCoach('answered')).toBe(false);
    expect(isAwaitingCoach('closed')).toBe(false);
  });

  it('選手の確認待ちを判別する', () => {
    expect(isAwaitingPlayer('answered')).toBe(true);
    expect(isAwaitingPlayer('acknowledged')).toBe(false);
    expect(isAwaitingPlayer('submitted')).toBe(false);
  });

  it('終わったものを判別する', () => {
    expect(isFinished('closed')).toBe(true);
    expect(isFinished('withdrawn')).toBe(true);
    expect(isFinished('answered')).toBe(false);
  });
});

describe('待たせている日数（12章）', () => {
  const now = new Date('2026-08-12T10:00:00+09:00');

  it('経過日数を数える', () => {
    expect(daysWaiting('2026-08-12T09:00:00+09:00', now)).toBe(0);
    expect(daysWaiting('2026-08-11T09:00:00+09:00', now)).toBe(1);
    expect(daysWaiting('2026-08-09T09:00:00+09:00', now)).toBe(3);
  });

  it('提出時刻が無ければ0', () => {
    expect(daysWaiting(null, now)).toBe(0);
    expect(daysWaiting('こわれた日時', now)).toBe(0);
  });

  it('未来の日付でも負にならない', () => {
    expect(daysWaiting('2026-08-20T09:00:00+09:00', now)).toBe(0);
  });

  it('3日以上の未回答を拾う', () => {
    expect(isOverdue('submitted', '2026-08-09T09:00:00+09:00', now)).toBe(true);
    expect(isOverdue('submitted', '2026-08-10T09:00:00+09:00', now)).toBe(false);
  });

  it('回答済みのものは何日経っても未回答扱いにしない', () => {
    expect(isOverdue('answered', '2026-01-01T09:00:00+09:00', now)).toBe(false);
    expect(isOverdue('closed', '2026-01-01T09:00:00+09:00', now)).toBe(false);
  });

  it('再質問も待たせていると数える', () => {
    expect(isOverdue('follow_up', '2026-08-01T09:00:00+09:00', now)).toBe(true);
  });
});
