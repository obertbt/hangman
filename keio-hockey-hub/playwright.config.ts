import { defineConfig, devices } from '@playwright/test';

/**
 * E2E テスト（71章）。
 *
 * 既定では Supabase が無くても動く範囲だけを対象にする。
 *   * 未ログイン時の振り分け（Security の一部）
 *   * 入力検証
 *   * スマートフォン幅での崩れ
 *
 * ログインが要る流れ（Import / Player Daily / Video）は e2e/authenticated/ に置き、
 * Supabase を用意した環境でだけ動かす（E2E_SUPABASE=1）。
 */
const PORT = Number(process.env.E2E_PORT ?? 3310);
const baseURL = `http://127.0.0.1:${PORT}`;

/**
 * この環境には Chromium が用意済み（PLAYWRIGHT_BROWSERS_PATH）。
 * 別の場所にある場合は PLAYWRIGHT_CHROMIUM_EXECUTABLE で指定する。
 */
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const launchOptions = executablePath ? { executablePath } : undefined;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  // Supabase を用意していない環境では、ログインが要るものを飛ばす
  testIgnore: process.env.E2E_SUPABASE ? [] : ['**/authenticated/**'],
  use: {
    baseURL,
    trace: 'on-first-retry',
    launchOptions,
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
  },
  projects: [
    // 主な利用端末はスマートフォン（3章: モバイルファースト）
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `pnpm start --port ${PORT}`,
    url: `${baseURL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
