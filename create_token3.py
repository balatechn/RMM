import sys, json, re, urllib.request, urllib.parse, http.cookiejar

BASE = "http://187.127.134.246:8000"
EMAIL = "bpillai100@gmail.com"
PASSWORD = sys.argv[1]

cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

def get(url):
    return opener.open(urllib.request.Request(url, headers={"Accept": "text/html"})).read().decode()

def post_json(url, data, extra_headers=None):
    h = {"Content-Type": "application/json", "Accept": "text/html, application/xhtml+xml"}
    if extra_headers:
        h.update(extra_headers)
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, body, headers=h)
    return opener.open(req).read().decode()

# 1. Login
html = get(f"{BASE}/login")
csrf = re.search(r'name="_token"[^>]*value="([^"]+)"', html).group(1)
opener.open(urllib.request.Request(
    f"{BASE}/login",
    urllib.parse.urlencode({"_token": csrf, "email": EMAIL, "password": PASSWORD}).encode(),
    headers={"Content-Type": "application/x-www-form-urlencoded"}
))
print("Logged in!")

# 2. Get api-tokens page and extract component snapshot
html = get(f"{BASE}/security/api-tokens")
snapshots = re.findall(r'wire:snapshot="([^"]+)"', html)

target_snapshot = None
for s in snapshots:
    decoded = s.replace("&quot;", '"').replace("&amp;", "&")
    try:
        obj = json.loads(decoded)
        if obj.get("memo", {}).get("name", "") == "security.api-tokens":
            target_snapshot = decoded
            print(f"Component ID: {obj['memo']['id']}")
            print(f"Data keys: {list(obj.get('data', {}).keys())}")
            print(f"Checksum: {obj.get('checksum', 'none')}")
            break
    except:
        continue

if not target_snapshot:
    print("ERROR: Component not found")
    sys.exit(1)

# 3. Get CSRF from any snapshot or page
lw_token = None
for s in snapshots:
    decoded = s.replace("&quot;", '"').replace("&amp;", "&")
    m = re.search(r'"csrfToken":"([^"]+)"', decoded)
    if m:
        lw_token = m.group(1)
        break

if not lw_token:
    m = re.search(r'<meta name="csrf-token" content="([^"]+)"', html)
    if m:
        lw_token = m.group(1)
if not lw_token:
    m = re.search(r'name="_token"[^>]*value="([^"]+)"', html)
    if m:
        lw_token = m.group(1)

if not lw_token:
    # Reuse login csrf
    lw_token = csrf
    
print(f"CSRF: {lw_token[:20]}...")

# 4. Try different Livewire v3 payload formats

# Format 1: updates as dict, calls as array  
payload = {
    "_token": lw_token,
    "components": [
        {
            "snapshot": target_snapshot,
            "updates": {
                "description": "rmm-deploy-token",
                "permissions": ["root"]
            },
            "calls": [
                {
                    "path": "",
                    "method": "addNewToken",
                    "params": []
                }
            ]
        }
    ]
}

headers = {
    "X-Livewire": "",
    "X-CSRF-TOKEN": lw_token,
}

try:
    resp = post_json(f"{BASE}/livewire/update", payload, headers)
    print(f"Format 1 OK - length: {len(resp)}")
