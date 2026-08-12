import type { Position } from '@/types/database.types';

/**
 * データ正規化（41章）。
 *
 * 大事な考え方:
 *   吸収できるものは吸収する。しかし「勝手に推測しすぎない」。
 *   判断できない時は、黙って変換せず warning を返して人に決めてもらう。
 */

export type NormalizeResult<T> = { ok: true; value: T; warning?: string } | { ok: false; error: string };

/** 全角英数字・記号を半角へ。スプレッドシートには全角がよく混ざる。 */
export function toHalfWidth(input: string): string {
  return (
    input
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
      // 全角ハイフンとダッシュ類だけを半角にする。
      // 長音符「ー」(U+30FC) は片仮名の一部なので絶対に変換しない
      // （「キーパー」が「キ-パ-」になり、ポジションを読み取れなくなる）。
      .replace(/[－―‐−]/g, '-')
      .replace(/／/g, '/')
      .replace(/　/g, ' ')
  );
}

/** 前後の空白を落とし、連続する空白を1つにまとめる。 */
export function cleanText(input: string): string {
  return input.trim().replace(/\s+/g, ' ');
}

/**
 * 氏名。
 * 「山田　花子」→「山田 花子」に整えるだけ。姓名の分割はしない
 * （日本語の姓名は機械的に割れないため、full_name のまま持つ）。
 */
export function normalizeName(input: string): NormalizeResult<string> {
  const value = cleanText(input.replace(/　/g, ' '));
  if (value === '') return { ok: false, error: '氏名が空です。' };
  if (value.length > 100) return { ok: false, error: '氏名が長すぎます。' };
  return { ok: true, value };
}

/**
 * 日付（41章）。
 *
 * 吸収する形:
 *   2026/4/15, 2026-04-15, 2026年4月15日, 2026.4.15
 *   4/15（年が無い）→ 補える基準年があれば補い、必ず警告する
 *
 * 曖昧な場合は警告する。勝手に推測しすぎない。
 */
export function normalizeDate(input: string, referenceYear?: number): NormalizeResult<string> {
  const raw = toHalfWidth(input).trim();
  if (raw === '') return { ok: false, error: '日付が空です。' };

  // 2026年4月15日
  const jp = /^(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日?$/.exec(raw);
  if (jp) return buildDate(Number(jp[1]), Number(jp[2]), Number(jp[3]));

  // 2026-04-15 / 2026/4/15 / 2026.4.15
  const ymd = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(raw);
  if (ymd) return buildDate(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));

  // 4/15（年が無い）
  const md = /^(\d{1,2})[-/.](\d{1,2})$/.exec(raw);
  if (md) {
    if (referenceYear === undefined) {
      return { ok: false, error: `年が分かりません（${input}）。年を含めて入力してください。` };
    }
    const result = buildDate(referenceYear, Number(md[1]), Number(md[2]));
    if (!result.ok) return result;
    return {
      ok: true,
      value: result.value,
      warning: `年の記載が無いため ${referenceYear} 年として扱いました（${input}）。`,
    };
  }

  return { ok: false, error: `日付として読み取れません（${input}）。` };
}

function buildDate(year: number, month: number, day: number): NormalizeResult<string> {
  if (month < 1 || month > 12) return { ok: false, error: `月が範囲外です（${month}）。` };
  if (day < 1 || day > 31) return { ok: false, error: `日が範囲外です（${day}）。` };

  // 2月30日のような、存在しない日を弾く
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return { ok: false, error: `存在しない日付です（${year}-${month}-${day}）。` };
  }

  const pad = (value: number) => String(value).padStart(2, '0');
  return { ok: true, value: `${year}-${pad(month)}-${pad(day)}` };
}

/**
 * 学年（41章）。
 *   3 / 3年 / 3年生 / ３年 → 3
 */
export function normalizeGrade(input: string): NormalizeResult<number> {
  const raw = toHalfWidth(input).trim();
  if (raw === '') return { ok: false, error: '学年が空です。' };

  const match = /^(\d+)\s*(年生?|回生)?$/.exec(raw);
  if (!match?.[1]) return { ok: false, error: `学年として読み取れません（${input}）。` };

  const grade = Number(match[1]);
  if (grade < 1 || grade > 6) {
    return { ok: false, error: `学年が範囲外です（${grade}）。` };
  }
  return { ok: true, value: grade };
}

