import type { RoleCode } from '@/types/database.types';

/**
 * 権限の定義（13章）。
 *
 * role だけに権限を依存させない。
 *   1. member_permissions に明示があれば、それが最優先（granted=false は剥奪）
 *   2. 無ければ role の既定
 *
 * ここは純粋な判定だけを置く。DB 側の app.has_permission() と同じ規則にする。
 * 片方だけ直すとズレるので、変更時は必ず両方を直すこと。
 */

export const PERMISSIONS = [
  'video.upload',
  'video.view_team',
  'video.feedback_request',
  'video.feedback_answer',
  'skill.review',
  'report.view_all',
  'event.manage',
  'import.execute',
  'storage.manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<Permission, string> = {
  'video.upload': '動画を投稿する',
  'video.view_team': 'チームの動画を見る',
  'video.feedback_request': '動画で質問する',
  'video.feedback_answer': '動画の質問に答える',
  'skill.review': 'スキルを審査する',
  'report.view_all': '全員の日報を見る',
  'event.manage': '予定を管理する',
  'import.execute': 'データ移行を実行する',
  'storage.manage': '保存容量を管理する',
};

export const ROLE_LABELS: Record<RoleCode, string> = {
  system_admin: '管理者',
  coach: 'コーチ',
  manager: 'マネージャー',
  player: '選手',
};

/** 役割ごとの既定権限。migration 0009_master_data.sql と一致させる。 */
export const ROLE_PERMISSIONS: Record<RoleCode, readonly Permission[]> = {
  system_admin: PERMISSIONS,
  coach: [
    'video.upload',
    'video.view_team',
    'video.feedback_request',
    'video.feedback_answer',
    'skill.review',
    'report.view_all',
    'event.manage',
  ],
  manager: ['video.upload', 'video.view_team', 'report.view_all', 'event.manage'],
  player: ['video.upload', 'video.view_team', 'video.feedback_request'],
};

/** 個別に付与・剥奪された権限。 */
export type PermissionOverrides = Partial<Record<Permission, boolean>>;

export interface PermissionContext {
  role: RoleCode;
  overrides?: PermissionOverrides;
}

/**
 * 権限を持っているか。
 *
 * 個別設定が role より優先される。granted=false なら role が持っていても不許可。
 */
export function hasPermission(context: PermissionContext, permission: Permission): boolean {
  const override = context.overrides?.[permission];
  if (override !== undefined) return override;
  return ROLE_PERMISSIONS[context.role].includes(permission);
}

/** 実際に有効な権限をすべて並べる（設定画面の表示用）。 */
export function effectivePermissions(context: PermissionContext): Permission[] {
  return PERMISSIONS.filter((permission) => hasPermission(context, permission));
}

/** 指導側かどうか。管理画面の入口の出し分けに使う。 */
export function isStaffRole(role: RoleCode): boolean {
  return role === 'system_admin' || role === 'coach' || role === 'manager';
}

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}
