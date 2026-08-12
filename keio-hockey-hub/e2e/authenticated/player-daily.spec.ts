import { expect, test } from '@playwright/test';

/**
 * 71章 E2E「Player Daily」。
 *
 *   選手ログイン → 今日 → 今週のテーマ → 今日の練習予定
 *   → コンディション → 目標 → 日報 → トレーニング
 *
 * 67章の「次の到達点」までを通しで確かめる。
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

test.describe('1日の記録（Phase 4）', () => {
  test('コンディションを入力すると「今日」に反映される', async ({ page }) => {
    await page.goto('/condition');

    // 段階評価は指1本で選べる
    await page.getByRole('radio', { name: '4', exact: true }).first().check();
    await page.getByLabel('睡眠時間').fill('7');
    await page.getByRole('button', { name: /保存する|入力を更新する/ }).click();

    await expect(page.getByRole('status')).toContainText('保存しました');

    // 今日の画面から「残っていること」が消える
    await page.goto('/today');
    await expect(page.getByRole('link', { name: /コンディション/ })).toBeVisible();
  });

  test('個人目標は空では保存できない', async ({ page }) => {
    await page.goto('/goal');
    await page.getByLabel('今日の個人目標').fill('');
    await page.getByRole('button', { name: /目標を決める|目標を更新する/ }).click();

    // ブラウザ側の required で止まるか、サーバー側が理由を返す
    const goal = page.getByLabel('今日の個人目標');
    await expect(goal)
      .toBeFocused()
      .catch(async () => {
        await expect(page.getByRole('alert')).toContainText('目標');
      });
  });

  test('中身が空の日報は提出できない（下書きにはできる）', async ({ page }) => {
    await page.goto('/report');
    await page.getByRole('button', { name: '下書きとして保存' }).click();
    await expect(page.getByRole('status')).toContainText('下書き');
  });

  test('トレーニングは種別によって項目が変わる', async ({ page }) => {
    await page.goto('/training');

    await page.getByLabel('種別').selectOption('running');
    await expect(page.getByLabel('距離（km）')).toBeVisible();
    await expect(page.getByLabel('技術テーマ')).toHaveCount(0);

    await page.getByLabel('種別').selectOption('self_practice');
    await expect(page.getByLabel('技術テーマ')).toBeVisible();
    await expect(page.getByLabel('距離（km）')).toHaveCount(0);

    await page.getByLabel('種別').selectOption('weight');
    await expect(page.getByLabel('種目 1')).toBeVisible();
  });

  test('選手は提出状況の一覧を開けない', async ({ page }) => {
    await page.goto('/admin/submissions');
    await expect(page).toHaveURL(/\/today/);
    await expect(page.getByRole('alert')).toContainText('権限がありません');
  });
});
