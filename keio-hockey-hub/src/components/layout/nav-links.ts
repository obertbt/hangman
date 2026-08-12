import { CalendarDays, ClipboardList, Home, Settings, Users, Video } from 'lucide-react';

import type { Permission } from '@/lib/auth/permissions';

export interface NavLink {
  href: string;
  label: string;
  icon: typeof Home;
  /** この権限を持つ人にだけ見せる。 */
  permission?: Permission;
}

/**
 * 下部ナビゲーション（モバイル）と横のナビゲーション（PC）で同じ定義を使う。
 * 選手が最初に開くのは常に「今日」。
 */
export const MAIN_NAV: NavLink[] = [
  { href: '/today', label: '今日', icon: Home },
  { href: '/schedule', label: '予定', icon: CalendarDays },
  { href: '/videos', label: '動画', icon: Video, permission: 'video.view_team' },
  { href: '/members', label: '名簿', icon: Users },
  { href: '/admin/import', label: 'データ移行', icon: ClipboardList, permission: 'import.execute' },
  { href: '/settings', label: '設定', icon: Settings },
];
