import { describe, expect, it } from 'vitest';

import {
  ROLE_PERMISSIONS,
  effectivePermissions,
  hasPermission,
  isPermission,
  isStaffRole,
} from './permissions';

describe('hasPermission', () => {
  it('役割の既定権限を許可する', () => {
    expect(hasPermission({ role: 'coach' }, 'video.feedback_answer')).toBe(true);
    expect(hasPermission({ role: 'player' }, 'video.feedback_request')).toBe(true);
  });

  it('役割が持たない権限は拒否する', () => {
    expect(hasPermission({ role: 'player' }, 'video.feedback_answer')).toBe(false);
    expect(hasPermission({ role: 'player' }, 'event.manage')).toBe(false);
    expect(hasPermission({ role: 'coach' }, 'import.execute')).toBe(false);
  });

  it('管理者はすべての権限を持つ', () => {
    expect(effectivePermissions({ role: 'system_admin' })).toEqual([...ROLE_PERMISSIONS.system_admin]);
    expect(hasPermission({ role: 'system_admin' }, 'import.execute')).toBe(true);
    expect(hasPermission({ role: 'system_admin' }, 'storage.manage')).toBe(true);
  });

  it('個別付与は役割より優先される', () => {
    // 50章: import.execute を明示的に持たせたコーチ
    expect(hasPermission({ role: 'coach', overrides: { 'import.execute': true } }, 'import.execute')).toBe(
      true,
    );
  });

  it('個別剥奪は役割より優先される', () => {
    expect(
      hasPermission(
        { role: 'coach', overrides: { 'video.feedback_answer': false } },
        'video.feedback_answer',
      ),
    ).toBe(false);
  });

  it('関係のない個別設定は他の権限に影響しない', () => {
    const context = { role: 'player', overrides: { 'import.execute': true } } as const;
    expect(hasPermission(context, 'import.execute')).toBe(true);
    expect(hasPermission(context, 'event.manage')).toBe(false);
  });
});

describe('isStaffRole', () => {
  it('指導側を判別する', () => {
    expect(isStaffRole('system_admin')).toBe(true);
    expect(isStaffRole('coach')).toBe(true);
    expect(isStaffRole('manager')).toBe(true);
    expect(isStaffRole('player')).toBe(false);
  });
});

describe('isPermission', () => {
  it('未知の権限コードを弾く', () => {
    expect(isPermission('video.upload')).toBe(true);
    expect(isPermission('video.delete_everything')).toBe(false);
  });
});

describe('マネージャーの権限範囲', () => {
  it('予定は管理できるが、回答や承認はできない', () => {
    expect(hasPermission({ role: 'manager' }, 'event.manage')).toBe(true);
    expect(hasPermission({ role: 'manager' }, 'report.view_all')).toBe(true);
    expect(hasPermission({ role: 'manager' }, 'video.feedback_answer')).toBe(false);
    expect(hasPermission({ role: 'manager' }, 'skill.review')).toBe(false);
  });
});
