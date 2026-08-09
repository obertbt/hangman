import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * supabase/setup.sql を、スマートフォンでも貼り付けられる大きさに分割する。
 *
 * 長い SQL を一度に貼ると、端末やブラウザ側で途中までしかコピーされないことがある。
 * 切れたまま実行すると「syntax error at end of input」で失敗するため、
 * 小分けにしたものを順番に流せるようにしておく。
 *
 * 分割してよいのは文の切れ目だけ。関数本体（$$ ... $$）の途中では切らない。
 *
 * あわせて supabase/setup/updates/ にマイグレーション1つぶんのファイルも書き出す。
 * 番号付きの 01, 02, … は「まだ何も無い状態」から作るためのもので、
 * マイグレーションを足すと区切り位置が変わる。
 * すでに動いている環境では、増えたぶんだけを updates/ から流す。
 */
const SOURCE = 'supabase/setup.sql';
const MIGRATIONS_DIR = 'supabase/migrations';
const OUT_DIR = 'supabase/setup';
const UPDATES_DIR = 'supabase/setup/updates';
/** 1ファイルの目安。実測で切れた 19KB よりだいぶ小さくしておく。 */
const TARGET_BYTES = 9_000;

const lines = readFileSync(SOURCE, 'utf8').split('\n');

/** 行だけのコメントを落として、貼り付ける量を減らす。文字列の中は触らない。 */
function stripComments(source) {
  const result = [];
  let inDollarQuote = false;
  let blankRun = 0;

  for (const line of source) {
    const dollarCount = (line.match(/\$\$/g) ?? []).length;
    const startsInsideQuote = inDollarQuote;
    if (dollarCount % 2 === 1) inDollarQuote = !inDollarQuote;

    // 関数本体の中はそのまま残す（文字列の一部なので）
    if (startsInsideQuote || inDollarQuote) {
      result.push(line);
      blankRun = 0;
      continue;
    }

    if (/^\s*--/.test(line)) continue;

    if (line.trim() === '') {
      // 空行が続くところは1行にまとめる
      if (blankRun > 0) continue;
      blankRun += 1;
    } else {
      blankRun = 0;
    }

    result.push(line);
  }

  return result;
}

/** 文の切れ目（$$ の外で `;` で終わる行）で区切りながら、目安の大きさで束ねる。 */
function splitIntoParts(source) {
  const parts = [];
  let current = [];
  let bytes = 0;
  let inDollarQuote = false;

  for (const line of source) {
    current.push(line);
    bytes += Buffer.byteLength(line, 'utf8') + 1;

    const dollarCount = (line.match(/\$\$/g) ?? []).length;
    if (dollarCount % 2 === 1) inDollarQuote = !inDollarQuote;

    const atStatementEnd = !inDollarQuote && line.trimEnd().endsWith(';');
    if (atStatementEnd && bytes >= TARGET_BYTES) {
      parts.push(current);
      current = [];
      bytes = 0;
    }
  }

  if (current.some((line) => line.trim() !== '')) parts.push(current);
  return parts;
}

const parts = splitIntoParts(stripComments(lines));

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

parts.forEach((part, index) => {
  const number = String(index + 1).padStart(2, '0');
  const header = `-- Hearth Growth セットアップ ${index + 1} / ${parts.length}
-- 番号順に、Supabase の SQL Editor へ貼り付けて実行してください。
-- 元になっているのは supabase/migrations/ の各ファイルです。

`;
  writeFileSync(join(OUT_DIR, `${number}.sql`), header + part.join('\n').trim() + '\n');
});

// 最後に、うまくいったかを確かめるための問い合わせを置いておく
writeFileSync(
  join(OUT_DIR, 'check.sql'),
  `-- 仕上がりの確認用。テーブル 13 / RLS が有効なテーブル 13 になっていれば成功です。
-- 関数の数とポリシー数は環境によって前後します（20 以上あれば問題ありません）。
select
  (select count(*) from pg_tables where schemaname = 'public')                    as テーブル数,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public')                                                   as 関数の数,
  (select count(*) from pg_tables where schemaname = 'public' and rowsecurity)    as RLSが有効なテーブル数,
  (select count(*) from pg_policies where schemaname = 'public')                  as ポリシー数;
`,
);

const sizes = parts.map((part) => Buffer.byteLength(part.join('\n'), 'utf8'));
console.log(`${OUT_DIR}/ に ${parts.length} 個に分割しました`);
console.log(`  1ファイルの大きさ: 最大 ${Math.max(...sizes).toLocaleString()} バイト`);
console.log(`  行数: ${parts.map((part) => part.length).join(', ')}`);

// -----------------------------------------------------------------------------
// 差分だけを流すためのファイル
// -----------------------------------------------------------------------------
mkdirSync(UPDATES_DIR, { recursive: true });

const migrations = readdirSync(MIGRATIONS_DIR)
  .filter((name) => /^\d+.*\.sql$/.test(name))
  .sort();

for (const name of migrations) {
  const source = readFileSync(join(MIGRATIONS_DIR, name), 'utf8').split('\n');
  const chunks = splitIntoParts(stripComments(source));
  const base = name.replace(/\.sql$/, '');

  chunks.forEach((chunk, index) => {
    const suffix = chunks.length > 1 ? `-${index + 1}` : '';
    const of = chunks.length > 1 ? `（${index + 1} / ${chunks.length}）` : '';
    const header = `-- Hearth Growth : ${name} だけを実行する${of}
-- すでに動いている環境へ、この変更ぶんだけを足すためのファイルです。
-- まっさらな状態から作る場合は supabase/setup/ の 01 から順に実行してください。

`;
    writeFileSync(join(UPDATES_DIR, `${base}${suffix}.sql`), header + chunk.join('\n').trim() + '\n');
  });
}

console.log(`${UPDATES_DIR}/ にマイグレーション ${migrations.length} 件ぶんを書き出しました`);
