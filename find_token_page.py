"""Find and create Coolify API token"""
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
    resp = opener.open(Request(f"{COOLIFY_URL}/login"), timeout=15)
    html = resp.read().decode("utf-8")
    csrf = re.search(r'csrf-token"\s*content="([^"]+)"', html).group(1)
    data = urlencode({"_token": csrf, "email": EMAIL, "password": password}).encode()
    req = Request(f"{COOLIFY_URL}/login", data=data, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    req.add_header("Referer", f"{COOLIFY_URL}/login")
    resp = opener.open(req, timeout=15)
    if "/login" in resp.url:
        print("Login failed"); sys.exit(1)
    print("Logged in!")

def check_page(opener, path):
    try:
        resp = opener.open(Request(f"{COOLIFY_URL}{path}"), timeout=10)
        html = resp.read().decode("utf-8")
        has_token_form = any(x in html.lower() for x in ["api token", "create token", "personal access", "addtoken"])
        # Find navigation links
        links = set(re.findall(r'href="http://187\.127\.134\.246:8000(/[^"]*)"', html))
        return {"status": resp.status, "size": len(html), "has_token_form": has_token_form, "links": links, "html": html}
    except HTTPError as e:
        return {"status": e.code, "size": 0, "has_token_form": False, "links": set(), "html": ""}

def main():
    password = sys.argv[1]
    opener, _ = create_opener()
    login(opener, password)
    
    # Check various pages for API token creation
    pages = ["/settings", "/profile", "/profile/tokens", "/security/api-tokens",
             "/settings/tokens", "/settings/api", "/team", "/team/api-tokens"]
    
    all_links = set()
    for page in pages:
        result = check_page(opener, page)
        print(f"{page}: HTTP {result['status']}, {result['size']} bytes, token_form={result['has_token_form']}")
        all_links.update(result["links"])
        if result["has_token_form"]:
            print(f"  >>> TOKEN FORM FOUND on {page}")
            with open("token_page_found.html", "w", encoding="utf-8") as f:
                f.write(result["html"])
    
    # Print unique internal paths
    paths = sorted(all_links)
    print(f"\nAll discovered paths ({len(paths)}):")
    for p in paths:
        if not p.startswith("/build/") and not p.endswith(".svg") and not p.endswith(".css") and not p.endswith(".js"):
            print(f"  {p}")

if __name__ == "__main__":
    main()
