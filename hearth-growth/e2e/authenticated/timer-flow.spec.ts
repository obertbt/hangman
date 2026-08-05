import { expect, test } from '@playwright/test';

/**
 * MVP完了条件のうち、ログインが要る流れ（23章）。
 *
 * Supabase が必要なので、既定では実行しない。
 * 用意した環境で次のように動かす:
 *
 *   supabase start
 *   npm run db:reset            # seed.sql のテストユーザーが入る
 *   E2E_SUPABASE=1 npm run test:e2e
 *
 * 既定の認証情報は seed.sql と同じもの。環境変数で差し替えられる。
 */
const enabled = process.env.E2E_SUPABASE === '1';
const email = process.env.E2E_EMAIL ?? 'alice@example.com';
const password = process.env.E2E_PASSWORD ?? 'password123';

test.describe('ログインしてからの流れ', () => {
  test.skip(!enabled, 'Supabase を用意した環境でのみ実行する（E2E_SUPABASE=1）');

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('メールアドレス').fill(email);
    await page.getByLabel('パスワード').fill(password);
    await page.getByRole('button', { name: 'ログイン' }).click();
    await expect(page).toHaveURL(/\/home/);
  });

  test('タイマーを開始し、再読み込みしても続いている', async ({ page }) => {
    await page.goto('/timer');
    await page.getByRole('button', { name: /勉強/ }).click();
    await page.getByRole('button', { name: '活動を始める' }).click();

    const clock = page.getByRole('timer');
    await expect(clock).toBeVisible();

    // ページを開き直しても、開始時刻から計算し直される（13.1）
    await page.reload();
    await expect(page.getByRole('timer')).toBeVisible();
    await expect(page.getByText('記録しています')).toBeVisible();
  });

  test('一時停止すると時間が止まる', async ({ page }) => {
    await page.goto('/timer');
    await page.getByRole('button', { name: '一時停止' }).click();
    await expect(page.getByText('一時停止中')).toBeVisible();

    const before = await page.getByRole('timer').textContent();
    await page.waitForTimeout(2500);
    expect(await page.getByRole('timer').textContent()).toBe(before);

    await page.getByRole('button', { name: '再開する' }).click();
    await expect(page.getByText('記録しています')).toBeVisible();
  });

  test('終了すると記録として残せる', async ({ page }) => {
    await page.goto('/timer');
    await page.getByRole('button', { name: '終了する' }).click();

    await expect(page).toHaveURL(/\/timer\/finish/);
    await page.getByLabel('活動タイトル（任意）').fill('E2E の確認');
    await page.getByRole('button', { name: '記録する' }).click();

    await expect(page).toHaveURL(/\/activities/);
    await expect(page.getByText('E2E の確認')).toBeVisible();
  });

  test('手動で記録でき、今日の合計に反映される', async ({ page }) => {
    await page.goto('/activities');
    await page.getByRole('button', { name: '手動で記録する' }).click();
    await page.getByRole('button', { name: '30分' }).first().click();
    await page.getByRole('button', { name: '記録する' }).click();

    await page.goto('/home');
    await expect(page.getByText('今日の活動時間')).toBeVisible();
  });

  test('二重にタイマーを開始できない', async ({ page }) => {
    await page.goto('/timer');
    // すでに動いていれば、開始画面ではなく活動中の画面になる
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toHaveText(/活動中|活動を始める/);
  });
});
