import type { MediaType } from './types';

/**
 * storage key の組み立て（75章）。
 *
 * 決まりごと:
 *   * 氏名を入れない。key が漏れても誰のものか分からないようにする。
 *   * チームで区切る。別チームのファイルに手が届かないようにする。
 *   * 日付で区切る。後から棚卸ししやすくする。
 *   * 拡張子だけ元ファイルから引き継ぎ、名前そのものは使わない。
 */

const MEDIA_PREFIX: Record<MediaType, string> = {
  video: 'videos',
  image: 'images',
  pdf: 'documents',
  other: 'files',
};

/** 許可する拡張子。ここに無いものは 'bin' に倒す。 */
const ALLOWED_EXTENSIONS = new Set([
  'mp4',
  'mov',
  'webm',
  'jpg',
  'jpeg',
  'png',
  'webp',
  'heic',
  'gif',
  'pdf',
]);

export function extensionFromFilename(filename: string): string {
  const match = /\.([A-Za-z0-9]+)$/.exec(filename.trim());
  if (!match?.[1]) return 'bin';
  const ext = match[1].toLowerCase();
  return ALLOWED_EXTENSIONS.has(ext) ? ext : 'bin';
}

export interface BuildStorageKeyInput {
  teamId: string;
  mediaType: MediaType;
  /** 衝突しない ID。呼び出し側で crypto.randomUUID() などを渡す。 */
  objectId: string;
  originalFilename: string;
  /** 'YYYY-MM-DD'。省略時は今日（Asia/Tokyo）。 */
  dateOnly: string;
  /** 一時アップロードは別の場所に置き、まとめて消せるようにする（21章）。 */
  temporary?: boolean;
}

/**
 * 例:
 *   teams/<teamId>/videos/2026/08/12/<uuid>.mp4
 *   teams/<teamId>/tmp/videos/2026/08/12/<uuid>.mp4
 */
export function buildStorageKey(input: BuildStorageKeyInput): string {
  const [year, month, day] = input.dateOnly.split('-');
  if (!year || !month || !day) {
    throw new Error(`日付の形式が不正です: ${input.dateOnly}`);
  }

  const ext = extensionFromFilename(input.originalFilename);
  const prefix = MEDIA_PREFIX[input.mediaType];
  const scope = input.temporary ? `tmp/${prefix}` : prefix;

  return `teams/${input.teamId}/${scope}/${year}/${month}/${day}/${input.objectId}.${ext}`;
}

/** key からチーム ID を取り出す。別チームのファイルを触らせないための確認に使う。 */
export function teamIdFromStorageKey(key: string): string | null {
  const match = /^teams\/([0-9a-fA-F-]{36})\//.exec(key);
  return match?.[1] ?? null;
}

/** key が指定チームのものか。署名付き URL を出す前に必ず確認する（62章）。 */
export function isKeyOwnedByTeam(key: string, teamId: string): boolean {
  return teamIdFromStorageKey(key) === teamId;
}

/** 保存名。元の名前は files.original_filename にだけ残す。 */
export function normalizedFilename(objectId: string, originalFilename: string): string {
  return `${objectId}.${extensionFromFilename(originalFilename)}`;
}
