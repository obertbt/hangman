import { expect, test } from '@playwright/test';

/**
 * 71章 E2E「Player Daily」の到達点（66章）。
 *
 *   選手ログイン → 今日 → 今週のテーマ → 今日の練習予定
 *
 * コンディション・日報・トレーニングの入力画面は Phase 4 で追加する。
 * ここでは「今日開いて、何をすべきか分かる」ところまでを確かめる。
 */

const PLAYER_EMAIL = process.env.E2E_PLAYER_EMAIL ?? '';
const PLAYER_PASSWORD = process.env.E2E_PLAYER_PASSWORD ?? '';

test.beforeEach(async ({ page }) => {
  test.skip(!PLAYER_EMAIL || !PLAYER_PASSWORD, 'E2E_PLAYER_EMAIL / E2E_PLAYER_PASSWORD が未設定');

  await page.goto('/login');
  await page.getByLabel('メールアドレス').fill(PLAYER_EMAIL);
  await page.getByLabel('パスワード').fill(PLAYER_PASSWORD);
  await page.getByRole('button', { name: 'ログイン' }).click();
});

test('ログインすると今日の画面が開く', async ({ page }) => {
  await expect(page).toHaveURL(/\/today/);
  await expect(page.getByText('残っていること')).toBeVisible();
});

test('今日の予定と今週のテーマが見える', async ({ page }) => {
  await page.goto('/today');
  await expect(page.getByText('今日の予定')).toBeVisible();
  await expect(page.getByText('今週のテーマ')).toBeVisible();
});

test('選手には管理画面の入口が出ない（62章）', async ({ page }) => {
  await page.goto('/today');
  await expect(page.getByRole('link', { name: 'データ移行' })).toHaveCount(0);
});

test('選手が管理画面を URL 直打ちしても入れない（62章）', async ({ page }) => {
  await page.goto('/admin/import');
  // requirePermission が今日の画面へ戻し、理由を伝える
  await expect(page).toHaveURL(/\/today/);
  await expect(page.getByRole('alert')).toContainText('権限がありません');
});

test('予定の詳細を開ける', async ({ page }) => {
  await page.goto('/schedule');
  const firstEvent = page.locator('a[href^="/schedule/events/"]').first();

  if ((await firstEvent.count()) > 0) {
    await firstEvent.click();
    await expect(page).toHaveURL(/\/schedule\/events\//);
  }
});
