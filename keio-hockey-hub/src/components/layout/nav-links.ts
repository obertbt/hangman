import {
  Award,
  Bell,
  CalendarDays,
  ClipboardList,
  Database,
  HardDrive,
  ListChecks,
  Home,
  MessageCircle,
  Ruler,
  ScrollText,
  Settings,
  Users,
  Video,
} from 'lucide-react';

import type { Permission } from '@/lib/auth/permissions';

export interface NavLink {
  href: string;
  label: string;
  icon: typeof Home;
  /** この権限を持つ人にだけ見せる。 */
  permission?: Permission;
  /**
   * スタッフ（管理者・コーチ・マネージャー）にだけ見せる。
   *
   * 監査ログのように「特定の権限」ではなく立場で決まるものに使う。
   * RLS 側も同じ条件（app.is_staff）で守っている。
   */
  staffOnly?: boolean;
  /**
   * スマートフォンの下部ナビゲーションに出すか。
   *
   * 画面幅 360px で1つあたり 60px しか取れないため、6つが上限。
   * 毎日通る道（循環）だけを残し、それ以外は設定から辿れるようにする。
   */
  bottom?: boolean;
}

/**
 * 下部ナビゲーション（モバイル）と横のナビゲーション（PC）で同じ定義を使う。
 * 選手が最初に開くのは常に「今日」。
 */
export const MAIN_NAV: NavLink[] = [
  { href: '/today', label: '今日', icon: Home, bottom: true },
  { href: '/schedule', label: '予定', icon: CalendarDays, bottom: true },
  { href: '/videos', label: '動画', icon: Video, permission: 'video.view_team', bottom: true },
  { href: '/feedback', label: '質問', icon: MessageCircle, bottom: true },
  { href: '/skills', label: 'スキル', icon: Award, bottom: true },
  { href: '/measurements', label: '測定', icon: Ruler },
  { href: '/notifications', label: 'お知らせ', icon: Bell },
  { href: '/members', label: '名簿', icon: Users },
  { href: '/admin/skills', label: 'スキル定義', icon: ListChecks, permission: 'skill.review' },
  { href: '/admin/export', label: '書き出し', icon: Database },
  { href: '/admin/import', label: 'データ移行', icon: ClipboardList, permission: 'import.execute' },
  { href: '/admin/storage', label: '保存容量', icon: HardDrive, permission: 'storage.manage' },
  { href: '/admin/audit', label: '操作の記録', icon: ScrollText, staffOnly: true },
  { href: '/settings', label: '設定', icon: Settings, bottom: true },
];
