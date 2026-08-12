import { describe, expect, it } from 'vitest';

import { buildStorageKey, extensionFromFilename, isKeyOwnedByTeam, teamIdFromStorageKey } from './keys';
import {
  formatSecondsToTimecode,
  parseTimecodeToSeconds,
  validateClipRange,
  validateUpload,
  type UploadLimits,
} from './validation';

const TEAM_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_TEAM_ID = '22222222-2222-2222-2222-222222222222';

const testLimits: UploadLimits = {
  maxVideoDurationSeconds: 60,
  maxVideoSizeBytes: 52_428_800,
  maxImageSizeBytes: 2_097_152,
  maxPdfSizeBytes: 10_485_760,
  maxDailyVideoUploadsPerUser: 5,
};

describe('buildStorageKey', () => {
  const base = {
    teamId: TEAM_ID,
    objectId: 'abc-123',
    dateOnly: '2026-08-12',
  };

  it('チーム・種別・日付で区切った key を作る', () => {
    const key = buildStorageKey({
      ...base,
      mediaType: 'video',
      originalFilename: 'practice.mp4',
    });
    expect(key).toBe(`teams/${TEAM_ID}/videos/2026/08/12/abc-123.mp4`);
  });

  it('氏名を含むファイル名を key へ持ち込まない（75章）', () => {
    const key = buildStorageKey({
      ...base,
      mediaType: 'video',
      originalFilename: '山田花子_自主練_2026.mp4',
    });
    expect(key).not.toContain('山田');
    expect(key).not.toContain('花子');
    expect(key).toBe(`teams/${TEAM_ID}/videos/2026/08/12/abc-123.mp4`);
  });

  it('一時アップロードは別の場所へ置く', () => {
    const key = buildStorageKey({
      ...base,
      mediaType: 'video',
      originalFilename: 'a.mp4',
      temporary: true,
    });
    expect(key).toBe(`teams/${TEAM_ID}/tmp/videos/2026/08/12/abc-123.mp4`);
  });

  it('未知の拡張子は bin に倒す', () => {
    expect(extensionFromFilename('script.sh')).toBe('bin');
    expect(extensionFromFilename('no-extension')).toBe('bin');
    expect(extensionFromFilename('movie.MP4')).toBe('mp4');
  });

  it('日付が壊れていれば作らない', () => {
    expect(() =>
      buildStorageKey({ ...base, dateOnly: 'invalid', mediaType: 'video', originalFilename: 'a.mp4' }),
    ).toThrow();
  });
});

describe('teamIdFromStorageKey', () => {
  it('key からチームを取り出せる', () => {
    const key = `teams/${TEAM_ID}/videos/2026/08/12/abc.mp4`;
    expect(teamIdFromStorageKey(key)).toBe(TEAM_ID);
  });

  it('別チームの key を弾く（62章）', () => {
    const key = `teams/${OTHER_TEAM_ID}/videos/2026/08/12/abc.mp4`;
    expect(isKeyOwnedByTeam(key, TEAM_ID)).toBe(false);
    expect(isKeyOwnedByTeam(key, OTHER_TEAM_ID)).toBe(true);
  });

  it('形の違う key を弾く', () => {
    expect(teamIdFromStorageKey('../../etc/passwd')).toBeNull();
    expect(isKeyOwnedByTeam('videos/abc.mp4', TEAM_ID)).toBe(false);
  });
});

