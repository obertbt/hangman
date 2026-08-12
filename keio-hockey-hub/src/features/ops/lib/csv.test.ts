import { describe, expect, it } from 'vitest';

import { parseTable } from '@/features/import/lib/parse';

import { escapeCell, exportFilename, flattenText, protectFromSpreadsheet, toCsv, withBom } from './csv';

/**
 * CSV の書き出し（3章の12: 過去の資産を失わない）。
 *
 * いちばん大事なのは「書いたものを読み直せる」こと。
 * 取り込み側（Phase 2）に通し直すテストで、そこを押さえる。
 */

describe('1マスの書き方', () => {
  it('普通の値はそのまま', () => {
    expect(escapeCell('山田')).toBe('山田');
    expect(escapeCell(42)).toBe('42');
    expect(escapeCell(true)).toBe('true');
  });

  it('空とnullは空欄', () => {
    expect(escapeCell(null)).toBe('');
    expect(escapeCell(undefined)).toBe('');
    expect(escapeCell('')).toBe('');
  });

  it('区切り・改行・引用符が入っていたらくくる', () => {
    expect(escapeCell('a,b')).toBe('"a,b"');
    expect(escapeCell('a\nb')).toBe('"a\nb"');
    expect(escapeCell('a"b')).toBe('"a""b"');
  });

  it('引用符は2つ重ねて表す（RFC 4180）', () => {
    expect(escapeCell('"')).toBe('""""');
  });

  it('必要ないものはくくらない。差分が読みにくくなるため', () => {
    expect(escapeCell('普通の文章です')).toBe('普通の文章です');
  });
});

interface Row {
  name: string;
  count: number;
  note: string | null;
}

const COLUMNS = [
  { header: '氏名', value: (row: Row) => row.name },
  { header: '件数', value: (row: Row) => row.count },
  { header: '備考', value: (row: Row) => row.note },
];

describe('表の書き出し', () => {
  it('見出しと本体を出す', () => {
    const csv = toCsv([{ name: '山田', count: 3, note: null }], COLUMNS);
    expect(csv).toBe('氏名,件数,備考\r\n山田,3,');
  });

  it('改行は CRLF', () => {
    const csv = toCsv(
      [
        { name: 'a', count: 1, note: null },
        { name: 'b', count: 2, note: null },
      ],
      COLUMNS,
    );
    expect(csv).toContain('\r\n');
    expect(csv.split('\r\n')).toHaveLength(3);
  });

  it('中身が無くても見出しは出す。空のファイルは壊れて見える', () => {
    expect(toCsv([], COLUMNS)).toBe('氏名,件数,備考');
  });
});

describe('書いたものを読み直せる', () => {
  it('区切り・引用符・改行が入っていても往復できる', () => {
    const rows: Row[] = [
      { name: '山田, 花子', count: 3, note: '「速い」と言われた' },
      { name: '鈴木', count: 0, note: '1本目\n2本目' },
      { name: '佐藤 "さっちゃん"', count: 12, note: null },
    ];

    const parsed = parseTable(toCsv(rows, COLUMNS));

    expect(parsed.rows).toHaveLength(3);
    expect(parsed.headers).toEqual(['氏名', '件数', '備考']);
    expect(parsed.rows[0]).toEqual(['山田, 花子', '3', '「速い」と言われた']);
    expect(parsed.rows[1]).toEqual(['鈴木', '0', '1本目\n2本目']);
    expect(parsed.rows[2]).toEqual(['佐藤 "さっちゃん"', '12', '']);
  });

  it('BOM を付けても読み直せる', () => {
    const parsed = parseTable(withBom(toCsv([{ name: '山田', count: 1, note: null }], COLUMNS)));
    expect(parsed.headers[0]).toBe('氏名');
    expect(parsed.rows[0]?.[0]).toBe('山田');
  });
});

describe('Excel から身を守る', () => {
  it('数式として実行されうる値に印を付ける', () => {
    // CSV インジェクション。開いた人の端末で式が動く
    expect(protectFromSpreadsheet('=1+1')).toBe("'=1+1");
    expect(protectFromSpreadsheet('+A1')).toBe("'+A1");
    expect(protectFromSpreadsheet('-1+1')).toBe("'-1+1");
    expect(protectFromSpreadsheet('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('普通の文章には触らない', () => {
    expect(protectFromSpreadsheet('今日は調子が良かった')).toBe('今日は調子が良かった');
    expect(protectFromSpreadsheet('')).toBe('');
    expect(protectFromSpreadsheet('3-4-5')).toBe('3-4-5');
  });

  it('BOM を先頭に置く', () => {
    expect(withBom('a,b')).toBe('﻿a,b');
  });
});

describe('ファイル名', () => {
  it('種別と日付を入れる', () => {
    expect(exportFilename('reports', '2026-08-12')).toBe('keio-hockey-reports-2026-08-12.csv');
  });

  it('氏名やパスは残さない', () => {
    // 端末に個人名の残るファイルを作らない（storage key と同じ考え方）。
    // 使うのは呼び出し側が決めた種別だけなので、英数字以外は全部落とす。
    expect(exportFilename('山田花子/../etc', '2026-08-12')).toBe('keio-hockey-etc-2026-08-12.csv');
    expect(exportFilename('日報', '2026-08-12')).toBe('keio-hockey--2026-08-12.csv');
  });
});

describe('文章の列', () => {
  it('改行を畳む', () => {
    expect(flattenText('1行目\n2行目')).toBe('1行目 2行目');
  });

  it('長すぎるものは切る', () => {
    expect(flattenText('あ'.repeat(20), 10)).toBe(`${'あ'.repeat(10)}…`);
  });

  it('空なら空', () => {
    expect(flattenText(null)).toBe('');
    expect(flattenText(undefined)).toBe('');
  });
});
