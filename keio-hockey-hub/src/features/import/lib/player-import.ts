import type { Position } from '@/types/database.types';

import type { MappingSuggestion, PlayerField } from './mapping';
import { fieldLabel } from './mapping';
import {
  checkGradeAgainstAdmissionYear,
  normalizeAdmissionYear,
  normalizeEmail,
  normalizeGrade,
  normalizeJerseyNumber,
  normalizeName,
  normalizePosition,
  cleanText,
} from './normalize';
import { matchMember, type ExistingMember, type MatchResult } from './matching';

/**
 * 選手インポートの解析（39章・44章・45章）。
 *
 * 決まりごと:
 *   * ここでは DB を一切書き換えない。プレビューのための計算だけ（39章）。
 *   * 1行のエラーで全体を止めない（45章）。行ごとに結果を持つ。
 *   * 既定は安全側。既存データを自動で上書きしない（46章）。
 */

export type RowStatus = 'valid' | 'warning' | 'error';
export type RowAction = 'insert' | 'update' | 'skip';
export type UpsertMode = 'insert_only' | 'update_existing' | 'skip_existing';

export interface RowMessage {
  level: 'warning' | 'error';
  field?: PlayerField;
  message: string;
}

export interface NormalizedPlayer {
  full_name: string;
  furigana: string | null;
  email: string | null;
  grade: number | null;
  admission_year: number | null;
  position: Position | null;
  sub_position: Position | null;
  jersey_number: number | null;
  personal_goal: string | null;
  external_id: string | null;
}

export interface AnalyzedRow {
  rowNumber: number;
  raw: string[];
  normalized: NormalizedPlayer | null;
  status: RowStatus;
  action: RowAction;
  messages: RowMessage[];
  matchedMemberId: string | null;
  matchReason: string | null;
  candidates: { id: string; label: string }[];
}

export interface AnalyzeResult {
  rows: AnalyzedRow[];
  summary: ImportSummary;
}

/** プレビューに出す集計（44章）。 */
export interface ImportSummary {
  total: number;
  valid: number;
  warning: number;
  error: number;
  insert: number;
  update: number;
  skip: number;
}

export interface AnalyzeOptions {
  headers: string[];
  rows: string[][];
  mappings: MappingSuggestion[];
  existingMembers: ExistingMember[];
  upsertMode: UpsertMode;
  /** 学年と入学年度の突き合わせに使う。 */
  currentYear: number;
  externalSource?: string | null;
}

/** マッピングに従って1行を項目名つきの値へ変える。 */
function pickValues(row: string[], mappings: MappingSuggestion[]): Partial<Record<PlayerField, string>> {
  const values: Partial<Record<PlayerField, string>> = {};
  for (const mapping of mappings) {
    if (!mapping.targetField) continue;
    values[mapping.targetField] = row[mapping.sourceIndex] ?? '';
  }
  return values;
}

