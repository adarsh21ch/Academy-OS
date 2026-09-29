#!/usr/bin/env python3
"""Copy Academy OS's uploaded files (logos, gallery, player photos, registration documents...) from the OLD project's
bucket `tenant-assets` into Nevorai OS's bucket `academy-assets`, same paths. The OLD project is only ever READ.

Needs the two projects' service_role keys (Supabase -> Project Settings -> API Keys -> "Legacy" tab -> service_role).
They are asked for here with hidden typing; never paste them in chat. (Or set OLD_SERVICE_KEY / NEW_SERVICE_KEY.)
Safe to run twice: existing files are overwritten with identical bytes. Run once for the rehearsal, once at cutover.
After cutover (CUTOVER_DONE stamp) it refuses to run: it could overwrite newer uploads with the old copies.
"""
import base64, getpass, json, os, sys, time, urllib.error, urllib.parse, urllib.request

DUMP = os.path.expanduser(os.environ.get("DUMP_DIR", "~/academy-move-private"))
if os.path.exists(os.path.join(DUMP, "CUTOVER_DONE")) and os.environ.get("I_KNOW_ACADEMY_IS_LIVE") != "yes":
    sys.exit("Academy OS is already cut over (CUTOVER_DONE exists): copying old files over the live bucket could overwrite newer uploads. Stopped.")

OLD_URL, OLD_BUCKET = "https://dhxkvceqcupkuwblfeue.supabase.co", "tenant-assets"
NEW_URL, NEW_BUCKET = "https://wxgfaaaboftzsazknbvl.supabase.co", "academy-assets"
def key_from_cli(project_ref):
    """Ask the logged-in Supabase CLI for the project's secret key (kept in memory only, never printed)."""
    import shutil, subprocess
    if not shutil.which("supabase"):
        return None
    for extra in (["-o", "json"], []):
        try:
            r = subprocess.run(["supabase", "projects", "api-keys", "--project-ref", project_ref] + extra,
                               capture_output=True, text=True, timeout=90)
        except Exception:
            continue
        if r.returncode != 0 or not r.stdout.strip():
            continue
        try:
            items = json.loads(r.stdout)
            items = items if isinstance(items, list) else items.get("keys", [])
            for it in items:
                if it.get("name") == "service_role" and it.get("api_key"):
                    return it["api_key"]
            for it in items:
                v = str(it.get("api_key", ""))
                if v.startswith("sb_secret_") and all(c.isalnum() or c in "_-" for c in v):
                    return v
        except ValueError:
            for line in r.stdout.splitlines():
                cells = [c.strip() for c in line.split("|")]
                if len(cells) > 1 and cells[0].lower() == "service_role" and cells[1]:
                    return cells[1]
                for c in cells:
                    if c.startswith("sb_secret_"):
                        return c
    return None


def check_key(label, key, project_ref):
    n = len(key)
    if key.startswith("eyJ"):
        try:
            part = key.split(".")[1]
            claims = json.loads(base64.urlsafe_b64decode(part + "=" * (-len(part) % 4)))
        except Exception:
            sys.exit(f"STOPPED - {label}: {n} characters typed. It starts like an API key but is cut off or has extra characters. "
                     "Copy it again with the copy icon (do not select the text by hand).")
        role, ref = claims.get("role"), claims.get("ref")
        if role != "service_role":
            sys.exit(f"STOPPED - {label}: this is the '{role}' key. This step needs the secret key that is labelled service_role.")
        if ref != project_ref:
            sys.exit(f"STOPPED - {label}: this key belongs to a different project ({ref}). It must be the key of project {project_ref}.")
        print(f"   {label}: OK (service_role key, project {ref}, {n} characters)")
    elif key.startswith("sb_secret_"):
        print(f"   {label}: OK (new-style secret key, {n} characters)")
    elif key.startswith("sb_publishable_"):
        sys.exit(f"STOPPED - {label}: this is the publishable key. This step needs the SECRET key (service_role / sb_secret_...).")
    else:
        sys.exit(f"STOPPED - {label}: {n} characters typed, and it does not look like an API key (API keys start with eyJ or sb_secret_). "
                 "It looks like a password. This step needs the API key, NOT the database password. "
                 "Easiest: run this step again and just press Enter at the prompt; the script then fetches the key by itself.")


def ask_key(label, env_name, project_ref):
    """Fetch the key with the logged-in Supabase CLI (nothing to type). Only if that fails, ask for it."""
    key = os.environ.get(env_name)
    if not key:
        key = key_from_cli(project_ref)
        if key:
            print(f"   {label}: fetched with the Supabase CLI (not shown)")
    if not key:
        key = getpass.getpass(f"{label}: could not fetch it automatically. Paste the project's service_role API key (hidden): ").strip()
    check_key(label, key, project_ref)
    return key


old_key = ask_key("OLD Academy OS project key", "OLD_SERVICE_KEY", "dhxkvceqcupkuwblfeue")
new_key = ask_key("Nevorai OS project key", "NEW_SERVICE_KEY", "wxgfaaaboftzsazknbvl")


def call(base, key, method, path, body=None, headers=None, raw=False):
    data = None if body is None else (body if raw else json.dumps(body).encode())
    req = urllib.request.Request(base + path, method=method, data=data)
    if not key.startswith("sb_secret_"):  # new-style secret keys are not JWTs: apikey header only
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

already = {} if os.environ.get("FULL_COPY") == "1" else dict(walk(NEW_URL, new_key, NEW_BUCKET))
todo = [p for p in old_files if not (p in already and already[p] == old_files[p])]
print(f"   {len(old_files) - len(todo)} already in the new bucket (same size), copying {len(todo)}")

copied = 0
for path in todo:
    resp = call(OLD_URL, old_key, "GET", f"/storage/v1/object/authenticated/{OLD_BUCKET}/{q(path)}")
    blob, ctype = resp.read(), resp.headers.get("Content-Type", "application/octet-stream")
    call(NEW_URL, new_key, "POST", f"/storage/v1/object/{NEW_BUCKET}/{q(path)}", blob,
         {"x-upsert": "true", "Content-Type": ctype}, raw=True)
    copied += 1
    if copied % 25 == 0:
        print(f"   copied {copied}/{len(todo)}")

print("checking the new bucket ...")
new_files = dict(walk(NEW_URL, new_key, NEW_BUCKET))
missing = sorted(set(old_files) - set(new_files))
wrong = sorted(p for p in old_files if p in new_files and old_files[p] != new_files[p])
print(f"   old {len(old_files)} files, new bucket {len(new_files)} files; missing {len(missing)}; size mismatch {len(wrong)}")
if missing or wrong:
    print("   problems:", (missing + wrong)[:10])
    sys.exit(1)
print("   ALL FILES MATCH. The old project was only read.")
