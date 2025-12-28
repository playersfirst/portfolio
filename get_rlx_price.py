#!/usr/bin/env python3
"""
Rolex 16200 Europe Region Price (USD)

"""
import cloudscraper
import urllib.parse
import time
import re
import sys
try:
    from bs4 import BeautifulSoup
    HAS_BS4 = True
except ImportError:
    HAS_BS4 = False

# Create scraper with browser-like settings
scraper = cloudscraper.create_scraper(
    browser={
        'browser': 'chrome',
        'platform': 'windows',
        'desktop': True
    }
)

r = scraper.get("https://watchcharts.com/watch_model/862-rolex-datejust-16200/overview")

# Debug: Print all available cookies (to stderr so it doesn't interfere)
if len(scraper.cookies) > 0:
    print(f"DEBUG: Found {len(scraper.cookies)} cookies:", file=sys.stderr)
    for cookie in scraper.cookies:
        print(f"  - {cookie.name}: {cookie.value[:50]}...", file=sys.stderr)
else:
    print("DEBUG: No cookies found", file=sys.stderr)

# First, try to extract CSRF token from Set-Cookie response headers
csrf = None
set_cookie_headers = r.headers.get_list('Set-Cookie') if hasattr(r.headers, 'get_list') else [r.headers.get('Set-Cookie', '')]
for set_cookie in set_cookie_headers:
    if set_cookie:
        # Look for csrfToken in Set-Cookie header
        csrf_match = re.search(r'csrfToken=([^;,\s]+)', set_cookie, re.IGNORECASE)
        if csrf_match:
            csrf = csrf_match.group(1)
            print(f"DEBUG: Found CSRF in Set-Cookie header", file=sys.stderr)
            break

# If not in headers, try cookies
if csrf is None:
    csrf = scraper.cookies.get('csrfToken')
    if csrf:
        print(f"DEBUG: Found CSRF in cookies (csrfToken)", file=sys.stderr)

# If CSRF token not in cookies, try alternative cookie names (case-insensitive search)
if csrf is None:
    for cookie in scraper.cookies:
        cookie_name_lower = cookie.name.lower()
        if 'csrf' in cookie_name_lower or cookie_name_lower in ['_token', 'token']:
            csrf = cookie.value
            print(f"DEBUG: Found CSRF in cookies ({cookie.name})", file=sys.stderr)
            break
    
    # If still not found, try specific cookie names
    if csrf is None:
        for cookie_name in ['csrfToken', 'csrf_token', 'XSRF-TOKEN', '_token', 'csrf-token', 'X-CSRF-TOKEN']:
            csrf = scraper.cookies.get(cookie_name)
            if csrf is not None:
                print(f"DEBUG: Found CSRF in cookies ({cookie_name})", file=sys.stderr)
                break
    
    # If still not found, try extracting from HTML
    if csrf is None:
        html_content = r.text
        
        # Use BeautifulSoup if available for better parsing
        if HAS_BS4:
            try:
                soup = BeautifulSoup(html_content, 'html.parser')
                # Try meta tag
                meta_tag = soup.find('meta', attrs={'name': re.compile(r'csrf', re.I)})
                if meta_tag and meta_tag.get('content'):
                    csrf = meta_tag.get('content')
                    print(f"DEBUG: Found CSRF in meta tag", file=sys.stderr)
                
                # Try to find in script tags
                if csrf is None:
                    for script in soup.find_all('script'):
                        if script.string:
                            # Look for CSRF token in script content
                            script_match = re.search(r'csrf[_-]?token["\']?\s*[:=]\s*["\']([^"\']+)["\']', script.string, re.IGNORECASE)
                            if script_match:
                                csrf = script_match.group(1)
                                print(f"DEBUG: Found CSRF in script tag", file=sys.stderr)
                                break
            except Exception as e:
                print(f"DEBUG: BeautifulSoup parsing failed: {e}", file=sys.stderr)
        
        # Fallback to regex if BeautifulSoup not available or didn't find it
        if csrf is None:
            # Try to find CSRF token in meta tag
            meta_match = re.search(r'<meta\s+name=["\']csrf-token["\']\s+content=["\']([^"\']+)["\']', html_content, re.IGNORECASE)
            if meta_match:
                csrf = meta_match.group(1)
                print(f"DEBUG: Found CSRF in meta tag (regex)", file=sys.stderr)
            else:
                # Try to find in script tags or data attributes
                script_match = re.search(r'csrf[_-]?token["\']?\s*[:=]\s*["\']([^"\']+)["\']', html_content, re.IGNORECASE)
                if script_match:
                    csrf = script_match.group(1)
                    print(f"DEBUG: Found CSRF in script (regex)", file=sys.stderr)
                else:
                    # Try to find in window/global variables
                    window_match = re.search(r'window\.(?:csrf|CSRF)[_-]?token\s*=\s*["\']([^"\']+)["\']', html_content, re.IGNORECASE)
                    if window_match:
                        csrf = window_match.group(1)
                        print(f"DEBUG: Found CSRF in window variable", file=sys.stderr)
                    else:
                        # Try to find in data attributes
                        data_match = re.search(r'data-csrf[_-]?token=["\']([^"\']+)["\']', html_content, re.IGNORECASE)
                        if data_match:
                            csrf = data_match.group(1)
                            print(f"DEBUG: Found CSRF in data attribute", file=sys.stderr)

