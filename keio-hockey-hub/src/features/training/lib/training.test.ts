import { describe, expect, it } from 'vitest';

import {
  durationFromTimes,
  expandWeightSets,
  formatDuration,
  formatPace,
  paceSecondsPerKm,
  sectionFor,
  totalVolume,
} from './training';

describe('種別ごとの入力項目（17章）', () => {
  it('ランニング・ウェイト・自主練は追加項目を持つ', () => {
    expect(sectionFor('running')).toBe('running');
    expect(sectionFor('weight')).toBe('weight');
    expect(sectionFor('self_practice')).toBe('self_practice');
  });

  it('その他の種別は共通項目だけ', () => {
    expect(sectionFor('recovery')).toBeNull();
    expect(sectionFor('stretch')).toBeNull();
    expect(sectionFor('agility')).toBeNull();
    expect(sectionFor('other')).toBeNull();
  });
});

describe('実施時間の計算', () => {
  it('開始と終了から分を出す', () => {
    expect(durationFromTimes('16:00', '19:00')).toBe(180);
    expect(durationFromTimes('06:30', '07:15')).toBe(45);
  });

  it('日付をまたいでも正しく出す', () => {
    expect(durationFromTimes('23:00', '00:30')).toBe(90);
  });

  it('片方が空なら null', () => {
    expect(durationFromTimes('16:00', null)).toBeNull();
    expect(durationFromTimes(null, '19:00')).toBeNull();
  });

  it('壊れた時刻は null', () => {
    expect(durationFromTimes('あ', '19:00')).toBeNull();
    expect(durationFromTimes('25:00', '19:00')).toBeNull();
    expect(durationFromTimes('16:99', '19:00')).toBeNull();
  });

  it('同じ時刻なら0分', () => {
    expect(durationFromTimes('16:00', '16:00')).toBe(0);
  });
});

describe('ペースの計算', () => {
  it('距離と時間から1kmあたりの秒数を出す', () => {
    // 10km を 50分 → 5分/km = 300秒
    expect(paceSecondsPerKm(10, 50)).toBe(300);
    // 5km を 27分30秒相当（27.5分）→ 330秒
    expect(paceSecondsPerKm(5, 27.5)).toBe(330);
  });

  it('0や負の値では計算しない', () => {
    expect(paceSecondsPerKm(0, 50)).toBeNull();
    expect(paceSecondsPerKm(10, 0)).toBeNull();
    expect(paceSecondsPerKm(-1, 50)).toBeNull();
  });

  it('値が無ければ null', () => {
    expect(paceSecondsPerKm(null, 50)).toBeNull();
    expect(paceSecondsPerKm(10, null)).toBeNull();
  });

  it('表示の形にできる', () => {
    expect(formatPace(300)).toBe('5\'00"/km');
    expect(formatPace(330)).toBe('5\'30"/km');
    expect(formatPace(null)).toBeNull();
    expect(formatPace(0)).toBeNull();
  });
});

describe('実施時間の表示', () => {
  it('60分未満は分だけ', () => {
    expect(formatDuration(45)).toBe('45分');
  });

  it('ちょうどの時間は分を出さない', () => {
    expect(formatDuration(120)).toBe('2時間');
  });

  it('時間と分を組み合わせる', () => {
    expect(formatDuration(80)).toBe('1時間20分');
  });

  it('値が無ければ null', () => {
    expect(formatDuration(null)).toBeNull();
    expect(formatDuration(-5)).toBeNull();
  });
});

describe('ウェイトのセット展開', () => {
  const base = { name: 'スクワット', weightKg: 40, reps: 10, setCount: 3 };

  it('セット数のぶんだけ行を作る', () => {
    const sets = expandWeightSets(base);
    expect(sets).toHaveLength(3);
    expect(sets[0]).toEqual({ setNumber: 1, weightKg: 40, reps: 10 });
    expect(sets[2]?.setNumber).toBe(3);
  });

  it('セット数が0以下なら何も作らない', () => {
    expect(expandWeightSets({ ...base, setCount: 0 })).toEqual([]);
    expect(expandWeightSets({ ...base, setCount: null })).toEqual([]);
  });

  it('入力ミスで大量の行を作らない', () => {
    expect(expandWeightSets({ ...base, setCount: 999 })).toHaveLength(20);
  });

  it('重量や回数が空でもセットは作れる（後から入れられる）', () => {
    const sets = expandWeightSets({ name: '腹筋', weightKg: null, reps: null, setCount: 2 });
    expect(sets).toHaveLength(2);
    expect(sets[0]?.weightKg).toBeNull();
  });
});

describe('総挙上量', () => {
  it('重量 × 回数 × セット数', () => {
    expect(totalVolume({ name: 'スクワット', weightKg: 40, reps: 10, setCount: 3 })).toBe(1200);
  });

  it('どれかが欠けていれば null', () => {
    expect(totalVolume({ name: '', weightKg: null, reps: 10, setCount: 3 })).toBeNull();
    expect(totalVolume({ name: '', weightKg: 40, reps: null, setCount: 3 })).toBeNull();
  });

  it('0以下があれば null', () => {
    expect(totalVolume({ name: '', weightKg: 0, reps: 10, setCount: 3 })).toBeNull();
  });
});
