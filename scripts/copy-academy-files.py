#!/usr/bin/env python3
"""Copy Academy OS's uploaded files (logos, gallery, player photos, registration documents...) from the OLD project's
bucket `tenant-assets` into Nevorai OS's bucket `academy-assets`, same paths. The OLD project is only ever READ.

Needs the two projects' service_role keys (Supabase -> Project Settings -> API Keys -> "Legacy" tab -> service_role).
They are asked for here with hidden typing; never paste them in chat. (Or set OLD_SERVICE_KEY / NEW_SERVICE_KEY.)
Safe to run twice: existing files are overwritten with identical bytes. Run once for the rehearsal, once at cutover.
After cutover (CUTOVER_DONE stamp) it refuses to run: it could overwrite newer uploads with the old copies.
"""
import getpass, json, os, sys, time, urllib.error, urllib.parse, urllib.request

DUMP = os.path.expanduser(os.environ.get("DUMP_DIR", "~/academy-move-private"))
if os.path.exists(os.path.join(DUMP, "CUTOVER_DONE")) and os.environ.get("I_KNOW_ACADEMY_IS_LIVE") != "yes":
    sys.exit("Academy OS is already cut over (CUTOVER_DONE exists): copying old files over the live bucket could overwrite newer uploads. Stopped.")

OLD_URL, OLD_BUCKET = "https://dhxkvceqcupkuwblfeue.supabase.co", "tenant-assets"
NEW_URL, NEW_BUCKET = "https://wxgfaaaboftzsazknbvl.supabase.co", "academy-assets"
old_key = os.environ.get("OLD_SERVICE_KEY") or getpass.getpass("OLD Academy OS project: service_role key (hidden): ").strip()
new_key = os.environ.get("NEW_SERVICE_KEY") or getpass.getpass("Nevorai OS project: service_role key (hidden): ").strip()
if not old_key or not new_key:
    sys.exit("Both keys are needed.")


def call(base, key, method, path, body=None, headers=None, raw=False):
    data = None if body is None else (body if raw else json.dumps(body).encode())
    req = urllib.request.Request(base + path, method=method, data=data)
    req.add_header("Authorization", f"Bearer {key}")
    req.add_header("apikey", key)
    req.add_header("User-Agent", "nevorai-academy-move/1.0")
    if body is not None and not raw:
        req.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    for attempt in range(3):
        try:
            return urllib.request.urlopen(req, timeout=120)
        except urllib.error.HTTPError as e:
            if e.code < 500 or attempt == 2:
                sys.exit(f"{method} {path[:120]} failed: HTTP {e.code} {e.read()[:300]!r}")
        except urllib.error.URLError as e:
            if attempt == 2:
                sys.exit(f"{method} {path[:120]} failed: {e}")
        time.sleep(2)


def walk(base, key, bucket, prefix=""):
    """Yield (path, size) for every file under prefix, folders included recursively."""
    offset = 0
    while True:
        listing = json.loads(call(base, key, "POST", f"/storage/v1/object/list/{bucket}",
                                  {"prefix": prefix, "limit": 100, "offset": offset,
                                   "sortBy": {"column": "name", "order": "asc"}}).read())
        for o in listing:
            p = f"{prefix}{o['name']}"
            if o.get("id") is None:  # a folder
                yield from walk(base, key, bucket, p + "/")
            else:
                yield p, (o.get("metadata") or {}).get("size")
        if len(listing) < 100:
            break
        offset += 100


def q(path):
    return urllib.parse.quote(path, safe="/")


print("listing the old bucket ...")
old_files = dict(walk(OLD_URL, old_key, OLD_BUCKET))
print(f"   {len(old_files)} files, {sum(s or 0 for s in old_files.values()) / 1048576:.1f} MB")

copied = 0
for path in old_files:
    resp = call(OLD_URL, old_key, "GET", f"/storage/v1/object/authenticated/{OLD_BUCKET}/{q(path)}")
    blob, ctype = resp.read(), resp.headers.get("Content-Type", "application/octet-stream")
    call(NEW_URL, new_key, "POST", f"/storage/v1/object/{NEW_BUCKET}/{q(path)}", blob,
         {"x-upsert": "true", "Content-Type": ctype}, raw=True)
    copied += 1
    if copied % 25 == 0:
        print(f"   copied {copied}/{len(old_files)}")

print("checking the new bucket ...")
new_files = dict(walk(NEW_URL, new_key, NEW_BUCKET))
missing = sorted(set(old_files) - set(new_files))
wrong = sorted(p for p in old_files if p in new_files and old_files[p] != new_files[p])
print(f"   old {len(old_files)} files, new bucket {len(new_files)} files; missing {len(missing)}; size mismatch {len(wrong)}")
if missing or wrong:
    print("   problems:", (missing + wrong)[:10])
    sys.exit(1)
print("   ALL FILES MATCH. The old project was only read.")
