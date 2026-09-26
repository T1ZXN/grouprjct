#!/usr/bin/env python3
"""Complete legacy file-deploy to Netlify: all static file hashes + the reglookup function hash."""
import hashlib, json, os, sys, urllib.request, urllib.error, time

SITE = "44dd5ac8-1253-4e59-935d-c683995f91ca"
PUB = "/home/team/shared/site/dist-netlify"
FN = PUB + "/netlify/functions/reglookup.js"
TOKEN = os.environ.get("newtoken", "")
AUTH = {"Authorization": "Bearer " + TOKEN}

def api(path, method="GET", body=None, raw=None, ctype="application/json"):
    url = "https://api.netlify.com/api/v1" + path
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(url, data=data, method=method, headers=AUTH)
    if ctype: req.add_header("Content-Type", ctype)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()

# 1. Cancel scrapped deploys (function-only + two stuck 'new' multipart ones)
for d in ["6aabaada0777c9528e702a14", "6aabaa409bcc60bd572ee12e", "6aabaa206380cb69cb8801a3"]:
    code, body = api(f"/sites/{SITE}/deploys/{d}", "DELETE")
    print(f"cancel {d}: HTTP {code}")

# 2. Hash every file in PUB (key = '/' + relative path, like netlify CLI)
files = {}
for root, dirs, names in os.walk(PUB):
    rel = os.path.relpath(root, PUB)
    for n in names:
        p = os.path.join(root, n)
        relp = n if rel == "." else os.path.join(rel, n)
        h = hashlib.sha1(open(p, "rb").read()).hexdigest()
        files["/" + relp] = h
print(f"files mapped: {len(files)}")

fn_hash = hashlib.sha1(open(FN, "rb").read()).hexdigest()
print("fn_hash:", fn_hash)

# 3. Create deploy
code, body = api(f"/sites/{SITE}/deploys", "POST",
                 {"files": files, "functions": {"reglookup": fn_hash}, "async": True})
d = json.loads(body)
did = d.get("id")
print(f"deploy {did} state={d.get('state')} required={len(d.get('required', []))} required_functions={d.get('required_functions')}")
if not did:
    print("NO DEPLOY ID — abort"); sys.exit(1)

# 4. Upload each required file
required = d.get("required", [])
for path in required:
    src = PUB + path
    code, body = api(f"/deploys/{did}/files/{path.lstrip('/')}", "PUT",
                     raw=open(src, "rb").read(), ctype="application/octet-stream")
    print(f"  PUT {path}: HTTP {code}")
# function blob
for h in d.get("required_functions", []):
    code, body = api(f"/deploys/{did}/files/{h}", "PUT",
                     raw=open(FN, "rb").read(), ctype="application/octet-stream")
    print(f"  PUT fn {h[:8]}: HTTP {code}")

# 5. Poll
for i in range(18):
    time.sleep(10)
    code, body = api(f"/sites/{SITE}/deploys/{did}")
    d = json.loads(body)
    st = d.get("state")
    print(f"poll{i}: {st}", end="\r")
    if st in ("ready", "error"):
        print()
        print("error_message:", (d.get("error_message") or "none")[:200])
        print("summary:", d.get("summary"))
        print("functions:", d.get("functions"))
        break
else:
    print("TIMEOUT")