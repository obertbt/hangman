/**
 * 動画配信元の抽象（24章）。
 *
 * 長時間動画は YouTube 限定公開、短編動画は R2。
 * どちらも「動画」として同じ画面から扱えるようにする。
 */

export type VideoProviderName = 'youtube' | 'r2' | 'cloudflare_stream' | 'external';

export interface VideoReference {
  provider: VideoProviderName;
  /** youtube の場合は動画ID、r2 の場合は storage key。 */
  providerVideoId: string | null;
  storageKey?: string | null;
}

export interface VideoMetadata {
  provider: VideoProviderName;
  title: string | null;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
}

export interface PlaybackRequest extends VideoReference {
  /** 仮想クリップとして再生する場合の範囲（18章）。 */
  startSeconds?: number | null;
  endSeconds?: number | null;
}

export type PlaybackSource =
  | {
      kind: 'iframe';
      /** YouTube の埋め込み URL。開始・終了位置を URL に持たせる。 */
      url: string;
    }
  | {
      kind: 'file';
      /** R2 の署名付き GET URL。期限付き（22章）。 */
      url: string;
      expiresAt: string;
      startSeconds: number | null;
      endSeconds: number | null;
    };

export interface VideoProvider {
  getMetadata(input: VideoReference): Promise<VideoMetadata>;
  createPlaybackSource(input: PlaybackRequest): Promise<PlaybackSource>;
  supportsVirtualClip(): boolean;
}
