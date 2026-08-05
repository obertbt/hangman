import { describe, expect, it } from 'vitest';

import { createCommentSchema } from './schemas';

const postId = '00000000-0000-4000-8000-000000000001';

describe('createCommentSchema', () => {
  it('前後の空白を落とす', () => {
    expect(createCommentSchema.parse({ postId, body: '  おつかれさま  ' }).body).toBe('おつかれさま');
  });

  it('空のコメントを弾く', () => {
    expect(createCommentSchema.safeParse({ postId, body: '   ' }).success).toBe(false);
  });

  it('2000文字を超えるコメントを弾く', () => {
    expect(createCommentSchema.safeParse({ postId, body: 'あ'.repeat(2000) }).success).toBe(true);
    expect(createCommentSchema.safeParse({ postId, body: 'あ'.repeat(2001) }).success).toBe(false);
  });

  it('投稿IDの形式を検査する', () => {
    expect(createCommentSchema.safeParse({ postId: 'x', body: 'a' }).success).toBe(false);
  });
});
