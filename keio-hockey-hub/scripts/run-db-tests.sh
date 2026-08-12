#!/usr/bin/env bash
#
# migration → RLS テスト → 制約テスト をまとめて流す。
#
# 使い方:
#   ./scripts/run-db-tests.sh                     # 一時的な PostgreSQL を立てて実行
#   DATABASE_URL=postgres://... ./scripts/run-db-tests.sh   # 既存の DB に対して実行
#
# 注意: 本番の DB には絶対に向けないこと。テストはデータを作る。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PSQL_ARGS=()
CLEANUP=""

if [[ -n "${DATABASE_URL:-}" ]]; then
  PSQL_ARGS=("$DATABASE_URL")
  echo "既存の DB に対して実行します"
else
  # 一時的なクラスタを立てる
  PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
  PGDATA="$(mktemp -d /var/tmp/khh-pg-XXXXXX)"
  SOCK="$(mktemp -d /var/tmp/khh-sock-XXXXXX)"
  PORT="${PGPORT:-5455}"

  # postgres ユーザーが読める場所である必要がある
  if id postgres >/dev/null 2>&1 && [[ "$(id -u)" == "0" ]]; then
    chown postgres:postgres "$PGDATA" "$SOCK"
    RUN_AS=(su postgres -c)
  else
    RUN_AS=(bash -c)
  fi

  "${RUN_AS[@]}" "$PGBIN/initdb -D $PGDATA -A trust -U postgres" >/dev/null
  "${RUN_AS[@]}" "$PGBIN/pg_ctl -D $PGDATA -o \"-k $SOCK -p $PORT -c listen_addresses=''\" -l $PGDATA/server.log start" >/dev/null
  sleep 2

  CLEANUP="$PGDATA"
  PSQL_ARGS=(-h "$SOCK" -p "$PORT" -U postgres -d postgres)

  cleanup() {
    "${RUN_AS[@]}" "$PGBIN/pg_ctl -D $CLEANUP stop -m immediate" >/dev/null 2>&1 || true
    rm -rf "$CLEANUP" "$SOCK"
  }
  trap cleanup EXIT

  psql "${PSQL_ARGS[@]}" -q -c "drop database if exists khh_test" -c "create database khh_test"
  PSQL_ARGS=(-h "$SOCK" -p "$PORT" -U postgres -d khh_test)

  echo "一時的な PostgreSQL を立てました（終了時に片付けます）"
fi

run() {
  psql "${PSQL_ARGS[@]}" -v ON_ERROR_STOP=1 -q -f "$1"
}

FAILED=0

# テスト本体。ok: の行だけを見せ、ERROR が出たら最後に落とす。
#
# psql は途中で ERROR が出ても終了コードを返さないことがある
# （\set ON_ERROR_STOP を付けても、grep を挟むと後ろの終了コードになる）ため、
# 出力を見て自分で判定する。
run_test() {
  local label="$1" file="$2" output
  echo "--- $label"
  output="$(psql "${PSQL_ARGS[@]}" -v ON_ERROR_STOP=1 -f "$file" 2>&1 | grep -E "(NOTICE|ERROR|FATAL)" || true)"
  echo "$output"
  if grep -qE "(ERROR|FATAL)" <<<"$output"; then
    FAILED=1
  fi
}

# Supabase が用意する部分（auth スキーマなど）の最小スタブ
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "--- Supabase スタブ"
  run supabase/tests/_supabase_stub.sql
fi

echo "--- migration"
for file in supabase/migrations/*.sql; do
  echo "    $(basename "$file")"
  run "$file"
done

echo "--- seed"
run supabase/seed.sql

run_test "RLS テスト" supabase/tests/rls_test.sql
run_test "制約テスト" supabase/tests/constraints_test.sql
run_test "動画・クリップ・質問のテスト" supabase/tests/video_test.sql
run_test "アップロードのテスト" supabase/tests/upload_test.sql
run_test "フィードバックの一周のテスト" supabase/tests/feedback_test.sql
run_test "スキルの申請と承認のテスト" supabase/tests/skill_test.sql
run_test "容量・掃除・監査ログ・通知のテスト" supabase/tests/ops_test.sql
run_test "測定のテスト" supabase/tests/measurement_test.sql
run_test "役割と権限のテスト" supabase/tests/role_test.sql
run_test "復元のテスト" supabase/tests/restore_test.sql
run_test "招待のテスト" supabase/tests/invitation_test.sql

echo
if [[ "$FAILED" != "0" ]]; then
  echo "失敗しました。上の ERROR を確認してください。"
  exit 1
fi
echo "すべて通りました。"
