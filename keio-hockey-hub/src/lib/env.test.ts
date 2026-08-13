import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 環境変数の読み取り。
 *
 * ここが厳しすぎると、**設定の途中でビルドごと落ちる**。
 * 実際に「変数名だけ登録して値が空」の状態で Build Failed になった。
 *
 * 値が分からないまま名前だけ作るのは、置き場所の画面を触っていれば普通に起きる。
 * 落とさずに既定値へ倒し、足りないことは /setup-check で見せる。
 *
 * env.ts はモジュールを読んだ時点で検証するので、
 * テストごとに読み直す（resetModules）。
 */

const KEYS = [
  'NEXT_PUBLIC_APP_NAME',
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
  'R2_ENDPOINT',
] as const;

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  vi.resetModules();
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

async function loadEnv() {
  return import('./env');
}

describe('公開値', () => {
  it('何も無くても落ちない（既定値に倒れる）', async () => {
    const { env } = await loadEnv();
    expect(env.NEXT_PUBLIC_APP_NAME).toBe('慶應ホッケーハブ');
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://localhost:54321');
  });

  it('**空文字でも落ちない**（変数名だけ作られた状態）', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = '';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = '';
    process.env.NEXT_PUBLIC_APP_URL = '';
    process.env.NEXT_PUBLIC_APP_NAME = '';

    const { env } = await loadEnv();
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://localhost:54321');
    expect(env.NEXT_PUBLIC_APP_NAME).toBe('慶應ホッケーハブ');
  });

  it('空白だけでも未設定として扱う', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = '   ';
    const { env } = await loadEnv();
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://localhost:54321');
  });

  it('入っていればその値を使う', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co';
    const { env } = await loadEnv();
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe('https://abc.supabase.co');
  });

  it('前後の空白は落とす（貼り付けの事故を吸収）', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = '  https://abc.supabase.co \n';
    const { env } = await loadEnv();
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe('https://abc.supabase.co');
  });
});

describe('設定できているかの判定', () => {
  it('空文字は「設定済み」と見なさない', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = '';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = '';
    const { isSupabaseConfigured } = await loadEnv();
    expect(isSupabaseConfigured()).toBe(false);
  });

  it('両方そろって初めて設定済み', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co';
    const half = await loadEnv();
    expect(half.isSupabaseConfigured()).toBe(false);

    vi.resetModules();
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
    const full = await loadEnv();
    expect(full.isSupabaseConfigured()).toBe(true);
  });
});

describe('サーバー専用の値', () => {
  it('空文字は未設定として断る（黙って進まない）', async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = '   ';
    const { getServerEnv } = await loadEnv();
    expect(() => getServerEnv()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('入っていれば返す', async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'secret';
    const { getServerEnv } = await loadEnv();
    expect(getServerEnv().SUPABASE_SERVICE_ROLE_KEY).toBe('secret');
  });
});

describe('R2', () => {
  it('未設定なら null（未設定でも他の機能は動く）', async () => {
    const { getR2Env } = await loadEnv();
    expect(getR2Env()).toBeNull();
  });

  it('空文字で埋まっていても null（設定済みと誤認しない）', async () => {
    process.env.R2_ACCOUNT_ID = '';
    process.env.R2_ACCESS_KEY_ID = '';
    process.env.R2_SECRET_ACCESS_KEY = '';
    process.env.R2_BUCKET_NAME = '';
    process.env.R2_ENDPOINT = '';
    const { getR2Env } = await loadEnv();
    expect(getR2Env()).toBeNull();
  });

  it('そろっていれば返す', async () => {
    process.env.R2_ACCOUNT_ID = 'acct';
    process.env.R2_ACCESS_KEY_ID = 'key';
    process.env.R2_SECRET_ACCESS_KEY = 'secret';
    process.env.R2_BUCKET_NAME = 'bucket';
    const { getR2Env } = await loadEnv();
    expect(getR2Env()?.endpoint).toBe('https://acct.r2.cloudflarestorage.com');
  });
});
