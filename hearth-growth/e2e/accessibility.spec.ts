import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * アクセシビリティ（22章 Phase 8）。
 * ログイン前に見える画面を対象に、機械的に見つかる問題を拾う。
 */
const PUBLIC_PAGES = ['/login', '/signup', '/reset-password', '/invite/short'];

test.describe('アクセシビリティ', () => {
  for (const path of PUBLIC_PAGES) {
    test(`${path} に重大な違反がない`, async ({ page }) => {
      await page.goto(path);

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      // 見つかった内容が分かるように、違反の要約を残す
      const summary = results.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        nodes: violation.nodes.length,
      }));

      expect(summary).toEqual([]);
    });
  }

  test('ページに言語が指定されている', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  });

  test('キーボードだけで入力欄へたどり着ける', async ({ page }) => {
    await page.goto('/login');
    await page.keyboard.press('Tab');

    // 最初の Tab で操作できる要素に移る（フォーカスが body に留まらない）
    const tag = await page.evaluate(() => document.activeElement?.tagName);
    expect(tag).not.toBe('BODY');
  });
});
