"""Coolify deployment helper - Creates API token and deploys resources"""
import re
import sys
import json
import http.cookiejar
import html as htmlmod
from urllib.request import Request, urlopen, build_opener, HTTPCookieProcessor
from urllib.parse import urlencode
from urllib.error import HTTPError

COOLIFY_URL = "http://187.127.134.246:8000"
EMAIL = "bpillai100@gmail.com"

def create_opener():
    jar = http.cookiejar.CookieJar()
    return build_opener(HTTPCookieProcessor(jar)), jar

def login(opener, password):
    print("[1] Getting login page...")
    resp = opener.open(Request(f"{COOLIFY_URL}/login"), timeout=15)
    html = resp.read().decode("utf-8")
    csrf = re.search(r'csrf-token"\s*content="([^"]+)"', html).group(1)
    print(f"    CSRF: {csrf[:15]}...")
    
    print("[2] Logging in...")
    data = urlencode({"_token": csrf, "email": EMAIL, "password": password}).encode()
    req = Request(f"{COOLIFY_URL}/login", data=data, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    req.add_header("Referer", f"{COOLIFY_URL}/login")
    resp = opener.open(req, timeout=15)
    if "/login" in resp.url:
        print("ERROR: Login failed")
        sys.exit(1)
    print("    Login successful!")
    return True

def get_csrf(opener, url):
    resp = opener.open(Request(url), timeout=15)
    html = resp.read().decode("utf-8")
    csrf = re.search(r'csrf-token"\s*content="([^"]+)"', html).group(1)
    return csrf, html

def try_api_with_session(opener):
    """Try using Coolify API with session cookie auth"""
    print("\n[3] Trying API with session cookies...")
    endpoints = [
        "/api/v1/security/api-tokens",
        "/api/v1/teams/current",
        "/api/v1/servers",
    ]
    for ep in endpoints:
        try:
            req = Request(f"{COOLIFY_URL}{ep}")
            req.add_header("Accept", "application/json")
            resp = opener.open(req, timeout=10)
            body = resp.read().decode("utf-8")
            print(f"    {ep}: {resp.status} - {body[:200]}")
            return True
        except HTTPError as e:
            print(f"    {ep}: HTTP {e.code}")
    return False

def create_token_via_livewire(opener, password):
    """Navigate to profile page and create API token via Livewire"""
    print("\n[4] Looking for API token creation page...")
    
    # Check /profile page for API tokens
    csrf, html = get_csrf(opener, f"{COOLIFY_URL}/profile")
    
    # Look for token-related forms/buttons
    if "API Token" in html or "api_token" in html or "token" in html.lower():
        print("    Found token references in profile page")
        
        # Find Livewire snapshots that relate to tokens
        snapshots = re.findall(r'wire:snapshot="([^"]*)"', html)
        for i, snap_escaped in enumerate(snapshots):
            snap = htmlmod.unescape(snap_escaped)
            try:
                snap_data = json.loads(snap)
                component_name = snap_data.get("memo", {}).get("name", "")
                print(f"    Component {i}: {component_name}")
                
                if "token" in component_name.lower() or "api" in component_name.lower() or "profile" in component_name.lower():
                    print(f"    >>> Found potential token component: {component_name}")
                    print(f"    Data keys: {list(snap_data.get('data', {}).keys())}")
                    
                    # Try calling the create method
                    wire_id = snap_data["memo"]["id"]
                    
                    # First set the token name
                    livewire_data = json.dumps({
                        "_token": csrf,
                        "components": [{
                            "snapshot": snap,
                            "updates": {"name": "rmm-deploy"},
                            "calls": [{
                                "path": "",
                                "method": "addToken" if "token" in component_name else "submit",
                                "params": []
                            }]
                        }]
                    }).encode()
                    
                    req = Request(f"{COOLIFY_URL}/livewire/update", data=livewire_data, method="POST")
                    req.add_header("Content-Type", "application/json")
                    req.add_header("X-Livewire", "")
                    req.add_header("X-CSRF-TOKEN", csrf)
                    
                    try:
                        resp = opener.open(req, timeout=15)
                        result = resp.read().decode("utf-8")
                        
                        # Look for token in the result
                        token_match = re.search(r'(\d+\|[A-Za-z0-9]{40,})', result)
                        if token_match:
                            token = token_match.group(1)
                            print(f"\n    API TOKEN: {token}")
                            return token
                        else:
                            with open(f"lw_result_{i}.json", "w") as f:
                                f.write(result)
                            print(f"    No token in response (saved to lw_result_{i}.json)")
                    except HTTPError as e:
                        print(f"    Livewire error: {e.code}")
            except json.JSONDecodeError:
                pass
    else:
        print("    No token references in profile page")

    # Also check /security/keys page  
    print("\n[5] Checking security pages...")
    for page in ["/security/private-key", "/security"]:
        try:
            csrf, html = get_csrf(opener, f"{COOLIFY_URL}{page}")
            print(f"    Page {page}: loaded ({len(html)} bytes)")
            
            snapshots = re.findall(r'wire:snapshot="([^"]*)"', html)  
            for i, snap_escaped in enumerate(snapshots):
                snap = htmlmod.unescape(snap_escaped)
                try:
                    snap_data = json.loads(snap)
                    name = snap_data.get("memo", {}).get("name", "")
                    if name:
                        print(f"      Component: {name}")
                except:
                    pass
        except HTTPError as e:
            print(f"    Page {page}: HTTP {e.code}")
    
    return None

def main():
    password = sys.argv[1] if len(sys.argv) > 1 else None
    if not password:
        print("Usage: python coolify_deploy.py <password>")
        sys.exit(1)
    
    opener, jar = create_opener()
    login(opener, password)
    
    # Try API with session auth first
    api_works = try_api_with_session(opener)
    
    if not api_works:
        print("    Session-based API access not available")
    
    # Try to create token via Livewire
    token = create_token_via_livewire(opener, password)
    
    if token:
        with open("coolify_token.txt", "w") as f:
            f.write(token)
        print(f"\nToken saved to coolify_token.txt")
    else:
        print("\n\nCould not auto-create API token.")
        print("Please create one manually:")
        print(f"  1. Go to {COOLIFY_URL}")
        print(f"  2. Login with {EMAIL}")
        print(f"  3. Go to Profile -> API Tokens or Keys & Tokens")
        print(f"  4. Create a new token with '*' (all) permissions")
        print(f"  5. Save the token to D:\\RMM\\coolify_token.txt")

if __name__ == "__main__":
    main()
