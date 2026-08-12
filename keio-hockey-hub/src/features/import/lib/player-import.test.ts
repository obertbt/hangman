import { describe, expect, it } from 'vitest';

import { suggestMapping } from './mapping';
import type { ExistingMember } from './matching';
import { parseTable } from './parse';
import { analyzePlayerRows, importableRows, type UpsertMode } from './player-import';

/** 36章の例をそのまま使う。 */
const PASTED = ['氏名\t学年\tポジション\t背番号', '山田花子\t3\tMF\t10', '鈴木花\t2\tFW\t9'].join('\n');

function analyze(pasted: string, existing: ExistingMember[] = [], upsertMode: UpsertMode = 'insert_only') {
  const table = parseTable(pasted);
  return analyzePlayerRows({
    headers: table.headers,
    rows: table.rows,
    mappings: suggestMapping(table.headers),
    existingMembers: existing,
    upsertMode,
    currentYear: 2026,
  });
}

describe('貼り付けからプレビューまで（39章）', () => {
  it('36章の例をそのまま取り込める', () => {
    const { rows, summary } = analyze(PASTED);

    expect(summary.total).toBe(2);
    expect(summary.error).toBe(0);
    expect(summary.insert).toBe(2);

    expect(rows[0]?.normalized).toMatchObject({
      full_name: '山田花子',
      grade: 3,
      position: 'MF',
      jersey_number: 10,
    });
    expect(rows[1]?.normalized).toMatchObject({
      full_name: '鈴木花',
      grade: 2,
      position: 'FW',
      jersey_number: 9,
    });
  });

  it('行番号は画面の行と合う（見出しが1行目）', () => {
    const { rows } = analyze(PASTED);
    expect(rows[0]?.rowNumber).toBe(2);
    expect(rows[1]?.rowNumber).toBe(3);
  });
});

describe('1行のエラーで全体を止めない（45章）', () => {
  it('壊れた行だけをエラーにして、他は取り込める', () => {
    const pasted = [
      '氏名\t学年\tポジション',
      '山田花子\t3\tMF',
      '\t2\tFW', // 氏名が無い
      '佐藤未来\t99\tDF', // 学年が範囲外
      '鈴木花\t2\tセンター', // ポジションが読めない
      '高橋葵\t1\tGK',
    ].join('\n');

    const { rows, summary } = analyze(pasted);

    expect(summary.total).toBe(5);
    expect(summary.error).toBe(3);
    expect(importableRows(rows)).toHaveLength(2);
    expect(rows[0]?.status).toBe('valid');
    expect(rows[4]?.status).toBe('valid');
  });

  it('エラー行には直し方が分かる文言を付ける', () => {
    const { rows } = analyze('氏名\tポジション\n山田花子\tセンター');
    const messages = rows[0]?.messages.map((message) => message.message).join(' ');
    expect(messages).toContain('GK / DF / MF / FW');
  });
});

describe('既存データを勝手に上書きしない（46章）', () => {
  const existing: ExistingMember[] = [
    {
      teamMemberId: 'member-1',
      profileId: 'profile-1',
      fullName: '山田花子',
      email: null,
      externalSource: null,
      externalId: null,
      grade: 3,
      admissionYear: 2024,
      position: 'MF',
    },
  ];

  it('既定（新規追加のみ）では既存を飛ばす', () => {
    const { rows, summary } = analyze(PASTED, existing, 'insert_only');

    expect(rows[0]?.action).toBe('skip');
    expect(rows[0]?.matchedMemberId).toBe('member-1');
    expect(summary.insert).toBe(1); // 鈴木花だけ
    expect(summary.skip).toBe(1);
  });

  it('明示的に選んだ時だけ更新する', () => {
    const { rows, summary } = analyze(PASTED, existing, 'update_existing');

    expect(rows[0]?.action).toBe('update');
    expect(summary.update).toBe(1);
    expect(summary.insert).toBe(1);
  });

  it('既存をスキップする指定でも新規は入る', () => {
    const { summary } = analyze(PASTED, existing, 'skip_existing');
    expect(summary.insert).toBe(1);
    expect(summary.skip).toBe(1);
  });

  it('飛ばした理由を利用者に伝える', () => {
    const { rows } = analyze(PASTED, existing, 'insert_only');
    const text = rows[0]?.messages.map((message) => message.message).join(' ');
    expect(text).toContain('既に登録されています');
  });
});

