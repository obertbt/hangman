/**
 * 貼り付け（36章）と CSV（37章）の解析。
 *
 * Google スプレッドシートで範囲選択してコピーすると Tab 区切りで渡ってくる。
 * CSV は RFC 4180 に沿って、引用符の中の区切り文字・改行を正しく扱う。
 *
 * ここは純粋な関数だけにする。DB もファイルも触らない。
 */

export interface ParsedTable {
  /** 1行目を見出しとして扱った結果。 */
  headers: string[];
  /** 見出しを除いたデータ行。 */
  rows: string[][];
  /** 解析中に気づいたこと（列数の不揃いなど）。 */
  warnings: string[];
}

/** UTF-8 BOM を取り除く（37章）。Excel が書き出した CSV に付いている。 */
export function stripBom(input: string): string {
  return input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
}

/**
 * 区切り文字を推測する。
 * 貼り付けは Tab、ファイルは CSV が多いが、どちらも来る前提で見る。
 */
export function detectDelimiter(input: string): '\t' | ',' {
  const firstLine = stripBom(input).split(/\r?\n/, 1)[0] ?? '';
  const tabCount = (firstLine.match(/\t/g) ?? []).length;
  const commaCount = (firstLine.match(/,/g) ?? []).length;
  return tabCount >= commaCount && tabCount > 0 ? '\t' : ',';
}

/**
 * 区切りテキストを表にする。
 *
 * 引用符の扱い:
 *   "a,b"     → a,b（1つのセル）
 *   "say ""hi""" → say "hi"
 */
export function parseDelimitedText(input: string, delimiter: string): string[][] {
  const text = stripBom(input);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let index = 0;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    row.push(field);
    field = '';
    rows.push(row);
    row = [];
  };

  while (index < text.length) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }

    if (char === '"' && field === '') {
      inQuotes = true;
      index += 1;
      continue;
    }

    if (char === delimiter) {
      pushField();
      index += 1;
      continue;
    }

    if (char === '\r') {
      // CRLF も LF も同じ扱いにする
      if (text[index + 1] === '\n') index += 1;
      pushRow();
      index += 1;
      continue;
    }

    if (char === '\n') {
      pushRow();
      index += 1;
      continue;
    }

    field += char;
    index += 1;
  }

  // 末尾に何か残っていれば最後の行として拾う
  if (field !== '' || row.length > 0) {
    pushRow();
  }

  return rows;
}

/** 完全に空の行（コピペの末尾に付きやすい）を落とす。 */
function isBlankRow(row: string[]): boolean {
  return row.every((cell) => cell.trim() === '');
}

export interface ParseTableOptions {
  /** 上限行数（37章）。超えた分は切り捨てて警告する。 */
  maxRows?: number;
}

/**
 * 貼り付け・CSV のどちらでも使う入口。
 * 1行目を見出しとして扱う。
 */
export function parseTable(input: string, options: ParseTableOptions = {}): ParsedTable {
  const warnings: string[] = [];
  const delimiter = detectDelimiter(input);
  const allRows = parseDelimitedText(input, delimiter).filter((row) => !isBlankRow(row));

  if (allRows.length === 0) {
    return { headers: [], rows: [], warnings: ['データが空です。'] };
  }

  const headers = (allRows[0] ?? []).map((cell) => cell.trim());
  let rows = allRows.slice(1);

  const maxRows = options.maxRows;
  if (maxRows !== undefined && rows.length > maxRows) {
    warnings.push(`行数が上限（${maxRows}行）を超えたため、${maxRows}行目までを読み込みました。`);
    rows = rows.slice(0, maxRows);
  }

  // 列数が見出しと違う行に気づけるようにする。切り捨てず、足りない分は空文字で埋める。
  const uneven = rows.filter((row) => row.length !== headers.length).length;
  if (uneven > 0) {
    warnings.push(`列の数が見出しと違う行が ${uneven} 行あります。内容を確認してください。`);
  }

  const normalizedRows = rows.map((row) => {
    const copy = [...row];
    while (copy.length < headers.length) copy.push('');
    return copy.slice(0, Math.max(headers.length, 1)).map((cell) => cell.trim());
  });

  return { headers, rows: normalizedRows, warnings };
}