describe('validateUpload', () => {
  it('普通の動画を受け入れる', () => {
    const result = validateUpload(
      { mediaType: 'video', mimeType: 'video/mp4', sizeBytes: 10_000_000, durationSeconds: 25 },
      testLimits,
    );
    expect(result.ok).toBe(true);
  });

  it('長すぎる動画を断る', () => {
    const result = validateUpload(
      { mediaType: 'video', mimeType: 'video/mp4', sizeBytes: 1_000_000, durationSeconds: 90 },
      testLimits,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('長すぎます');
  });

  it('大きすぎる動画を断る', () => {
    const result = validateUpload(
      { mediaType: 'video', mimeType: 'video/mp4', sizeBytes: 60_000_000, durationSeconds: 30 },
      testLimits,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('大きすぎます');
  });

  it('対応していない形式を断る', () => {
    const result = validateUpload(
      { mediaType: 'video', mimeType: 'video/x-msvideo', sizeBytes: 1000 },
      testLimits,
    );
    expect(result.ok).toBe(false);
  });

  it('MOV と WebM を受け入れる（19章）', () => {
    expect(
      validateUpload({ mediaType: 'video', mimeType: 'video/quicktime', sizeBytes: 1000 }, testLimits).ok,
    ).toBe(true);
    expect(
      validateUpload({ mediaType: 'video', mimeType: 'video/webm', sizeBytes: 1000 }, testLimits).ok,
    ).toBe(true);
  });

  it('charset 付きの Content-Type でも判定できる', () => {
    expect(
      validateUpload({ mediaType: 'video', mimeType: 'video/mp4; codecs=avc1', sizeBytes: 1000 }, testLimits)
        .ok,
    ).toBe(true);
  });

  it('1日の上限に達していたら断る', () => {
    const result = validateUpload(
      {
        mediaType: 'video',
        mimeType: 'video/mp4',
        sizeBytes: 1000,
        durationSeconds: 10,
        todayUploadCount: 5,
      },
      testLimits,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('1日に投稿できる動画');
  });

  it('上限未満なら受け入れる', () => {
    const result = validateUpload(
      {
        mediaType: 'video',
        mimeType: 'video/mp4',
        sizeBytes: 1000,
        durationSeconds: 10,
        todayUploadCount: 4,
      },
      testLimits,
    );
    expect(result.ok).toBe(true);
  });

  it('画像には画像の上限を使う', () => {
    expect(
      validateUpload({ mediaType: 'image', mimeType: 'image/jpeg', sizeBytes: 3_000_000 }, testLimits).ok,
    ).toBe(false);
    expect(
      validateUpload({ mediaType: 'image', mimeType: 'image/jpeg', sizeBytes: 1_000_000 }, testLimits).ok,
    ).toBe(true);
  });

  it('空のファイルを断る', () => {
    expect(validateUpload({ mediaType: 'image', mimeType: 'image/png', sizeBytes: 0 }, testLimits).ok).toBe(
      false,
    );
  });
});

describe('validateClipRange', () => {
  it('妥当な範囲を受け入れる', () => {
    expect(validateClipRange(754, 828, 3600).ok).toBe(true);
  });

  it('終了が開始より前なら断る', () => {
    expect(validateClipRange(100, 50, 3600).ok).toBe(false);
    expect(validateClipRange(100, 100, 3600).ok).toBe(false);
  });

  it('動画の長さを超えたら断る（53章）', () => {
    expect(validateClipRange(100, 4000, 3600).ok).toBe(false);
  });

  it('長さが不明なら超過判定をしない', () => {
    expect(validateClipRange(100, 4000, null, 100_000).ok).toBe(true);
  });

  it('長すぎる切り出しを断る', () => {
    expect(validateClipRange(0, 600, 3600, 300).ok).toBe(false);
  });

  it('負の開始位置を断る', () => {
    expect(validateClipRange(-1, 10, 3600).ok).toBe(false);
  });
});

describe('parseTimecodeToSeconds', () => {
  it('MM:SS を秒にする', () => {
    expect(parseTimecodeToSeconds('12:34')).toBe(754);
  });

  it('HH:MM:SS を秒にする', () => {
    expect(parseTimecodeToSeconds('1:02:03')).toBe(3723);
  });

  it('秒だけの入力も受ける', () => {
    expect(parseTimecodeToSeconds('90')).toBe(90);
  });

  it('壊れた入力は null', () => {
    expect(parseTimecodeToSeconds('あ:い')).toBeNull();
    expect(parseTimecodeToSeconds('')).toBeNull();
    expect(parseTimecodeToSeconds('12:')).toBeNull();
  });

  it('往復して同じ値になる', () => {
    expect(formatSecondsToTimecode(754)).toBe('12:34');
    expect(formatSecondsToTimecode(3723)).toBe('1:02:03');
    expect(parseTimecodeToSeconds(formatSecondsToTimecode(754))).toBe(754);
  });
});
