#!/usr/bin/env python3
"""Load Academy OS's data into Nevorai OS (schema `academy`) from pg_dump files.

Reads (never writes) the two files made by `scripts/academy-move.sh dump` (or the same pg_dump commands by hand):
  <DUMP_DIR>/public_data.sql   pg_dump --data-only --schema=public --no-owner
  <DUMP_DIR>/auth_data.sql     pg_dump --data-only --no-owner -t auth.users -t auth.identities
and loads them into the NEW database. The OLD project is not touched by this script at all.

Connection: NEW_DB_URL, or the usual PGHOST / PGPORT / PGUSER / PGPASSWORD / PGDATABASE variables
(scripts/academy-move.sh sets them from hidden prompts in YOUR terminal; never paste them in chat). Other env:
  DUMP_DIR                         default ~/academy-move-private
  I_KNOW_THIS_WIPES_ACADEMY=yes    required: the academy schema in Nevorai OS is emptied first
  I_KNOW_ACADEMY_IS_LIVE=yes       only after cutover (a CUTOVER_DONE stamp file otherwise stops the run: it would wipe live data)

Run once for the rehearsal and once more at cutover with FRESH dump files.
Logins: same id + same password hash + same phone/metadata as before. A person who already has a Nevorai OS login with the
same email keeps THAT login (their old Academy id is swapped for it, inside the data rows only).
The wipe and the load are ONE transaction: if anything fails, the academy schema keeps whatever it had before.
Rows are loaded with triggers and foreign keys switched off (session_replication_role = replica), exactly like a restore, so
nothing fires and nobody is notified; afterwards every foreign key is checked by hand.
"""
import atexit, os, re, subprocess, sys, tempfile

NEW = os.environ.get("NEW_DB_URL", "")
DUMP = os.path.expanduser(os.environ.get("DUMP_DIR", "~/academy-move-private"))
if os.environ.get("I_KNOW_THIS_WIPES_ACADEMY") != "yes":
    sys.exit("Set I_KNOW_THIS_WIPES_ACADEMY=yes (this empties the academy schema in Nevorai OS).")
if os.path.exists(os.path.join(DUMP, "CUTOVER_DONE")) and os.environ.get("I_KNOW_ACADEMY_IS_LIVE") != "yes":
    sys.exit("Academy OS is already cut over to Nevorai OS (CUTOVER_DONE exists): this would wipe LIVE data. Stopped.")
for f in ("public_data.sql", "auth_data.sql"):
    if not os.path.exists(os.path.join(DUMP, f)):
        sys.exit(f"Missing {os.path.join(DUMP, f)}: run the dump step first.")


def psql(sql=None, file=None, tuples=False):
    args = ["psql"] + ([NEW] if NEW else []) + ["-X", "-q", "-v", "ON_ERROR_STOP=1"]
    if tuples:
        args += ["-A", "-t"]
    args += ["-c", sql] if sql is not None else ["--single-transaction", "-f", file]
    r = subprocess.run(args, capture_output=True, text=True)
    if r.returncode:
        sys.exit(f"psql failed: {r.stderr.strip()[:1500]}")
    return r.stdout.strip()


def copy_blocks(text):
    """Yield (header_line, [data lines]) for every COPY ... FROM stdin; block."""
    lines = text.split("\n")
    i = 0
    while i < len(lines):
        if lines[i].startswith("COPY ") and lines[i].rstrip().endswith("FROM stdin;"):
            j = i + 1
            while j < len(lines) and lines[j] != "\\.":
                j += 1
            if j == len(lines):
                sys.exit("A dump file ends in the middle of a table: it is incomplete. Run the dump step again.")
            yield lines[i], lines[i + 1:j]
            i = j
        i += 1


def _cleanup():  # the stage tables hold password hashes: never leave them in the shared database, even after an error
    subprocess.run(["psql"] + ([NEW] if NEW else []) + ["-X", "-q", "-c", "drop schema if exists academy_stage cascade"], capture_output=True)


# ── 0 · checks BEFORE anything is changed ─────────────────────────────────────
print("0/5 checks")
if psql("select to_regnamespace('platform') is not null", tuples=True) != "t":
    sys.exit("This database has no `platform` schema: it is not Nevorai OS. Nothing was changed.")
db_tables = [t for t in psql("select table_name from information_schema.tables where table_schema='academy' and table_type='BASE TABLE' order by 1", tuples=True).split("\n") if t]
if len(db_tables) != 104:
    sys.exit(f"The academy schema has {len(db_tables)} tables (expected 104): run the schema step first. Nothing was changed.")
assert all(re.fullmatch(r"[a-z_][a-z0-9_]*", t) for t in db_tables), "unexpected table name"
if psql("set session_replication_role = replica; select current_setting('session_replication_role')", tuples=True) != "replica":
    sys.exit("This database does not allow session_replication_role = replica. Nothing was changed; tell Claude.")