except urllib.error.HTTPError as e:
    err = e.read().decode()
    print(f"Format 1 failed: HTTP {e.code}")
    err_match = re.search(r'text-red-500">(.*?)</div>', err, re.DOTALL)
    if err_match:
        print(f"  Error: {err_match.group(1).strip()}")
    
    # Format 2: Only calls with $set
    payload2 = {
        "_token": lw_token,
        "components": [
            {
                "snapshot": target_snapshot,
                "updates": {},
                "calls": [
                    {
                        "path": "",
                        "method": "$set",
                        "params": ["description", "rmm-deploy-token"]
                    },
                    {
                        "path": "",
                        "method": "$set",
                        "params": ["permissions", ["root"]]
                    },
                    {
                        "path": "",
                        "method": "addNewToken",
                        "params": []
                    }
                ]
            }
        ]
    }
    
    try:
        resp = post_json(f"{BASE}/livewire/update", payload2, headers)
        print(f"Format 2 OK - length: {len(resp)}")
    except urllib.error.HTTPError as e2:
        err2 = e2.read().decode()
        print(f"Format 2 failed: HTTP {e2.code}")
        err_match2 = re.search(r'text-red-500">(.*?)</div>', err2, re.DOTALL)
        if err_match2:
            print(f"  Error: {err_match2.group(1).strip()}")
        
        # Format 3: empty updates array
        payload3 = {
            "_token": lw_token,
            "components": [
                {
                    "snapshot": target_snapshot,
                    "updates": [],
                    "calls": [
                        {
                            "path": "",
                            "method": "addNewToken",
                            "params": []
                        }
                    ]
                }
            ]
        }
        
        try:
            resp = post_json(f"{BASE}/livewire/update", payload3, headers)
            print(f"Format 3 OK (no params) - length: {len(resp)}")
        except urllib.error.HTTPError as e3:
            err3 = e3.read().decode()
            print(f"Format 3 failed: HTTP {e3.code}")
            err_match3 = re.search(r'text-red-500">(.*?)</div>', err3, re.DOTALL)
            if err_match3:
                print(f"  Error: {err_match3.group(1).strip()}")
            with open("d:\\RMM\\lw_err.html", "w") as f:
                f.write(err3)
            resp = None

if resp:
    # Search for token in response
    patterns = [
        r'(\d+\|[A-Za-z0-9]{40,})',
        r'"plainTextToken"\s*:\s*"([^"]+)"',
        r'"token"\s*:\s*"(\d+\|[^"]+)"',
        r'<code[^>]*>([^<]+)</code>',
        r'class="token[^"]*"[^>]*>([^<]+)',
    ]
    
    for p in patterns:
        matches = re.findall(p, resp)
        if matches:
            for m in matches:
                if len(m) > 30:
                    print(f"\n=== API TOKEN FOUND ===")
                    print(m)
                    with open("d:\\RMM\\coolify_token.txt", "w") as f:
                        f.write(m)
                    print("Token saved to coolify_token.txt")
                    sys.exit(0)
    
    # Save response for inspection
    with open("d:\\RMM\\lw_response.json", "w") as f:
        f.write(resp)
    print("Token not found in response. Saved to lw_response.json for inspection.")
    
    # Check if it's JSON and print relevant parts
    try:
        data = json.loads(resp)
        if "components" in data:
            for comp in data["components"]:
                snap = comp.get("snapshot", "")
                if isinstance(snap, str):
                    try:
                        snap_obj = json.loads(snap)
                        if "security.api-tokens" in snap_obj.get("memo", {}).get("name", ""):
                            tokens_data = snap_obj.get("data", {}).get("tokens", [])
                            print(f"\nTokens data: {json.dumps(tokens_data, indent=2)[:1000]}")
                    except:
                        pass
                # Check effects
                effects = comp.get("effects", {})
                print(f"\nEffects keys: {list(effects.keys()) if isinstance(effects, dict) else 'not dict'}")
                if isinstance(effects, dict):
                    html_content = effects.get("html", "")
                    if html_content:
                        # Look for token in rendered HTML
                        for p in patterns:
                            matches = re.findall(p, html_content)
                            for m in matches:
                                if len(m) > 30:
                                    print(f"\n=== API TOKEN IN HTML ===")
                                    print(m)
                                    with open("d:\\RMM\\coolify_token.txt", "w") as f:
                                        f.write(m)
                                    sys.exit(0)
                        # Check for dispatch events
                    dispatches = effects.get("dispatches", [])
                    if dispatches:
                        print(f"Dispatches: {json.dumps(dispatches, indent=2)[:500]}")
    except:
        pass
