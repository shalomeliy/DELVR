#!/usr/bin/env bash
# Spins up a throwaway Postgres, loads the stub and the schema, and runs test.sql. Needs Postgres 15+ binaries.
set -euo pipefail
cd "$(dirname "$0")"
BIN=${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}
DIR=$(mktemp -d); PORT=${PG_PORT:-55432}
OWNER=$(id -un); [ "$OWNER" = root ] && OWNER=postgres
chown -R "$OWNER" "$DIR" 2>/dev/null || true
as() { if [ "$(id -un)" = root ]; then su "$OWNER" -s /bin/bash -c "$*"; else bash -c "$*"; fi; }
as "$BIN/initdb -D $DIR -U postgres -A trust >/dev/null"
as "$BIN/pg_ctl -D $DIR -o '-p $PORT -k $DIR -c wal_level=logical' -l $DIR/log -w start >/dev/null"
trap 'as "$BIN/pg_ctl -D $DIR -m fast stop >/dev/null"; rm -rf "$DIR"' EXIT
PSQL="psql -h $DIR -p $PORT -U postgres -d postgres -v ON_ERROR_STOP=1 -q"
$PSQL -f supabase-stub.sql >/dev/null
$PSQL -f schema.sql >/dev/null
$PSQL -f test.sql
