import { BottomNav } from '@/components/layout/bottom-nav';
import { SideNav } from '@/components/layout/side-nav';
import { NotificationBell } from '@/features/notifications/components/notification-bell';
import { countUnreadNotifications } from '@/features/notifications/queries';

/**
 * ログイン後の共通レイアウト。
 * 認証ガードは proxy で行っているため、ここでは見た目だけを担当する。
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const unreadCount = await countUnreadNotifications();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl">
      <SideNav unreadCount={unreadCount} />
      <div className="min-w-0 flex-1">
        {/* キーボード操作でナビゲーションを読み飛ばせるようにする */}
        <a
          href="#main"
          className="bg-ember-700 sr-only rounded-full px-4 py-2 text-white focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
        >
          本文へ移動
        </a>
        {/*
         * 下部ナビは5つで埋まっているので、ベルは上に置く。
         * 画面が広いときは横のナビに出るため、こちらは隠す。
         */}
        <div className="flex items-center justify-between px-4 pt-2 md:hidden">
          <p className="text-sm font-bold">Hearth Growth</p>
          <NotificationBell unreadCount={unreadCount} />
        </div>
        <main
          id="main"
          // 上のベル行がある幅では、その下に重ねて余白を取り過ぎない
          className="mx-auto w-full max-w-2xl px-4 pt-4 md:pt-6"
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
