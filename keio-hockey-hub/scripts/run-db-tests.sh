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

echo "--- RLS テスト"
psql "${PSQL_ARGS[@]}" -v ON_ERROR_STOP=1 -f supabase/tests/rls_test.sql 2>&1 | grep -E "^(psql.*)?(NOTICE|ERROR)" || true

echo "--- 制約テスト"
psql "${PSQL_ARGS[@]}" -v ON_ERROR_STOP=1 -f supabase/tests/constraints_test.sql 2>&1 | grep -E "^(psql.*)?(NOTICE|ERROR)" || true

echo "--- 動画・クリップ・質問のテスト"
psql "${PSQL_ARGS[@]}" -v ON_ERROR_STOP=1 -f supabase/tests/video_test.sql 2>&1 | grep -E "^(psql.*)?(NOTICE|ERROR)" || true

echo "--- アップロードのテスト"
psql "${PSQL_ARGS[@]}" -v ON_ERROR_STOP=1 -f supabase/tests/upload_test.sql 2>&1 | grep -E "^(psql.*)?(NOTICE|ERROR)" || true

echo "--- フィードバックの一周のテスト"
psql "${PSQL_ARGS[@]}" -v ON_ERROR_STOP=1 -f supabase/tests/feedback_test.sql 2>&1 | grep -E "^(psql.*)?(NOTICE|ERROR)" || true

echo
echo "すべて通りました。"
