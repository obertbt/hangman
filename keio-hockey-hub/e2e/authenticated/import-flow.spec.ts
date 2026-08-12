import { expect, test } from '@playwright/test';

/**
 * 71章 E2E「Import」。
 *
 *   管理者ログイン → Google Sheets 形式を貼り付け → 対応づけ
 *   → プレビュー → 取り込み → 名簿に表示
 *
 * Supabase を用意した環境でだけ動く（E2E_SUPABASE=1）。
 * 必要な環境変数:
 *   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD
 */

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? '';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? '';

// 実行ごとに名前を変え、前回の残りとぶつからないようにする
const suffix = Date.now().toString().slice(-6);
const PASTED = [
  '氏名\t学年\tポジション\t背番号',
  `テスト花子${suffix}\t3\tMF\t7`,
  `テスト桜${suffix}\t2\tFW\t8`,
].join('\n');

test.beforeEach(async ({ page }) => {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, 'E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD が未設定');

  await page.goto('/login');
  await page.getByLabel('メールアドレス').fill(ADMIN_EMAIL);
  await page.getByLabel('パスワード').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await expect(page).toHaveURL(/\/today/);
});

test('貼り付けから取り込みまで通しで動く', async ({ page }) => {
  await page.goto('/admin/import');

  // 貼り付け
  await page.getByLabel('貼り付け欄').fill(PASTED);
  await page.getByRole('button', { name: '内容を確認する' }).click();

  // 列マッピングが自動で埋まる
  await expect(page.getByRole('combobox', { name: '氏名 の取り込み先' })).toHaveValue('full_name');
  await expect(page.getByRole('combobox', { name: '学年 の取り込み先' })).toHaveValue('grade');

  // プレビューの集計
  await expect(page.getByText('総件数')).toBeVisible();
  await expect(page.getByText(`テスト花子${suffix}`)).toBeVisible();

  // 取り込み
  await page.getByRole('button', { name: /2 件を取り込む/ }).click();
  await expect(page.getByText('取り込みが完了しました')).toBeVisible();

  // 名簿に出る
  await page.goto('/members');
  await expect(page.getByText(`テスト花子${suffix}`)).toBeVisible();
  await expect(page.getByText(`テスト桜${suffix}`)).toBeVisible();
});

test('同じデータをもう一度入れても二重登録されない（46章）', async ({ page }) => {
  await page.goto('/admin/import');
  await page.getByLabel('貼り付け欄').fill(PASTED);
  await page.getByRole('button', { name: '内容を確認する' }).click();

  // 既定は「新規追加のみ」なので、既に居る選手は対象外になる
  await expect(page.getByText('既に登録されています').first()).toBeVisible();
});

test('エラー行があっても他の行は取り込める（45章）', async ({ page }) => {
  await page.goto('/admin/import');
  await page
    .getByLabel('貼り付け欄')
    .fill(['氏名\t学年\tポジション', `正常${suffix}\t1\tGK`, '\t2\tFW'].join('\n'));
  await page.getByRole('button', { name: '内容を確認する' }).click();

  await expect(page.getByText('エラー').first()).toBeVisible();
  // エラーが1行あっても、残りの1件は取り込める
  await expect(page.getByRole('button', { name: /1 件を取り込む/ })).toBeEnabled();
});