atexit.register(_cleanup)

# ── 1 · logins ────────────────────────────────────────────────────────────────
print("1/5 logins")
auth_txt = open(os.path.join(DUMP, "auth_data.sql")).read()
auth_txt = re.sub(r"^\\(un)?restrict .*\n", "", auth_txt, flags=re.M)
blocks = {re.match(r"COPY auth\.(\w+) \(", h).group(1): (h, rows) for h, rows in copy_blocks(auth_txt)}
if "users" not in blocks or "identities" not in blocks:
    sys.exit("auth_data.sql does not hold auth.users and auth.identities. Run the dump step again.")
ucols = re.match(r"COPY auth\.users \((.*?)\) FROM", blocks["users"][0]).group(1)
icols = re.match(r"COPY auth\.identities \((.*?)\) FROM", blocks["identities"][0]).group(1)

stage = ["create schema if not exists academy_stage;",
         "drop table if exists academy_stage.users, academy_stage.identities;",
         "create table academy_stage.users (like auth.users);",
         "create table academy_stage.identities (like auth.identities);",
         f"copy academy_stage.users ({ucols}) from stdin;"]
stage += blocks["users"][1] + ["\\.", f"copy academy_stage.identities ({icols}) from stdin;"] + blocks["identities"][1] + ["\\."]
tmp = tempfile.mkdtemp()
os.chmod(tmp, 0o700)
p = os.path.join(tmp, "stage_auth.sql")
open(p, "w").write("\n".join(stage) + "\n")
psql(file=p)
os.remove(p)

idmap = {}  # old academy user id -> id of the login that already exists in Nevorai OS (same email)
for line in psql("select s.id || '|' || u.id || '|' || s.email from academy_stage.users s join auth.users u on lower(u.email) = lower(s.email) and u.id <> s.id", tuples=True).splitlines():
    old, new, email = line.split("|", 2)
    idmap[old] = new
    print(f"   {email}: already a Nevorai OS login, re-using it")
skip_ids = ",".join(f"'{i}'" for i in idmap) or "'00000000-0000-0000-0000-000000000000'"

clash = psql(f"""select s.id || ' ' || coalesce(s.email, '') from academy_stage.users s
  join auth.users u on u.phone = s.phone and u.id <> s.id
  where coalesce(s.phone, '') <> '' and s.id not in ({skip_ids})""", tuples=True)
if clash:
    sys.exit("These Academy logins share a phone number with a DIFFERENT Nevorai OS login and cannot be copied as-is. Academy data untouched:\n" + clash)

n_users = int(psql("select count(*) from academy_stage.users", tuples=True))
psql(f"""
set session_replication_role = replica;
insert into auth.users ({ucols}) select {ucols} from academy_stage.users s
  where s.id not in ({skip_ids}) and not exists (select 1 from auth.users u where u.id = s.id);
update auth.users u set encrypted_password = s.encrypted_password, phone = s.phone, phone_confirmed_at = s.phone_confirmed_at,
  raw_user_meta_data = s.raw_user_meta_data, raw_app_meta_data = s.raw_app_meta_data, email_confirmed_at = s.email_confirmed_at,
  last_sign_in_at = s.last_sign_in_at, updated_at = s.updated_at
  from academy_stage.users s where u.id = s.id;
insert into auth.identities ({icols}) select {icols} from academy_stage.identities i
  where i.user_id not in ({skip_ids}) on conflict (id) do nothing;
""")
present = int(psql(f"select count(*) from academy_stage.users s where exists (select 1 from auth.users u where u.id = s.id) or s.id in ({skip_ids})", tuples=True))
print(f"   {n_users} logins in the old project; {len(idmap)} matched an existing Nevorai OS login; {present}/{n_users} present now")
if present != n_users:
    sys.exit("Some logins did not arrive; stopping before any academy data is touched.")

# Nevorai OS join list (decision B, 2026-09-30): every login that came over joins Academy OS (same id, or the existing
# Nevorai OS login with the same email). Done HERE because the temporary login copy (academy_stage) is removed when
# this script ends, so a later SQL step cannot see it. Skipped if the join list is not installed.
psql("""do $$ begin
  if to_regclass('platform.app_users') is not null then
    insert into platform.app_users (user_id, app_key, joined_via)
    select distinct u.id, 'academy', 'academy_move'
    from academy_stage.users s
    join auth.users u on u.id = s.id or (s.email is not null and lower(u.email) = lower(s.email))
    on conflict do nothing;
  end if;
end $$;""")
joined = psql("select case when to_regclass('platform.app_users') is null then 'join list not installed' else "
              "(select count(*) from platform.app_users where app_key = 'academy')::text || ' people have joined Academy OS' end", tuples=True)
