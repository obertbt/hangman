import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * supabase/migrations/ をまとめて supabase/setup.sql を作る。
 *
 * Supabase の SQL Editor へ1回貼るだけで初期構築できるようにするためのもの。
 * マイグレーションを足したら、このコマンドで作り直す。
 */
const DIR = 'supabase/migrations';
const OUT = 'supabase/setup.sql';

const files = readdirSync(DIR)
  .filter((name) => /^\d+.*\.sql$/.test(name))
  .sort();

const header = `-- =============================================================================
-- Hearth Growth : 初回セットアップ用（全マイグレーションをまとめたもの）
-- =============================================================================
-- Supabase の SQL Editor に、このファイルの中身をまるごと貼って一度だけ実行します。
-- supabase/migrations/ の各ファイルを番号順に連結しただけで、内容は同じです。
--
-- 2回目以降やマイグレーションを追加したときは、
-- supabase/migrations/ の新しいファイルだけを個別に実行してください。
--
-- このファイルは生成物です。直接編集せず、migrations 側を直してから
--   npm run db:bundle
-- で作り直してください。
-- =============================================================================

`;

const body = files
  .map((name) => {
    const rule = '-- ' + '═'.repeat(75);
    return `\n${rule}\n-- ${name}\n${rule}\n\n${readFileSync(join(DIR, name), 'utf8').trimEnd()}\n`;
  })
  .join('');

writeFileSync(OUT, header + body);
console.log(`${OUT} を作成しました（${files.length} ファイル）`);
