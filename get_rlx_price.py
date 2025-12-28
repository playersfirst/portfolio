#!/usr/bin/env python3
"""
Rolex 16200 Europe Region Price (USD)

"""
import cloudscraper
import urllib.parse
import time
import re
import sys

scraper = cloudscraper.create_scraper()

r = scraper.get("https://watchcharts.com/watch_model/862-rolex-datejust-16200/overview")
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
    print(f"Error: {r2.status_code}")
    exit(1)
