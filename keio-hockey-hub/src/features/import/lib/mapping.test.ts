import { describe, expect, it } from 'vitest';

import { canonicalizeHeader, duplicateAssignments, missingRequiredFields, suggestMapping } from './mapping';

describe('列マッピングの自動推測（40章）', () => {
  it('仕様に挙がっている表記ゆれをすべて full_name へ寄せる', () => {
    for (const header of ['名前', '氏名', '選手名', 'Player', 'player_name']) {
      const [mapping] = suggestMapping([header]);
      expect(mapping?.targetField, `${header} が full_name にならない`).toBe('full_name');
    }
  });

  it('よくある見出しを一通り割り当てる', () => {
    const mappings = suggestMapping(['氏名', 'メールアドレス', '学年', 'ポジション', '背番号']);
    expect(mappings.map((mapping) => mapping.targetField)).toEqual([
      'full_name',
      'email',
      'grade',
      'position',
      'jersey_number',
    ]);
  });

  it('英語の見出しでも割り当てる', () => {
    const mappings = suggestMapping(['Name', 'Email', 'Grade', 'Position', 'Number']);
    expect(mappings.map((mapping) => mapping.targetField)).toEqual([
      'full_name',
      'email',
      'grade',
      'position',
      'jersey_number',
    ]);
  });

  it('分からない列は null にして、勝手に割り当てない', () => {
    const mappings = suggestMapping(['氏名', '血液型', '好きな食べ物']);
    expect(mappings[0]?.targetField).toBe('full_name');
    expect(mappings[1]?.targetField).toBeNull();
    expect(mappings[2]?.targetField).toBeNull();
  });

  it('同じ項目を2つの列に割り当てない', () => {
    const mappings = suggestMapping(['氏名', '名前']);
    const assigned = mappings.map((mapping) => mapping.targetField).filter(Boolean);
    expect(new Set(assigned).size).toBe(assigned.length);
  });

  it('完全一致を部分一致より優先する', () => {
    // 「選手氏名」は部分一致、「氏名」は完全一致。完全一致の側が full_name を取る。
    const mappings = suggestMapping(['選手氏名', '氏名']);
    expect(mappings[1]?.targetField).toBe('full_name');
    expect(mappings[1]?.confidence).toBe(1);
  });

  it('確信度を返す', () => {
    const [exact] = suggestMapping(['氏名']);
    expect(exact?.confidence).toBe(1);
  });

  it('空の見出しを無視する', () => {
    const mappings = suggestMapping(['氏名', '']);
    expect(mappings[1]?.targetField).toBeNull();
  });
});

describe('canonicalizeHeader', () => {
  it('全角・空白・記号・大文字小文字の違いを消す', () => {
    expect(canonicalizeHeader('背 番 号')).toBe(canonicalizeHeader('背番号'));
    expect(canonicalizeHeader('Player_Name')).toBe(canonicalizeHeader('playername'));
    expect(canonicalizeHeader('E-mail')).toBe(canonicalizeHeader('email'));
  });
});

describe('マッピングの検証', () => {
  it('必須項目が無ければ知らせる', () => {
    const mappings = suggestMapping(['学年', 'ポジション']);
    const missing = missingRequiredFields(mappings);
    expect(missing.map((definition) => definition.field)).toContain('full_name');
  });

  it('必須項目が揃っていれば空', () => {
    const mappings = suggestMapping(['氏名', '学年']);
    expect(missingRequiredFields(mappings)).toHaveLength(0);
  });

  it('人が同じ項目を2列に割り当てたら気づける', () => {
    const mappings = suggestMapping(['氏名', '学年']);
    // 利用者が2列目も full_name に直した状況を作る
    const edited = mappings.map((mapping, index) =>
      index === 1 ? { ...mapping, targetField: 'full_name' as const, isAutoDetected: false } : mapping,
    );
    expect(duplicateAssignments(edited)).toEqual(['full_name']);
  });
});
