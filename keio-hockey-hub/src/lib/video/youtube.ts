import type {
  PlaybackRequest,
  PlaybackSource,
  VideoMetadata,
  VideoProvider,
  VideoReference,
} from './provider';

/**
 * YouTube 限定公開の動画（18章 A / 24章）。
 *
 * アプリ側に動画本体は持たない。埋め込みで再生するだけ。
 * 仮想クリップは URL の start / end で表現する。実ファイルは切り出さない。
 */
export class YouTubeVideoProvider implements VideoProvider {
  supportsVirtualClip(): boolean {
    return true;
  }

  async getMetadata(input: VideoReference): Promise<VideoMetadata> {
    // MVP では YouTube Data API を叩かない（10章・76章: 外部依存を増やさない）。
    // 長さは登録時に人が入力する。将来 API を足す場合はここだけを差し替える。
    return {
      provider: 'youtube',
      title: null,
      durationSeconds: null,
      thumbnailUrl: input.providerVideoId ? thumbnailUrlFor(input.providerVideoId) : null,
    };
  }

  async createPlaybackSource(input: PlaybackRequest): Promise<PlaybackSource> {
    if (!input.providerVideoId) {
      throw new Error('YouTube の動画IDがありません。');
    }
    return {
      kind: 'iframe',
      url: buildEmbedUrl(input.providerVideoId, input.startSeconds ?? null, input.endSeconds ?? null),
    };
  }
}

/**
 * 貼り付けられた URL から動画IDを取り出す。
 *
 * 対応する形:
 *   https://www.youtube.com/watch?v=ID
 *   https://youtu.be/ID
 *   https://www.youtube.com/embed/ID
 *   https://www.youtube.com/live/ID
 *   ID そのまま
 */
export function extractYouTubeVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;

  // ID だけが渡された場合（11文字の英数字・ハイフン・アンダースコア）
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '');

  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0] ?? '';
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  }

  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    const v = url.searchParams.get('v');
    if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;

    const match = /^\/(embed|live|shorts)\/([A-Za-z0-9_-]{11})/.exec(url.pathname);
    if (match?.[2]) return match[2];
  }

  return null;
}

/** 仮想クリップの範囲を URL に載せる（18章 B）。 */
export function buildEmbedUrl(
  videoId: string,
  startSeconds: number | null,
  endSeconds: number | null,
): string {
  const url = new URL(`https://www.youtube-nocookie.com/embed/${videoId}`);
  if (startSeconds !== null && startSeconds > 0) {
    url.searchParams.set('start', String(Math.floor(startSeconds)));
  }
  if (endSeconds !== null && endSeconds > 0) {
    url.searchParams.set('end', String(Math.ceil(endSeconds)));
  }
  url.searchParams.set('rel', '0');
  return url.toString();
}

export function thumbnailUrlFor(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}
