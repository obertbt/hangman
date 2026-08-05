import { BottomNav } from '@/components/layout/bottom-nav';
import { SideNav } from '@/components/layout/side-nav';

/**
 * ログイン後の共通レイアウト。
 * 認証ガードは middleware で行っているため、ここでは見た目だけを担当する。
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl">
      <SideNav />
      <div className="min-w-0 flex-1">
        {/* キーボード操作でナビゲーションを読み飛ばせるようにする */}
        <a
          href="#main"
          className="bg-ember-700 sr-only rounded-full px-4 py-2 text-white focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
        >
          本文へ移動
        </a>
        <main
          id="main"
          className="mx-auto w-full max-w-2xl px-4 pt-6"
          // 下部ナビゲーションに隠れないだけの余白を確保する
          style={{ paddingBottom: 'calc(var(--bottom-nav-height) + env(safe-area-inset-bottom) + 1rem)' }}
        >
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
