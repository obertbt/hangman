import { cleanText } from './normalize';

/**
 * 選手照合（42章）。
 *
 * 過去データを移行する際、同じ選手を何度も作らない。
 *
 * 優先順位:
 *   1. external_id（移行元の ID があれば最も確実）
 *   2. email
 *   3. 氏名 + 補助情報（入学年度・学年・ポジション）
 *
 * 一意に決められない場合は、勝手に選ばず候補を返して人に確認させる。
 */

export interface ExistingMember {
  teamMemberId: string;
  profileId: string;
  fullName: string;
  email: string | null;
  externalSource: string | null;
  externalId: string | null;
  grade: number | null;
  admissionYear: number | null;
  position: string | null;
}

export interface MatchCandidateInput {
  fullName: string;
  email: string | null;
  externalId: string | null;
  grade: number | null;
  admissionYear: number | null;
  position: string | null;
}

export type MatchResult =
  | { kind: 'new' }
  | { kind: 'matched'; member: ExistingMember; reason: string }
  | { kind: 'ambiguous'; candidates: ExistingMember[]; reason: string };

/** 氏名の比較用。空白と全角空白の違いを無視する。 */
export function normalizeNameForCompare(name: string): string {
  return cleanText(name.replace(/[　\s]/g, '')).toLowerCase();
}

export function matchMember(
  input: MatchCandidateInput,
  existing: ExistingMember[],
  externalSource: string | null = null,
): MatchResult {
  // 1. external_id
  if (input.externalId) {
    const byExternal = existing.filter(
      (member) =>
        member.externalId === input.externalId &&
        (externalSource === null || member.externalSource === externalSource),
    );
    if (byExternal.length === 1 && byExternal[0]) {
      return { kind: 'matched', member: byExternal[0], reason: '旧システムIDが一致' };
    }
    if (byExternal.length > 1) {
      return { kind: 'ambiguous', candidates: byExternal, reason: '同じ旧システムIDが複数あります' };
    }
  }

  // 2. email
  if (input.email) {
    const email = input.email.toLowerCase();
    const byEmail = existing.filter((member) => member.email?.toLowerCase() === email);
    if (byEmail.length === 1 && byEmail[0]) {
      return { kind: 'matched', member: byEmail[0], reason: 'メールアドレスが一致' };
    }
    if (byEmail.length > 1) {
      return { kind: 'ambiguous', candidates: byEmail, reason: '同じメールアドレスが複数あります' };
    }
  }

  // 3. 氏名
  const target = normalizeNameForCompare(input.fullName);
  const byName = existing.filter((member) => normalizeNameForCompare(member.fullName) === target);

  if (byName.length === 0) {
    return { kind: 'new' };
  }

  if (byName.length === 1 && byName[0]) {
    return { kind: 'matched', member: byName[0], reason: '氏名が一致' };
  }

  // 同姓同名。補助情報で絞り込めるか試す。
  const narrowed = narrowByAttributes(input, byName);
  if (narrowed.length === 1 && narrowed[0]) {
    return { kind: 'matched', member: narrowed[0], reason: '氏名と学年・入学年度が一致' };
  }

  return {
    kind: 'ambiguous',
    candidates: byName,
    reason: `同じ氏名の選手が ${byName.length} 人います。どの選手か選んでください。`,
  };
}

/**
 * 補助情報で絞る。
 * 入力側に情報が無い項目は判断材料にしない（空欄を「一致しない」と扱わない）。
 */
function narrowByAttributes(input: MatchCandidateInput, candidates: ExistingMember[]): ExistingMember[] {
  return candidates.filter((member) => {
    if (input.admissionYear !== null && member.admissionYear !== null) {
      if (input.admissionYear !== member.admissionYear) return false;
    }
    if (input.grade !== null && member.grade !== null) {
      if (input.grade !== member.grade) return false;
    }
    if (input.position !== null && member.position !== null) {
      if (input.position !== member.position) return false;
    }
    return true;
  });
}

/** 候補を人に見せる時の1行表示（42章の例）。 */
export function describeCandidate(member: ExistingMember): string {
  const parts = [member.fullName];
  if (member.grade !== null) parts.push(`${member.grade}年`);
  if (member.position) parts.push(member.position);
  if (member.email) parts.push(member.email);
  return parts.join(' / ');
}
