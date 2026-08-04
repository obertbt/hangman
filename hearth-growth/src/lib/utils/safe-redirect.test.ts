import { describe, expect, it } from 'vitest';

import { safeRedirectPath } from './safe-redirect';

describe('safeRedirectPath', () => {
  it('自サイト内のパスはそのまま通す', () => {
    expect(safeRedirectPath('/timeline')).toBe('/timeline');
    expect(safeRedirectPath('/groups/abc?tab=members')).toBe('/groups/abc?tab=members');
  });

  it('未指定なら既定の遷移先', () => {
    expect(safeRedirectPath(undefined)).toBe('/home');
    expect(safeRedirectPath(null)).toBe('/home');
    expect(safeRedirectPath('')).toBe('/home');
  });

  it('外部サイトへのリダイレクトを弾く', () => {
    expect(safeRedirectPath('https://example.com')).toBe('/home');
    expect(safeRedirectPath('//example.com')).toBe('/home');
    expect(safeRedirectPath('/\\example.com')).toBe('/home');
    expect(safeRedirectPath('javascript:alert(1)')).toBe('/home');
  });

  it('改行を含む値を弾く（ヘッダー分割の回避）', () => {
    expect(safeRedirectPath('/home\nLocation: https://example.com')).toBe('/home');
  });

  it('既定の遷移先を指定できる', () => {
    expect(safeRedirectPath('https://example.com', '/login')).toBe('/login');
  });
});
