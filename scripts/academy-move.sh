#!/usr/bin/env bash
# Academy OS -> Nevorai OS move: ONE command per step. Passwords and keys are typed hidden and never saved anywhere
# (the only secret that lands on disk is the daily-jobs secret, in your private folder, readable only by you).
#
#   bash scripts/academy-move.sh dump     copy the OLD project's data into ~/academy-move-private (the old project is only READ)
#   bash scripts/academy-move.sh schema   install the academy tables + the 5 daily jobs (paused) into Nevorai OS
#   bash scripts/academy-move.sh check    is the academy area reachable through the Nevorai OS API? (no password needed)
#   bash scripts/academy-move.sh load     empty the academy copy in Nevorai OS and fill it again from the dump files
#   bash scripts/academy-move.sh files    copy the uploaded photos and documents (old bucket -> academy-assets)
#   bash scripts/academy-move.sh env      save the Nevorai OS service key for the localhost test (hidden typing)
#   bash scripts/academy-move.sh dev      run Academy OS on this Mac against the Nevorai OS copy (the localhost test)
#   bash scripts/academy-move.sh lock     AFTER the cutover works: locks dump/schema/load/files so they can never wipe live data
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/opt/postgresql@17/bin:$HOME/.bun/bin:$PATH" LC_ALL=en_US.UTF-8

DUMP_DIR="${DUMP_DIR:-$HOME/academy-move-private}"
export DUMP_DIR
OLD_REF=dhxkvceqcupkuwblfeue
OLD_HOST=aws-0-ap-northeast-1.pooler.supabase.com   # Tokyo
NEW_REF=wxgfaaaboftzsazknbvl
NEW_HOST=aws-0-ap-south-1.pooler.supabase.com       # Mumbai (Nevorai OS)
NEW_URL="https://${NEW_REF}.supabase.co"
NEW_ANON="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4Z2ZhYWFib2Z0enNhemtuYnZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1Nzg4OTMsImV4cCI6MjEwMzE1NDg5M30.gWxBCrnkMIvVi6IzSgbwmcR0rLfOz2lmS5T51yk6NLs"  # public key: every browser sees it

mkdir -p "$DUMP_DIR"
chmod 700 "$DUMP_DIR"

die() { echo >&2; echo "STOPPED: $*" >&2; exit 1; }

not_after_cutover() {
  [ ! -e "$DUMP_DIR/CUTOVER_DONE" ] || die "Academy OS already runs on Nevorai OS (the lock is set). This step could overwrite live data."
}

ask_hidden() {  # prompt on the screen, typing hidden, value returned on stdout
  local v=""
  read -r -s -p "$1" v
  echo >&2
  [ -n "$v" ] || die "nothing was typed"
  printf '%s' "$v"
}

new_db() {
  PGPASSWORD="$(ask_hidden 'Nevorai OS database password (typing is hidden; press Enter): ')"
  export PGPASSWORD PGHOST="$NEW_HOST" PGPORT=5432 PGUSER="postgres.${NEW_REF}" PGDATABASE=postgres PGSSLMODE=require
  if ! psql -X -q -A -t -w -c "select 1" >/dev/null 2>"$DUMP_DIR/.err"; then
    die "could not log in to Nevorai OS ($(head -c 200 "$DUMP_DIR/.err")). If the password was wrong, check it ONCE before trying again: several wrong tries in a row make Supabase block this Mac for a while. Nothing was changed."
  fi
  rm -f "$DUMP_DIR/.err"
  [ "$(psql -X -q -A -t -c "select to_regnamespace('platform') is not null")" = t ] || die "this is not the Nevorai OS database (no platform area). Nothing was changed."
}

ensure_secret() {
  if [ ! -s "$DUMP_DIR/cron_secret.txt" ]; then
    ( umask 077; openssl rand -hex 32 > "$DUMP_DIR/cron_secret.txt" )
  fi
}

