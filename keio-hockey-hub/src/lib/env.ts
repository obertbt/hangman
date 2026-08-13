import { z } from 'zod';

/**
 * 環境変数の読み取りと検証。
 *
 * 方針（74章・75章）:
 *   - 公開値（NEXT_PUBLIC_*）とサーバー専用値を型の上で分ける。
 *   - サーバー専用値はモジュール読み込み時ではなく、使う時に検証する。
 *     ビルド時や Vitest 実行時に Supabase / R2 の鍵が無くても落ちないようにするため。
 *   - process.env はビルド時に静的置換されるため、必ず添字ではなくプロパティで書く。
 */

/** 数値の環境変数。未設定なら既定値を使う。 */
function numberFromEnv(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * 空文字を「未設定」として扱う。
 *
 * 置き場所（Vercel など）の画面では、変数名だけ登録して値を空にできる。
 * その場合 process.env には `''` が入る。
 * zod の `.default()` は undefined のときにしか効かないので、
 * 素通しすると `''` が URL 検証に掛かり、**ビルドごと落ちる**。
 *
 * 実際にそれで「Build Failed」になった。
 * 値が分からないまま変数名だけ作るのは、設定していて普通に起きること。
 * 落とすのではなく、未設定として扱って既定値へ倒す。
 * 何が足りないかは /setup-check で見えるようにしてある。
 */
function orUndefined(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed === '' ? undefined : trimmed;
}

const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().min(1).default('慶應ホッケーハブ'),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().default('http://localhost:54321'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).default('missing-anon-key'),
});

/**
 * ブラウザからも読める値。
 * ここに秘密情報を足してはいけない。
 */
export const env = publicEnvSchema.parse({
  NEXT_PUBLIC_APP_NAME: orUndefined(process.env.NEXT_PUBLIC_APP_NAME),
  NEXT_PUBLIC_APP_URL: orUndefined(process.env.NEXT_PUBLIC_APP_URL),
  NEXT_PUBLIC_SUPABASE_URL: orUndefined(process.env.NEXT_PUBLIC_SUPABASE_URL),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: orUndefined(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
});

/** Supabase の設定が実際に入っているか（設定診断ページ用）。 */
export function isSupabaseConfigured(): boolean {
  return (
    orUndefined(process.env.NEXT_PUBLIC_SUPABASE_URL) !== undefined &&
    orUndefined(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) !== undefined
  );
}

/**
 * サーバー専用の値。Server Component / Server Action / Route Handler からのみ呼ぶ。
 */
export function getServerEnv() {
  const serviceRoleKey = orUndefined(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY が設定されていません。');
  }
  return { SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey };
}

export interface R2Env {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint: string;
}

/** R2 の設定が揃っているか。揃っていなければ null を返す（Phase 7 まで未設定でも動く）。 */
export function getR2Env(): R2Env | null {
  // 空文字も未設定として扱う。R2 は未設定でも動く（Phase 7 まではそうしていた）ので、
  // 変数名だけ作られた状態で「設定済み」と誤認しないようにする。
  const accountId = orUndefined(process.env.R2_ACCOUNT_ID);
  const accessKeyId = orUndefined(process.env.R2_ACCESS_KEY_ID);
  const secretAccessKey = orUndefined(process.env.R2_SECRET_ACCESS_KEY);
  const bucket = orUndefined(process.env.R2_BUCKET_NAME);
  const endpoint =
    orUndefined(process.env.R2_ENDPOINT) ??
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !endpoint) {
    return null;
  }
  return { accountId, accessKeyId, secretAccessKey, bucket, endpoint };
}

/**
 * 容量・制限の既定値（58章）。
 * 将来は app_settings テーブルでチーム毎に上書きできるようにする。
 */
export const limits = {
  maxVideoDurationSeconds: numberFromEnv(process.env.MAX_VIDEO_DURATION_SECONDS, 60),
  maxVideoSizeBytes: numberFromEnv(process.env.MAX_VIDEO_SIZE_BYTES, 52_428_800),
  maxDailyVideoUploadsPerUser: numberFromEnv(process.env.MAX_DAILY_VIDEO_UPLOADS_PER_USER, 5),
  maxImageSizeBytes: numberFromEnv(process.env.MAX_IMAGE_SIZE_BYTES, 2_097_152),
  maxPdfSizeBytes: numberFromEnv(process.env.MAX_PDF_SIZE_BYTES, 10_485_760),
  signedUrlExpirySeconds: numberFromEnv(process.env.SIGNED_URL_EXPIRY_SECONDS, 900),
  tempUploadRetentionHours: numberFromEnv(process.env.TEMP_UPLOAD_RETENTION_HOURS, 24),
  deletedFileRetentionDays: numberFromEnv(process.env.DELETED_FILE_RETENTION_DAYS, 30),
  maxImportFileSizeBytes: numberFromEnv(process.env.MAX_IMPORT_FILE_SIZE_BYTES, 10_485_760),
  maxImportRows: numberFromEnv(process.env.MAX_IMPORT_ROWS, 10_000),
  /**
   * 保存容量の目安（59章）。
   *
   * R2 に技術的な上限があるわけではない。
   * 「これ以上増えたら費用と運用を見直す」という自分たちの線引き。
   * 既定の25GBは docs/capacity-planning.md の見積もりに合わせている。
   */
  storageLimitBytes: numberFromEnv(process.env.STORAGE_LIMIT_BYTES, 26_843_545_600),
} as const;

export type Limits = typeof limits;
