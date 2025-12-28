#!/usr/bin/env python3
"""
Rolex 16200 Europe Region Price (USD)

"""
import cloudscraper
import urllib.parse
import time
import re
import sys

# Try to use Playwright (bypasses Cloudflare on GitHub Actions)
USE_PLAYWRIGHT = False
try:
    from playwright.sync_api import sync_playwright
    USE_PLAYWRIGHT = True
    print("DEBUG: Using Playwright (real browser) for Cloudflare bypass", file=sys.stderr)
except ImportError:
    USE_PLAYWRIGHT = False
    print("DEBUG: Playwright not available, using cloudscraper only", file=sys.stderr)

if USE_PLAYWRIGHT:
    # Use Playwright for everything (works better on GitHub Actions)
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
        
        # Load the page to get past Cloudflare
        print("DEBUG: Loading page with Playwright to bypass Cloudflare...", file=sys.stderr)
        page.goto("https://watchcharts.com/watch_model/862-rolex-datejust-16200/overview", wait_until="load", timeout=30000)
        time.sleep(3)  # Wait for Cloudflare challenge
        
        # Get CSRF token from cookies
        cookies = context.cookies()
        playwright_cookies = {cookie['name']: cookie['value'] for cookie in cookies}
        csrf = playwright_cookies.get('csrfToken')
        print(f"DEBUG: Got {len(playwright_cookies)} cookies, CSRF: {'Found' if csrf else 'Not found'}", file=sys.stderr)
        
        # If CSRF not in cookies, try to extract from page
        if csrf is None:
            html_content = page.content()
            meta_match = re.search(r'<meta\s+name=["\']csrf-token["\']\s+content=["\']([^"\']+)["\']', html_content, re.IGNORECASE)
            if meta_match:
                csrf = meta_match.group(1)
        
        # Prepare headers for API request
        headers = {
            'Referer': 'https://watchcharts.com/watch_model/862-rolex-datejust-16200/overview',
            'X-Requested-With': 'XMLHttpRequest',
        }
        if csrf:
            headers['X-CSRF-Token'] = urllib.parse.unquote(csrf) if csrf else ""
        
        # Make API request using Playwright's request API (uses same browser context)
        timestamp = int(time.time() * 1000)
        url = f"https://watchcharts.com/charts/watch/862.json?type=trend&key=0150&variation_id=0&mobile=0&_={timestamp}"
        
        print("DEBUG: Making API request with Playwright...", file=sys.stderr)
        response = page.request.get(url, headers=headers)
        print(f"DEBUG: API request status: {response.status}", file=sys.stderr)
        
        if response.status == 200:
            data = response.json()
            print(f"DEBUG: Got JSON data, keys: {list(data.keys())}", file=sys.stderr)
            prices = data['data']['all']
            print(f"DEBUG: Found {len(prices)} price points", file=sys.stderr)
            latest_ts = max(prices.keys())
            latest_price = prices[latest_ts]
            
            final_price = latest_price * 1.05
            
            # Print to stdout (not stderr) so it can be captured by grep
            print(f"${final_price:,.0f}")
            sys.stdout.flush()
            
            browser.close()
            exit(0)
        else:
            print(f"Error: {response.status}", file=sys.stderr)
            print(f"Response: {response.text()[:500]}", file=sys.stderr)
            browser.close()
            exit(1)

# Fallback to cloudscraper (your original code - works on Mac)
scraper = cloudscraper.create_scraper()

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
    try:
        data = r2.json()
        print(f"DEBUG: Got JSON data, keys: {list(data.keys())}", file=sys.stderr)
        prices = data['data']['all']
        print(f"DEBUG: Found {len(prices)} price points", file=sys.stderr)
        latest_ts = max(prices.keys())
        latest_price = prices[latest_ts]
        
        final_price = latest_price * 1.05
        
        # Print to stdout (not stderr) so it can be captured by grep
        print(f"${final_price:,.0f}")
        sys.stdout.flush()  # Ensure output is flushed
    except Exception as e:
        print(f"Error parsing response: {e}", file=sys.stderr)
        print(f"Response text (first 500 chars): {r2.text[:500]}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        exit(1)
else:
    print(f"Error: {r2.status_code}", file=sys.stderr)
    print(f"Response: {r2.text[:500]}", file=sys.stderr)
    exit(1)
