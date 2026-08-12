import { describe, expect, it } from 'vitest';

import type { UploadLimits } from '@/lib/storage/validation';

import { isSessionExpired, planUpload, sessionExpiryFrom, verifyUploadedObject } from './plan';

const TEAM_ID = '11111111-1111-1111-1111-111111111111';

const limits: UploadLimits = {
  maxVideoDurationSeconds: 60,
  maxVideoSizeBytes: 52_428_800,
  maxImageSizeBytes: 2_097_152,
  maxPdfSizeBytes: 10_485_760,
  maxDailyVideoUploadsPerUser: 5,
};

const base = {
  teamId: TEAM_ID,
  objectId: 'abc-123',
  originalFilename: '自主練.mp4',
  mimeType: 'video/mp4',
  sizeBytes: 10_000_000,
  durationSeconds: 25,
  mediaType: 'video' as const,
  todayUploadCount: 0,
  dateOnly: '2026-08-12',
};

describe('アップロードの受け入れ判定（19章・20章）', () => {
  it('条件を満たす動画を受け入れ、置き場所を決める', () => {
    const result = planUpload(base, limits);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.plan.storageKey).toBe(`teams/${TEAM_ID}/videos/2026/08/12/abc-123.mp4`);
      expect(result.plan.durationSeconds).toBe(25);
    }
  });

  it('置き場所に氏名やファイル名を持ち込まない（75章）', () => {
    const result = planUpload({ ...base, originalFilename: '山田花子_自主練_20260812.mp4' }, limits);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.plan.storageKey).not.toContain('山田');
      expect(result.plan.storageKey).not.toContain('自主練');
      expect(result.plan.normalizedFilename).toBe('abc-123.mp4');
    }
  });

  it('長すぎる動画を、直し方が分かる言葉で断る', () => {
    const result = planUpload({ ...base, durationSeconds: 90 }, limits);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('60秒');
      expect(result.reason).toContain('切り出して');
    }
  });

  it('大きすぎる動画を断る', () => {
    const result = planUpload({ ...base, sizeBytes: 60_000_000 }, limits);
    expect(result.ok).toBe(false);
  });

  it('対応していない形式を断る', () => {
    expect(planUpload({ ...base, mimeType: 'video/x-msvideo' }, limits).ok).toBe(false);
  });

  it('1日の上限に達していたら断る', () => {
    const result = planUpload({ ...base, todayUploadCount: 5 }, limits);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('1日に投稿できる動画');
  });

  it('上限未満なら受け入れる', () => {
    expect(planUpload({ ...base, todayUploadCount: 4 }, limits).ok).toBe(true);
  });

  it('長さが分からない動画は受け入れない', () => {
    const result = planUpload({ ...base, durationSeconds: null }, limits);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('長さを読み取れませんでした');
  });

  it('画像には1日の本数制限をかけない', () => {
    const result = planUpload(
      {
        ...base,
        mediaType: 'image',
        mimeType: 'image/jpeg',
        originalFilename: 'photo.jpg',
        sizeBytes: 1_000_000,
        durationSeconds: null,
        todayUploadCount: 99,
      },
      limits,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.plan.storageKey).toContain('/images/');
  });

  it('本置き場に置く（一時領域には置かない）', () => {
    const result = planUpload(base, limits);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.plan.temporary).toBe(false);
      expect(result.plan.storageKey).not.toContain('/tmp/');
    }
  });
});

describe('アップロード後の実物確認（20章）', () => {
  it('大きさが一致すれば受け入れる', () => {
    const result = verifyUploadedObject({
      declaredSize: 1000,
      declaredMime: 'video/mp4',
      actual: { sizeBytes: 1000, contentType: 'video/mp4' },
    });
    expect(result.ok).toBe(true);
  });

  it('実物が無ければ断る', () => {
    const result = verifyUploadedObject({
      declaredSize: 1000,
      declaredMime: 'video/mp4',
      actual: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('見つかりませんでした');
  });

  it('途中で切れていたら断る', () => {
    const result = verifyUploadedObject({
      declaredSize: 1000,
      declaredMime: 'video/mp4',
      actual: { sizeBytes: 400, contentType: 'video/mp4' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('途中で終わった');
  });

  it('種類が違えば断る', () => {
    const result = verifyUploadedObject({
      declaredSize: 1000,
      declaredMime: 'video/mp4',
      actual: { sizeBytes: 1000, contentType: 'application/zip' },
    });
    expect(result.ok).toBe(false);
  });

  it('同じ種類なら細かい違いは許す（R2 が補うことがある）', () => {
    const result = verifyUploadedObject({
      declaredSize: 1000,
      declaredMime: 'video/quicktime',
      actual: { sizeBytes: 1000, contentType: 'video/mp4' },
    });
    expect(result.ok).toBe(true);
  });

  it('Content-Type が返らなくても、大きさが合っていれば受け入れる', () => {
    const result = verifyUploadedObject({
      declaredSize: 1000,
      declaredMime: 'video/mp4',
      actual: { sizeBytes: 1000, contentType: null },
    });
    expect(result.ok).toBe(true);
  });
});

describe('セッションの期限（21章）', () => {
  const now = new Date('2026-08-12T10:00:00Z');

  it('署名付きURLより少し長くする', () => {
    const expiry = sessionExpiryFrom(900, now);
    const diffSeconds = (new Date(expiry).getTime() - now.getTime()) / 1000;
    expect(diffSeconds).toBeGreaterThan(900);
  });

  it('期限切れを判別する', () => {
    expect(isSessionExpired('2026-08-12T09:00:00Z', now)).toBe(true);
    expect(isSessionExpired('2026-08-12T11:00:00Z', now)).toBe(false);
  });

  it('壊れた日時は期限切れ扱いにする（安全側）', () => {
    expect(isSessionExpired('こわれている', now)).toBe(true);
  });
});
