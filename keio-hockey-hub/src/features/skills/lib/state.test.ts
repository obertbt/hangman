import { describe, expect, it } from 'vitest';

import {
  applicationStatusFor,
  availableActions,
  isActionAllowed,
  isAwaitingReview,
  isBackToPlayer,
  isFinished,
  nextSkills,
  overallProgress,
  playerSkillStatusFor,
  summarizeProgress,
  type PlayerSkillLike,
  type SkillLike,
} from './state';

/**
 * スキル申請の状態遷移と進捗の集計（30〜32章）。
 *
 * ここが崩れると「承認されたはずのものが消える」「自分で承認できる」が起きる。
 * DB のトリガ（0014）と同じ規則になっているかも、ここで押さえる。
 */

describe('誰が何をできるか', () => {
  it('下書きを出せるのは本人だけ', () => {
    expect(isActionAllowed('draft', 'owner', 'submit')).toBe(true);
    expect(isActionAllowed('draft', 'reviewer', 'submit')).toBe(false);
    expect(isActionAllowed('draft', 'observer', 'submit')).toBe(false);
  });

  it('承認できるのは審査できる人だけ。本人は自分を承認できない', () => {
    expect(isActionAllowed('submitted', 'reviewer', 'approve')).toBe(true);
    expect(isActionAllowed('submitted', 'owner', 'approve')).toBe(false);
    expect(isActionAllowed('reviewing', 'owner', 'approve')).toBe(false);
  });

  it('取り下げられるのは本人だけ', () => {
    expect(isActionAllowed('submitted', 'owner', 'withdraw')).toBe(true);
    expect(isActionAllowed('submitted', 'reviewer', 'withdraw')).toBe(false);
  });

  it('見ているだけの人には何もできない', () => {
    const statuses = ['draft', 'submitted', 'reviewing', 'approved', 'rejected', 'withdrawn'] as const;
    for (const status of statuses) {
      expect(availableActions(status, 'observer')).toEqual([]);
    }
  });

  it('承認済み・却下・取り下げからは動かない', () => {
    for (const status of ['approved', 'rejected', 'withdrawn'] as const) {
      expect(availableActions(status, 'owner')).toEqual([]);
      expect(availableActions(status, 'reviewer')).toEqual([]);
      expect(isFinished(status)).toBe(true);
    }
  });

  it('審査を始めていなくても、届いた申請にはそのまま答えられる', () => {
    // 「審査を始める」を押させないと承認できない、では手間が増えるだけ
    const actions = availableActions('submitted', 'reviewer').map((entry) => entry.action);
    expect(actions).toContain('approve');
    expect(actions).toContain('need_more');
    expect(actions).toContain('reject');
  });
});

describe('操作と、その後の状態', () => {
  it('申請すると、到達状況は申請中になる', () => {
    expect(applicationStatusFor('submit')).toBe('submitted');
    expect(playerSkillStatusFor('submit')).toBe('applied');
  });

  it('承認すると、到達状況も承認になる', () => {
    expect(applicationStatusFor('approve')).toBe('approved');
    expect(playerSkillStatusFor('approve')).toBe('approved');
  });

  it('差し戻しは選手の手元へ戻る。却下ではない', () => {
    expect(applicationStatusFor('need_more')).toBe('draft');
    expect(playerSkillStatusFor('need_more')).toBe('feedback');
  });

  it('見送り・取り下げは、到達状況を元に戻す', () => {
    expect(playerSkillStatusFor('reject')).toBe('not_started');
    expect(playerSkillStatusFor('withdraw')).toBe('not_started');
  });

  it('差し戻された下書きは、審査待ちには数えない', () => {
    expect(isAwaitingReview('draft')).toBe(false);
    expect(isAwaitingReview('submitted')).toBe(true);
    expect(isAwaitingReview('reviewing')).toBe(true);
    expect(isAwaitingReview('approved')).toBe(false);
  });

  it('差し戻された下書きは、まだ一度も出していない下書きと区別する', () => {
    expect(isBackToPlayer('draft', true)).toBe(true);
    expect(isBackToPlayer('draft', false)).toBe(false);
    expect(isBackToPlayer('submitted', true)).toBe(false);
  });
});

