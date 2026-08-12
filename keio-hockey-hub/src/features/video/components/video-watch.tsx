'use client';

import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatSecondsToTimecode } from '@/lib/storage/validation';
import { buildEmbedUrl } from '@/lib/video/youtube';
import { cn } from '@/lib/utils/cn';
import type { VideoClipRow } from '@/types/database.types';

/**
 * 動画の再生と、仮想クリップの選択（18章 B）。
 *
 * クリップを選ぶと、その範囲だけを再生する。
 * 実ファイルは切り出していないので、切り替えは URL を変えるだけで済む。
 */
export function VideoWatch({
  providerVideoId,
  clips,
  selectedClipId,
}: {
  providerVideoId: string;
  clips: VideoClipRow[];
  /** 質問から辿ってきた場合、その場面を最初から選んでおく。 */
  selectedClipId?: string | null;
}) {
  const [selected, setSelected] = useState<VideoClipRow | null>(
    clips.find((clip) => clip.id === selectedClipId) ?? null,
  );

  const embedUrl = selected
    ? buildEmbedUrl(providerVideoId, selected.start_seconds, selected.end_seconds)
    : buildEmbedUrl(providerVideoId, null, null);

  return (
    <div className="space-y-3">
      <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
        <iframe
          // key を変えて iframe を作り直す。src だけ変えても再生位置が戻らないため。
          key={embedUrl}
          src={embedUrl}
          title="動画"
          className="size-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>

      {selected ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge tone="action">
            {formatSecondsToTimecode(selected.start_seconds)} 〜{' '}
            {formatSecondsToTimecode(selected.end_seconds)}
          </Badge>
          <span className="min-w-0 flex-1 truncate">{selected.title ?? '見てもらいたい場面'}</span>
          <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
            全体を見る
          </Button>
        </div>
      ) : null}

      {clips.length > 0 ? (
        <div>
          <p className="mb-2 text-sm font-medium">見てもらいたい場面（{clips.length}件）</p>
          <ul className="space-y-1.5">
            {clips.map((clip) => (
              <li key={clip.id}>
                <button
                  type="button"
                  onClick={() => setSelected(clip)}
                  aria-pressed={selected?.id === clip.id}
                  className={cn(
                    'flex min-h-12 w-full items-center gap-3 rounded-lg border px-3 text-left text-sm',
                    selected?.id === clip.id
                      ? 'border-keio-600 bg-keio-50 dark:bg-keio-800/40'
                      : 'border-[--color-border]',
                  )}
                >
                  <span className="shrink-0 font-mono text-xs text-[--color-muted]">
                    {formatSecondsToTimecode(clip.start_seconds)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {clip.title ?? `${formatSecondsToTimecode(clip.end_seconds - clip.start_seconds)}の場面`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
