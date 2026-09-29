#!/usr/bin/env bash
# Academy OS -> Nevorai OS move: ONE command per step. Passwords and keys are typed hidden and never saved anywhere
# (the only secret that lands on disk is the daily-jobs secret, in your private folder, readable only by you).
#
#   bash scripts/academy-move.sh dump      copy the OLD project's data into ~/academy-move-private (the old project is only READ)
#   bash scripts/academy-move.sh schema    install the academy tables + the 5 daily jobs (paused) into Nevorai OS
#   bash scripts/academy-move.sh check     is the academy area reachable through the Nevorai OS API? (no password needed)
#   bash scripts/academy-move.sh load      empty the academy copy in Nevorai OS and fill it again from the dump files
#   bash scripts/academy-move.sh files     copy the uploaded photos and documents (old bucket -> academy-assets)
#   bash scripts/academy-move.sh env       save the Nevorai OS service key for the localhost test (hidden typing)
#   bash scripts/academy-move.sh dev       run Academy OS on this Mac against the Nevorai OS copy (the localhost test)
#   bash scripts/academy-move.sh switch    THE CUTOVER (after a fresh 'load'): new files copied, live site pointed at Nevorai OS, published, locked
#   bash scripts/academy-move.sh rollback  EMERGENCY ONLY: point the live site back at the OLD project
#   bash scripts/academy-move.sh lock      locks dump/schema/load/files so they can never wipe live data ('switch' does this itself)
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
  if ! psql -X -q -A -t -w -c "select 1" >/dev/null 2>"$DUMP_DIR/.err" && grep -q "password authentication failed" "$DUMP_DIR/.err"; then
    # right after a password reset, Supabase's connection gateway sometimes refuses the new password once
    echo "   the gateway refused the password once (common right after a reset); trying again in 10 seconds ..."
    sleep 10
  fi
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

cli_key() {  # $1 project ref, $2 anon|service_role: that project's API key, fetched with the logged-in Supabase CLI (never shown)
  supabase projects api-keys --project-ref "$1" -o json 2>/dev/null \
    | W="$2" python3 -c 'import json,os,sys; d=json.load(sys.stdin); d=d if isinstance(d,list) else d.get("keys",[]); print(next((k["api_key"] for k in d if k.get("name")==os.environ["W"] and str(k.get("api_key","")).startswith("eyJ")), ""))' 2>/dev/null || true
}

key_is() {  # $1 key, $2 role, $3 project ref: is it really that project's key of that kind?
  K="$1" R="$2" P="$3" python3 -c 'import base64,json,os,sys
try:
    p = os.environ["K"].split(".")[1]
    c = json.loads(base64.urlsafe_b64decode(p + "=" * (-len(p) % 4)))
    sys.exit(0 if (c.get("role"), c.get("ref")) == (os.environ["R"], os.environ["P"]) else 1)
except Exception:
    sys.exit(1)'
}

vercel_ready() {
  command -v vercel >/dev/null || die "the Vercel command is not installed on this Mac. Nothing was changed."
  grep -q '"projectName":"academyos"' .vercel/project.json 2>/dev/null || die "this folder is not linked to the Vercel project academyos. Nothing was changed."
  vercel whoami >/dev/null 2>&1 || die "Vercel is not logged in on this Mac. Nothing was changed."
}

vset() {  # $1 name, $2 value, $3 --sensitive|--no-sensitive: a fresh Production setting owned by you (not by the old Supabase link)
  vercel env rm "$1" production --yes >/dev/null 2>&1 || true
  if ! printf '%s' "$2" | vercel env add "$1" production --yes "$3" >"$DUMP_DIR/.vercel.out" 2>&1; then
    die "Vercel refused the setting $1: $(grep -v '^Vercel CLI' "$DUMP_DIR/.vercel.out" | tail -n 2 | tr '\n' ' ')
The live site is NOT affected by this (settings only apply when a new version is published). Do not publish anything; tell Claude."
  fi
  rm -f "$DUMP_DIR/.vercel.out"
  echo "   $1"
}