/**
 * ポジション（41章）。
 * 表記ゆれを吸収する。分からないものは変換せずエラーにする。
 */
const POSITION_ALIASES: Record<string, Position> = {
  gk: 'GK',
  goalkeeper: 'GK',
  goalie: 'GK',
  キーパー: 'GK',
  ゴールキーパー: 'GK',
  ゴーリー: 'GK',

  df: 'DF',
  defender: 'DF',
  defence: 'DF',
  defense: 'DF',
  back: 'DF',
  ディフェンス: 'DF',
  ディフェンダー: 'DF',
  バック: 'DF',
  守備: 'DF',

  mf: 'MF',
  midfielder: 'MF',
  midfield: 'MF',
  mid: 'MF',
  ミッド: 'MF',
  ミッドフィールダー: 'MF',
  ハーフ: 'MF',
  中盤: 'MF',

  fw: 'FW',
  forward: 'FW',
  striker: 'FW',
  フォワード: 'FW',
  ストライカー: 'FW',
  前線: 'FW',

  staff: 'STAFF',
  manager: 'STAFF',
  coach: 'STAFF',
  スタッフ: 'STAFF',
  マネージャー: 'STAFF',
  コーチ: 'STAFF',
};

export function normalizePosition(input: string): NormalizeResult<Position> {
  const raw = toHalfWidth(input).trim();
  if (raw === '') return { ok: false, error: 'ポジションが空です。' };

  const key = raw.toLowerCase().replace(/\s+/g, '');
  const matched = POSITION_ALIASES[key];
  if (matched) return { ok: true, value: matched };

  return {
    ok: false,
    error: `ポジションとして読み取れません（${input}）。GK / DF / MF / FW / STAFF のいずれかにしてください。`,
  };
}

/** 背番号。空欄は「未設定」として通す。 */
export function normalizeJerseyNumber(input: string): NormalizeResult<number | null> {
  const raw = toHalfWidth(input).trim();
  if (raw === '' || raw === '-') return { ok: true, value: null };

  const match = /^(\d{1,3})\s*(番)?$/.exec(raw);
  if (!match?.[1]) return { ok: false, error: `背番号として読み取れません（${input}）。` };

  const value = Number(match[1]);
  if (value < 0 || value > 999) return { ok: false, error: `背番号が範囲外です（${value}）。` };
  return { ok: true, value };
}

/** メールアドレス。空欄は許す（まだ持っていない選手がいる）。 */
export function normalizeEmail(input: string): NormalizeResult<string | null> {
  const raw = toHalfWidth(input).trim().toLowerCase();
  if (raw === '') return { ok: true, value: null };

  // 深追いしない。誤って弾くほうが困る。
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
    return { ok: false, error: `メールアドレスの形式が不正です（${input}）。` };
  }
  if (raw.length > 254) return { ok: false, error: 'メールアドレスが長すぎます。' };
  return { ok: true, value: raw };
}

/** 入学年度。 */
export function normalizeAdmissionYear(input: string, currentYear: number): NormalizeResult<number | null> {
  const raw = toHalfWidth(input).trim();
  if (raw === '') return { ok: true, value: null };

  const match = /^(\d{4})\s*(年度?)?$/.exec(raw);
  if (!match?.[1]) return { ok: false, error: `入学年度として読み取れません（${input}）。` };

  const year = Number(match[1]);
  if (year < 1900 || year > currentYear + 10) {
    return { ok: false, error: `入学年度が範囲外です（${year}）。` };
  }
  return { ok: true, value: year };
}

/**
 * 学年と入学年度の食い違いを見る。
 * どちらも直さない。人に判断してもらうための警告だけを出す。
 */
export function checkGradeAgainstAdmissionYear(
  grade: number | null,
  admissionYear: number | null,
  currentYear: number,
): string | null {
  if (grade === null || admissionYear === null) return null;
  const expected = currentYear - admissionYear + 1;
  if (expected !== grade) {
    return `学年（${grade}年）と入学年度（${admissionYear}）が合いません。入学年度からは ${expected} 年になります。`;
  }
  return null;
}
