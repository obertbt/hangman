import { Card } from '@/components/ui/card';

/**
 * ログイン後の画面の読み込み中。
 * 中身のない枠を出して、切り替わったときに位置が飛ばないようにする。
 */
export default function AppLoading() {
  return (
    <div className="space-y-4" aria-busy="true">
      <p className="sr-only" role="status">
        読み込んでいます
      </p>
      <div className="bg-hearth-100 h-7 w-40 animate-pulse rounded" aria-hidden />
      <div className="grid grid-cols-2 gap-3" aria-hidden>
        <Card className="h-24 animate-pulse" />
        <Card className="h-24 animate-pulse" />
      </div>
      <Card className="h-40 animate-pulse" aria-hidden />
    </div>
  );
}
