import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * 「RLS の付け忘れ」を検出するための静的チェック。
 *
 * 実際のポリシー挙動（グループ外から投稿が見えないこと等）は
 * Supabase を立てた統合テストで確認する（Phase 8）。
 * ここで守るのは、テーブルを追加したのにポリシーを書き忘れる事故だけ。
 *
 * 対象は 0001〜0003 ではなく**すべてのマイグレーション**にする。
 * 後から足したテーブルこそ書き忘れやすいので、
 * ファイル名を並べる書き方にすると、その肝心な場合を素通りしてしまう。
 */
const migrationsDir = join(process.cwd(), 'supabase', 'migrations');

const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => /^\d+.*\.sql$/.test(name))
  .sort();

/** すべてのマイグレーションを番号順に連結したもの。 */
const allSql = migrationFiles.map((name) => readFileSync(join(migrationsDir, name), 'utf8')).join('\n');

const schemaSql = readFileSync(join(migrationsDir, '0001_initial_schema.sql'), 'utf8');
const rlsSql = readFileSync(join(migrationsDir, '0002_rls_policies.sql'), 'utf8');
const rpcSql = readFileSync(join(migrationsDir, '0003_rpc.sql'), 'utf8');

function createdTables(sql: string): string[] {
  return [...sql.matchAll(/create table public\.(\w+)/g)].map((match) => match[1]);
}

function rlsEnabledTables(sql: string): string[] {
  return [...sql.matchAll(/alter table public\.(\w+)\s+enable row level security/g)].map((match) => match[1]);
}

function policyTargets(sql: string): string[] {
  return [...sql.matchAll(/create policy "[^"]+" on public\.(\w+)/g)].map((match) => match[1]);
}

describe('RLS の網羅', () => {
  const tables = createdTables(allSql);

  it('スキーマにテーブルが定義されている', () => {
    expect(tables.length).toBeGreaterThan(0);
  });

  it('0001 以降に足したテーブルも検査の対象になっている', () => {
    // 対象がいつのまにか 0001 だけに戻っていないことの確認
    expect(tables.length).toBeGreaterThan(createdTables(schemaSql).length);
  });

  it('すべてのテーブルで RLS を有効化している', () => {
    const enabled = new Set(rlsEnabledTables(allSql));
    const missing = tables.filter((table) => !enabled.has(table));
    expect(missing).toEqual([]);
  });

  it('すべてのテーブルに少なくとも1つのポリシーがある', () => {
    const covered = new Set(policyTargets(allSql));
    const missing = tables.filter((table) => !covered.has(table));
    expect(missing).toEqual([]);
  });
});

describe('SECURITY DEFINER 関数の扱い', () => {
  const definerFunctionCount = (sql: string) => [...sql.matchAll(/security definer/g)].length;

  it('SECURITY DEFINER 関数は search_path を固定している', () => {
    expect([...allSql.matchAll(/set search_path = public/g)].length).toBe(definerFunctionCount(allSql));
  });

  it('公開する RPC は anon から実行権限を剥奪している（招待プレビューを除く）', () => {
    const granted = [...rpcSql.matchAll(/grant execute on function public\.(\w+)/g)].map((m) => m[1]);
    const revoked = [...rpcSql.matchAll(/revoke all on function public\.(\w+)/g)].map((m) => m[1]);
    for (const name of granted) {
      expect(revoked).toContain(name);
    }
  });
});

describe('タイマーの不変条件', () => {
  it('running / paused を1ユーザー1件に制限する一意インデックスがある', () => {
    expect(schemaSql).toMatch(
      /create unique index activity_sessions_one_active_per_user[\s\S]*?where status in \('running', 'paused'\)/,
    );
  });
});

describe('公開範囲の不変条件', () => {
  it("visibility = 'group' のときだけ group_id を持つ制約がある", () => {
    expect(schemaSql).toMatch(/constraint posts_group_visibility_check/);
  });

  it('投稿の SELECT ポリシーが private / group / selected をすべて判定している', () => {
    const policy = rlsSql.match(/create policy "activity_posts_select_visible"[\s\S]*?;\n/)?.[0];
    expect(policy).toBeDefined();
    expect(policy).toContain("visibility = 'group'");
    expect(policy).toContain("visibility = 'selected'");
    expect(policy).toContain('deleted_at is null');
  });

  /**
   * 投稿者への `deleted_at is null` の適用は、論理削除そのものを壊す。
   * deleted_at を立てた瞬間に新しい行が SELECT ポリシーを満たさなくなり、
   * UPDATE が「new row violates row-level security policy」で失敗するため。
   * 実挙動は supabase/tests/rls_test.sql で確認している。
   */
  it('投稿者は deleted_at の条件より先に無条件で許可されている', () => {
    const policy = rlsSql.match(/create policy "activity_posts_select_visible"[\s\S]*?;\n/)?.[0] ?? '';
    const ownerCheck = policy.indexOf('user_id = (select auth.uid())');
    const deletedCheck = policy.indexOf('deleted_at is null');
    expect(ownerCheck).toBeGreaterThan(-1);
    expect(deletedCheck).toBeGreaterThan(-1);
    expect(ownerCheck).toBeLessThan(deletedCheck);
  });

  it('コメントの SELECT ポリシーも本人を無条件で許可している', () => {
    const policy = rlsSql.match(/create policy "comments_select_visible_post"[\s\S]*?;\n/)?.[0] ?? '';
    const ownerCheck = policy.indexOf('user_id = (select auth.uid())');
    const deletedCheck = policy.indexOf('deleted_at is null');
    expect(ownerCheck).toBeGreaterThan(-1);
    expect(ownerCheck).toBeLessThan(deletedCheck);
  });
});
