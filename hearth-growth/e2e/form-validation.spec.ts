import { expect, test } from '@playwright/test';

/**
 * 入力検証。
 * ここで見ているのはクライアント側の案内で、権限や整合性の保証ではない。
 * サーバー側でも同じスキーマで検証している。
 */
test.describe('入力検証', () => {
  test('空のままログインしようとすると、何を入れるべきか出る', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'ログイン' }).click();

    await expect(page.getByText('メールアドレスを入力してください')).toBeVisible();
    await expect(page.getByText('パスワードを入力してください')).toBeVisible();
  });

  test('メールアドレスの形が違うと知らせる', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('メールアドレス').fill('not-an-email');
    await page.getByLabel('パスワード').fill('password123');
    await page.getByRole('button', { name: 'ログイン' }).click();

    await expect(page.getByText('メールアドレスの形式が正しくありません')).toBeVisible();
  });

  test('短いパスワードでは登録できない', async ({ page }) => {
    await page.goto('/signup');
    await page.getByLabel('表示名').fill('あさひ');
    await page.getByLabel('メールアドレス').fill('a@example.com');
    await page.getByLabel('パスワード').fill('short');
    await page.getByRole('button', { name: '登録する' }).click();

    await expect(page.getByText('パスワードは8文字以上にしてください')).toBeVisible();
  });

  test('壊れた招待リンクは、その旨だけを伝える', async ({ page }) => {
    await page.goto('/invite/short');
    await expect(page.getByText('この招待リンクは正しくありません')).toBeVisible();
  });
});
