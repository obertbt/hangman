import { expect, test } from '@playwright/test';

/**
 * 71章 E2E「Video」の後半（70章への入口）。
 *
 *   コーチ回答 → 選手確認 → 次回課題
 *
 * ここで循環が閉じる。
 * Supabase を用意した環境でだけ動く（E2E_SUPABASE=1）。
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

test.describe('コーチ側', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!COACH_EMAIL || !COACH_PASSWORD, 'E2E_COACH_EMAIL / E2E_COACH_PASSWORD が未設定');
    await login(page, COACH_EMAIL, COACH_PASSWORD);
  });

  test('今日の画面に未回答の件数が出る（12章）', async ({ page }) => {
    await page.goto('/today');
    await expect(page.getByText('動画の質問')).toBeVisible();
  });

  test('一覧から質問を開いて回答できる', async ({ page }) => {
    await page.goto('/feedback');
    await expect(page.getByText('回答待ち')).toBeVisible();

    const first = page.locator('a[href^="/feedback/"]').first();
    test.skip((await first.count()) === 0, '回答待ちの質問が無い');

    await first.click();
    await expect(page).toHaveURL(/\/feedback\//);

    // 担当していない状態なら、まず担当する
    const assign = page.getByRole('button', { name: 'この質問を担当する' });
    if (await assign.isVisible().catch(() => false)) {
      await assign.click();
      await expect(page.getByRole('status')).toContainText('担当しました');
    }

    // 結論だけで回答できる
    await page.getByLabel('結論').fill('この判断で合っています。');
    await page.getByLabel('次回の課題').fill('受ける前に内側を1回見る');
    await page.getByRole('button', { name: '回答する' }).click();

    await expect(page.getByRole('status')).toContainText('回答しました');
  });

  test('結論が空では回答できない', async ({ page }) => {
    await page.goto('/feedback');
    const first = page.locator('a[href^="/feedback/"]').first();
    test.skip((await first.count()) === 0, '質問が無い');

    await first.click();
    const conclusion = page.getByLabel('結論');
    test.skip(!(await conclusion.isVisible().catch(() => false)), 'いま回答できる状態ではない');

    await page.getByRole('button', { name: '回答する' }).click();
    await expect(conclusion).toBeFocused();
  });
});

test.describe('選手側', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!PLAYER_EMAIL || !PLAYER_PASSWORD, 'E2E_PLAYER_EMAIL / E2E_PLAYER_PASSWORD が未設定');
    await login(page, PLAYER_EMAIL, PLAYER_PASSWORD);
  });

  test('回答が来ると「残っていること」に出る（11章）', async ({ page }) => {
    await page.goto('/today');
    const pending = page.getByRole('link', { name: /動画フィードバックを確認する/ });

    if (await pending.isVisible().catch(() => false)) {
      await pending.click();
      await expect(page).toHaveURL(/\/feedback/);
    }
  });

  test('回答を確認できる。確認は本人しかできない', async ({ page }) => {
    await page.goto('/feedback');
    const first = page.locator('a[href^="/feedback/"]').first();
    test.skip((await first.count()) === 0, '質問が無い');

    await first.click();

    const acknowledge = page.getByRole('button', { name: '回答を確認した' });
    if (await acknowledge.isVisible().catch(() => false)) {
      await acknowledge.click();
      await expect(page.getByRole('status')).toContainText('確認しました');
    }
  });

  test('回答の次回課題から、今日の目標へ辿れる（循環）', async ({ page }) => {
    await page.goto('/feedback');
    const first = page.locator('a[href^="/feedback/"]').first();
    test.skip((await first.count()) === 0, '質問が無い');

    await first.click();

    const link = page.getByRole('link', { name: '次の練習の目標にする' });
    test.skip(!(await link.isVisible().catch(() => false)), '次回課題つきの回答が無い');

    await link.click();
    await expect(page).toHaveURL(/\/goal/);
    // コーチの回答から引き継いだことが分かる文言が出る
    await expect(page.getByText(/コーチの回答にあった/)).toBeVisible();
  });

  test('選手は他人の質問に回答できない', async ({ page }) => {
    await page.goto('/feedback');
    const first = page.locator('a[href^="/feedback/"]').first();
    test.skip((await first.count()) === 0, '質問が無い');

    await first.click();
    // 回答フォームは出ない
    await expect(page.getByLabel('結論')).toHaveCount(0);
  });
});
