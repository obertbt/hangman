import { expect, test } from '@playwright/test';

/**
 * 未ログイン時の振り分け（12章）。
 * 権限判定そのものは RLS が行うが、入口の振り分けもここで確認する。
 */
const PROTECTED_PATHS = [
  '/',
  '/home',
  '/timeline',
  '/timer',
  '/activities',
  '/groups',
  '/profile',
  '/settings',
];

test.describe('認証ガード', () => {
  for (const path of PROTECTED_PATHS) {
    test(`${path} は未ログインだとログイン画面へ送られる`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    });
  }

  test('ログイン後に元のページへ戻れるよう next を持つ', async ({ page }) => {
    await page.goto('/settings');
    await expect(page).toHaveURL(/next=%2Fsettings/);
  });

  test('ログインと新規登録は未ログインでも開ける', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel('メールアドレス')).toBeVisible();

    await page.goto('/signup');
    await expect(page.getByLabel('表示名')).toBeVisible();
  });
});