prod_deploy() {  # "url state" of the newest Production deployment; $1 = a commit (only its deployments) or READY (only live-able ones)
  local filter=()
  case "${1:-}" in READY) filter=(-s READY) ;; ?*) filter=(-m "githubCommitSha=$1") ;; esac
  vercel ls academyos --format json "${filter[@]}" 2>/dev/null | python3 -c 'import json,sys
d = sorted((x for x in json.load(sys.stdin).get("deployments", []) if x.get("target") == "production"), key=lambda x: -x.get("createdAt", 0))
print(d[0]["url"] + " " + d[0]["state"] if d else "")' 2>/dev/null || true
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
    svc="$(cli_key "$NEW_REF" service_role)"
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

  switch)
    # before this: a fresh 'load' taken while the old project's daily jobs were paused, so the copy is complete
    not_after_cutover
    vercel_ready
    [ "$(git rev-parse --abbrev-ref HEAD)" = main ] || die "this folder is not on the main branch. Nothing was changed."
    git diff --quiet -- .env || die ".env has edits nobody saved. Nothing was changed. Tell Claude."
    [ -s "$DUMP_DIR/cron_secret.txt" ] || die "the daily-jobs secret is missing from $DUMP_DIR. Nothing was changed. Tell Claude."
    svc="$(cli_key "$NEW_REF" service_role)"
    key_is "$svc" service_role "$NEW_REF" || die "could not fetch the Nevorai OS service key with the Supabase CLI. Nothing was changed."
    key_is "$NEW_ANON" anon "$NEW_REF" || die "the Nevorai OS public key in this script is wrong. Nothing was changed. Tell Claude."
    echo "This moves the LIVE Academy OS site to Nevorai OS. Everyone signs in once more afterwards (same passwords)."
    read -r -p "Type yes to switch: " a
    [ "$a" = yes ] || die "not confirmed; nothing was changed"

    echo; echo "1/4 copying photos and documents added since the last copy ..."
    python3 scripts/copy-academy-files.py

    echo; echo "2/4 pointing the live site's settings at Nevorai OS ..."
    vset SUPABASE_URL "$NEW_URL" --no-sensitive
    vset SUPABASE_PUBLISHABLE_KEY "$NEW_ANON" --no-sensitive
    vset SUPABASE_SERVICE_ROLE_KEY "$svc" --sensitive
    vset VITE_SUPABASE_URL "$NEW_URL" --no-sensitive
    vset VITE_SUPABASE_PUBLISHABLE_KEY "$NEW_ANON" --no-sensitive
    vset VITE_DB_SCHEMA academy --no-sensitive
    vset VITE_STORAGE_BUCKET academy-assets --no-sensitive
    vset CRON_SECRET "$(cat "$DUMP_DIR/cron_secret.txt")" --sensitive
    gone=0
    for v in SUPABASE_ANON_KEY SUPABASE_SECRET_KEY SUPABASE_JWT_SECRET NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY \
             NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY POSTGRES_URL POSTGRES_PRISMA_URL POSTGRES_URL_NON_POOLING POSTGRES_USER \
             POSTGRES_HOST POSTGRES_PASSWORD POSTGRES_DATABASE; do   # unused by the code; they only pointed at the old project
      if vercel env rm "$v" production --yes >/dev/null 2>&1; then gone=$((gone + 1)); fi
    done
    echo "   removed $gone unused settings that pointed at the old project"

    echo; echo "3/4 publishing ..."
    NEW_URL="$NEW_URL" NEW_ANON="$NEW_ANON" NEW_REF="$NEW_REF" python3 - <<'PY'
import os, re
e = os.environ
want = {"SUPABASE_PROJECT_ID": e["NEW_REF"], "SUPABASE_PUBLISHABLE_KEY": e["NEW_ANON"], "SUPABASE_URL": e["NEW_URL"],
        "VITE_SUPABASE_PROJECT_ID": e["NEW_REF"], "VITE_SUPABASE_PUBLISHABLE_KEY": e["NEW_ANON"], "VITE_SUPABASE_URL": e["NEW_URL"],
        "VITE_DB_SCHEMA": "academy", "VITE_STORAGE_BUCKET": "academy-assets"}
out, seen = [], set()
for line in open(".env").read().splitlines():
    m = re.match(r"([A-Z_0-9]+)=", line)
    if m and m.group(1) in want:
        out.append(f'{m.group(1)}="{want[m.group(1)]}"'); seen.add(m.group(1))
    else:
        out.append(line)
