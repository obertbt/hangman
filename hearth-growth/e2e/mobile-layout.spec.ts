import { expect, test } from '@playwright/test';

/**
 * スマートフォンでの見え方（16.2）。
 * 主な利用端末は Android スマートフォンなので、横スクロールが出ないことを守る。
 */
test.describe('スマートフォン表示', () => {
  test.skip(({ isMobile }) => !isMobile, 'モバイル端末の設定でのみ確認する');

  for (const path of ['/login', '/signup', '/reset-password']) {
    test(`${path} で横スクロールが出ない`, async ({ page }) => {
      await page.goto(path);

      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(overflows).toBe(false);
    });
  }

  test('入力欄のタップ領域が44px以上ある', async ({ page }) => {
    await page.goto('/login');

    for (const label of ['メールアドレス', 'パスワード']) {
      const box = await page.getByLabel(label).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }

    const button = await page.getByRole('button', { name: 'ログイン' }).boundingBox();
    expect(button?.height ?? 0).toBeGreaterThanOrEqual(44);
  });

  test('タップしても勝手に拡大されない文字サイズになっている', async ({ page }) => {
    await page.goto('/login');
    // iOS は 16px 未満の入力欄で自動ズームする
    const fontSize = await page
      .getByLabel('メールアドレス')
      .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(16);
  });
});