describe('一意に決められない場合は管理者へ確認させる（42章）', () => {
  const twins: ExistingMember[] = [
    {
      teamMemberId: 'member-1',
      profileId: 'profile-1',
      fullName: '田中花子',
      email: null,
      externalSource: null,
      externalId: null,
      grade: 4,
      admissionYear: 2023,
      position: 'MF',
    },
    {
      teamMemberId: 'member-2',
      profileId: 'profile-2',
      fullName: '田中花子',
      email: null,
      externalSource: null,
      externalId: null,
      grade: 1,
      admissionYear: 2026,
      position: 'FW',
    },
  ];

  it('候補を出してエラーにし、勝手に選ばない', () => {
    const { rows } = analyze('氏名\n田中花子', twins);

    expect(rows[0]?.status).toBe('error');
    expect(rows[0]?.candidates).toHaveLength(2);
    expect(rows[0]?.candidates[0]?.label).toContain('田中花子');
    expect(rows[0]?.candidates[0]?.label).toContain('4年');
  });

  it('学年が分かれば自動で決まる', () => {
    const { rows } = analyze('氏名\t学年\n田中花子\t1', twins);
    expect(rows[0]?.status).not.toBe('error');
    expect(rows[0]?.matchedMemberId).toBe('member-2');
  });
});

describe('警告は出すが取り込みは止めない', () => {
  it('学年と入学年度の食い違いは警告に留める', () => {
    const { rows, summary } = analyze('氏名\t学年\t入学年度\n山田花子\t1\t2024');

    expect(rows[0]?.status).toBe('warning');
    expect(summary.error).toBe(0);
    expect(importableRows(rows)).toHaveLength(1);
  });

  it('同じ取り込みデータ内の同姓同名に気づかせる', () => {
    const { rows } = analyze('氏名\n田中花子\n田中花子');
    const text = rows[1]?.messages.map((message) => message.message).join(' ');
    expect(text).toContain('行目にも同じ氏名');
  });
});

describe('集計（44章）', () => {
  it('総件数・正常・警告・エラー・新規・更新・スキップを数える', () => {
    const existing: ExistingMember[] = [
      {
        teamMemberId: 'member-1',
        profileId: 'profile-1',
        fullName: '既存 選手',
        email: null,
        externalSource: null,
        externalId: null,
        grade: 3,
        admissionYear: 2024,
        position: 'MF',
      },
    ];

    const pasted = [
      '氏名\t学年',
      '新規 一人\t1',
      '既存 選手\t3',
      '\t2', // エラー
    ].join('\n');

    const { summary } = analyze(pasted, existing, 'update_existing');

    expect(summary.total).toBe(3);
    expect(summary.error).toBe(1);
    expect(summary.insert).toBe(1);
    expect(summary.update).toBe(1);
  });
});

describe('取り込み対象の絞り込み', () => {
  it('エラー行とスキップ行を除く（45章: エラー行を除外して実行）', () => {
    const pasted = ['氏名\t学年', '正常\t1', '\t2'].join('\n');
    const { rows } = analyze(pasted);
    const importable = importableRows(rows);

    expect(importable).toHaveLength(1);
    expect(importable[0]?.normalized?.full_name).toBe('正常');
  });
});

describe('列マッピングを人が直した場合', () => {
  it('直したマッピングに従って取り込む', () => {
    const table = parseTable('A\tB\n山田花子\t3');
    // 自動では割り当てられない見出しを、人が指定した状況
    const mappings = [
      {
        sourceIndex: 0,
        sourceColumn: 'A',
        targetField: 'full_name' as const,
        confidence: 0,
        isAutoDetected: false,
      },
      {
        sourceIndex: 1,
        sourceColumn: 'B',
        targetField: 'grade' as const,
        confidence: 0,
        isAutoDetected: false,
      },
    ];

    const { rows } = analyzePlayerRows({
      headers: table.headers,
      rows: table.rows,
      mappings,
      existingMembers: [],
      upsertMode: 'insert_only',
      currentYear: 2026,
    });

    expect(rows[0]?.normalized).toMatchObject({ full_name: '山田花子', grade: 3 });
  });
});
