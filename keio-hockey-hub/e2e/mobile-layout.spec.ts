import { expect, test } from '@playwright/test';

/**
 * 3章「スマートフォンから素早く入力できる」。
 * 横スクロールが出る＝スマートフォンで使いにくい、とみなす。
 */
test.describe('スマートフォン幅での表示', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Chromium だけで確認する');

  for (const path of ['/login', '/reset-password', '/setup-check']) {
    test(`${path} で横スクロールが出ない`, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 740 });
      await page.goto(path);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(overflow, `${path} で横スクロールが出ている`).toBe(false);
    });
  }

  test('入力欄の文字は16px以上（iOS で勝手に拡大されない）', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/login');

    const fontSize = await page
      .getByLabel('メールアドレス')
      .evaluate((element) => window.getComputedStyle(element).fontSize);

    expect(parseFloat(fontSize)).toBeGreaterThanOrEqual(16);
  });

  test('ボタンのタップ領域が44px以上ある', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/login');

    const box = await page.getByRole('button', { name: 'ログイン' }).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });
});
