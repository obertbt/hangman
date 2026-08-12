import type { Metadata } from 'next';
import Link from 'next/link';

import { Card, CardHeader } from '@/components/ui/card';
import { VideoUploader } from '@/features/upload/components/video-uploader';
import { requirePermission } from '@/lib/auth/session';
import { limits } from '@/lib/env';
import { isStorageConfigured } from '@/lib/storage/r2';

export const metadata: Metadata = { title: '動画を投稿する' };

export default async function VideoUploadPage() {
  await requirePermission('video.upload');
  const configured = isStorageConfigured();

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <Link href="/videos" className="text-keio-700 dark:text-keio-300 underline">
          ← 動画一覧へ戻る
        </Link>
      </p>

      <header>
        <h1 className="text-xl font-bold">動画を投稿する</h1>
        <p className="mt-1 text-sm text-[--color-muted]">
          自主練や、切り抜いた短い動画をそのまま投稿できます。
        </p>
      </header>

      {configured ? (
        <VideoUploader maxSeconds={limits.maxVideoDurationSeconds} maxBytes={limits.maxVideoSizeBytes} />
      ) : (
        <Card>
          <CardHeader title="まだ使えません" />
          <p className="text-sm">
            動画の保存先（Cloudflare R2）が設定されていません。 管理者に連絡してください。
          </p>
          <p className="mt-2 text-sm">
            <Link href="/setup-check" className="text-keio-700 dark:text-keio-300 underline">
              設定の状況を確認する
            </Link>
          </p>
        </Card>
      )}

      <Card>
        <CardHeader title="長い動画を見てもらいたいときは" />
        <p className="text-sm">
          練習や試合の全体動画は、YouTube に限定公開でアップロードしてから
          <Link href="/videos" className="text-keio-700 dark:text-keio-300 mx-1 underline">
            動画一覧
          </Link>
          で登録してください。見てもらいたい場面だけを指定して質問できます。
        </p>
        <p className="mt-2 text-xs text-[--color-muted]">
          長時間の動画をこのシステムに保存しないのは、容量の増えかたを抑えるためです。
        </p>
      </Card>
    </div>
  );
}
