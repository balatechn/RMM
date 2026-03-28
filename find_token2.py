"""Create API token on Coolify via Livewire"""
import re
import sys
import json
import http.cookiejar
import html as htmlmod
from urllib.request import Request, build_opener, HTTPCookieProcessor
from urllib.parse import urlencode
from urllib.error import HTTPError

COOLIFY_URL = "http://187.127.134.246:8000"
EMAIL = "bpillai100@gmail.com"

def create_opener():
    jar = http.cookiejar.CookieJar()
    return build_opener(HTTPCookieProcessor(jar)), jar

def login(opener, password):
    resp = opener.open(Request(f"{COOLIFY_URL}/login"), timeout=15)
    html = resp.read().decode("utf-8")
    csrf = re.search(r'csrf-token"\s*content="([^"]+)"', html).group(1)
    data = urlencode({"_token": csrf, "email": EMAIL, "password": password}).encode()
    req = Request(f"{COOLIFY_URL}/login", data=data, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    req.add_header("Referer", f"{COOLIFY_URL}/login")
    resp = opener.open(req, timeout=15)
    if "/login" in resp.url:
        sys.exit("Login failed")
    print("Logged in!")

def main():
    password = sys.argv[1]
    opener, _ = create_opener()
    login(opener, password)

    # Get the API tokens page
    print("Loading /security/api-tokens...")
    resp = opener.open(Request(f"{COOLIFY_URL}/security/api-tokens"), timeout=15)
    html = resp.read().decode("utf-8")
    csrf = re.search(r'csrf-token"\s*content="([^"]+)"', html).group(1)
    
    # Find ALL Livewire components and look for api-token related ones
    snapshots = re.findall(r'wire:snapshot="([^"]*)"', html)
    print(f"Found {len(snapshots)} Livewire components")
    
    for i, snap_escaped in enumerate(snapshots):
        snap = htmlmod.unescape(snap_escaped)
        try:
            snap_data = json.loads(snap)
            name = snap_data.get("memo", {}).get("name", "")
            data_keys = list(snap_data.get("data", {}).keys())
            
            # Print all component names with their data
            if "token" in name.lower() or "api" in name.lower():
                print(f"\n  [{i}] {name}")
                print(f"      Keys: {data_keys}")
                print(f"      Data: {json.dumps(snap_data.get('data', {}), indent=2)[:500]}")
        except:
            pass
    
    # Also search for forms specifically on this page related to tokens
    # Look for "Create New Token" or similar form elements
    forms = re.findall(r'<form[^>]*wire:submit=[\'"]([^\'"]+)[\'"][^>]*>', html)
    print(f"\nForms with wire:submit: {forms}")
    
    # Search for specific keywords around API token creation
    for keyword in ["Create New Token", "New API Token", "addApiToken", "createToken", "Generate Token"]:
        if keyword in html:
            idx = html.index(keyword)
            context = html[max(0,idx-200):idx+200]
            print(f"\nFound '{keyword}' at index {idx}")
            print(f"Context: {context[:300]}")
    
    # Find the actual token management section
    # Look for the text that appears ONLY on the API tokens page
    # Search for token-related text blocks
    matches = re.findall(r'(?:New Token|Token Name|Create.*Token|token.*permission)[^<]{0,100}', html, re.IGNORECASE)
    for m in matches[:10]:
        print(f"\nToken-related text: {m[:150]}")

if __name__ == "__main__":
    main()