# If still not found, try making a second request (sometimes cookies are set after first request)
if csrf is None:
    print("DEBUG: CSRF not found on first request, trying second request...", file=sys.stderr)
    time.sleep(2)  # Longer delay to allow Cloudflare challenge to complete
    r2_check = scraper.get("https://watchcharts.com/watch_model/862-rolex-datejust-16200/overview")
    
    # Check Set-Cookie headers again
    set_cookie_headers = r2_check.headers.get_list('Set-Cookie') if hasattr(r2_check.headers, 'get_list') else [r2_check.headers.get('Set-Cookie', '')]
    for set_cookie in set_cookie_headers:
        if set_cookie:
            csrf_match = re.search(r'csrfToken=([^;,\s]+)', set_cookie, re.IGNORECASE)
            if csrf_match:
                csrf = csrf_match.group(1)
                print(f"DEBUG: Found CSRF in Set-Cookie on second request", file=sys.stderr)
                break
    
    if csrf is None:
        csrf = scraper.cookies.get('csrfToken')
        if csrf:
            print(f"DEBUG: Found CSRF in cookies on second request", file=sys.stderr)
    
    if csrf is None:
        for cookie in scraper.cookies:
            cookie_name_lower = cookie.name.lower()
            if 'csrf' in cookie_name_lower:
                csrf = cookie.value
                print(f"DEBUG: Found CSRF in cookies ({cookie.name}) on second request", file=sys.stderr)
                break
    
    # Also try parsing HTML from second request
    if csrf is None and HAS_BS4:
        try:
            soup = BeautifulSoup(r2_check.text, 'html.parser')
            meta_tag = soup.find('meta', attrs={'name': re.compile(r'csrf', re.I)})
            if meta_tag and meta_tag.get('content'):
                csrf = meta_tag.get('content')
                print(f"DEBUG: Found CSRF in meta tag on second request", file=sys.stderr)
        except Exception:
            pass

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
            time.sleep(3)  # Longer delay
            r_retry = scraper.get("https://watchcharts.com/watch_model/862-rolex-datejust-16200/overview")
            
            # Try all methods again on retry
            csrf_retry = scraper.cookies.get('csrfToken')
            if not csrf_retry:
                for cookie in scraper.cookies:
                    if 'csrf' in cookie.name.lower():
                        csrf_retry = cookie.value
                        break
            
            # Try HTML parsing on retry
            if not csrf_retry and HAS_BS4:
                try:
                    soup = BeautifulSoup(r_retry.text, 'html.parser')
                    meta_tag = soup.find('meta', attrs={'name': re.compile(r'csrf', re.I)})
                    if meta_tag and meta_tag.get('content'):
                        csrf_retry = meta_tag.get('content')
                except Exception:
                    pass
            
            if csrf_retry:
                print(f"DEBUG: Found CSRF on retry: {csrf_retry[:20]}...", file=sys.stderr)
                headers['X-CSRF-Token'] = urllib.parse.unquote(csrf_retry) if csrf_retry else ""
                r2 = scraper.get(url, headers=headers)
                if r2.status_code == 200:
                    data = r2.json()
                    prices = data['data']['all']
                    latest_ts = max(prices.keys())
                    latest_price = prices[latest_ts]
                    final_price = latest_price * 1.05
                    print(f"${final_price:,.0f}")
                    exit(0)
            else:
                print("DEBUG: Still no CSRF token found on retry", file=sys.stderr)
    except Exception as e:
        print(f"{error_msg}\nException: {e}", file=sys.stderr)
    
    exit(1)