// 大分類1つ、中目標1つ、その下に小目標3つ
const SKILLS: SkillLike[] = [
  { id: 'mid-1', skill_category_id: 'cat-1', parent_id: null },
  { id: 'leaf-1', skill_category_id: 'cat-1', parent_id: 'mid-1' },
  { id: 'leaf-2', skill_category_id: 'cat-1', parent_id: 'mid-1' },
  { id: 'leaf-3', skill_category_id: 'cat-1', parent_id: 'mid-1' },
  { id: 'cat2-leaf-1', skill_category_id: 'cat-2', parent_id: null },
];

describe('進捗の集計', () => {
  it('数えるのは小目標だけ。中目標は入れ物なので数えない', () => {
    const progress = summarizeProgress(SKILLS, []);
    expect(progress.get('cat-1')?.total).toBe(3);
    // 子を持たない中目標は、それ自体が到達点なので数える
    expect(progress.get('cat-2')?.total).toBe(1);
  });

  it('承認済みの割合を出す', () => {
    const player: PlayerSkillLike[] = [
      { skill_id: 'leaf-1', status: 'approved' },
      { skill_id: 'leaf-2', status: 'applied' },
    ];
    const progress = summarizeProgress(SKILLS, player);
    const cat1 = progress.get('cat-1');

    expect(cat1?.approved).toBe(1);
    expect(cat1?.inProgress).toBe(1);
    expect(cat1?.notStarted).toBe(1);
    expect(cat1?.percent).toBe(33);
  });

  it('中目標を承認しても、割合は跳ねない', () => {
    const progress = summarizeProgress(SKILLS, [{ skill_id: 'mid-1', status: 'approved' }]);
    expect(progress.get('cat-1')?.percent).toBe(0);
  });

  it('差し戻し中も「進んでいる」に数える', () => {
    const progress = summarizeProgress(SKILLS, [{ skill_id: 'leaf-1', status: 'feedback' }]);
    expect(progress.get('cat-1')?.inProgress).toBe(1);
  });

  it('スキルが1つも無くても落ちない', () => {
    const progress = summarizeProgress([], []);
    expect(progress.size).toBe(0);
    expect(overallProgress(progress).percent).toBe(0);
  });

  it('全体の割合は、大分類をまたいで数える', () => {
    const player: PlayerSkillLike[] = [
      { skill_id: 'leaf-1', status: 'approved' },
      { skill_id: 'cat2-leaf-1', status: 'approved' },
    ];
    const total = overallProgress(summarizeProgress(SKILLS, player));

    expect(total.total).toBe(4);
    expect(total.approved).toBe(2);
    expect(total.percent).toBe(50);
  });
});

describe('次に取り組むとよいもの', () => {
  it('差し戻し中を先に出す（放置させない）', () => {
    const player: PlayerSkillLike[] = [
      { skill_id: 'leaf-1', status: 'applied' },
      { skill_id: 'leaf-3', status: 'feedback' },
    ];
    const next = nextSkills(SKILLS, player);
    expect(next[0]?.id).toBe('leaf-3');
    expect(next[1]?.id).toBe('leaf-1');
  });

  it('承認済みは出さない', () => {
    const player: PlayerSkillLike[] = [
      { skill_id: 'leaf-1', status: 'approved' },
      { skill_id: 'leaf-2', status: 'approved' },
      { skill_id: 'leaf-3', status: 'approved' },
      { skill_id: 'cat2-leaf-1', status: 'approved' },
    ];
    expect(nextSkills(SKILLS, player)).toEqual([]);
  });

  it('中目標は出さない', () => {
    const next = nextSkills(SKILLS, []);
    expect(next.map((skill) => skill.id)).not.toContain('mid-1');
  });

  it('件数を絞れる', () => {
    expect(nextSkills(SKILLS, [], 2)).toHaveLength(2);
  });
});
