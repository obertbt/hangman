import { describe, expect, it } from 'vitest';

import {
  daysUntilFull,
  deletionCutoff,
  levelFor,
  reclaimableBytes,
  summarizeUsage,
  tempUploadCutoff,
  USAGE_THRESHOLDS,
} from './capacity';

/**
 * 容量の見かた（58章・59章）。
 *
 * ここが狂うと「まだ余裕がある」と言いながら埋まる、
 * あるいは常に警告が出て誰も見なくなる。どちらも困る。
 */

const GB = 1024 * 1024 * 1024;

describe('しきい値', () => {
  it('70 / 85 / 95 で段階が変わる', () => {
    expect(levelFor(69.9)).toBe('ok');
    expect(levelFor(USAGE_THRESHOLDS.notice)).toBe('notice');
    expect(levelFor(84.9)).toBe('notice');
    expect(levelFor(USAGE_THRESHOLDS.warning)).toBe('warning');
    expect(levelFor(94.9)).toBe('warning');
    expect(levelFor(USAGE_THRESHOLDS.critical)).toBe('critical');
    expect(levelFor(120)).toBe('critical');
  });
});

describe('使用量のまとめ', () => {
  it('割合を小数1桁で出す', () => {
    const summary = summarizeUsage(10 * GB, 25 * GB);
    expect(summary.percent).toBe(40);
    expect(summary.level).toBe('ok');
    expect(summary.remainingBytes).toBe(15 * GB);
  });

  it('端数を丸めすぎない', () => {
    // 1/3 は 33.333…%。33% と 33.3% では、増え方の見え方が変わる
    expect(summarizeUsage(1, 3).percent).toBe(33.3);
  });

  it('上限を超えていても壊れない', () => {
    const summary = summarizeUsage(30 * GB, 25 * GB);
    expect(summary.percent).toBe(120);
    expect(summary.level).toBe('critical');
    expect(summary.remainingBytes).toBe(0);
  });

  it('上限が設定されていなければ、割合を出さない', () => {
    // 数字が無いのに 0% や 100% と出すと、判断を誤らせる
    const summary = summarizeUsage(10 * GB, 0);
    expect(summary.percent).toBe(0);
    expect(summary.level).toBe('ok');
  });

  it('負の使用量は0として扱う', () => {
    expect(summarizeUsage(-5, 100).usedBytes).toBe(0);
  });
});

describe('このままだといつ埋まるか', () => {
  it('増え方から日数を見積もる', () => {
    // 10日で 1GB 増えた → 1日 0.1GB。残り 5GB なら 50日
    const history = [
      { capturedOn: '2026-08-01', totalBytes: 20 * GB },
      { capturedOn: '2026-08-11', totalBytes: 21 * GB },
    ];
    expect(daysUntilFull(history, 26 * GB)).toBe(50);
  });

  it('並び順が逆でも同じ結果になる', () => {
    const history = [
      { capturedOn: '2026-08-11', totalBytes: 21 * GB },
      { capturedOn: '2026-08-01', totalBytes: 20 * GB },
    ];
    expect(daysUntilFull(history, 26 * GB)).toBe(50);
  });

  it('増えていなければ見積もらない', () => {
    const history = [
      { capturedOn: '2026-08-01', totalBytes: 20 * GB },
      { capturedOn: '2026-08-11', totalBytes: 20 * GB },
    ];
    expect(daysUntilFull(history, 26 * GB)).toBeNull();
  });

  it('減っていれば見積もらない', () => {
    const history = [
      { capturedOn: '2026-08-01', totalBytes: 20 * GB },
      { capturedOn: '2026-08-11', totalBytes: 18 * GB },
    ];
    expect(daysUntilFull(history, 26 * GB)).toBeNull();
  });

  it('記録が1件しかなければ見積もらない', () => {
    expect(daysUntilFull([{ capturedOn: '2026-08-01', totalBytes: 20 * GB }], 26 * GB)).toBeNull();
  });

  it('同じ日の記録が2件でも壊れない', () => {
    const history = [
      { capturedOn: '2026-08-01', totalBytes: 20 * GB },
      { capturedOn: '2026-08-01', totalBytes: 21 * GB },
    ];
    expect(daysUntilFull(history, 26 * GB)).toBeNull();
  });

  it('すでに超えていれば0日', () => {
    const history = [
      { capturedOn: '2026-08-01', totalBytes: 20 * GB },
      { capturedOn: '2026-08-11', totalBytes: 30 * GB },
    ];
    expect(daysUntilFull(history, 26 * GB)).toBe(0);
  });
});

describe('消せば空く容量', () => {
  it('削除待ちと一時アップロードを足す', () => {
    expect(reclaimableBytes(2 * GB, 1 * GB)).toBe(3 * GB);
  });

  it('負の値は0として扱う', () => {
    expect(reclaimableBytes(-1, -1)).toBe(0);
  });
});

describe('掃除の対象になる時刻', () => {
  const now = new Date('2026-08-12T09:00:00Z');

  it('30日前より古いものが物理削除の対象', () => {
    expect(deletionCutoff(30, now)).toBe('2026-07-13T09:00:00.000Z');
  });

  it('24時間前より古い一時アップロードが掃除の対象', () => {
    expect(tempUploadCutoff(24, now)).toBe('2026-08-11T09:00:00.000Z');
  });
});
