import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // tsconfig の paths（@/*）をそのまま使う
    tsconfigPaths: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // E2E (Playwright) は Phase 8 で別コマンドとして追加する
    exclude: ['node_modules', '.next', 'e2e'],
  },
});
