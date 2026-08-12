import '@testing-library/jest-dom/vitest';

// 環境変数に依存するモジュールをテストから読めるようにする。
// 実際の Supabase / R2 へは接続しない。
process.env.NEXT_PUBLIC_APP_NAME ??= '慶應ホッケーハブ';
process.env.NEXT_PUBLIC_APP_URL ??= 'http://localhost:3000';
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://localhost:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';
process.env.R2_ACCOUNT_ID ??= 'test-account';
process.env.R2_ACCESS_KEY_ID ??= 'test-access-key';
process.env.R2_SECRET_ACCESS_KEY ??= 'test-secret-key';
process.env.R2_BUCKET_NAME ??= 'test-bucket';
process.env.R2_ENDPOINT ??= 'https://test-account.r2.cloudflarestorage.com';
