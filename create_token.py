import sys, json, re, urllib.request, urllib.parse, http.cookiejar

BASE = "http://187.127.134.246:8000"
EMAIL = "bpillai100@gmail.com"
PASSWORD = sys.argv[1]

cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

def get(url):
    return opener.open(urllib.request.Request(url, headers={"Accept": "text/html"})).read().decode()

def post(url, data, headers=None):
    h = {"Content-Type": "application/x-www-form-urlencoded"}
    if headers:
        h.update(headers)
    body = urllib.parse.urlencode(data).encode() if isinstance(data, dict) else data
    if isinstance(data, (bytes, str)):
        h["Content-Type"] = "application/json"
        body = data if isinstance(data, bytes) else data.encode()
    req = urllib.request.Request(url, body, headers=h)
    return opener.open(req).read().decode()

# 1. Get CSRF
html = get(f"{BASE}/login")
csrf = re.search(r'name="_token"[^>]*value="([^"]+)"', html)
if not csrf:
    csrf = re.search(r'"csrfToken":"([^"]+)"', html)
token = csrf.group(1)
print(f"CSRF: {token[:20]}...")

# 2. Login
post(f"{BASE}/login", {"_token": token, "email": EMAIL, "password": PASSWORD})
print("Logged in!")

# 3. Get api-tokens page
html = get(f"{BASE}/security/api-tokens")

# 4. Find the security.api-tokens component snapshot
snapshots = re.findall(r'wire:snapshot="([^"]+)"', html)
target_snapshot = None
target_id = None
for s in snapshots:
    decoded = s.replace("&quot;", '"').replace("&amp;", "&")
    try:
        obj = json.loads(decoded)
        if "security.api-tokens" in obj.get("memo", {}).get("name", ""):
            target_snapshot = decoded
            target_id = obj.get("memo", {}).get("id", "")
            print(f"Found component ID: {target_id}")
            break
    except:
        continue

if not target_snapshot:
    print("ERROR: Could not find security.api-tokens component")
    sys.exit(1)

# 5. Get CSRF for Livewire
csrf2 = re.search(r'"csrfToken":"([^"]+)"', html)
if not csrf2:
    csrf2 = re.search(r'name="_token"[^>]*value="([^"]+)"', html)
if not csrf2:
    csrf2 = re.search(r'csrf[_-]token["\s:=]+(["\'])([^"\']+)\1', html)
    if csrf2:
        lw_token = csrf2.group(2)
    else:
        # Try to get it from a meta tag
        csrf2 = re.search(r'<meta name="csrf-token" content="([^"]+)"', html)
        if csrf2:
            lw_token = csrf2.group(1)
        else:
            # Extract from any Livewire snapshot
            for s in snapshots:
                decoded = s.replace("&quot;", '"').replace("&amp;", "&")
                try:
                    obj = json.loads(decoded)
                    if "csrfToken" in str(obj):
                        ct = re.search(r'"csrfToken":"([^"]+)"', decoded)
                        if ct:
                            lw_token = ct.group(1)
                            break
                except:
                    continue
            else:
                print("ERROR: Cannot find CSRF token")
                # Save page for debugging
                with open("d:\\RMM\\api_tokens_page.html", "w") as f:
                    f.write(html)
                sys.exit(1)
else:
    lw_token = csrf2.group(1)
print(f"LW CSRF: {lw_token[:20]}...")

# 6. Build Livewire update request
# Set description and permissions, then call addNewToken
updates = [
    {
        "type": "syncInput",
        "payload": {
            "name": "description",
            "value": "rmm-deploy-token"
        }
    },
    {
        "type": "syncInput",
        "payload": {
            "name": "permissions",
            "value": ["root"]
        }
    },
    {
        "type": "callMethod",
        "payload": {
            "method": "addNewToken",
            "params": []
        }
    }
]