out += [f'{k}="{v}"' for k, v in want.items() if k not in seen]
open(".env", "w").write("\n".join(out) + "\n")
PY
    ! grep -q "$OLD_REF" .env || die ".env still mentions the old project. Tell Claude."
    git add .env
    git diff --cached --quiet || git commit -q -m "Academy OS runs on Nevorai OS: .env points at the academy area and the academy-assets bucket" \
      -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
    git push -q origin main || die "the push to GitHub failed. The live site still runs the OLD version, so nothing is broken. Tell Claude."
    sha="$(git rev-parse HEAD)"

    echo; printf '4/4 Vercel is building the new version (usually 2-4 minutes) '
    d=""
    for _ in $(seq 1 60); do
      d="$(prod_deploy "$sha")"
      case "$d" in *" READY"|*" ERROR"|*" CANCELED") break ;; esac
      printf '.'; sleep 10
    done
    echo
    case "$d" in
      *" READY") ;;
      "") die "Vercel had not started building after 10 minutes. The live site still runs the OLD version, so nothing is broken. Tell Claude." ;;
      *) die "the new version did not build (${d#* }). The live site still runs the OLD version, so nothing is broken. Tell Claude." ;;
    esac
    date > "$DUMP_DIR/CUTOVER_DONE"
    echo
    echo "DONE: the live site now runs on Nevorai OS (${d%% *})."
    echo "Locked: dump / schema / load / files will refuse to run from now on."
    echo "Next: run the daily-jobs SQL Claude gave you in Nevorai OS, then sign in and check."
    ;;

  rollback)
    # EMERGENCY ONLY. The old project must still exist. Anything saved in Nevorai OS after the switch is NOT copied back.
    vercel_ready
    old_anon="$(cli_key "$OLD_REF" anon)"
    old_svc="$(cli_key "$OLD_REF" service_role)"
    { key_is "$old_anon" anon "$OLD_REF" && key_is "$old_svc" service_role "$OLD_REF"; } \
      || die "could not fetch the OLD project's keys (is it deleted or paused?). Nothing was changed."
    live="$(prod_deploy READY)"
    [ -n "$live" ] || die "could not find the live version on Vercel. Nothing was changed."
    echo "This points the LIVE site back at the OLD project. Anything saved since the switch stays only in Nevorai OS."
    read -r -p "Type rollback to go on: " a
    [ "$a" = rollback ] || die "not confirmed; nothing was changed"
    vset SUPABASE_URL "https://${OLD_REF}.supabase.co" --no-sensitive
    vset SUPABASE_PUBLISHABLE_KEY "$old_anon" --no-sensitive
    vset SUPABASE_SERVICE_ROLE_KEY "$old_svc" --sensitive
    vset VITE_SUPABASE_URL "https://${OLD_REF}.supabase.co" --no-sensitive
    vset VITE_SUPABASE_PUBLISHABLE_KEY "$old_anon" --no-sensitive
    vset VITE_DB_SCHEMA public --no-sensitive
    vset VITE_STORAGE_BUCKET tenant-assets --no-sensitive
    echo "rebuilding the live version with the old settings (2-4 minutes) ..."
    vercel redeploy "${live%% *}" --target production >/dev/null || die "the rebuild failed. Tell Claude."
    if [ -e "$DUMP_DIR/CUTOVER_DONE" ]; then mv "$DUMP_DIR/CUTOVER_DONE" "$DUMP_DIR/ROLLED_BACK_$(date +%Y%m%d-%H%M)"; fi
    echo "DONE: the live site runs on the OLD project again. Tell Claude now: the daily jobs must be switched back too."
    ;;

  lock)
    read -r -p "Type yes ONLY if Academy OS now runs on Nevorai OS in production and you have tested it: " a
    [ "$a" = yes ] || die "not confirmed"
    date > "$DUMP_DIR/CUTOVER_DONE"
    echo "Locked: dump / schema / load / files will refuse to run from now on."
    ;;

  *)
    awk 'NR > 1 { if (/^#/) print; else exit }' "$0"
    exit 1
    ;;
esac
