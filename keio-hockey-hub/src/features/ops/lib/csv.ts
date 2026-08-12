/**
 * CSV の書き出し（依頼書3章の12: 過去の資産を失わない）。
 *
 * 取り込み（`features/import/lib/parse.ts`）の裏返し。
 * ここで書いたものを、そのまま取り込み直せることを大事にする。
 *
 * 相手は Excel と Google スプレッドシート。
 * 「開いたら文字化けした」「先頭の0が消えた」で信用を失わないようにする。
 */

export interface CsvColumn<T> {
  /** 1行目に出す見出し。 */
  header: string;
  /** その行から値を取り出す。null / undefined は空欄になる。 */
  value: (row: T) => string | number | boolean | null | undefined;
}

/**
 * 1つの値を CSV の1マスにする（RFC 4180）。
 *
 * 引用符でくくるのは、区切り・改行・引用符が入っているときだけ。
 * 全部くくると、差分が読みにくくなる。
 */
export function escapeCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';

  const text = typeof value === 'string' ? value : String(value);
  if (text === '') return '';

  const needsQuote = /[",\r\n]/.test(text);
  if (!needsQuote) return text;

  return `"${text.replace(/"/g, '""')}"`;
}

/**
 * 表を CSV にする。
 *
 * 改行は CRLF。RFC 4180 がそう決めているのと、
 * Windows の Excel で開いたときに崩れないため。
 */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines: string[] = [columns.map((column) => escapeCell(column.header)).join(',')];

  for (const row of rows) {
    lines.push(columns.map((column) => escapeCell(column.value(row))).join(','));
  }

  return lines.join('\r\n');
}

/**
 * Excel で文字化けしないようにする。
 *
 * Excel は BOM が無いと UTF-8 と判断せず、日本語が崩れる。
 * Google スプレッドシートは BOM があっても正しく読む。
 * どちらでも開けるほうを取る。
 */
export function withBom(csv: string): string {
  return `﻿${csv}`;
}

/**
 * ダウンロードする時のファイル名。
 *
 * 氏名は入れない（storage key と同じ考え方）。
 * 端末に「山田花子_日報.csv」が残ると、共有端末で困る。
 */
export function exportFilename(kind: string, dateOnly: string): string {
  const safe = kind.replace(/[^a-z0-9_-]/gi, '');
  return `keio-hockey-${safe}-${dateOnly}.csv`;
}

/**
 * Excel が勝手に解釈してしまう値を守る。
 *
 * `01` は 1 に、`2026-08-12` は日付書式に、
 * `=1+1` に至っては数式として実行される（CSV インジェクション）。
 *
 * 先頭が `= + - @` タブ CR の値は、頭に `'` を付けて文字列だと伝える。
 * 数式の実行を防ぐのは、見た目の問題ではなく安全の問題。
 */
export function protectFromSpreadsheet(value: string): string {
  if (value === '') return value;
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** 文章の列に使う。改行をそのまま残すと1行が読みにくくなるので畳む。 */
export function flattenText(value: string | null | undefined, maxLength = 1000): string {
  if (!value) return '';
  const flat = value.replace(/\r?\n/g, ' ').trim();
  return flat.length > maxLength ? `${flat.slice(0, maxLength)}…` : flat;
}
