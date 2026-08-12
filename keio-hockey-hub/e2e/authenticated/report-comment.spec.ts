import { expect, test } from '@playwright/test';

/**
 * 日報へのコーチのコメント（16章）。
 *
 *   選手が日報を出す → コーチが提出状況から開く → ひとこと返す
 *   → 選手が自分の日報でそれを読む
 *
 * 「フィードバックが次の練習の課題につながる」（依頼書3章の5）の、
 * 動画を使わないほうの経路。
 *
 * Supabase を用意した環境でだけ動く。
 */

const COACH_EMAIL = process.env.E2E_COACH_EMAIL ?? '';
const COACH_PASSWORD = process.env.E2E_COACH_PASSWORD ?? '';
const PLAYER_EMAIL = process.env.E2E_PLAYER_EMAIL ?? '';
const PLAYER_PASSWORD = process.env.E2E_PLAYER_PASSWORD ?? '';

async function login(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('メールアドレス').fill(email);
  await page.getByLabel('パスワード').fill(password);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await expect(page).toHaveURL(/\/today/);
}

test.describe('選手側', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!PLAYER_EMAIL || !PLAYER_PASSWORD, 'E2E_PLAYER_EMAIL / E2E_PLAYER_PASSWORD が未設定');
    await login(page, PLAYER_EMAIL, PLAYER_PASSWORD);
  });

  test('これまでの日報から1件を開ける', async ({ page }) => {
    await page.goto('/report');

    const first = page.locator('a[href^="/report/"]').first();
    if ((await first.count()) === 0) {
      test.skip(true, '過去の日報がまだない');
      return;
    }

    await first.click();
    await expect(page).toHaveURL(/\/report\/[0-9a-f-]{36}/);
    await expect(page.getByText('コーチからのコメント')).toBeVisible();
  });

  test('選手には日報にコメントする欄が出ない（16章）', async ({ page }) => {
    await page.goto('/report');

    const first = page.locator('a[href^="/report/"]').first();
    if ((await first.count()) === 0) {
      test.skip(true, '過去の日報がまだない');
      return;
    }

    await first.click();
    await expect(page.getByLabel('選手へのことば')).toHaveCount(0);
  });
});

test.describe('コーチ側', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!COACH_EMAIL || !COACH_PASSWORD, 'E2E_COACH_EMAIL / E2E_COACH_PASSWORD が未設定');
    await login(page, COACH_EMAIL, COACH_PASSWORD);
  });

  test('提出状況にこの日の日報が並ぶ', async ({ page }) => {
    await page.goto('/admin/submissions');
    await expect(page.getByText('この日の日報')).toBeVisible();
  });

  test('日報を開いてコメントを書ける', async ({ page }) => {
    await page.goto('/admin/submissions');

    const first = page.locator('a[href^="/report/"]').first();
    if ((await first.count()) === 0) {
      test.skip(true, 'この日の日報がまだない');
      return;
    }

    await first.click();
    await expect(page).toHaveURL(/\/report\/[0-9a-f-]{36}/);

    await page.getByLabel('選手へのことば').fill('切り替えが速くなっています。次は逆足も。');
    await page.getByRole('button', { name: 'コメントを書く' }).click();

    await expect(page.getByRole('status')).toContainText('コメントを書きました');
    await expect(page.getByText('切り替えが速くなっています。次は逆足も。')).toBeVisible();
  });

  test('自分の書いたコメントは取り消せる', async ({ page }) => {
    await page.goto('/admin/submissions');

    const first = page.locator('a[href^="/report/"]').first();
    if ((await first.count()) === 0) {
      test.skip(true, 'この日の日報がまだない');
      return;
    }

    await first.click();

    const remove = page.getByRole('button', { name: '取り消す' }).first();
    if ((await remove.count()) === 0) {
      test.skip(true, '自分の書いたコメントがまだない');
      return;
    }

    // 一度押しただけでは消えない（指の滑りで消えないようにしている）
    await remove.click();
    await expect(page.getByRole('button', { name: '本当に取り消す' }).first()).toBeVisible();
  });
});
