import { expect, test } from '@playwright/test';

/**
 * 71章 E2E「Video」。68章の到達点。
 *
 *   選手 → YouTube 練習動画 → 見てもらいたい場面を指定 → 質問
 *
 * コーチの回答から次回課題までは Phase 6 で足す。
 * Supabase を用意した環境でだけ動く（E2E_SUPABASE=1）。
 */

const PLAYER_EMAIL = process.env.E2E_PLAYER_EMAIL ?? '';
const PLAYER_PASSWORD = process.env.E2E_PLAYER_PASSWORD ?? '';

const suffix = Date.now().toString().slice(-6);

test.beforeEach(async ({ page }) => {
  test.skip(!PLAYER_EMAIL || !PLAYER_PASSWORD, 'E2E_PLAYER_EMAIL / E2E_PLAYER_PASSWORD が未設定');

  await page.goto('/login');
  await page.getByLabel('メールアドレス').fill(PLAYER_EMAIL);
  await page.getByLabel('パスワード').fill(PLAYER_PASSWORD);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await expect(page).toHaveURL(/\/today/);
});

test('YouTube でない URL は理由を伝えて断る', async ({ page }) => {
  await page.goto('/videos');
  await page.getByLabel('YouTube の URL').fill('https://vimeo.com/123456');
  await page.getByLabel('タイトル').fill('だめな動画');
  await page.getByRole('button', { name: '動画を登録する' }).click();

  await expect(page.getByRole('alert')).toContainText('youtube.com/watch');
});

test('動画を登録して、場面を指定して、質問できる', async ({ page }) => {
  await page.goto('/videos');

  // 1. 登録
  await page.getByLabel('YouTube の URL').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await page.getByLabel('タイトル').fill(`E2E 練習試合 ${suffix}`);
  await page.getByLabel('動画の長さ').fill('1:00:00');
  await page.getByRole('button', { name: '動画を登録する' }).click();
  await expect(page.getByRole('status')).toContainText('登録しました');

  // 2. 詳細を開く
  await page.getByRole('link', { name: new RegExp(`E2E 練習試合 ${suffix}`) }).click();
  await expect(page).toHaveURL(/\/videos\//);

  // 埋め込みプレイヤーが出る（動画本体はアプリに持たない）
  await expect(page.locator('iframe[title="動画"]')).toBeVisible();

  // 3. 見てもらいたい場面を指定する（18章の例）
  await page.getByRole('button', { name: '開く' }).first().click();
  await page.getByLabel('開始位置').fill('12:34');
  await page.getByLabel('終了位置').fill('12:48');
  await page.getByLabel('この場面の名前').fill('右サイドの1対1');
  await page.getByRole('button', { name: 'この場面を登録する' }).click();
  await expect(page.getByRole('status')).toContainText('登録しました');

  // 4. 質問する
  await page.getByLabel('聞きたいこと').selectOption('judgement');
  await page.getByLabel('質問の内容').fill('内側に運ぶべきでしたか');
  await page.getByRole('button', { name: '質問を投稿する' }).click();
  await expect(page.getByRole('status')).toContainText('投稿しました');

  // 5. 一覧に「回答待ち」として並ぶ
  await expect(page.getByText('回答待ち')).toBeVisible();
  await expect(page.getByText('内側に運ぶべきでしたか')).toBeVisible();
});

test('終了が開始より前の場面は作れない', async ({ page }) => {
  await page.goto('/videos');
  const firstVideo = page.locator('a[href^="/videos/"]').first();
  test.skip((await firstVideo.count()) === 0, '動画が1件も無い');

  await firstVideo.click();
  await page.getByRole('button', { name: '開く' }).first().click();
  await page.getByLabel('開始位置').fill('12:48');
  await page.getByLabel('終了位置').fill('12:34');
  await page.getByRole('button', { name: 'この場面を登録する' }).click();

  await expect(page.getByRole('alert')).toContainText('終了位置');
});

test('質問の公開範囲の初期値はコーチとスタッフのみ（29章）', async ({ page }) => {
  await page.goto('/videos');
  const firstVideo = page.locator('a[href^="/videos/"]').first();
  test.skip((await firstVideo.count()) === 0, '動画が1件も無い');

  await firstVideo.click();
  await expect(page.getByLabel('公開範囲')).toHaveValue('private_staff');
});
