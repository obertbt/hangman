import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * 招待トークンの扱い（Phase 1 の積み残し）。
 *
 * 招待リンクは「持っているだけでアカウントを作れる」ものなので、
 * パスワードと同じ重さで扱う。
 *
 * **生のトークンを DB に残さない。** 残す/照合するのはハッシュだけ。
 * 署名付き URL を DB に保存しないのと同じ考え方（75章）。
 * DB が漏れても、そこから招待リンクは作れない。
 *
 * ここは DB もネットワークも触らない。テストで固める。
 */

/** リンクに載る長さ。43文字（256bit の base64url）。 */
const TOKEN_BYTES = 32;

/** 招待の有効期間。長すぎると「拾われたリンク」が生き続ける。 */
export const INVITATION_VALID_DAYS = 14;

/**
 * 新しいトークンを作る。
 *
 * 返すのは「リンクに載せる生の値」と「DB に残すハッシュ」の組。
 * 生の値は、この時しか手に入らない。
 */
export function createInvitationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

/** 照合に使う形。同じ入力からは必ず同じ結果になる。 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token.trim()).digest('hex');
}

/**
 * ハッシュ同士を比べる。
 *
 * 長さが同じなら、内容が違っても同じ時間で終わる比較を使う。
 * 普通の `===` は先頭から違うほど早く終わるため、
 * 応答時間から少しずつ答えを探られる余地がある。
 */
export function tokensMatch(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

/** 招待リンク。メールや LINE で渡す想定。 */
export function invitationUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/invite/${token}`;
}

export function expiresAtFrom(now: Date = new Date(), days = INVITATION_VALID_DAYS): string {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

/** 招待がいまどうなっているか。 */
export type InvitationState = 'valid' | 'expired' | 'accepted';

export function invitationState(
  input: { expiresAt: string; acceptedAt: string | null },
  now: Date = new Date(),
): InvitationState {
  // 使い切りにする。1つのリンクで2人目を作れてはいけない。
  if (input.acceptedAt !== null) return 'accepted';

  const expiry = new Date(input.expiresAt);
  if (Number.isNaN(expiry.getTime())) return 'expired';

  return expiry.getTime() <= now.getTime() ? 'expired' : 'valid';
}

/** 画面に出す言葉。何が起きたのか、次に何をすればいいかを書く。 */
export const INVITATION_STATE_MESSAGES: Record<Exclude<InvitationState, 'valid'>, string> = {
  expired: 'この招待リンクは期限が切れています。部の担当者に新しいリンクを頼んでください。',
  accepted: 'この招待リンクはすでに使われています。心当たりがなければ、部の担当者に連絡してください。',
};

/**
 * リンクから受け取ったトークンとして、形が正しいか。
 *
 * 形が違うものは DB を引くまでもなく断る。
 * 総当たりの相手をしないための、いちばん外側の門。
 */
export function looksLikeToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{40,64}$/.test(value.trim());
}
