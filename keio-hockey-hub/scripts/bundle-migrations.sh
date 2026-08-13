#!/usr/bin/env bash
# =============================================================
# bundle-migrations.sh
# migration を1つのファイルにまとめる。
#
# Supabase の SQL Editor へ23回貼り付けるのは、
# 順番を間違える余地が23回あるということ。
# ここでまとめておけば、貼り付けは1回で済む。
#
#   ./scripts/bundle-migrations.sh
#   → supabase/bundled.sql ができる
#
# **できたファイルは git に入れる。**
# パソコンを持っていない人が、GitHub の画面から開いて
# そのままコピーできるようにしておくため。
# migration を足したら、このコマンドを流し直して一緒にコミットする。
#
# 中身は連結しただけ。順番はファイル名の番号順。
# 何度流しても同じ結果になるように書いてあるが、
# **本番のデータが入った後は流さないこと**。
# =============================================================
set -euo pipefail

cd "$(dirname "$0")/.."

OUT="supabase/bundled.sql"

{
  echo "-- =========================================================="
  echo "-- 自動生成: scripts/bundle-migrations.sh"
  echo "-- $(date '+%Y-%m-%d %H:%M:%S') 時点の supabase/migrations/ をまとめたもの。"
  echo "-- 直接編集しない。直すのは元の migration のほう。"
  echo "-- =========================================================="
  echo

  for file in supabase/migrations/*.sql; do
    echo
    echo "-- =========================================================="
    echo "-- $(basename "$file")"
    echo "-- =========================================================="
    cat "$file"
    echo
  done
} > "$OUT"

COUNT=$(find supabase/migrations -name '*.sql' | wc -l | tr -d ' ')
LINES=$(wc -l < "$OUT" | tr -d ' ')

echo "$COUNT 個の migration を $OUT にまとめました（$LINES 行）。"
echo "Supabase の SQL Editor に貼り付けて実行してください。"
