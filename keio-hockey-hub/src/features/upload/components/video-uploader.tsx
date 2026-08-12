'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field, FormMessage, TextInput } from '@/components/ui/field';
import { completeVideoUpload, startVideoUpload } from '@/features/upload/actions';
import { formatBytes } from '@/lib/storage/validation';

/**
 * 短編動画の投稿（20章）。
 *
 * 動画本体はサーバーを通さず、ブラウザから R2 へ直接送る。
 * 進み具合が見えないと「固まった」と思われるので、必ず割合を出す。
 *
 * ブラウザ側でも長さと容量を確かめるが、それは親切のため。
 * 本当の判定はサーバー側（startVideoUpload）で行う。
 */

type Phase = 'idle' | 'checking' | 'uploading' | 'finishing' | 'done';

interface Selected {
  file: File;
  durationSeconds: number | null;
}

/** 選んだ動画の長さを、再生せずに読み取る。 */
function readDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';

    const cleanup = () => URL.revokeObjectURL(url);

    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : null;
      cleanup();
      resolve(duration);
    };
    video.onerror = () => {
      cleanup();
      resolve(null);
    };

    video.src = url;
  });
}

/** R2 へ直接送る。進み具合を知りたいので fetch ではなく XHR を使う。 */
function putToStorage(
  url: string,
  headers: Record<string, string>,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', url);

    for (const [name, value] of Object.entries(headers)) {
      request.setRequestHeader(name, value);
    }

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        resolve();
      } else {
        reject(new Error(`保存先が受け付けませんでした（${request.status}）`));
      }
    };
    request.onerror = () => reject(new Error('通信に失敗しました'));
    request.ontimeout = () => reject(new Error('時間内に送りきれませんでした'));

    request.send(file);
  });
}

export function VideoUploader({ maxSeconds, maxBytes }: { maxSeconds: number; maxBytes: number }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [selected, setSelected] = useState<Selected | null>(null);
  const [title, setTitle] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function handleSelect(file: File) {
    setError(null);
    setPhase('checking');

    const durationSeconds = await readDuration(file);

    // ここでの確認は親切のため。サーバー側でも必ず確かめる。
    if (durationSeconds !== null && durationSeconds > maxSeconds) {
      setError(
        `動画が長すぎます（上限 ${maxSeconds}秒、選んだもの ${Math.round(durationSeconds)}秒）。見てもらいたい場面だけを切り出してください。`,
      );
      setPhase('idle');
      setSelected(null);
      return;
    }

    if (file.size > maxBytes) {
      setError(
        `ファイルが大きすぎます（上限 ${formatBytes(maxBytes)}、選んだもの ${formatBytes(file.size)}）。`,
      );
      setPhase('idle');
      setSelected(null);
      return;
    }

    setSelected({ file, durationSeconds });
    setPhase('idle');
  }

  async function handleUpload() {
    if (!selected) return;

    setError(null);
    setPercent(0);
    setPhase('uploading');

    const started = await startVideoUpload({
      filename: selected.file.name,
      mimeType: selected.file.type,
      sizeBytes: selected.file.size,
      durationSeconds: selected.durationSeconds,
    });

    if (started.error || !started.upload) {
      setError(started.error ?? 'アップロードを開始できませんでした。');
      setPhase('idle');
      return;
    }

    try {
      await putToStorage(started.upload.url, started.upload.headers, selected.file, setPercent);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '送信に失敗しました。');
      setPhase('idle');
      return;
    }

    setPhase('finishing');

    const completed = await completeVideoUpload({
      sessionId: started.upload.sessionId,
      title,
      durationSeconds: selected.durationSeconds,
    });

    if (completed.error || !completed.videoId) {
      setError(completed.error ?? '登録できませんでした。');
      setPhase('idle');
      return;
    }

    setPhase('done');
    router.push(`/videos/${completed.videoId}`);
  }

  const busy = phase === 'uploading' || phase === 'finishing' || phase === 'checking';

  return (
    <Card>
      <CardHeader
        title="スマートフォンから動画を投稿する"
        description={`${maxSeconds}秒以内・${formatBytes(maxBytes)}以内。15〜30秒に絞ると、返ってくる答えが具体的になります。`}
      />

      <div className="space-y-4">
        {error ? <FormMessage tone="error">{error}</FormMessage> : null}

        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/webm"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleSelect(file);
          }}
        />

        <Button variant="outline" block onClick={() => inputRef.current?.click()} disabled={busy}>
          {phase === 'checking' ? '確認しています…' : '動画を選ぶ'}
        </Button>

        {selected ? (
          <>
            <dl className="space-y-1 rounded-lg border border-[--color-border] px-3 py-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-[--color-muted]">長さ</dt>
                <dd>
                  {selected.durationSeconds !== null
                    ? `${Math.round(selected.durationSeconds)}秒`
                    : '読み取れませんでした'}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[--color-muted]">容量</dt>
                <dd>{formatBytes(selected.file.size)}</dd>
              </div>
            </dl>

            <Field label="この動画の名前" htmlFor="title" hint="後から探しやすくなります">
              <TextInput
                id="title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="インドドリブルの練習"
                disabled={busy}
              />
            </Field>

            {phase === 'uploading' ? (
              <div>
                <div
                  className="bg-keio-100 dark:bg-keio-800 h-2 w-full overflow-hidden rounded-full"
                  role="progressbar"
                  aria-valuenow={percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="アップロードの進み具合"
                >
                  <div className="bg-action-600 h-full transition-[width]" style={{ width: `${percent}%` }} />
                </div>
                <p className="mt-1 text-xs text-[--color-muted]">送っています… {percent}%</p>
              </div>
            ) : null}

            {phase === 'finishing' ? (
              <p className="text-sm text-[--color-muted]">保存先に届いたか確認しています…</p>
            ) : null}

            <Button variant="action" block size="lg" onClick={() => void handleUpload()} disabled={busy}>
              {phase === 'uploading' || phase === 'finishing' ? '処理しています…' : 'この動画を投稿する'}
            </Button>
          </>
        ) : null}

        <p className="text-xs text-[--color-muted]">
          動画はこのシステムのサーバーを通らず、保存先へ直接送られます。
          投稿した動画は、はじめはコーチとスタッフだけが見られます。
        </p>
      </div>
    </Card>
  );
}
