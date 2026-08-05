import { describe, expect, it } from 'vitest';

import { GENERIC_ERROR_MESSAGE } from '@/features/auth/errors';

import { toGroupErrorMessage, toInvitationErrorMessage } from './errors';

describe('toInvitationErrorMessage', () => {
  it('招待が使えない理由を日本語で伝える', () => {
    expect(toInvitationErrorMessage({ message: 'invitation expired' })).toContain('有効期限');
    expect(toInvitationErrorMessage({ message: 'invitation revoked' })).toContain('無効');
    expect(toInvitationErrorMessage({ message: 'invitation exhausted' })).toContain('回数');
    expect(toInvitationErrorMessage({ message: 'invitation not found' })).toContain('見つかりません');
  });

  it('Postgres が付ける接頭辞があっても判定できる', () => {
    expect(toInvitationErrorMessage({ message: 'PostgresError: invitation expired (code P0001)' })).toContain(
      '有効期限',
    );
  });

  it('知らないエラーでは内部情報を出さない', () => {
    expect(toInvitationErrorMessage({ message: 'relation "x" does not exist' })).toBe(GENERIC_ERROR_MESSAGE);
    expect(toInvitationErrorMessage(null)).toBe(GENERIC_ERROR_MESSAGE);
  });
});

describe('toGroupErrorMessage', () => {
  it('RLS に弾かれた場合は権限不足として伝える', () => {
    expect(toGroupErrorMessage({ code: '42501' })).toContain('権限');
    expect(toGroupErrorMessage({ code: 'PGRST301' })).toContain('権限');
  });

  it('重複はその旨を伝える', () => {
    expect(toGroupErrorMessage({ code: '23505' })).toContain('すでに');
  });

  it('それ以外は一律の文言', () => {
    expect(toGroupErrorMessage({ code: '23503', message: 'FK violation on group_members' })).toBe(
      GENERIC_ERROR_MESSAGE,
    );
  });
});
