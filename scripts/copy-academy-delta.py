#!/usr/bin/env python3
"""After the switch: rows the OLD Academy OS project saved after the move's copy -> Nevorai OS (academy schema).

  export OUT   PG* = the OLD project.  Every public row created or updated after SINCE -> OUT (json, private folder).
  apply  IN    PG* = Nevorai OS.       Those rows go into academy.*, all or nothing, like the load: triggers and
               foreign-key triggers off (no notification fires twice, no "attendance is immutable" guard), an old row only
               replaces a Nevorai OS row that is OLDER, nothing is ever deleted; then every foreign key of the touched
               tables is checked by hand. Safe to repeat.

Run it through `bash scripts/academy-move.sh delta`, which asks for both passwords.
"""
import datetime as dt
import json
import os
import re
import secrets
import subprocess
import sys

SINCE = os.environ.get("SINCE", "2026-09-29 19:50:00+00")  # 01:20 IST, just before the 01:23 dump the load used
IST = dt.timezone(dt.timedelta(hours=5, minutes=30))
if not re.fullmatch(r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\+00", SINCE):
    sys.exit("SINCE must look like 2026-09-29 19:50:00+00")


def psql(sql, single_transaction=False):
    args = ["psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"] + (["--single-transaction"] if single_transaction else []) + ["-f", "-"]
    r = subprocess.run(args, input=sql, capture_output=True, text=True)
    if r.returncode:
        err = r.stderr.strip()[:900]
        sys.exit(f"\nSTOPPED: {err}\nNothing was changed in Nevorai OS (it is all or nothing). Tell Claude.")
    return r.stdout.strip()


EXPORT = """
create function pg_temp.delta(since timestamptz) returns jsonb language plpgsql as $f$
declare r record; found_rows jsonb; res jsonb := '{}';
begin
  for r in
    select c.oid::regclass as rel, c.relname as t,
           bool_or(a.attname = 'created_at') as has_c, bool_or(a.attname = 'updated_at') as has_u
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    join pg_attribute a on a.attrelid = c.oid and a.attname in ('created_at', 'updated_at') and not a.attisdropped
                        and a.atttypid in ('timestamptz'::regtype, 'timestamp'::regtype)
    where c.relkind = 'r' and not c.relispartition
    group by c.oid, c.relname
    order by c.relname
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]'') from %%s x where %%s', r.rel,
                   concat_ws(' or ', case when r.has_c then 'x.created_at > $1' end, case when r.has_u then 'x.updated_at > $1' end))
      into found_rows using since;
    if jsonb_array_length(found_rows) > 0 then res := res || jsonb_build_object(r.t, found_rows); end if;
  end loop;
  return jsonb_build_object('since', since, 'tables', res,
    'new_logins', (select count(*) from auth.users where created_at > since),
    'new_files', (select count(*) from storage.objects where created_at > since));
end $f$;
select pg_temp.delta(%s);
"""

APPLY = """
set session_replication_role = replica;
create temp table _delta on commit drop as select %(json)s::jsonb as d;
create temp table _done (tbl text, rows_in int, written int) on commit drop;
do $f$
declare t text; found_rows jsonb; rel regclass; cols text; ecols text; pk text; has_u boolean; n int;
begin
  for t, found_rows in select key, value from jsonb_each((select d -> 'tables' from _delta)) order by key loop
    rel := to_regclass(format('academy.%%I', t));
    if rel is null then raise exception 'Nevorai OS has no table academy.%%', t; end if;
    select string_agg(quote_ident(attname), ', ' order by attnum), string_agg('excluded.' || quote_ident(attname), ', ' order by attnum)
      into cols, ecols
      from pg_attribute where attrelid = rel and attnum > 0 and not attisdropped and attgenerated = '';
    select string_agg(quote_ident(a.attname), ', ' order by k.ord) into pk
      from pg_index i cross join lateral unnest(i.indkey) with ordinality k(attnum, ord)
      join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
      where i.indrelid = rel and i.indisprimary;
    if pk is null then raise exception 'academy.%% has no primary key', t; end if;
    has_u := exists (select 1 from pg_attribute where attrelid = rel and attname = 'updated_at' and not attisdropped);
    execute format('insert into %%s as cur (%%s) select %%s from jsonb_populate_recordset(null::%%s, $1) '
                   'on conflict (%%s) do update set (%%s) = row(%%s) where %%s',
                   rel, cols, cols, rel, pk, cols, ecols,
                   case when has_u then 'cur.updated_at is null or cur.updated_at < excluded.updated_at' else 'false' end)
      using found_rows;
    get diagnostics n = row_count;
    insert into _done values (t, jsonb_array_length(found_rows), n);
  end loop;
end $f$;
do $f$
declare k record; n bigint; bad text := '';
begin
  for k in
    select c.conname, c.conrelid::regclass as child, c.confrelid::regclass as parent,
      (select string_agg(format('ch.%%I', a.attname), ', ' order by u.ord) from unnest(c.conkey) with ordinality u(attnum, ord)
         join pg_attribute a on a.attrelid = c.conrelid and a.attnum = u.attnum) as ccols,
      (select string_agg(format('p.%%I', a.attname), ', ' order by u.ord) from unnest(c.confkey) with ordinality u(attnum, ord)
         join pg_attribute a on a.attrelid = c.confrelid and a.attnum = u.attnum) as pcols,
      (select string_agg(format('ch.%%I is not null', a.attname), ' and ' order by u.ord) from unnest(c.conkey) with ordinality u(attnum, ord)
         join pg_attribute a on a.attrelid = c.conrelid and a.attnum = u.attnum) as present
    from pg_constraint c
    where c.contype = 'f' and c.conrelid in (select to_regclass(format('academy.%%I', tbl)) from _done)
  loop
    execute format('select count(*) from %%s ch where %%s and not exists (select 1 from %%s p where (%%s) = (%%s))',
                   k.child, k.present, k.parent, k.pcols, k.ccols) into n;
    if n > 0 then bad := bad || format('%%s.%%s: %%s row(s); ', k.child, k.conname, n); end if;
  end loop;
  if bad <> '' then raise exception 'some rows would point at records Nevorai OS does not have: %%', bad; end if;
end $f$;
select tbl || '|' || rows_in || '|' || written from _done order by tbl;
"""


def when(s):  # Postgres json timestamps (any fraction length, offset or none = UTC) -> aware datetime
    m = re.match(r"(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d+))?([+-]\d{2}(?::?\d{2})?|Z)?$", s)
    if not m:
        return None
    day, clock, frac, tz = m.groups()
    tz = "+00:00" if tz in (None, "Z") else (tz + ":00" if len(tz) == 3 else tz if ":" in tz else tz[:3] + ":" + tz[3:])
    return dt.datetime.fromisoformat(f"{day}T{clock}.{(frac or '0')[:6].ljust(6, '0')}{tz}")


def newest(rows):
    stamps = [w for r in rows for k in ("updated_at", "created_at") if isinstance(r.get(k), str) and (w := when(r[k]))]
    return max(stamps).astimezone(IST).strftime("%d %b %H:%M IST") if stamps else "?"


def export(out):
    raw = psql(EXPORT % ("'" + SINCE + "'"))
    d = json.loads(raw)
    old_mask = os.umask(0o077)
    try:
        with open(out, "w") as f:
            f.write(raw)
    finally:
        os.umask(old_mask)
    tables = d["tables"]
    if not tables:
        print("   the old project saved nothing after the copy: nothing to bring over")
    for t, rows in tables.items():
        print(f"   {t}: {len(rows)} row(s), newest {newest(rows)}")
    if d["new_logins"] or d["new_files"]:
        print(f"   ALSO: {d['new_logins']} new login(s) and {d['new_files']} new file(s) in the old project. Tell Claude (they are not copied by this step).")
    return 0


def apply(inp):
    raw = open(inp).read().strip()
    d = json.loads(raw)
    if not d["tables"]:
        print("   nothing to copy")
        return 0
    tag = "$d" + secrets.token_hex(6) + "$"
    assert tag not in raw
    out = psql(APPLY % {"json": tag + raw + tag}, single_transaction=True)
    print("   copied into Nevorai OS (all or nothing; foreign keys checked):")
    for line in out.splitlines():
        t, n_in, n_written = line.split("|")
        skipped = int(n_in) - int(n_written)
        extra = f" ({skipped} left alone: Nevorai OS already had a newer or equal version)" if skipped else ""
        print(f"   {t}: {n_written} of {n_in} written{extra}")
    print("DONE: the old project's late rows are now in Nevorai OS.")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] not in ("export", "apply"):
        sys.exit(__doc__)
    sys.exit(export(sys.argv[2]) if sys.argv[1] == "export" else apply(sys.argv[2]))
