import { describe, expect, it } from 'vitest';

import { REACTION_EMOJI, REACTION_LABELS, REACTION_OPTIONS, setReactionSchema } from './schemas';

const postId = '00000000-0000-4000-8000-000000000001';

describe('setReactionSchema', () => {
  it('決められた種類だけを受け付ける', () => {
    expect(setReactionSchema.safeParse({ postId, reactionType: 'cheer' }).success).toBe(true);
    expect(setReactionSchema.safeParse({ postId, reactionType: 'like' }).success).toBe(false);
  });
});

describe('REACTION_OPTIONS', () => {
  it('応援の言葉として5種類そろっている（10.1）', () => {
    expect(REACTION_OPTIONS).toHaveLength(5);
    expect(REACTION_OPTIONS.map((option) => option.value)).toEqual([
      'cheer',
      'good_job',
      'amazing',
      'together',
      'streak',
    ]);
  });

  it('「いいね」のような優劣を含む言葉を使わない', () => {
    const labels = REACTION_OPTIONS.map((option) => option.label).join('');
    expect(labels).not.toContain('いいね');
  });

  it('すべての種類にラベルと絵文字がある', () => {
    for (const option of REACTION_OPTIONS) {
      expect(REACTION_LABELS[option.value]).toBe(option.label);
      expect(REACTION_EMOJI[option.value]).toBe(option.emoji);
    }
  });
});
