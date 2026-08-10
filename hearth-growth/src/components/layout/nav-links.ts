/**
 * 画面が狭いときの、下部ナビに載らない行き先。
 *
 * 横のナビ（SideNav）は幅が広いときしか出ない。
 * そこにしか導線が無いページは、スマートフォンの縦画面から永久に辿り着けない。
 * 実際 `/groups` がその状態だった。
 *
 * ここに挙げたものはマイページから開けるようにし、
 * 取り残しが出ていないかを `src/tests/mobile-reachability.test.ts` が見張る。
 */
export const MOBILE_EXTRA_LINKS = [
  { href: '/groups', label: 'グループ', description: '仲間と記録を共有する場所' },
  { href: '/notifications', label: 'お知らせ', description: '応援やコメントの通知' },
  { href: '/settings', label: '設定', description: 'プロフィール・カテゴリー・お知らせ' },
] as const;
