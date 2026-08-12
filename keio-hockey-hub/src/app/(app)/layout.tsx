import { BottomNav } from '@/components/layout/bottom-nav';
import { MAIN_NAV } from '@/components/layout/nav-links';
import { SideNav } from '@/components/layout/side-nav';
import { can, requireSession } from '@/lib/auth/session';
import { env } from '@/lib/env';
import { logout } from '@/features/auth/actions';
import { Button } from '@/components/ui/button';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  // 権限を持たない入口は最初から出さない。
  // ただし出さないことは権限確認ではない。実際の判定はページ側と RLS で行う。
  const links = MAIN_NAV.filter((link) => !link.permission || can(session, link.permission));

  // スマートフォンは幅が足りないので、毎日通る道だけを下に出す。
  // 出さなかったものは設定から辿れる。
  const bottomLinks = links.filter((link) => link.bottom);

  return (
    <div className="flex min-h-dvh">
      <SideNav links={links} appName={env.NEXT_PUBLIC_APP_NAME} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-[--color-border] bg-[--color-surface] px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{session.displayName}</p>
            <p className="truncate text-xs text-[--color-muted]">{session.teamName}</p>
          </div>
          <form action={logout}>
            <Button type="submit" variant="ghost" size="sm">
              ログアウト
            </Button>
          </form>
        </header>

        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5 pb-[calc(var(--bottom-nav-height)+1.5rem)] md:pb-8">
          {children}
        </main>
      </div>

      <BottomNav links={bottomLinks} />
    </div>
  );
}
