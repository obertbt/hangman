import { expect, test } from '@playwright/test';

test.describe('ログイン画面', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('必要な入力欄がそろっている', async ({ page }) => {
    await expect(page.getByLabel('メールアドレス')).toBeVisible();
    await expect(page.getByLabel('パスワード')).toBeVisible();
    await expect(page.getByRole('button', { name: 'ログイン' })).toBeVisible();
  });

  test('メールアドレス欄はスマートフォンで適したキーボードを出す', async ({ page }) => {
    const email = page.getByLabel('メールアドレス');
    await expect(email).toHaveAttribute('type', 'email');
    await expect(email).toHaveAttribute('inputmode', 'email');
  });

  test('パスワードは伏せ字になる', async ({ page }) => {
    await expect(page.getByLabel('パスワード')).toHaveAttribute('type', 'password');
  });

  test('パスワード再設定へ行ける', async ({ page }) => {
    await page.getByRole('link', { name: 'パスワードを忘れた場合' }).click();
    await expect(page).toHaveURL(/\/reset-password/);
    await expect(page.getByRole('heading', { name: 'パスワードの再設定' })).toBeVisible();
  });

  test('日本語で表示される', async ({ page }) => {
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  });
});
