import { describe, expect, it } from 'vitest';

import { notificationHref, notificationText } from './messages';

describe('notificationText', () => {
  it('応援が1人なら名前だけを出す', () => {
    expect(notificationText({ type: 'reaction', actorName: 'あさひ', actorCount: 1, groupName: null })).toBe(
      'あさひさんが応援しています',
    );
  });

  it('応援が複数なら「ほか◯人」にまとめる', () => {
    expect(notificationText({ type: 'reaction', actorName: 'あさひ', actorCount: 3, groupName: null })).toBe(
      'あさひさんほか2人が応援しています',
    );
  });

  it('コメントはまとめずに知らせる', () => {
    expect(notificationText({ type: 'comment', actorName: 'ゆうき', actorCount: 1, groupName: null })).toBe(
      'ゆうきさんがコメントしました',
    );
  });

  it('グループ参加はグループ名を添える', () => {
    expect(
      notificationText({ type: 'group_join', actorName: 'かおる', actorCount: 1, groupName: 'ふたりの記録' }),
    ).toBe('かおるさんが「ふたりの記録」に参加しました');
  });

  it('グループ名が引けなくても文が壊れない', () => {
    expect(
      notificationText({ type: 'group_join', actorName: 'かおる', actorCount: 1, groupName: null }),
    ).toBe('かおるさんがグループに参加しました');
  });

  it('相手の名前が引けなければ一般的な呼び方にする', () => {
    expect(notificationText({ type: 'comment', actorName: null, actorCount: 1, groupName: null })).toBe(
      'メンバーさんがコメントしました',
    );
  });
});

describe('notificationHref', () => {
  it('応援とコメントは記録の画面へ送る', () => {
    expect(notificationHref({ type: 'reaction', postId: 'p1', groupId: null })).toBe('/activities/p1');
    expect(notificationHref({ type: 'comment', postId: 'p1', groupId: null })).toBe('/activities/p1');
  });

  it('記録が消えていれば行き先を出さない', () => {
    expect(notificationHref({ type: 'reaction', postId: null, groupId: null })).toBeNull();
    expect(notificationHref({ type: 'comment', postId: null, groupId: null })).toBeNull();
  });

  it('グループ参加はグループの画面へ送る', () => {
    expect(notificationHref({ type: 'group_join', postId: null, groupId: 'g1' })).toBe('/groups/g1');
  });
});