payload = json.dumps({
    "_token": lw_token,
    "components": [
        {
            "snapshot": target_snapshot,
            "updates": updates,
            "calls": [
                {
                    "path": "",
                    "method": "addNewToken",
                    "params": []
                }
            ]
        }
    ]
}).encode()

req = urllib.request.Request(
    f"{BASE}/livewire/update",
    payload,
    headers={
        "Content-Type": "application/json",
        "X-Livewire": "",
        "X-CSRF-TOKEN": lw_token,
        "Accept": "text/html, application/xhtml+xml",
    }
)
try:
    resp = opener.open(req).read().decode()
    print(f"Response length: {len(resp)}")
    
    # Try to find the token in the response
    # Livewire v3 returns JSON with components array
    try:
        data = json.loads(resp)
        # Look for the token in effects/html or in the snapshot data
        print(json.dumps(data, indent=2)[:3000])
        
        # Search for token pattern (usually a long alphanumeric string after pipe)
        token_match = re.findall(r'(\d+\|[A-Za-z0-9]{40,})', resp)
        if token_match:
            print(f"\n=== API TOKEN FOUND ===")
            print(token_match[0])
            with open("d:\\RMM\\coolify_token.txt", "w") as f:
                f.write(token_match[0])
            print("Token saved to coolify_token.txt")
        else:
            # Look for plain token
            token_match2 = re.findall(r'"plainTextToken"\s*:\s*"([^"]+)"', resp)
            if token_match2:
                print(f"\n=== API TOKEN FOUND ===")
                print(token_match2[0])
                with open("d:\\RMM\\coolify_token.txt", "w") as f:
                    f.write(token_match2[0])
                print("Token saved to coolify_token.txt")
            else:
                # Save full response for inspection
                with open("d:\\RMM\\lw_response.json", "w") as f:
                    f.write(resp)
                print("No token pattern found - response saved to lw_response.json")
    except json.JSONDecodeError:
        with open("d:\\RMM\\lw_response.html", "w") as f:
            f.write(resp)
        print("Non-JSON response saved to lw_response.html")
except urllib.error.HTTPError as e:
    body = e.read().decode()
    print(f"HTTP {e.code}: {body[:1000]}")
    # Try alternative Livewire v3 format
    print("\nTrying alternative format...")
    
    payload2 = json.dumps({
        "_token": lw_token,
        "components": [
            {
                "snapshot": target_snapshot,
                "updates": [
                    {
                        "type": "syncInput",
                        "payload": {
                            "name": "description",
                            "value": "rmm-deploy-token"
                        }
                    }
                ],
                "calls": [
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
    }).encode()
    
    req2 = urllib.request.Request(
        f"{BASE}/livewire/update",
        payload2,
        headers={
            "Content-Type": "application/json",
            "X-Livewire": "",
            "X-CSRF-TOKEN": lw_token,
            "Accept": "text/html, application/xhtml+xml",
        }
    )
    try:
        resp2 = opener.open(req2).read().decode()
        print(f"Alt response length: {len(resp2)}")
        
        token_match = re.findall(r'(\d+\|[A-Za-z0-9]{40,})', resp2)
        if token_match:
            print(f"\n=== API TOKEN FOUND ===")
            print(token_match[0])
            with open("d:\\RMM\\coolify_token.txt", "w") as f:
                f.write(token_match[0])
            print("Token saved to coolify_token.txt")
        else:
            token_match2 = re.findall(r'"plainTextToken"\s*:\s*"([^"]+)"', resp2)
            if token_match2:
                print(f"\n=== API TOKEN FOUND ===")
                print(token_match2[0])
                with open("d:\\RMM\\coolify_token.txt", "w") as f:
                    f.write(token_match2[0])
                print("Token saved to coolify_token.txt")
            else:
                with open("d:\\RMM\\lw_response2.json", "w") as f:
                    f.write(resp2)
                print("No token found - response saved to lw_response2.json")
    except urllib.error.HTTPError as e2:
        print(f"Alt also failed: HTTP {e2.code}: {e2.read().decode()[:500]}")
