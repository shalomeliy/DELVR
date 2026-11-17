#!/usr/bin/env bash
# Database checks for company mode: npm run test:db
# Starts a throwaway Postgres (15+ binaries needed), and for each tests/db/*.test.sql makes a fresh database with
# the Supabase stub and every migration in supabase/migrations, then runs that test file. Fails if any check fails.
set -euo pipefail
cd "$(dirname "$0")"
MIG=../../supabase/migrations
BIN=${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}
[ -x "$BIN/initdb" ] || { echo "Postgres binaries not found (set PG_BIN)"; exit 2; }
DIR=$(mktemp -d); PORT=${PG_PORT:-55432}
OWNER=$(id -un); [ "$OWNER" = root ] && OWNER=postgres
chown -R "$OWNER" "$DIR" 2>/dev/null || true
as() { if [ "$(id -un)" = root ]; then su "$OWNER" -s /bin/bash -c "$*"; else bash -c "$*"; fi; }
as "$BIN/initdb -D $DIR -U postgres -A trust >/dev/null"
as "$BIN/pg_ctl -D $DIR -o '-p $PORT -k $DIR -c wal_level=logical' -l $DIR/log -w start >/dev/null"
trap 'as "$BIN/pg_ctl -D $DIR -m fast stop >/dev/null"; rm -rf "$DIR"' EXIT
PSQL="psql -h $DIR -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"
fail=0; total=0
for t in *.test.sql; do
  db="t_$(basename "$t" .test.sql | tr -c 'a-z0-9\n' '_')"
  $PSQL -d postgres -c "create database $db" >/dev/null
  $PSQL -d "$db" -f supabase-stub.sql >/dev/null
  for m in "$MIG"/*.sql; do $PSQL -d "$db" -f "$m" >/dev/null; done
  $PSQL -d "$db" -f helpers.sql >/dev/null
  out=$($PSQL -d "$db" -f "$t" 2>&1) || { echo "$out"; echo "ERROR in $t"; exit 1; }
  [ -n "${DB_VERBOSE:-}" ] && echo "$out"
  echo "== $t"; echo "$out" | grep -E '^(FAIL|[0-9]+ of [0-9]+ passed)' || true
  n=$(echo "$out" | grep -c '^FAIL' || true); fail=$((fail + n))
  total=$((total + $(echo "$out" | grep -cE '^(PASS|FAIL)' || true)))
done
echo "$((total - fail)) of $total database checks passed"
[ "$fail" -eq 0 ]