step="${1:-}"
case "$step" in

  dump)
    PGPASSWORD="$(ask_hidden 'OLD Academy OS database password (typing is hidden; press Enter): ')"
    export PGPASSWORD PGHOST="$OLD_HOST" PGPORT=5432 PGUSER="postgres.${OLD_REF}" PGDATABASE=postgres PGSSLMODE=require
    t="$(mktemp -d "$DUMP_DIR/.new.XXXXXX")"
    trap 'rm -rf "$t"' EXIT
    # order matters: structure, then the academy data, then the logins last (every academy row's login is then in the login dump)
    echo "1/3 structure ...";  pg_dump --schema-only --schema=public --no-owner -f "$t/schema_with_grants.sql"
    echo "2/3 academy data ..."; pg_dump --data-only --schema=public --no-owner -f "$t/public_data.sql"
    echo "3/3 logins ...";     pg_dump --data-only --no-owner -t auth.users -t auth.identities -f "$t/auth_data.sql"
    for f in schema_with_grants public_data auth_data; do
      tail -n 8 "$t/$f.sql" | grep -q "PostgreSQL database dump complete" || die "$f.sql looks incomplete. The old project was only read; nothing in $DUMP_DIR changed."
    done
    python3 scripts/build-academy-nevorai-os-sql.py "$t/schema_with_grants.sql" "$t/check_schema.sql" >/dev/null 2>"$t/build.err" \
      || die "the live Academy OS structure has CHANGED ($(tail -n 1 "$t/build.err")). Nothing in $DUMP_DIR changed. Tell Claude."
    chmod 600 "$t"/*.sql
    mv "$t/schema_with_grants.sql" "$t/public_data.sql" "$t/auth_data.sql" "$DUMP_DIR/"
    echo
    wc -l "$DUMP_DIR/schema_with_grants.sql" "$DUMP_DIR/public_data.sql" "$DUMP_DIR/auth_data.sql" | sed 's/^/   /'
    # comment lines (pg_dump / Postgres version stamps) are ignored: only real structure counts
    if diff -q <(grep -v '^--' "$t/check_schema.sql") <(grep -v '^--' supabase/nevorai-os/academy_0001_schema.sql) >/dev/null; then
      echo "Structure check: the live structure is IDENTICAL to the installed copy. Good."
    else
      echo "STRUCTURE CHECK: the live Academy OS structure has CHANGED since the copy was built. Do NOT go on. Tell Claude."
      exit 3
    fi
    ;;

  schema)
    not_after_cutover
    new_db
    if [ "$(psql -X -q -A -t -c "select to_regnamespace('academy') is not null")" != t ]; then
      psql -X -q -v ON_ERROR_STOP=1 -c "select platform.create_app_schema('academy', 'Academy OS')" >/dev/null
      echo "created the empty 'academy' area"
    fi
    if [ "$(psql -X -q -A -t -c "select count(*) from information_schema.tables where table_schema = 'academy'")" = 0 ]; then
      psql -X -q -v ON_ERROR_STOP=1 --single-transaction -f supabase/nevorai-os/academy_0001_schema.sql >/dev/null
      echo "installed the academy tables, rules and file bucket"
    else
      echo "the academy tables are already installed: left as they are"
    fi
    ensure_secret
    psql -X -q -v ON_ERROR_STOP=1 -v cron_secret="$(cat "$DUMP_DIR/cron_secret.txt")" -f supabase/nevorai-os/academy_0002_cron.sql >/dev/null
    echo "the 5 daily jobs are installed and PAUSED"
    psql -X -q -c "notify pgrst, 'reload schema'"
    psql -X -q -A -t -c "select '   ' || count(*) || ' tables, ' || (select count(*) from pg_policies where schemaname = 'academy') || ' access rules, ' || (select count(*) from cron.job where jobname like 'academy-%') || ' daily jobs (all paused: ' || (select bool_and(not active) from cron.job where jobname like 'academy-%') || ')' from information_schema.tables where table_schema = 'academy' and table_type = 'BASE TABLE'"
    echo
    echo "ONE THING LEFT, in the Supabase website (project Nevorai OS): Settings -> API -> Exposed schemas -> add 'academy' -> Save."
    echo "Then run:  bash scripts/academy-move.sh check"
    ;;

  check)
    out="$(mktemp)"
    code="$(curl -s -o "$out" -w '%{http_code}' -H "apikey: $NEW_ANON" -H "Authorization: Bearer $NEW_ANON" -H "Accept-Profile: academy" "$NEW_URL/rest/v1/tenants_public_directory?select=slug&limit=5")"
    case "$code" in
      200) echo "OK: the academy area is reachable through the Nevorai OS API. Academies listed publicly: $(cat "$out")" ;;
      406) echo "NOT YET: Supabase does not expose the 'academy' area. In Nevorai OS: Settings -> API -> Exposed schemas -> add 'academy' -> Save." ;;
      404) echo "Reachable, but the academy tables are not installed yet: run the 'schema' step." ;;
      *)   echo "Unexpected answer (HTTP $code): $(head -c 300 "$out")" ;;
    esac
    rm -f "$out"
    ;;

  load)
    not_after_cutover
    [ -s "$DUMP_DIR/public_data.sql" ] && [ -s "$DUMP_DIR/auth_data.sql" ] || die "no dump files yet: run the 'dump' step first"
    new_db
    echo
    echo "This EMPTIES the academy copy inside Nevorai OS and fills it again from the dump taken at $(stat -f '%Sm' -t '%d %b %Y %H:%M' "$DUMP_DIR/public_data.sql")."
    echo "(The old project is not touched. Nothing else in Nevorai OS changes, except that the academy logins are added.)"
    read -r -p "Type yes to go on: " a
    [ "$a" = yes ] || die "not confirmed; nothing was changed"
    I_KNOW_THIS_WIPES_ACADEMY=yes python3 scripts/migrate-academy-data.py
    ;;

  files)
    not_after_cutover
    python3 scripts/copy-academy-files.py
    ;;

  env)
    ensure_secret
    # fetched with the logged-in Supabase CLI (nothing to type); asked only if that fails
    svc="$(supabase projects api-keys --project-ref "$NEW_REF" -o json 2>/dev/null | python3 -c 'import json,sys; d=json.load(sys.stdin); d=d if isinstance(d,list) else d.get("keys",[]); print(next((k["api_key"] for k in d if k.get("name")=="service_role" and str(k.get("api_key","")).startswith("eyJ")), ""))' 2>/dev/null || true)"
    if [ -n "$svc" ]; then
      echo "fetched the Nevorai OS key with the Supabase CLI (not shown)"
    else
      svc="$(ask_hidden 'Nevorai OS service_role API key (NOT the database password; typing is hidden; press Enter): ')"
    fi
    case "$svc" in eyJ*|sb_secret_*) ;; *) die "that is not an API key (API keys start with eyJ). Nothing was saved." ;; esac
    ( umask 077
      cat > "$DUMP_DIR/rehearsal.env" <<EOF
SUPABASE_URL=$NEW_URL
SUPABASE_PUBLISHABLE_KEY=$NEW_ANON
SUPABASE_SERVICE_ROLE_KEY=$svc
SUPABASE_PROJECT_ID=$NEW_REF
VITE_SUPABASE_URL=$NEW_URL
VITE_SUPABASE_PUBLISHABLE_KEY=$NEW_ANON
VITE_SUPABASE_PROJECT_ID=$NEW_REF
VITE_DB_SCHEMA=academy
VITE_STORAGE_BUCKET=academy-assets
CRON_SECRET=$(cat "$DUMP_DIR/cron_secret.txt")
EOF
    )
    echo "saved to $DUMP_DIR/rehearsal.env (only you can read it). Next:  bash scripts/academy-move.sh dev"
    ;;

  dev)
    [ -s "$DUMP_DIR/rehearsal.env" ] || die "run the 'env' step first"
    set -a
    . "$DUMP_DIR/rehearsal.env"
    set +a
    echo "Academy OS is starting on this Mac, talking to the Nevorai OS copy (NOT the old project)."
    echo "When it says 'ready', open the address it prints and add  /?tenant=saisportsacademy  at the end.  Ctrl+C stops it."
    exec bun run dev
    ;;

  lock)
    read -r -p "Type yes ONLY if Academy OS now runs on Nevorai OS in production and you have tested it: " a
    [ "$a" = yes ] || die "not confirmed"
    date > "$DUMP_DIR/CUTOVER_DONE"
    echo "Locked: dump / schema / load / files will refuse to run from now on."
    ;;

  *)
    sed -n "2,12p" "$0"
    exit 1
    ;;
esac
