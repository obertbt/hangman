import { defineConfig, devices } from '@playwright/test';

/**
 * E2E テスト。
 *
 * 既定では、Supabase が無くても動く範囲だけを対象にしている。
 *   * 未ログイン時の振り分け
 *   * 入力検証（クライアント側）
 *   * スマートフォン幅での崩れ
 *   * アクセシビリティ
 *
 * ログインが要る流れは e2e/authenticated/ に置き、
 * Supabase を用意した環境でのみ実行する（E2E_SUPABASE=1）。
 */
const PORT = Number(process.env.E2E_PORT ?? 3210);
const baseURL = `http://127.0.0.1:${PORT}`;

/**
 * 通常は `npx playwright install chromium` で入れたブラウザを使う。
 * 既にブラウザがある環境（CI のイメージなど）では、
 * PLAYWRIGHT_CHROMIUM_EXECUTABLE でその場所を指定できる。
 */
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const launchOptions = executablePath ? { executablePath } : undefined;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    launchOptions,
  },
  projects: [
    // 主な利用端末は Android スマートフォン（16.2）
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `npm run start -- --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
