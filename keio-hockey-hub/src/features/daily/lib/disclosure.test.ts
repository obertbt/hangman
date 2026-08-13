import { describe, expect, it } from 'vitest';

import { describeDisclosure, disclosureOf } from './disclosure';

/**
 * 「自分だけ」を選んだとき、何が伝わるか。
 *
 * ここが実装とずれると、選手は知らないうちに何かを伝えている状態になる。
 * 公開範囲の意味は 0023 で変わったので、その通りかを固める。
 */

describe('下書き', () => {
  it('提出するまでは何も伝わらない', () => {
    const result = disclosureOf('staff', 'draft');
    expect(result.factVisibleToStaff).toBe(false);
    expect(result.bodyVisibleToStaff).toBe(false);
    expect(result.bodyVisibleToTeam).toBe(false);
    expect(result.canReceiveComments).toBe(false);
  });

  it('公開範囲を team にしていても、下書きなら伝わらない', () => {
    expect(disclosureOf('team', 'draft').bodyVisibleToTeam).toBe(false);
  });

  it('文言でもそう伝える', () => {
    expect(describeDisclosure('team', 'draft')).toContain('誰にも見えません');
  });
});

describe('自分だけ', () => {
  const result = disclosureOf('private');

  it('中身は誰にも見えない', () => {
    expect(result.bodyVisibleToStaff).toBe(false);
    expect(result.bodyVisibleToTeam).toBe(false);
  });

  it('**出したことは伝わる**（未提出として扱われないため）', () => {
    expect(result.factVisibleToStaff).toBe(true);
  });

  it('コメントは付かない', () => {
    expect(result.canReceiveComments).toBe(false);
  });

  it('文言に、事実だけは伝わることを書く', () => {
    const text = describeDisclosure('private');
    expect(text).toContain('提出したこと');
    expect(text).toContain('コメントは付きません');
  });
});

describe('コーチまで', () => {
  const result = disclosureOf('staff');

  it('コーチは中身を読める', () => {
    expect(result.bodyVisibleToStaff).toBe(true);
  });

  it('他の選手には見えない', () => {
    expect(result.bodyVisibleToTeam).toBe(false);
  });

  it('コメントを受け取れる', () => {
    expect(result.canReceiveComments).toBe(true);
  });
});

describe('チーム全員', () => {
  const result = disclosureOf('team');

  it('全員が読める', () => {
    expect(result.bodyVisibleToStaff).toBe(true);
    expect(result.bodyVisibleToTeam).toBe(true);
  });

  it('コメントを受け取れる', () => {
    expect(result.canReceiveComments).toBe(true);
  });
});

describe('どの公開範囲でも共通すること', () => {
  const all = ['private', 'staff', 'team'] as const;

  it('提出したら、出した事実は必ず伝わる', () => {
    for (const visibility of all) {
      expect(disclosureOf(visibility).factVisibleToStaff).toBe(true);
    }
  });

  it('コメントが付くのは、中身が読めるときだけ', () => {
    for (const visibility of all) {
      const result = disclosureOf(visibility);
      expect(result.canReceiveComments).toBe(result.bodyVisibleToStaff);
    }
  });

  it('チームに見えるなら、コーチにも見える', () => {
    for (const visibility of all) {
      const result = disclosureOf(visibility);
      if (result.bodyVisibleToTeam) expect(result.bodyVisibleToStaff).toBe(true);
    }
  });

  it('説明はどれも空でない', () => {
    for (const visibility of all) {
      expect(describeDisclosure(visibility).length).toBeGreaterThan(10);
    }
  });
});
