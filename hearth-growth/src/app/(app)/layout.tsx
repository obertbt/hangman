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
        <main
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
