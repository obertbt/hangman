import { describe, expect, it } from 'vitest';

import { detectDelimiter, parseDelimitedText, parseTable, stripBom } from './parse';

describe('Google スプレッドシートからの貼り付け（36章）', () => {
  it('Tab 区切りをそのまま表にできる', () => {
    const pasted = ['氏名\t学年\tポジション\t背番号', '山田花子\t3\tMF\t10', '鈴木花\t2\tFW\t9'].join('\n');

    const result = parseTable(pasted);

    expect(result.headers).toEqual(['氏名', '学年', 'ポジション', '背番号']);
    expect(result.rows).toEqual([
      ['山田花子', '3', 'MF', '10'],
      ['鈴木花', '2', 'FW', '9'],
    ]);
    expect(result.warnings).toEqual([]);
  });

  it('区切り文字を推測する', () => {
    expect(detectDelimiter('a\tb\tc')).toBe('\t');
    expect(detectDelimiter('a,b,c')).toBe(',');
  });

  it('末尾の空行を無視する', () => {
    const pasted = '氏名\t学年\n山田花子\t3\n\n\n';
    const result = parseTable(pasted);
    expect(result.rows).toHaveLength(1);
  });

  it('Windows の改行（CRLF）でも読める', () => {
    const result = parseTable('氏名\t学年\r\n山田花子\t3\r\n');
    expect(result.rows).toEqual([['山田花子', '3']]);
  });
});

describe('CSV の解析（37章）', () => {
  it('引用符の中のカンマを1つのセルとして扱う', () => {
    const csv = '氏名,個人目標\n山田花子,"1対1で、前を向く"';
    const result = parseTable(csv);
    expect(result.rows[0]).toEqual(['山田花子', '1対1で、前を向く']);
  });

  it('引用符の中の改行を保てる', () => {
    const csv = '氏名,個人目標\n山田花子,"1行目\n2行目"';
    const result = parseTable(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.[1]).toBe('1行目\n2行目');
  });

  it('二重の引用符をひとつに戻す', () => {
    const csv = '氏名,コメント\n山田花子,"""前を向く"" を意識"';
    const result = parseTable(csv);
    expect(result.rows[0]?.[1]).toBe('"前を向く" を意識');
  });

  it('UTF-8 BOM を取り除く', () => {
    const csv = '﻿氏名,学年\n山田花子,3';
    expect(stripBom(csv).startsWith('氏名')).toBe(true);
    const result = parseTable(csv);
    expect(result.headers[0]).toBe('氏名');
  });

  it('空のセルを保つ', () => {
    const result = parseTable('氏名,メール,学年\n山田花子,,3');
    expect(result.rows[0]).toEqual(['山田花子', '', '3']);
  });
});

describe('列数の不揃い', () => {
  it('足りない列を空文字で埋め、警告を出す', () => {
    const result = parseTable('氏名,学年,ポジション\n山田花子,3');
    expect(result.rows[0]).toEqual(['山田花子', '3', '']);
    expect(result.warnings.join()).toContain('列の数');
  });
});

describe('行数の上限（37章）', () => {
  it('上限を超えた分は切り捨てて警告する', () => {
    const lines = ['氏名'];
    for (let i = 0; i < 20; i += 1) lines.push(`選手${i}`);

    const result = parseTable(lines.join('\n'), { maxRows: 10 });

    expect(result.rows).toHaveLength(10);
    expect(result.warnings.join()).toContain('上限');
  });
});

describe('空の入力', () => {
  it('空文字は警告付きで空の表を返す', () => {
    const result = parseTable('');
    expect(result.headers).toEqual([]);
    expect(result.rows).toEqual([]);
    expect(result.warnings).toHaveLength(1);
  });
});

describe('parseDelimitedText', () => {
  it('末尾に改行が無くても最後の行を拾う', () => {
    expect(parseDelimitedText('a,b\nc,d', ',')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });
});
