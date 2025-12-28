#!/usr/bin/env python3
"""
Rolex 16200 Europe Region Price (USD)

"""
import cloudscraper
import urllib.parse
import time
import re
import sys

# Try to use Playwright to get cookies (bypasses Cloudflare on GitHub Actions)
playwright_cookies = None
try:
    from playwright.sync_api import sync_playwright
    USE_PLAYWRIGHT = True
    print("DEBUG: Using Playwright to get cookies (bypass Cloudflare)...", file=sys.stderr)
    
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=['--disable-blink-features=AutomationControlled', '--disable-dev-shm-usage', '--no-sandbox']
        )
        context = browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        )
        page = context.new_page()
        
        page.goto("https://watchcharts.com/watch_model/862-rolex-datejust-16200/overview", wait_until="load", timeout=30000)
        time.sleep(3)  # Wait for Cloudflare challenge
        
        cookies = context.cookies()
        playwright_cookies = {cookie['name']: cookie['value'] for cookie in cookies}
        print(f"DEBUG: Got {len(playwright_cookies)} cookies from Playwright", file=sys.stderr)
        browser.close()
except ImportError:
    USE_PLAYWRIGHT = False
    print("DEBUG: Playwright not available, using cloudscraper only", file=sys.stderr)
except Exception as e:
    USE_PLAYWRIGHT = False
    print(f"DEBUG: Playwright failed: {e}, falling back to cloudscraper", file=sys.stderr)

# Use cloudscraper (like your original code)
scraper = cloudscraper.create_scraper()

# If we got cookies from Playwright, add them to cloudscraper
if playwright_cookies:
    # Only add essential cookies to avoid header size issues
    for name in ['csrfToken', 'cf_clearance']:
        if name in playwright_cookies:
            scraper.cookies.set(name, playwright_cookies[name], domain='.watchcharts.com', path='/')
    print("DEBUG: Added Playwright cookies to cloudscraper", file=sys.stderr)

print("DEBUG: Making request with cloudscraper...", file=sys.stderr)
r = scraper.get("https://watchcharts.com/watch_model/862-rolex-datejust-16200/overview")
print(f"DEBUG: cloudscraper request status: {r.status_code}", file=sys.stderr)
csrf = scraper.cookies.get('csrfToken')
print(f"DEBUG: CSRF token from cookies: {'Found' if csrf else 'Not found'}", file=sys.stderr)

# If CSRF token not in cookies, try to extract from HTML response
if csrf is None:
    # Try alternative cookie names
    for cookie_name in ['csrfToken', 'csrf_token', 'XSRF-TOKEN', '_token']:
        csrf = scraper.cookies.get(cookie_name)
        if csrf is not None:
            break
    
    # If still not found, try extracting from HTML meta tag or script
    if csrf is None:
        html_content = r.text
        # Try to find CSRF token in meta tag
        meta_match = re.search(r'<meta\s+name=["\']csrf-token["\']\s+content=["\']([^"\']+)["\']', html_content, re.IGNORECASE)
        if meta_match:
            csrf = meta_match.group(1)
        else:
            # Try to find in script tags or data attributes
            script_match = re.search(r'csrf[_-]?token["\']?\s*[:=]\s*["\']([^"\']+)["\']', html_content, re.IGNORECASE)
            if script_match:
                csrf = script_match.group(1)

# If CSRF token still not found, try without it or use empty string
if csrf is None:
    print("Warning: CSRF token not found, attempting request without it", file=sys.stderr)
    csrf = ""

headers = {
    'Referer': 'https://watchcharts.com/watch_model/862-rolex-datejust-16200/overview',
    'X-Requested-With': 'XMLHttpRequest',
}

# Only add CSRF token header if we have one
if csrf:
    headers['X-CSRF-Token'] = urllib.parse.unquote(csrf) if csrf else ""

timestamp = int(time.time() * 1000)
url = f"https://watchcharts.com/charts/watch/862.json?type=trend&key=0150&variation_id=0&mobile=0&_={timestamp}"

print("DEBUG: Making API request...", file=sys.stderr)
r2 = scraper.get(url, headers=headers)
print(f"DEBUG: API request status: {r2.status_code}", file=sys.stderr)

if r2.status_code == 200:
    data = r2.json()
    prices = data['data']['all']
    latest_ts = max(prices.keys())
    latest_price = prices[latest_ts]
    
    final_price = latest_price * 1.05
    
    print(f"${final_price:,.0f}")
else:
    print(f"Error: {r2.status_code}")
    exit(1)
