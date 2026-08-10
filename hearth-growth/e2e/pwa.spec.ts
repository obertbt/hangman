import { expect, test } from '@playwright/test';

/** PWA として入れられる状態か（5.1「PWA対応を考慮した設計」）。 */
test.describe('PWA', () => {
  test('マニフェストが配信され、必要な項目がそろっている', async ({ request }) => {
    const response = await request.get('/manifest.webmanifest');
    expect(response.ok()).toBe(true);

    const manifest = await response.json();
    expect(manifest.name).toBe('Hearth Growth');
    expect(manifest.start_url).toBe('/home');
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.length).toBeGreaterThan(0);
    // インストール時の切り抜きに耐えるアイコンを持つ
    expect(manifest.icons.some((icon: { purpose?: string }) => icon.purpose === 'maskable')).toBe(true);
  });

  /*
   * 画面の向きを縦に固定しない。
   *
   * orientation: 'portrait' を書いていたため、ホーム画面から起動した
   * タブレットを横にしても縦のまま中央に置かれ、左右に壁紙が見えていた。
   * 端末の向きは利用者が決めることで、アプリが決めることではない。
   */
  test('画面の向きを固定していない', async ({ request }) => {
    const manifest = await (await request.get('/manifest.webmanifest')).json();
    expect(manifest.orientation ?? 'any').toBe('any');
  });

  test('アイコンが配信されている', async ({ request }) => {
    for (const icon of ['/icons/icon.svg', '/icons/icon-maskable.svg']) {
      const response = await request.get(icon);
      expect(response.ok()).toBe(true);
    }
  });

  test('マニフェストとテーマ色が head にある', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
    expect(await page.locator('meta[name="theme-color"]').count()).toBeGreaterThan(0);
  });

  test('クローズドなサービスなので検索避けをしている', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });
});

test.describe('オフライン', () => {
  test('サービスワーカーとオフライン用のページが配信されている', async ({ request }) => {
    const worker = await request.get('/sw.js');
    expect(worker.ok()).toBe(true);
    expect(await worker.text()).toContain('/offline');

    const offline = await request.get('/offline');
    expect(offline.ok()).toBe(true);
  });

  test('オフライン用のページは未ログインでも開ける', async ({ page }) => {
    await page.goto('/offline');
    await expect(page).toHaveURL(/\/offline/);
    await expect(page.getByText('今は繋がっていません')).toBeVisible();
  });
});