function analyzeRow(
  rowNumber: number,
  row: string[],
  options: AnalyzeOptions,
  seenNames: Map<string, number>,
): AnalyzedRow {
  const values = pickValues(row, options.mappings);
  const messages: RowMessage[] = [];

  const base: AnalyzedRow = {
    rowNumber,
    raw: row,
    normalized: null,
    status: 'error',
    action: 'skip',
    messages,
    matchedMemberId: null,
    matchReason: null,
    candidates: [],
  };

  // --- 必須項目 ---
  const nameResult = normalizeName(values.full_name ?? '');
  if (!nameResult.ok) {
    messages.push({ level: 'error', field: 'full_name', message: nameResult.error });
    return base;
  }
  const fullName = nameResult.value;

  // --- 任意項目。読めない値はエラーにするが、行の解析は続ける ---
  let hasError = false;

  const emailResult = normalizeEmail(values.email ?? '');
  let email: string | null = null;
  if (emailResult.ok) {
    email = emailResult.value;
  } else {
    messages.push({ level: 'error', field: 'email', message: emailResult.error });
    hasError = true;
  }

  let grade: number | null = null;
  const gradeRaw = (values.grade ?? '').trim();
  if (gradeRaw !== '') {
    const gradeResult = normalizeGrade(gradeRaw);
    if (gradeResult.ok) {
      grade = gradeResult.value;
    } else {
      messages.push({ level: 'error', field: 'grade', message: gradeResult.error });
      hasError = true;
    }
  }

  let admissionYear: number | null = null;
  const admissionResult = normalizeAdmissionYear(values.admission_year ?? '', options.currentYear);
  if (admissionResult.ok) {
    admissionYear = admissionResult.value;
  } else {
    messages.push({ level: 'error', field: 'admission_year', message: admissionResult.error });
    hasError = true;
  }

  let position: Position | null = null;
  const positionRaw = (values.position ?? '').trim();
  if (positionRaw !== '') {
    const positionResult = normalizePosition(positionRaw);
    if (positionResult.ok) {
      position = positionResult.value;
    } else {
      messages.push({ level: 'error', field: 'position', message: positionResult.error });
      hasError = true;
    }
  }

  let subPosition: Position | null = null;
  const subPositionRaw = (values.sub_position ?? '').trim();
  if (subPositionRaw !== '') {
    const subResult = normalizePosition(subPositionRaw);
    if (subResult.ok) {
      subPosition = subResult.value;
    } else {
      messages.push({ level: 'warning', field: 'sub_position', message: subResult.error });
    }
  }

  let jerseyNumber: number | null = null;
  const jerseyResult = normalizeJerseyNumber(values.jersey_number ?? '');
  if (jerseyResult.ok) {
    jerseyNumber = jerseyResult.value;
  } else {
    messages.push({ level: 'error', field: 'jersey_number', message: jerseyResult.error });
    hasError = true;
  }

  // 学年と入学年度の食い違いは警告に留める（どちらが正しいか機械には決められない）
  const consistency = checkGradeAgainstAdmissionYear(grade, admissionYear, options.currentYear);
  if (consistency) {
    messages.push({ level: 'warning', message: consistency });
  }

  const normalized: NormalizedPlayer = {
    full_name: fullName,
    furigana: emptyToNull(values.furigana),
    email,
    grade,
    admission_year: admissionYear,
    position,
    sub_position: subPosition,
    jersey_number: jerseyNumber,
    personal_goal: emptyToNull(values.personal_goal),
    external_id: emptyToNull(values.external_id),
  };

  if (hasError) {
    return { ...base, normalized, status: 'error', action: 'skip' };
  }

  // --- 同じ取り込みデータの中での重複 ---
  const nameKey = fullName.replace(/\s/g, '');
  const previousRow = seenNames.get(nameKey);
  if (previousRow !== undefined) {
    messages.push({
      level: 'warning',
      message: `${previousRow} 行目にも同じ氏名があります。別の選手であれば、学年や入学年度で区別できるようにしてください。`,
    });
  } else {
    seenNames.set(nameKey, rowNumber);
  }

  // --- 既存データとの照合（42章） ---
  const match: MatchResult = matchMember(
    {
      fullName,
      email,
      externalId: normalized.external_id,
      grade,
      admissionYear,
      position,
    },
    options.existingMembers,
    options.externalSource ?? null,
  );

  let action: RowAction;
  let matchedMemberId: string | null = null;
  let matchReason: string | null = null;
  let candidates: { id: string; label: string }[] = [];

  if (match.kind === 'ambiguous') {
    messages.push({ level: 'error', message: match.reason });
    candidates = match.candidates.map((member) => ({
      id: member.teamMemberId,
      label: describeMember(member),
    }));
    return { ...base, normalized, status: 'error', action: 'skip', candidates };
  }

  if (match.kind === 'matched') {
    matchedMemberId = match.member.teamMemberId;
    matchReason = match.reason;

    // 46章: 既定（insert_only）では既存データを自動で上書きしない
    switch (options.upsertMode) {
      case 'insert_only':
        action = 'skip';
        messages.push({
          level: 'warning',
          message: `既に登録されています（${match.reason}）。「既存を更新する」を選ぶと上書きできます。`,
        });
        break;
      case 'skip_existing':
        action = 'skip';
        messages.push({ level: 'warning', message: `既に登録されているため飛ばします（${match.reason}）。` });
        break;
      case 'update_existing':
        action = 'update';
        break;
    }
  } else {
    action = 'insert';
  }

  const status: RowStatus = messages.some((message) => message.level === 'warning') ? 'warning' : 'valid';

  return {
    rowNumber,
    raw: row,
    normalized,
    status,
    action,
    messages,
    matchedMemberId,
    matchReason,
    candidates,
  };
}

function describeMember(member: ExistingMember): string {
  const parts = [member.fullName];
  if (member.grade !== null) parts.push(`${member.grade}年`);
  if (member.position) parts.push(member.position);
  if (member.email) parts.push(member.email);
  return parts.join(' / ');
}

function emptyToNull(value: string | undefined): string | null {
  const cleaned = cleanText(value ?? '');
  return cleaned === '' ? null : cleaned;
}

/**
 * 全行を解析してプレビュー用の結果を作る。
 * DB は書き換えない。
 */
export function analyzePlayerRows(options: AnalyzeOptions): AnalyzeResult {
  const seenNames = new Map<string, number>();

  const rows = options.rows.map((row, index) =>
    // 1行目は見出しなので、データの1行目は2行目として数える（画面の行番号と合わせる）
    analyzeRow(index + 2, row, options, seenNames),
  );

  return { rows, summary: summarize(rows) };
}

export function summarize(rows: AnalyzedRow[]): ImportSummary {
  return {
    total: rows.length,
    valid: rows.filter((row) => row.status === 'valid').length,
    warning: rows.filter((row) => row.status === 'warning').length,
    error: rows.filter((row) => row.status === 'error').length,
    insert: rows.filter((row) => row.action === 'insert' && row.status !== 'error').length,
    update: rows.filter((row) => row.action === 'update' && row.status !== 'error').length,
    skip: rows.filter((row) => row.action === 'skip' || row.status === 'error').length,
  };
}

/** 実際に書き込む対象の行だけを取り出す（45章: エラー行を除外して実行）。 */
export function importableRows(rows: AnalyzedRow[]): AnalyzedRow[] {
  return rows.filter((row) => row.status !== 'error' && row.action !== 'skip' && row.normalized !== null);
}

/** エラーの要約。人が直す時に読む文章。 */
export function describeRowMessages(row: AnalyzedRow): string {
  return row.messages
    .map((message) => (message.field ? `${fieldLabel(message.field)}: ${message.message}` : message.message))
    .join(' / ');
}
