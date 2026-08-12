/**
 * オブジェクトストレージの抽象（23章）。
 *
 * Cloudflare R2 へ直接依存させすぎない。
 * UI から直接ストレージを触らせない（75章）。呼ぶのは常にサーバー側の Service 層。
 */

export type MediaType = 'video' | 'image' | 'pdf' | 'other';

export interface CreateUploadUrlInput {
  key: string;
  contentType: string;
  contentLength: number;
  /** 署名の有効期限（秒）。省略時は設定値。 */
  expiresInSeconds?: number;
}

export interface PresignedUpload {
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
  key: string;
  expiresAt: string;
}

export interface CreateDownloadUrlInput {
  key: string;
  expiresInSeconds?: number;
  /** ブラウザに表示させるファイル名。 */
  downloadFilename?: string;
}

export interface PresignedDownload {
  url: string;
  expiresAt: string;
}

export interface StoredObjectMetadata {
  key: string;
  sizeBytes: number;
  contentType: string | null;
  etag: string | null;
  lastModified: string | null;
}

export interface ObjectStorage {
  createUploadUrl(input: CreateUploadUrlInput): Promise<PresignedUpload>;
  createDownloadUrl(input: CreateDownloadUrlInput): Promise<PresignedDownload>;
  statObject(key: string): Promise<StoredObjectMetadata | null>;
  deleteObject(key: string): Promise<void>;
  objectExists(key: string): Promise<boolean>;
}
