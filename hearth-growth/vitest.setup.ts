import '@testing-library/jest-dom/vitest';

// 環境変数に依存するモジュールをテストから読めるようにする。
// 実際の Supabase へは接続しない。
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://localhost:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'test-anon-key';
process.env.NEXT_PUBLIC_SITE_URL ??= 'http://localhost:3000';
