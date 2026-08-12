import 'server-only';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { getR2Env, limits } from '@/lib/env';

import type {
  CreateDownloadUrlInput,
  CreateUploadUrlInput,
  ObjectStorage,
  PresignedDownload,
  PresignedUpload,
  StoredObjectMetadata,
} from './types';

/**
 * Cloudflare R2 実装（23章）。
 *
 * R2 は S3 互換なので aws-sdk をそのまま使う。
 * 将来 S3 や別サービスへ移す時は、このクラスを差し替えるだけで済むようにしている。
 *
 * 決まりごと:
 *   * Bucket は Private（22章）。恒久公開 URL は作らない。
 *   * 署名付き URL を DB へ保存しない（75章）。毎回発行する。
 *   * 動画本体はサーバーを経由させない（20章）。ブラウザから直接 R2 へ入れる。
 */
export class CloudflareR2Storage implements ObjectStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    const config = getR2Env();
    if (!config) {
      throw new Error(
        'R2 の環境変数が設定されていません（R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME）。',
      );
    }

    this.bucket = config.bucket;
    this.client = new S3Client({
      // R2 はリージョンを持たないが、SDK が必須にしているため auto を渡す。
      region: 'auto',
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async createUploadUrl(input: CreateUploadUrlInput): Promise<PresignedUpload> {
    const expiresIn = input.expiresInSeconds ?? limits.signedUrlExpirySeconds;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.key,
      ContentType: input.contentType,
      ContentLength: input.contentLength,
    });

    const url = await getSignedUrl(this.client, command, { expiresIn });

    return {
      url,
      method: 'PUT',
      // 署名に含めた値と実際の PUT が食い違うと 403 になる。ブラウザへそのまま渡す。
      headers: {
        'Content-Type': input.contentType,
      },
      key: input.key,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    };
  }

  async createDownloadUrl(input: CreateDownloadUrlInput): Promise<PresignedDownload> {
    const expiresIn = input.expiresInSeconds ?? limits.signedUrlExpirySeconds;

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: input.key,
      ResponseContentDisposition: input.downloadFilename
        ? `attachment; filename="${encodeURIComponent(input.downloadFilename)}"`
        : undefined,
    });

    const url = await getSignedUrl(this.client, command, { expiresIn });

    return {
      url,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    };
  }

  async statObject(key: string): Promise<StoredObjectMetadata | null> {
    try {
      const result = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return {
        key,
        sizeBytes: result.ContentLength ?? 0,
        contentType: result.ContentType ?? null,
        etag: result.ETag ?? null,
        lastModified: result.LastModified?.toISOString() ?? null,
      };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async objectExists(key: string): Promise<boolean> {
    return (await this.statObject(key)) !== null;
  }
}

function isNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const name = 'name' in error ? String((error as { name: unknown }).name) : '';
  if (name === 'NotFound' || name === 'NoSuchKey') return true;

  const metadata = '$metadata' in error ? (error as { $metadata: unknown }).$metadata : null;
  if (metadata && typeof metadata === 'object' && 'httpStatusCode' in metadata) {
    return (metadata as { httpStatusCode: unknown }).httpStatusCode === 404;
  }
  return false;
}

let cached: ObjectStorage | null = null;

/**
 * 使う側はこれだけを呼ぶ。実装が何かを知らせない。
 * R2 未設定の環境（Phase 7 前）では呼んだ時点で例外になる。
 */
export function getObjectStorage(): ObjectStorage {
  cached ??= new CloudflareR2Storage();
  return cached;
}

/** R2 が使える状態か。設定診断ページ用。 */
export function isStorageConfigured(): boolean {
  return getR2Env() !== null;
}
