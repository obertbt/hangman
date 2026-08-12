import { describe, expect, it } from 'vitest';

import { pendingActions, resolveDayPhase, todayHeadline, type TodayState } from './pending-actions';

const practice = { id: 'event-1', event_type: 'practice' as const, start_time: '16:00', end_time: '19:00' };

function state(overrides: Partial<TodayState> = {}): TodayState {
  return {
    events: [practice],
    nowTime: '20:00',
    hasCondition: false,
    hasGoal: false,
    hasReport: false,
    hasTraining: false,
    unreadFeedbackCount: 0,
    waitingFeedbackCount: 0,
    ...overrides,
  };
}

describe('今日の段階（6章）', () => {
  it('練習前・練習中・練習後を見分ける', () => {
    expect(resolveDayPhase(state({ nowTime: '12:00' }))).toBe('before_event');
    expect(resolveDayPhase(state({ nowTime: '17:00' }))).toBe('during_event');
    expect(resolveDayPhase(state({ nowTime: '20:00' }))).toBe('after_event');
  });

  it('予定が無ければ no_event', () => {
    expect(resolveDayPhase(state({ events: [] }))).toBe('no_event');
  });

  it('オフの日は記録を求めない', () => {
    const off = { id: 'e', event_type: 'rest' as const, start_time: null, end_time: null };
    expect(resolveDayPhase(state({ events: [off] }))).toBe('no_event');
  });

  it('時刻が無いイベントは練習前として扱う（入力を妨げない）', () => {
    const noTime = { id: 'e', event_type: 'practice' as const, start_time: null, end_time: null };
    expect(resolveDayPhase(state({ events: [noTime] }))).toBe('before_event');
  });

  it('終了時刻が無ければ、開始後はずっと練習中', () => {
    const openEnd = { id: 'e', event_type: 'practice' as const, start_time: '16:00', end_time: null };
    expect(resolveDayPhase(state({ events: [openEnd], nowTime: '23:00' }))).toBe('during_event');
  });
});

describe('練習前にやること（11章・15章）', () => {
  it('コンディションと目標を求める', () => {
    const actions = pendingActions(state({ nowTime: '12:00' }));
    expect(actions.map((action) => action.key)).toEqual(['condition', 'goal']);
  });

  it('練習前に日報は求めない', () => {
    const actions = pendingActions(state({ nowTime: '12:00' }));
    expect(actions.map((action) => action.key)).not.toContain('report');
  });

  it('入力済みのものは出さない', () => {
    const actions = pendingActions(state({ nowTime: '12:00', hasCondition: true }));
    expect(actions.map((action) => action.key)).toEqual(['goal']);
  });
});

describe('練習後にやること（11章の例）', () => {
  it('日報とトレーニング結果を求める', () => {
    const actions = pendingActions(state({ nowTime: '20:00', hasCondition: true, hasGoal: true }));
    expect(actions.map((action) => action.key)).toEqual(['report', 'training']);
  });

  it('11章の例と同じ並びになる', () => {
    // ・日報を提出する / ・トレーニング結果を入力する / ・動画フィードバックを確認する
    const actions = pendingActions(
      state({ nowTime: '20:00', hasCondition: true, hasGoal: true, unreadFeedbackCount: 2 }),
    );
    expect(actions.map((action) => action.key)).toEqual(['feedback_unread', 'report', 'training']);
  });

  it('全部終わっていれば空になる', () => {
    const actions = pendingActions(
      state({ nowTime: '20:00', hasCondition: true, hasGoal: true, hasReport: true, hasTraining: true }),
    );
    expect(actions).toEqual([]);
  });
});

describe('練習中', () => {
  it('未入力のコンディションは練習中でも入れられる', () => {
    const actions = pendingActions(state({ nowTime: '17:00' }));
    expect(actions.map((action) => action.key)).toContain('condition');
  });

  it('練習中に日報は求めない', () => {
    const actions = pendingActions(state({ nowTime: '17:00' }));
    expect(actions.map((action) => action.key)).not.toContain('report');
  });
});

describe('フィードバックの確認', () => {
  it('予定が無い日でも未確認があれば知らせる', () => {
    const actions = pendingActions(state({ events: [], unreadFeedbackCount: 1 }));
    expect(actions.map((action) => action.key)).toEqual(['feedback_unread']);
  });

  it('件数を文言に含める', () => {
    const actions = pendingActions(state({ events: [], unreadFeedbackCount: 3 }));
    expect(actions[0]?.label).toContain('3件');
  });
});

describe('見出しの文言（11章）', () => {
  it('練習が終わって残りがあれば「今日の練習は終了しました」', () => {
    expect(todayHeadline(state({ nowTime: '20:00' }))).toBe('今日の練習は終了しました');
  });

  it('全部終わっていればそう伝える', () => {
    const done = state({
      nowTime: '20:00',
      hasCondition: true,
      hasGoal: true,
      hasReport: true,
      hasTraining: true,
    });
    expect(todayHeadline(done)).toBe('今日やることは全部終わりました');
  });

  it('予定が無い日はそう伝える', () => {
    expect(todayHeadline(state({ events: [] }))).toBe('今日の予定はありません');
  });

  it('練習前はこれからだと伝える', () => {
    expect(todayHeadline(state({ nowTime: '10:00' }))).toBe('今日の練習はこれからです');
  });
});

describe('試合の日', () => {
  it('試合でも記録を求める', () => {
    const match = { id: 'm', event_type: 'match' as const, start_time: '13:00', end_time: '15:00' };
    const actions = pendingActions(state({ events: [match], nowTime: '18:00' }));
    expect(actions.map((action) => action.key)).toContain('report');
  });

  it('ミーティングだけの日は記録を求めない', () => {
    const meeting = { id: 'm', event_type: 'meeting' as const, start_time: '18:00', end_time: '19:00' };
    const actions = pendingActions(state({ events: [meeting], nowTime: '20:00' }));
    expect(actions).toEqual([]);
  });
});
