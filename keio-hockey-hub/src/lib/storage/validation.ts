import { limits } from '@/lib/env';

import type { MediaType } from './types';

/**
 * アップロードの受け入れ判定（19章・58章）。
 *
 * ブラウザ側の確認は「親切」でしかない。
 * Presigned URL を出す前に、必ずサーバー側でここを通す。
 */

/** 対応する形式（19章）。 */
export const ALLOWED_VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'] as const;
export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const;
export const ALLOWED_PDF_MIME_TYPES = ['application/pdf'] as const;

export interface UploadLimits {
  maxVideoDurationSeconds: number;
  maxVideoSizeBytes: number;
  maxImageSizeBytes: number;
  maxPdfSizeBytes: number;
  maxDailyVideoUploadsPerUser: number;
}

export const defaultUploadLimits: UploadLimits = {
  maxVideoDurationSeconds: limits.maxVideoDurationSeconds,
  maxVideoSizeBytes: limits.maxVideoSizeBytes,
  maxImageSizeBytes: limits.maxImageSizeBytes,
  maxPdfSizeBytes: limits.maxPdfSizeBytes,
  maxDailyVideoUploadsPerUser: limits.maxDailyVideoUploadsPerUser,
};

export interface ValidateUploadInput {
  mediaType: MediaType;
  mimeType: string;
  sizeBytes: number;
  /** 動画のみ。ブラウザで測った長さ。 */
  durationSeconds?: number;
  /** その日すでに投稿した本数。 */
  todayUploadCount?: number;
}

export type UploadValidationResult = { ok: true } | { ok: false; reason: string };

function mimeAllowed(mediaType: MediaType, mimeType: string): boolean {
  const normalized = mimeType.toLowerCase().split(';')[0]?.trim() ?? '';
  switch (mediaType) {
    case 'video':
      return (ALLOWED_VIDEO_MIME_TYPES as readonly string[]).includes(normalized);
    case 'image':
      return (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(normalized);
    case 'pdf':
      return (ALLOWED_PDF_MIME_TYPES as readonly string[]).includes(normalized);
    case 'other':
      return false;
  }
}

function maxSizeFor(mediaType: MediaType, uploadLimits: UploadLimits): number {
  switch (mediaType) {
    case 'video':
      return uploadLimits.maxVideoSizeBytes;
    case 'image':
      return uploadLimits.maxImageSizeBytes;
    case 'pdf':
      return uploadLimits.maxPdfSizeBytes;
    case 'other':
      return 0;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))}MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${bytes}バイト`;
}

/**
 * 受け入れてよいアップロードか。
 * 断る場合は、利用者がその場で直せる言葉で理由を返す。
 */
export function validateUpload(
  input: ValidateUploadInput,
  uploadLimits: UploadLimits = defaultUploadLimits,
): UploadValidationResult {
  if (!mimeAllowed(input.mediaType, input.mimeType)) {
    return { ok: false, reason: `この形式には対応していません（${input.mimeType}）。` };
  }

  if (input.sizeBytes <= 0) {
    return { ok: false, reason: 'ファイルが空です。' };
  }

  const maxSize = maxSizeFor(input.mediaType, uploadLimits);
  if (input.sizeBytes > maxSize) {
    return {
      ok: false,
      reason: `ファイルが大きすぎます（上限 ${formatBytes(maxSize)}、選択されたもの ${formatBytes(input.sizeBytes)}）。`,
    };
  }

  if (input.mediaType === 'video') {
    if (input.durationSeconds !== undefined && input.durationSeconds > uploadLimits.maxVideoDurationSeconds) {
      return {
        ok: false,
        reason: `動画が長すぎます（上限 ${uploadLimits.maxVideoDurationSeconds}秒、選択されたもの ${Math.round(input.durationSeconds)}秒）。見てもらいたい場面だけを切り出してください。`,
      };
    }

    if (
      input.todayUploadCount !== undefined &&
      input.todayUploadCount >= uploadLimits.maxDailyVideoUploadsPerUser
    ) {
      return {
        ok: false,
        reason: `1日に投稿できる動画は${uploadLimits.maxDailyVideoUploadsPerUser}本までです。明日また投稿できます。`,
      };
    }
  }

  return { ok: true };
}

/**
 * 仮想クリップの範囲が妥当か（18章・53章）。
 * 実ファイルを切り出さないので、ここで弾かないと再生時に破綻する。
 */
export function validateClipRange(
  startSeconds: number,
  endSeconds: number,
  videoDurationSeconds: number | null,
  maxClipDurationSeconds = 300,
): UploadValidationResult {
  if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) {
    return { ok: false, reason: '開始・終了の時間を数値で指定してください。' };
  }
  if (startSeconds < 0) {
    return { ok: false, reason: '開始時間が負の値になっています。' };
  }
  if (endSeconds <= startSeconds) {
    return { ok: false, reason: '終了時間は開始時間より後にしてください。' };
  }
  if (videoDurationSeconds !== null && endSeconds > videoDurationSeconds) {
    return { ok: false, reason: '終了時間が動画の長さを超えています。' };
  }
  if (endSeconds - startSeconds > maxClipDurationSeconds) {
    return {
      ok: false,
      reason: `切り出す範囲が長すぎます（上限 ${maxClipDurationSeconds}秒）。見てもらいたい場面を絞ってください。`,
    };
  }
  return { ok: true };
}

/** 'MM:SS' / 'HH:MM:SS' を秒に直す。仮想クリップの入力で使う。 */
export function parseTimecodeToSeconds(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;

  const parts = trimmed.split(':');
  if (parts.some((part) => part === '' || !/^\d+(\.\d+)?$/.test(part))) return null;

  const numbers = parts.map(Number);
  if (numbers.some((value) => !Number.isFinite(value))) return null;

  if (numbers.length === 1) return numbers[0] ?? null;
  if (numbers.length === 2) return (numbers[0] ?? 0) * 60 + (numbers[1] ?? 0);
  if (numbers.length === 3) return (numbers[0] ?? 0) * 3600 + (numbers[1] ?? 0) * 60 + (numbers[2] ?? 0);
  return null;
}

/** 秒を 'M:SS' 表記にする。 */
export function formatSecondsToTimecode(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const pad = (value: number) => value.toString().padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}
