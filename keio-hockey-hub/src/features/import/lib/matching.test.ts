import { describe, expect, it } from 'vitest';

import { matchMember, type ExistingMember } from './matching';

const hanako3MF: ExistingMember = {
  teamMemberId: 'member-1',
  profileId: 'profile-1',
  fullName: '田中花子',
  email: 'tanaka@example.com',
  externalSource: 'google_sheets_legacy',
  externalId: 'player_023',
  grade: 4,
  admissionYear: 2023,
  position: 'MF',
};

const hanako1FW: ExistingMember = {
  teamMemberId: 'member-2',
  profileId: 'profile-2',
  fullName: '田中花子',
  email: null,
  externalSource: null,
  externalId: null,
  grade: 1,
  admissionYear: 2026,
  position: 'FW',
};

const other: ExistingMember = {
  teamMemberId: 'member-3',
  profileId: 'profile-3',
  fullName: '鈴木花',
  email: 'suzuki@example.com',
  externalSource: null,
  externalId: null,
  grade: 2,
  admissionYear: 2025,
  position: 'FW',
};

const emptyInput = {
  fullName: '',
  email: null,
  externalId: null,
  grade: null,
  admissionYear: null,
  position: null,
};

describe('選手照合（42章）', () => {
  it('知らない名前は新規として扱う', () => {
    const result = matchMember({ ...emptyInput, fullName: '新入 部員' }, [hanako3MF, other]);
    expect(result.kind).toBe('new');
  });

  it('external_id を最優先で照合する（43章）', () => {
    const result = matchMember(
      { ...emptyInput, fullName: '別の名前', externalId: 'player_023' },
      [hanako3MF, other],
      'google_sheets_legacy',
    );
    expect(result.kind).toBe('matched');
    if (result.kind === 'matched') {
      expect(result.member.teamMemberId).toBe('member-1');
      expect(result.reason).toContain('旧システムID');
    }
  });

  it('external_id が無ければ email で照合する', () => {
    const result = matchMember({ ...emptyInput, fullName: '田中 花子', email: 'tanaka@example.com' }, [
      hanako3MF,
      other,
    ]);
    expect(result.kind).toBe('matched');
    if (result.kind === 'matched') expect(result.reason).toContain('メール');
  });

  it('氏名だけでも、1人しかいなければ照合する', () => {
    const result = matchMember({ ...emptyInput, fullName: '鈴木花' }, [hanako3MF, other]);
    expect(result.kind).toBe('matched');
    if (result.kind === 'matched') expect(result.member.teamMemberId).toBe('member-3');
  });

  it('氏名の空白の違いを無視する', () => {
    const result = matchMember({ ...emptyInput, fullName: '鈴木　花' }, [other]);
    expect(result.kind).toBe('matched');
  });

  it('同姓同名が複数いる場合、勝手に決めず候補を返す（42章の例）', () => {
    const result = matchMember({ ...emptyInput, fullName: '田中花子' }, [hanako3MF, hanako1FW]);
    expect(result.kind).toBe('ambiguous');
    if (result.kind === 'ambiguous') {
      expect(result.candidates).toHaveLength(2);
      expect(result.reason).toContain('2 人');
    }
  });

  it('同姓同名でも、学年で一意に決まれば照合する', () => {
    const result = matchMember({ ...emptyInput, fullName: '田中花子', grade: 1 }, [hanako3MF, hanako1FW]);
    expect(result.kind).toBe('matched');
    if (result.kind === 'matched') expect(result.member.teamMemberId).toBe('member-2');
  });

  it('同姓同名でも、入学年度で一意に決まれば照合する', () => {
    const result = matchMember({ ...emptyInput, fullName: '田中花子', admissionYear: 2023 }, [
      hanako3MF,
      hanako1FW,
    ]);
    expect(result.kind).toBe('matched');
    if (result.kind === 'matched') expect(result.member.teamMemberId).toBe('member-1');
  });

  it('同姓同名でポジションだけ違えば、それで決まる', () => {
    const result = matchMember({ ...emptyInput, fullName: '田中花子', position: 'FW' }, [
      hanako3MF,
      hanako1FW,
    ]);
    expect(result.kind).toBe('matched');
    if (result.kind === 'matched') expect(result.member.teamMemberId).toBe('member-2');
  });

  it('補助情報でも絞りきれなければ候補を返す', () => {
    const twin: ExistingMember = { ...hanako1FW, teamMemberId: 'member-4', profileId: 'profile-4' };
    const result = matchMember({ ...emptyInput, fullName: '田中花子', grade: 1 }, [hanako1FW, twin]);
    expect(result.kind).toBe('ambiguous');
  });

  it('メールが重複していれば候補を返す（勝手に選ばない）', () => {
    const duplicate: ExistingMember = { ...other, teamMemberId: 'member-5', fullName: '別人' };
    const result = matchMember({ ...emptyInput, fullName: '鈴木花', email: 'suzuki@example.com' }, [
      other,
      duplicate,
    ]);
    expect(result.kind).toBe('ambiguous');
  });

  it('入力側に情報が無い項目は判断材料にしない', () => {
    // grade を渡さなくても、既存側に grade があるだけでは除外されない
    const result = matchMember({ ...emptyInput, fullName: '鈴木花' }, [other]);
    expect(result.kind).toBe('matched');
  });

  it('移行元が違う external_id は一致とみなさない', () => {
    const result = matchMember(
      { ...emptyInput, fullName: '新人', externalId: 'player_023' },
      [hanako3MF],
      'another_source',
    );
    expect(result.kind).toBe('new');
  });
});
