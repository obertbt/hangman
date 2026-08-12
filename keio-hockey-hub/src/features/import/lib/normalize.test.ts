import { describe, expect, it } from 'vitest';

import {
  checkGradeAgainstAdmissionYear,
  normalizeAdmissionYear,
  normalizeDate,
  normalizeEmail,
  normalizeGrade,
  normalizeJerseyNumber,
  normalizeName,
  normalizePosition,
  toHalfWidth,
} from './normalize';

describe('日付の正規化（41章）', () => {
  it('仕様に挙がっている形をすべて吸収する', () => {
    expect(normalizeDate('2026/4/15')).toEqual({ ok: true, value: '2026-04-15' });
    expect(normalizeDate('2026-04-15')).toEqual({ ok: true, value: '2026-04-15' });
    expect(normalizeDate('2026年4月15日')).toEqual({ ok: true, value: '2026-04-15' });
  });

  it('年が無い場合は基準年で補い、必ず警告する', () => {
    const result = normalizeDate('4/15', 2026);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('2026-04-15');
      expect(result.warning).toContain('2026');
    }
  });

  it('年が無く基準年も無ければ、推測せずエラーにする', () => {
    const result = normalizeDate('4/15');
    expect(result.ok).toBe(false);
  });

  it('存在しない日付を弾く', () => {
    expect(normalizeDate('2026-02-30').ok).toBe(false);
    expect(normalizeDate('2026-13-01').ok).toBe(false);
  });

  it('全角の数字でも読める', () => {
    expect(normalizeDate('２０２６/４/１５')).toEqual({ ok: true, value: '2026-04-15' });
  });

  it('読めないものはエラーにする', () => {
    expect(normalizeDate('来週の火曜').ok).toBe(false);
    expect(normalizeDate('').ok).toBe(false);
  });

  it('うるう年を正しく扱う', () => {
    expect(normalizeDate('2028-02-29').ok).toBe(true);
    expect(normalizeDate('2026-02-29').ok).toBe(false);
  });
});

describe('学年の正規化（41章）', () => {
  it('3 / 3年 / 3年生 をすべて 3 にする', () => {
    expect(normalizeGrade('3')).toEqual({ ok: true, value: 3 });
    expect(normalizeGrade('3年')).toEqual({ ok: true, value: 3 });
    expect(normalizeGrade('3年生')).toEqual({ ok: true, value: 3 });
    expect(normalizeGrade('３年')).toEqual({ ok: true, value: 3 });
  });

  it('範囲外を弾く', () => {
    expect(normalizeGrade('0').ok).toBe(false);
    expect(normalizeGrade('9').ok).toBe(false);
  });

  it('読めないものを弾く', () => {
    expect(normalizeGrade('三年').ok).toBe(false);
    expect(normalizeGrade('').ok).toBe(false);
  });
});

describe('ポジションの正規化（41章）', () => {
  it('Forward / フォワード / FW をすべて FW にする', () => {
    expect(normalizePosition('Forward')).toEqual({ ok: true, value: 'FW' });
    expect(normalizePosition('フォワード')).toEqual({ ok: true, value: 'FW' });
    expect(normalizePosition('FW')).toEqual({ ok: true, value: 'FW' });
    expect(normalizePosition('fw')).toEqual({ ok: true, value: 'FW' });
  });

  it('Midfielder / ミッド / MF をすべて MF にする', () => {
    expect(normalizePosition('Midfielder')).toEqual({ ok: true, value: 'MF' });
    expect(normalizePosition('ミッド')).toEqual({ ok: true, value: 'MF' });
    expect(normalizePosition('MF')).toEqual({ ok: true, value: 'MF' });
  });

  it('GK と DF も吸収する', () => {
    expect(normalizePosition('キーパー')).toEqual({ ok: true, value: 'GK' });
    expect(normalizePosition('goalkeeper')).toEqual({ ok: true, value: 'GK' });
    expect(normalizePosition('ディフェンス')).toEqual({ ok: true, value: 'DF' });
    expect(normalizePosition('back')).toEqual({ ok: true, value: 'DF' });
  });

  it('分からないものは勝手に決めずエラーにする', () => {
    const result = normalizePosition('センター');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('GK / DF / MF / FW');
  });
});

describe('背番号', () => {
  it('空欄は未設定として通す', () => {
    expect(normalizeJerseyNumber('')).toEqual({ ok: true, value: null });
    expect(normalizeJerseyNumber('-')).toEqual({ ok: true, value: null });
  });

  it('「10番」のような表記を吸収する', () => {
    expect(normalizeJerseyNumber('10番')).toEqual({ ok: true, value: 10 });
    expect(normalizeJerseyNumber('１０')).toEqual({ ok: true, value: 10 });
  });

  it('読めないものを弾く', () => {
    expect(normalizeJerseyNumber('十番').ok).toBe(false);
  });
});

describe('メールアドレス', () => {
  it('空欄を許す（まだ持っていない選手がいる）', () => {
    expect(normalizeEmail('')).toEqual({ ok: true, value: null });
  });

  it('大文字を小文字に揃える', () => {
    expect(normalizeEmail('Hanako@Example.com')).toEqual({ ok: true, value: 'hanako@example.com' });
  });

  it('形式が違うものを弾く', () => {
    expect(normalizeEmail('hanako').ok).toBe(false);
    expect(normalizeEmail('hanako@').ok).toBe(false);
  });
});

describe('入学年度', () => {
  it('「2024年度」を吸収する', () => {
    expect(normalizeAdmissionYear('2024年度', 2026)).toEqual({ ok: true, value: 2024 });
    expect(normalizeAdmissionYear('2024', 2026)).toEqual({ ok: true, value: 2024 });
  });

  it('空欄を許す', () => {
    expect(normalizeAdmissionYear('', 2026)).toEqual({ ok: true, value: null });
  });

  it('遠すぎる未来を弾く', () => {
    expect(normalizeAdmissionYear('2100', 2026).ok).toBe(false);
  });
});

describe('学年と入学年度の突き合わせ', () => {
  it('合っていれば何も言わない', () => {
    expect(checkGradeAgainstAdmissionYear(3, 2024, 2026)).toBeNull();
  });

  it('食い違えば警告する（勝手に直さない）', () => {
    const message = checkGradeAgainstAdmissionYear(1, 2024, 2026);
    expect(message).not.toBeNull();
    expect(message).toContain('3');
  });

  it('片方が無ければ判断しない', () => {
    expect(checkGradeAgainstAdmissionYear(null, 2024, 2026)).toBeNull();
    expect(checkGradeAgainstAdmissionYear(3, null, 2026)).toBeNull();
  });
});

describe('氏名', () => {
  it('全角空白を半角に揃える', () => {
    expect(normalizeName('山田　花子')).toEqual({ ok: true, value: '山田 花子' });
  });

  it('空欄を弾く', () => {
    expect(normalizeName('   ').ok).toBe(false);
  });
});

describe('toHalfWidth', () => {
  it('全角英数字を半角にする', () => {
    expect(toHalfWidth('ＡＢＣ１２３')).toBe('ABC123');
  });
});
