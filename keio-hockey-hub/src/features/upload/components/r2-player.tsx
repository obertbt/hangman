'use client';

import { useEffect, useRef, useState } from 'react';

import { getPlaybackUrl } from '@/features/upload/actions';

/**
 * R2 に置いた動画の再生（22章）。
 *
 * 署名付き URL は DB に保存せず、開くたびに発行する。
 * 期限（既定15分）が切れたら取り直す。
 */
export function R2Player({ videoId }: { videoId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let cancelled = false;

    void getPlaybackUrl(videoId).then((result) => {
      if (cancelled) return;
      if (result.error || !result.url) {
        setError(result.error ?? '再生できませんでした。');
        return;
      }
      setError(null);
      setUrl(result.url);
    });

    return () => {
      cancelled = true;
    };
  }, [videoId, reloadKey]);

  if (error) {
    return (
      <div className="rounded-lg border border-[--color-border] px-3 py-6 text-center">
        <p className="text-sm text-[--color-muted]">{error}</p>
        <button
          type="button"
          onClick={() => setReloadKey((value) => value + 1)}
          className="text-keio-700 dark:text-keio-300 mt-2 text-sm underline"
        >
          もう一度読み込む
        </button>
      </div>
    );
  }

  if (!url) {
    return <div className="bg-keio-100 dark:bg-keio-800 aspect-video w-full animate-pulse rounded-lg" />;
  }

  return (
    <video
      ref={videoRef}
      src={url}
      controls
      playsInline
      className="aspect-video w-full rounded-lg bg-black"
      // 期限が切れた状態で再生しようとした場合、取り直せるようにする
      onError={() => setError('再生用のリンクの期限が切れたようです。')}
    />
  );
}
