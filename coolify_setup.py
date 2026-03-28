"""Coolify API helper - Login and create API token"""
import re
import sys
import json
import http.cookiejar
from urllib.request import Request, urlopen, build_opener, HTTPCookieProcessor
from urllib.parse import urlencode
from urllib.error import HTTPError

COOLIFY_URL = "http://187.127.134.246:8000"
EMAIL = "bpillai100@gmail.com"

def main():
    password = sys.argv[1] if len(sys.argv) > 1 else None
    if not password:
        print("Usage: python coolify_setup.py <password>")
        sys.exit(1)

    # Create a cookie jar + opener that persists cookies
    jar = http.cookiejar.CookieJar()
    opener = build_opener(HTTPCookieProcessor(jar))

    # Step 1: GET login page to get CSRF token + session cookie
    print("[1] Getting login page...")
    req = Request(f"{COOLIFY_URL}/login")
    resp = opener.open(req, timeout=15)
    html = resp.read().decode("utf-8")
    
    # Extract CSRF token
    m = re.search(r'csrf-token"\s*content="([^"]+)"', html)
    if not m:
        print("ERROR: Could not find CSRF token")
        sys.exit(1)
    csrf = m.group(1)
    print(f"   CSRF token: {csrf[:20]}...")

    # Step 2: POST login
    print("[2] Logging in...")
    data = urlencode({
        "_token": csrf,
        "email": EMAIL,
        "password": password,
    }).encode("utf-8")
    
    req = Request(f"{COOLIFY_URL}/login", data=data, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    req.add_header("Referer", f"{COOLIFY_URL}/login")
    
    try:
        resp = opener.open(req, timeout=15)
        final_url = resp.url
        print(f"   Redirected to: {final_url}")
        
        if "/login" in final_url:
            print("ERROR: Login failed - still on login page")
            sys.exit(1)
        print("   Login successful!")
    except HTTPError as e:
        if e.code == 419:
            print(f"ERROR: CSRF mismatch (419). Retrying...")
            sys.exit(1)
        raise

    # Step 3: Get the API tokens page to get a fresh CSRF for token creation
    print("[3] Getting API tokens page...")
    req = Request(f"{COOLIFY_URL}/security/api-tokens")
    resp = opener.open(req, timeout=15)
    html = resp.read().decode("utf-8")
    
    m = re.search(r'csrf-token"\s*content="([^"]+)"', html)
    if not m:
        print("ERROR: Could not find CSRF on tokens page")
        sys.exit(1)
    csrf2 = m.group(1)
    print(f"   Fresh CSRF: {csrf2[:20]}...")
    
    # Step 4: Create API token via Livewire
    # Coolify uses Livewire components. Let's try the API endpoint directly.
    # First try creating a token via the Sanctum endpoint
    print("[4] Creating API token...")
    
    # Try the Livewire approach - Coolify uses Livewire for forms
    # We need to find the Livewire component state
    snapshot_match = re.search(r'wire:snapshot="([^"]*)"', html)
    if snapshot_match:
        import html as htmlmod
        snapshot_raw = htmlmod.unescape(snapshot_match.group(1))
        print(f"   Found Livewire snapshot")
    
    # Alternative: try using /api/v1/security/keys endpoint with session auth
    # Let's try the sanctum token create endpoint
    data = urlencode({
        "_token": csrf2,
        "name": "rmm-deploy",
    }).encode("utf-8")
    
    # Try POST to create token
    req = Request(f"{COOLIFY_URL}/security/api-tokens", data=data, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    req.add_header("Referer", f"{COOLIFY_URL}/security/api-tokens")
    req.add_header("Accept", "text/html,application/xhtml+xml")
    
    try:
        resp = opener.open(req, timeout=15)
        result_html = resp.read().decode("utf-8")
        
        # Look for the token in the response
        token_match = re.search(r'(\d+\|[A-Za-z0-9]+)', result_html)
        if token_match:
            api_token = token_match.group(1)
            print(f"\n   API TOKEN: {api_token}")
            with open("coolify_token.txt", "w") as f:
                f.write(api_token)
            print("   Saved to coolify_token.txt")
            return api_token
        else:
            # Save for debugging
            with open("token_page.html", "w", encoding="utf-8") as f:
                f.write(result_html)
            print("   Token not found in response, saved page for debug")
            print(f"   Response length: {len(result_html)}")
    except HTTPError as e:
        print(f"   HTTP Error: {e.code}")
        body = e.read().decode("utf-8", errors="replace")
        with open("token_error.html", "w", encoding="utf-8") as f:
            f.write(body)
        print(f"   Error body saved to token_error.html")

    # If form POST didn't work, try Livewire RPC
    print("\n[5] Trying Livewire approach...")
    
    # Find all Livewire component data
    wire_id_match = re.search(r'wire:id="([^"]+)"', html)
    if wire_id_match:
        wire_id = wire_id_match.group(1)
        print(f"   Livewire component: {wire_id}")
        
        if snapshot_match:
            import html as htmlmod
            snapshot_raw = htmlmod.unescape(snapshot_match.group(1))
            
            # Create Livewire update request
            livewire_data = json.dumps({
                "_token": csrf2,
                "components": [{
                    "snapshot": snapshot_raw,
                    "updates": {},
                    "calls": [{
                        "path": "",
                        "method": "createToken",
                        "params": []
                    }]
                }]
            }).encode("utf-8")
            
            req = Request(f"{COOLIFY_URL}/livewire/update", data=livewire_data, method="POST")
            req.add_header("Content-Type", "application/json")
            req.add_header("X-Livewire", "")
            req.add_header("X-CSRF-TOKEN", csrf2)
            req.add_header("Referer", f"{COOLIFY_URL}/security/api-tokens")
            
            try:
                resp = opener.open(req, timeout=15)
                result = resp.read().decode("utf-8")
                
                token_match = re.search(r'(\d+\|[A-Za-z0-9]+)', result)
                if token_match:
                    api_token = token_match.group(1)
                    print(f"\n   API TOKEN: {api_token}")
                    with open("coolify_token.txt", "w") as f:
                        f.write(api_token)
                    return api_token
                else:
                    with open("livewire_result.json", "w", encoding="utf-8") as f:
                        f.write(result)
                    print("   Livewire result saved to livewire_result.json")
            except HTTPError as e:
                print(f"   Livewire error: {e.code}")
                body = e.read().decode("utf-8", errors="replace")[:500]
                print(f"   {body}")

    print("\nDone. Check output files for debugging.")

if __name__ == "__main__":
    main()
