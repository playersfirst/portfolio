#!/usr/bin/env python3
"""
Rolex 16200 Europe Region Price (USD)

"""
import cloudscraper
import urllib.parse
import time
import re
import sys

# Create scraper with browser-like settings
scraper = cloudscraper.create_scraper(
    browser={
        'browser': 'chrome',
        'platform': 'windows',
        'desktop': True
    }
)

r = scraper.get("https://watchcharts.com/watch_model/862-rolex-datejust-16200/overview")

# First, try to extract CSRF token from Set-Cookie response headers
csrf = None
if 'Set-Cookie' in r.headers:
    set_cookie = r.headers.get('Set-Cookie', '')
    # Look for csrfToken in Set-Cookie header
    csrf_match = re.search(r'csrfToken=([^;]+)', set_cookie, re.IGNORECASE)
    if csrf_match:
        csrf = csrf_match.group(1)

# If not in headers, try cookies
if csrf is None:
    csrf = scraper.cookies.get('csrfToken')

# If CSRF token not in cookies, try to extract from HTML response
if csrf is None:
    # Try alternative cookie names (case-insensitive search)
    for cookie in scraper.cookies:
        cookie_name_lower = cookie.name.lower()
        if 'csrf' in cookie_name_lower or cookie_name_lower in ['_token', 'token']:
            csrf = cookie.value
            break
    
    # If still not found, try specific cookie names
    if csrf is None:
        for cookie_name in ['csrfToken', 'csrf_token', 'XSRF-TOKEN', '_token', 'csrf-token']:
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
            else:
                # Try to find in window/global variables
                window_match = re.search(r'window\.(?:csrf|CSRF)[_-]?token\s*=\s*["\']([^"\']+)["\']', html_content, re.IGNORECASE)
                if window_match:
                    csrf = window_match.group(1)

# If still not found, try making a second request (sometimes cookies are set after first request)
if csrf is None:
    time.sleep(1)  # Small delay
    r2_check = scraper.get("https://watchcharts.com/watch_model/862-rolex-datejust-16200/overview")
    csrf = scraper.cookies.get('csrfToken')
    if csrf is None:
        for cookie in scraper.cookies:
            cookie_name_lower = cookie.name.lower()
            if 'csrf' in cookie_name_lower:
                csrf = cookie.value
                break

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
    # Unquote if it's URL-encoded, otherwise use as-is
    try:
        headers['X-CSRF-Token'] = urllib.parse.unquote(csrf)
    except (TypeError, AttributeError):
        headers['X-CSRF-Token'] = str(csrf)

timestamp = int(time.time() * 1000)
url = f"https://watchcharts.com/charts/watch/862.json?type=trend&key=0150&variation_id=0&mobile=0&_={timestamp}"

r2 = scraper.get(url, headers=headers)

if r2.status_code == 200:
    data = r2.json()
    prices = data['data']['all']
    latest_ts = max(prices.keys())
    latest_price = prices[latest_ts]
    
    final_price = latest_price * 1.05
    
    print(f"${final_price:,.0f}")
else:
    # If request failed, try to get more info
    error_msg = f"Error: {r2.status_code}"
    try:
        error_data = r2.text[:500]  # First 500 chars of error response
        print(f"{error_msg}\nResponse: {error_data}", file=sys.stderr)
        
        # Sometimes the error response contains the CSRF token requirement
        # Try to extract it and retry
        if csrf is None or csrf == "":
            # Check if we can get CSRF from the error response or retry with fresh request
            print("Retrying with fresh request to get CSRF token...", file=sys.stderr)
            time.sleep(2)
            r_retry = scraper.get("https://watchcharts.com/watch_model/862-rolex-datejust-16200/overview")
            csrf_retry = scraper.cookies.get('csrfToken')
            if csrf_retry:
                headers['X-CSRF-Token'] = urllib.parse.unquote(csrf_retry)
                r2 = scraper.get(url, headers=headers)
                if r2.status_code == 200:
                    data = r2.json()
                    prices = data['data']['all']
                    latest_ts = max(prices.keys())
                    latest_price = prices[latest_ts]
                    final_price = latest_price * 1.05
                    print(f"${final_price:,.0f}")
                    exit(0)
    except Exception as e:
        print(f"{error_msg}\nException: {e}", file=sys.stderr)
    
    exit(1)