print(f"   {joined}")

# ── 2 · academy data file (schema renamed, ids swapped, only inside COPY blocks) ──
print("2/5 preparing the data file")
txt = open(os.path.join(DUMP, "public_data.sql")).read()
txt = re.sub(r"^\\(un)?restrict .*\n", "", txt, flags=re.M)
counts, body, in_copy, cur = {}, [], False, None
for line in txt.split("\n"):
    if in_copy:
        if line == "\\.":
            in_copy = False
        else:
            counts[cur] += 1
            for old, new in idmap.items():
                if old in line:
                    line = line.replace(old, new)
        body.append(line)
        continue
    m = re.match(r"^COPY public\.(\w+) \(", line)
    if m and line.rstrip().endswith("FROM stdin;"):
        cur, in_copy = m.group(1), True
        counts[cur] = 0
        line = line.replace("COPY public.", "COPY academy.", 1)
    elif line.startswith("SELECT pg_catalog.setval("):
        line = line.replace("'public.", "'academy.")
    body.append(line)
extra = sorted(set(counts) - set(db_tables))
if extra:
    sys.exit("The dump has tables the academy schema lacks: " + ", ".join(extra) + ". Rebuild the schema file from a fresh dump and run the schema step again. Nothing was wiped.")
absent = sorted(set(db_tables) - set(counts))
if absent:
    print("   note: not in the dump (they stay empty):", ", ".join(absent))
assert not re.search(r"^COPY public\.", "\n".join(body), flags=re.M), "public COPY left"
tables = ", ".join(f"academy.{t}" for t in db_tables)
sql_path = os.path.join(tmp, "academy_data.sql")
open(sql_path, "w").write("\n".join(["set session_replication_role = replica;", f"truncate {tables} restart identity cascade;"] + body))

# ── 3 · wipe + load, ONE transaction ──
print("3/5 loading (empties the academy schema and fills it again, all or nothing)")
psql(file=sql_path)
os.remove(sql_path)

# ── 4 · check: row counts and every foreign key ──
def lit(s):
    return "'" + s.replace("'", "''") + "'"


print("4/5 row counts (dump vs Nevorai OS)")
got = dict(l.split("|") for l in psql(" union all ".join(f"select {lit(t)} || '|' || count(*) from academy.{t}" for t in counts), tuples=True).splitlines())
bad = {t: (n, int(got[t])) for t, n in counts.items() if int(got[t]) != n}
print("   ALL MATCH" if not bad else f"   MISMATCH {bad}")
print("   " + ", ".join(f"{t} {n}" for t, n in sorted(counts.items()) if n))

print("5/5 every foreign key (each row must point at something that exists)")
fks = psql("""select k.conrelid::regclass::text || '|' || k.confrelid::regclass::text || '|' || k.conname || '|' ||
  (select string_agg(quote_ident(a.attname), ',' order by u.ord) from unnest(k.conkey) with ordinality u(attnum, ord) join pg_attribute a on a.attrelid = k.conrelid and a.attnum = u.attnum) || '|' ||
  (select string_agg(quote_ident(a.attname), ',' order by u.ord) from unnest(k.confkey) with ordinality u(attnum, ord) join pg_attribute a on a.attrelid = k.confrelid and a.attnum = u.attnum)
  from pg_constraint k join pg_namespace n on n.oid = k.connamespace where k.contype = 'f' and n.nspname = 'academy'""", tuples=True).splitlines()
checks = []
for row in fks:
    child, parent, name, ccols, pcols = row.split("|")
    cc, pc = ccols.split(","), pcols.split(",")
    notnull = " and ".join(f"c.{c} is not null" for c in cc)
    match = " and ".join(f"p.{b} = c.{a}" for a, b in zip(cc, pc))
    checks.append(f"select {lit(child + '.' + name)} || '|' || count(*) from {child} c where {notnull} and not exists (select 1 from {parent} p where {match})")
res = psql(" union all ".join(checks), tuples=True) if checks else ""
orphans = {k: int(v) for k, v in (l.rsplit("|", 1) for l in res.splitlines()) if int(v)}
print(f"   {len(fks)} foreign keys checked:", "no orphans" if not orphans else f"ORPHANS {orphans}")
psql("analyze " + tables)
seqs = psql("select sequencename || '=' || coalesce(last_value::text, 'unused') from pg_sequences where schemaname = 'academy' order by 1", tuples=True)
print("   number counters:", seqs.replace("\n", ", ") if seqs else "none")
print("DONE: everything matches" if not (bad or orphans) else "PROBLEMS FOUND: do not go on, tell Claude")
sys.exit(1 if (bad or orphans) else 0)
