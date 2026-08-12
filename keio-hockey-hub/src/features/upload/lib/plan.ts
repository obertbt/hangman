import { buildStorageKey, normalizedFilename } from '@/lib/storage/keys';
import { validateUpload, type UploadLimits } from '@/lib/storage/validation';
import type { MediaType } from '@/lib/storage/types';

/**
 * アップロードを受け入れるかどうかと、受け入れる場合の置き場所（20章・21章）。
 *
 * ここは DB もネットワークも触らない。
 * 「何を確かめてから Presigned URL を出すか」を1か所にまとめ、テストで固める。
 *
 * ブラウザ側の確認は親切でしかない。
 * この関数はサーバー側で必ず通す。
 */

export interface PlanUploadInput {
  teamId: string;
  /** 衝突しない ID。呼び出し側で crypto.randomUUID() を渡す。 */
  objectId: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  /** 動画のみ。ブラウザで測った長さ。 */
  durationSeconds?: number | null;
  mediaType: MediaType;
  /** その日すでに投稿した本数。 */
  todayUploadCount: number;
  /** 'YYYY-MM-DD'（Asia/Tokyo）。 */
  dateOnly: string;
}

export interface UploadPlan {
  storageKey: string;
  normalizedFilename: string;
  mediaType: MediaType;
  mimeType: string;
  sizeBytes: number;
  durationSeconds: number | null;
  /**
   * 一時領域に置くか。
   *
   * 動画は「上げてから質問を書く」流れなので、
   * まず tmp に置き、質問と結び付いた時点で残すものと決める…
   * という運用も考えられるが、MVP では最初から本置き場にする。
   * 消えて困るものを一時領域に置くと、24時間の掃除で消える事故が起きる。
   */
  temporary: boolean;
}

export type PlanResult = { ok: true; plan: UploadPlan } | { ok: false; reason: string };

/**
 * 受け入れ判定 →（通れば）置き場所の決定。
 *
 * 断るときは、利用者がその場で直せる言葉で理由を返す。
 */
export function planUpload(input: PlanUploadInput, limits?: UploadLimits): PlanResult {
  const validation = validateUpload(
    {
      mediaType: input.mediaType,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      durationSeconds: input.durationSeconds ?? undefined,
      todayUploadCount: input.mediaType === 'video' ? input.todayUploadCount : undefined,
    },
    limits,
  );

  if (!validation.ok) {
    return { ok: false, reason: validation.reason };
  }

  // 動画は長さが分からないと、あとから制限を確かめ直せない
  if (
    input.mediaType === 'video' &&
    (input.durationSeconds === undefined || input.durationSeconds === null)
  ) {
    return {
      ok: false,
      reason: '動画の長さを読み取れませんでした。別の形式で書き出してからもう一度お試しください。',
    };
  }

  const storageKey = buildStorageKey({
    teamId: input.teamId,
    mediaType: input.mediaType,
    objectId: input.objectId,
    originalFilename: input.originalFilename,
    dateOnly: input.dateOnly,
    temporary: false,
  });

  return {
    ok: true,
    plan: {
      storageKey,
      normalizedFilename: normalizedFilename(input.objectId, input.originalFilename),
      mediaType: input.mediaType,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      durationSeconds: input.durationSeconds ?? null,
      temporary: false,
    },
  };
}

/**
 * アップロード完了後、R2 にある実物と申告が一致するか（20章）。
 *
 * ブラウザが「完了した」と言ってきても、それは信用しない。
 * サーバーが R2 に問い合わせた結果と突き合わせる。
 */
export interface VerifyInput {
  declaredSize: number;
  declaredMime: string;
  actual: { sizeBytes: number; contentType: string | null } | null;
}

export type VerifyResult = { ok: true } | { ok: false; reason: string };

export function verifyUploadedObject(input: VerifyInput): VerifyResult {
  if (input.actual === null) {
    return {
      ok: false,
      reason: 'アップロードされたファイルが見つかりませんでした。もう一度お試しください。',
    };
  }

  if (input.actual.sizeBytes !== input.declaredSize) {
    return {
      ok: false,
      reason: 'アップロードが途中で終わったようです。通信状況を確認して、もう一度お試しください。',
    };
  }

  // Content-Type は R2 側で補われることがあるため、
  // 申告と違っていても種別（video/ image/ など）が合っていればよしとする。
  if (input.actual.contentType) {
    const actualKind = input.actual.contentType.split('/')[0];
    const declaredKind = input.declaredMime.split('/')[0];
    if (actualKind !== declaredKind) {
      return { ok: false, reason: 'アップロードされたファイルの種類が申告と違います。' };
    }
  }

  return { ok: true };
}

/** 期限切れのセッションか（21章）。 */
export function isSessionExpired(expiresAt: string, now: Date = new Date()): boolean {
  const expiry = new Date(expiresAt);
  if (Number.isNaN(expiry.getTime())) return true;
  return expiry.getTime() <= now.getTime();
}

/** セッションの期限。Presigned URL より少し長くしておく。 */
export function sessionExpiryFrom(signedUrlExpirySeconds: number, now: Date = new Date()): string {
  const marginSeconds = 300;
  return new Date(now.getTime() + (signedUrlExpirySeconds + marginSeconds) * 1000).toISOString();
}
