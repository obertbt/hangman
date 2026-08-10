import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { NAV_ITEMS } from '@/components/layout/bottom-nav';
import { MOBILE_EXTRA_LINKS } from '@/components/layout/nav-links';

/**
 * スマートフォンの縦画面から、すべての画面へ辿り着けること。
 *
 * 横のナビ（SideNav）は幅が広いときしか出ない。
 * そこにしか導線が無いページは、スマートフォンでは永久に開けない。
 * 実際 `/groups` がその状態で、利用者に指摘されるまで気づけなかった。
 *
 * 画面を足したときに同じことが起きないよう、ここで機械的に見張る。
 */
const appDir = join(process.cwd(), 'src', 'app', '(app)');

/** `(app)` 配下の静的なルートを集める。動的セグメントは除く。 */
function staticRoutes(dir: string, prefix = ''): string[] {
  const routes: string[] = [];

  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (!statSync(full).isDirectory()) continue;
    // [id] のような動的セグメントは、一覧から辿るものなので対象外
    if (entry.startsWith('[')) continue;
    // (group) のようなルートグループは URL に出ない
    const segment = entry.startsWith('(') ? '' : `/${entry}`;

    if (readdirSync(full).includes('page.tsx')) {
      routes.push(`${prefix}${segment}`);
    }
    routes.push(...staticRoutes(full, `${prefix}${segment}`));
  }

  return routes;
}

/**
 * 下部ナビにも「そのほか」にも載せないもの。
 * ここに足すときは、狭い画面での導線がどこにあるかを書くこと。
 */
const ALLOWED_WITHOUT_NAV: Record<string, string> = {
  // タイマーを終えた直後にだけ開く。自分で開く画面ではない。
  '/timer/finish': 'タイマー終了後に自動で遷移する',
};

describe('狭い画面からの導線', () => {
  const routes = staticRoutes(appDir);

  it('(app) の画面を拾えている', () => {
    expect(routes).toContain('/home');
    expect(routes).toContain('/groups');
    expect(routes.length).toBeGreaterThan(5);
  });

  it('すべての画面が、下部ナビか「そのほか」から開ける', () => {
    const reachable = new Set<string>([
      ...NAV_ITEMS.map((item) => item.href as string),
      ...MOBILE_EXTRA_LINKS.map((link) => link.href as string),
      ...Object.keys(ALLOWED_WITHOUT_NAV),
    ]);

    const unreachable = routes.filter((route) => !reachable.has(route));
    expect(unreachable).toEqual([]);
  });

  it('「そのほか」の行き先が実在する', () => {
    for (const link of MOBILE_EXTRA_LINKS) {
      expect(routes).toContain(link.href);
    }
  });
});
