import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'オフライン' };

/**
 * 通信が切れているときに出す代わりのページ。
 * サービスワーカーが事前に持っておくため、静的に描画する。
 */
export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-lg font-medium">今は繋がっていません。</p>
      <p className="text-sm text-[--color-muted]">
        電波の届くところで、もう一度開いてみてください。
        <br />
        計測中のタイマーは、開始時刻から計算し直されるので影響ありません。
      </p>
    </div>
  );
}
