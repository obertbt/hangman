import { describe, expect, it } from 'vitest';

import {
  createInvitationToken,
  expiresAtFrom,
  hashToken,
  INVITATION_VALID_DAYS,
  invitationState,
  invitationUrl,
  looksLikeToken,
  tokensMatch,
} from './token';

/**
 * 招待トークンの扱い。
 *
 * ここが緩いと「リンクを持っているだけで部員になれる」が壊れる方向に働く。
 * 生の値が DB に残らないこと、使い切りであること、期限が効くことを押さえる。
 */

describe('トークンの生成', () => {
  it('毎回違う値になる', () => {
    const values = new Set(Array.from({ length: 50 }, () => createInvitationToken().token));
    expect(values.size).toBe(50);
  });

  it('リンクにそのまま載せられる形（URL で困る文字を含まない）', () => {
    for (let index = 0; index < 20; index += 1) {
      const { token } = createInvitationToken();
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(encodeURIComponent(token)).toBe(token);
    }
  });

  it('総当たりされない長さがある', () => {
    // 32バイト = 256bit。base64url で43文字。
    expect(createInvitationToken().token.length).toBeGreaterThanOrEqual(43);
  });

  it('生の値とハッシュは別物', () => {
    const { token, tokenHash } = createInvitationToken();
    expect(tokenHash).not.toBe(token);
    // DB に残るのはこちら。ここから生の値は作れない。
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('同じトークンからは同じハッシュになる（照合できる）', () => {
    const { token, tokenHash } = createInvitationToken();
    expect(hashToken(token)).toBe(tokenHash);
  });

  it('前後の空白は無視する（コピー&ペーストの事故を吸収）', () => {
    const { token, tokenHash } = createInvitationToken();
    expect(hashToken(`  ${token}\n`)).toBe(tokenHash);
  });
});

describe('ハッシュの照合', () => {
  it('同じものは一致する', () => {
    const hash = hashToken('abc');
    expect(tokensMatch(hash, hash)).toBe(true);
  });

  it('違うものは一致しない', () => {
    expect(tokensMatch(hashToken('abc'), hashToken('abd'))).toBe(false);
  });

  it('長さが違っても落ちない', () => {
    expect(tokensMatch('short', hashToken('abc'))).toBe(false);
    expect(tokensMatch('', '')).toBe(true);
  });
});

describe('招待の状態', () => {
  const now = new Date('2026-08-12T09:00:00Z');

  it('期限内で未使用なら使える', () => {
    expect(invitationState({ expiresAt: '2026-08-20T00:00:00Z', acceptedAt: null }, now)).toBe('valid');
  });

  it('期限を過ぎたら使えない', () => {
    expect(invitationState({ expiresAt: '2026-08-01T00:00:00Z', acceptedAt: null }, now)).toBe('expired');
  });

  it('ちょうど期限のときは使えない', () => {
    expect(invitationState({ expiresAt: '2026-08-12T09:00:00Z', acceptedAt: null }, now)).toBe('expired');
  });

  it('使い切り。1つのリンクで2人目は作れない', () => {
    expect(
      invitationState({ expiresAt: '2026-08-20T00:00:00Z', acceptedAt: '2026-08-13T00:00:00Z' }, now),
    ).toBe('accepted');
  });

  it('使用済みが期限より優先される（理由を正しく伝える）', () => {
    expect(
      invitationState({ expiresAt: '2026-08-01T00:00:00Z', acceptedAt: '2026-07-30T00:00:00Z' }, now),
    ).toBe('accepted');
  });

  it('日付が壊れていたら使えない扱い', () => {
    expect(invitationState({ expiresAt: 'とても未来', acceptedAt: null }, now)).toBe('expired');
  });
});

describe('期限の計算', () => {
  it('既定は14日後', () => {
    const now = new Date('2026-08-12T09:00:00Z');
    expect(expiresAtFrom(now)).toBe('2026-08-26T09:00:00.000Z');
    expect(INVITATION_VALID_DAYS).toBe(14);
  });

  it('日数を変えられる', () => {
    const now = new Date('2026-08-12T09:00:00Z');
    expect(expiresAtFrom(now, 1)).toBe('2026-08-13T09:00:00.000Z');
  });
});

describe('リンクの組み立て', () => {
  it('末尾のスラッシュがあっても二重にならない', () => {
    expect(invitationUrl('https://example.com/', 'abc')).toBe('https://example.com/invite/abc');
    expect(invitationUrl('https://example.com', 'abc')).toBe('https://example.com/invite/abc');
  });
});

describe('形の確認', () => {
  it('作ったトークンは通る', () => {
    expect(looksLikeToken(createInvitationToken().token)).toBe(true);
  });

  it('短すぎるもの・記号混じりは断る', () => {
    expect(looksLikeToken('abc')).toBe(false);
    expect(looksLikeToken('a'.repeat(43) + '/')).toBe(false);
    expect(looksLikeToken('')).toBe(false);
    // SQL や パスを混ぜたものも、DB を引く前に断る
    expect(looksLikeToken("' or 1=1--")).toBe(false);
    expect(looksLikeToken('../../etc/passwd')).toBe(false);
  });

  it('前後の空白は許す', () => {
    const { token } = createInvitationToken();
    expect(looksLikeToken(` ${token} `)).toBe(true);
  });
});
