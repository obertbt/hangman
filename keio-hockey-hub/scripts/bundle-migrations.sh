#!/usr/bin/env bash
# =============================================================
# bundle-migrations.sh
# migration をまとめる。2種類の出力を作る。
#
#   supabase/bundled.sql    1ファイル（パソコンから貼る用）
#   supabase/parts/NN.sql   分割（タブレットから貼る用）
#
# なぜ分割も要るか:
#   1ファイルは19万文字ある。
#   タブレットのブラウザでは、全選択もコピーも貼り付けも重くなる。
#   実際に「コピペがうまくいかない」で止まった。
#
#   分割の境目は必ず migration ファイルの切れ目に置く。
#   1つの migration を途中で切ると、順に流しても通らなくなる。
#
#   ./scripts/bundle-migrations.sh
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

# 1回の貼り付けの上限。タブレットで詰まらない大きさ。
# 1つの migration がこれを超える場合は、そのまま1つの part にする。
MAX_CHARS=${MAX_CHARS:-32000}

OUT="supabase/bundled.sql"
PARTS="supabase/parts"

header() {
  echo "-- =========================================================="
  echo "-- 自動生成: scripts/bundle-migrations.sh"
  echo "-- 直接編集しない。直すのは supabase/migrations/ のほう。"
  echo "-- $1"
  echo "-- =========================================================="
  echo
}

# --- 1ファイル版 --------------------------------------------
{
  header "$(date '+%Y-%m-%d') 時点の migration をすべてまとめたもの。"
  for file in supabase/migrations/*.sql; do
    echo
    echo "-- ---------- $(basename "$file") ----------"
    cat "$file"
    echo
  done
} > "$OUT"

# --- 分割版 --------------------------------------------------
rm -rf "$PARTS"
mkdir -p "$PARTS"

part_index=1
part_chars=0
part_files=()

flush_part() {
  [[ ${#part_files[@]} -eq 0 ]] && return
  local name
  name="$(printf '%s/%02d.sql' "$PARTS" "$part_index")"
  {
    header "$(printf '%d 番目。中身: %s' "$part_index" "$(basename -a "${part_files[@]}" | tr '\n' ' ')")"
    for f in "${part_files[@]}"; do
      echo
      echo "-- ---------- $(basename "$f") ----------"
      cat "$f"
      echo
    done
  } > "$name"
  printf '  %s  %6d 文字  (%s)\n' \
    "$name" "$(wc -m < "$name" | tr -d ' ')" \
    "$(basename -a "${part_files[@]}" | sed 's/_.*//' | tr '\n' ',' | sed 's/,$//')"
  part_index=$((part_index + 1))
  part_files=()
  part_chars=0
}

for file in supabase/migrations/*.sql; do
  size=$(wc -m < "$file" | tr -d ' ')
  # 入れると上限を超えるなら、いまの part をここで閉じる
  if [[ ${#part_files[@]} -gt 0 && $((part_chars + size)) -gt $MAX_CHARS ]]; then
    flush_part
  fi
  part_files+=("$file")
  part_chars=$((part_chars + size))
done
flush_part

COUNT=$(find supabase/migrations -name '*.sql' | wc -l | tr -d ' ')
echo
echo "$COUNT 個の migration をまとめました。"
echo "  パソコンから: $OUT を1回貼る"
echo "  タブレットから: $PARTS/ を番号順に貼る"
