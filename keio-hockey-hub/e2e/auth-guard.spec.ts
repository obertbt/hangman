import { expect, test } from '@playwright/test';

/**
 * 62章「URL 直打ちでも権限回避不可」の入口部分。
 *
 * ここで確かめるのは「未ログインなら中に入れない」こと。
 * 権限そのものの確認は RLS テスト（supabase/tests/rls_test.sql）で行う。
 */

const PROTECTED_PATHS = [
  '/today',
  '/schedule',
  '/members',
  '/settings',
  '/condition',
  '/goal',
  '/report',
  '/training',
  '/admin/import',
  '/admin/submissions',
];

for (const path of PROTECTED_PATHS) {
  test(`未ログインで ${path} を開くとログイン画面へ送られる`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
    // 元のページへ戻れるように next が付く
    await expect(page).toHaveURL(new RegExp(`next=${encodeURIComponent(path).replace(/%2F/g, '%2F')}`));
  });
}

test('入口（/）は未ログインならログインへ送られる', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
});

test('ログイン画面は未ログインでも開ける', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'ログイン' })).toBeVisible();
});

test('設定の自己診断はログイン前でも開ける', async ({ page }) => {
  await page.goto('/setup-check');
  await expect(page.getByRole('heading', { name: '接続設定の確認' })).toBeVisible();
});

test('自己診断ページに秘密の値を出さない', async ({ page }) => {
  await page.goto('/setup-check');
  const body = (await page.textContent('body')) ?? '';
  // 「設定済み / 未設定」だけを出し、値そのものは出さない
  expect(body).not.toContain('eyJ'); // JWT の始まり
  expect(body).toMatch(/設定済み|未設定/);
});
