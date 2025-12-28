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

# Try Playwright first (real browser - best for Cloudflare)
USE_PLAYWRIGHT = False
try:
    from playwright.sync_api import sync_playwright
    USE_PLAYWRIGHT = True
    print("DEBUG: Using Playwright (real browser) for Cloudflare bypass", file=sys.stderr)
except ImportError:
    USE_PLAYWRIGHT = False

# Try to use curl_cffi if available (better at bypassing Cloudflare)
USE_CURL_CFFI = False
if not USE_PLAYWRIGHT:
    try:
        from curl_cffi import requests
        USE_CURL_CFFI = True
        print("DEBUG: Using curl_cffi for better Cloudflare bypass", file=sys.stderr)
    except ImportError:
        USE_CURL_CFFI = False
        print("DEBUG: curl_cffi not available, using cloudscraper", file=sys.stderr)

def get_cookies_dict(session_or_scraper, use_curl_cffi):
    """Helper function to get cookies as a dict from either curl_cffi or cloudscraper"""
    if use_curl_cffi:
        # curl_cffi cookies are accessed differently
        try:
            # Try dict conversion first
            if isinstance(session_or_scraper.cookies, dict):
                return session_or_scraper.cookies
            # Try accessing as items
            return dict(session_or_scraper.cookies)
        except:
            # Fallback: try to iterate if it's a cookie jar
            try:
                return {name: cookie.value for name, cookie in session_or_scraper.cookies.items()}
            except:
                # Last resort: empty dict
                return {}
    else:
        # cloudscraper uses requests-style cookies
        return {cookie.name: cookie.value for cookie in session_or_scraper.cookies}

# Initialize based on available libraries
if USE_PLAYWRIGHT:
    # Playwright will be initialized when needed
    pass
elif USE_CURL_CFFI:
    # Use curl_cffi which is better at bypassing Cloudflare
    try:
        session = requests.Session()
    except:
        session = requests.Session()
else:
    # Create scraper with browser-like settings
    try:
        scraper = cloudscraper.create_scraper(
            browser={
                'browser': 'chrome',
                'platform': 'windows',
                'desktop': True
            },
            delay=10
        )
    except:
        scraper = cloudscraper.create_scraper(delay=10)

# Make initial request using the best available method
if USE_PLAYWRIGHT:
    # Use Playwright with real browser - best for bypassing Cloudflare
    print("DEBUG: Using Playwright to load page...", file=sys.stderr)
    with sync_playwright() as p:
        # Launch browser with stealth settings
        browser = p.chromium.launch(
            headless=True,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                '--no-sandbox',
                '--disable-setuid-sandbox',
            ]
        )
        
        # Create context with realistic settings
        context = browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            locale='en-US',
            timezone_id='America/New_York',
        )
        
        page = context.new_page()
        
        # Navigate to page and wait for it to load
        # Use "load" instead of "networkidle" - more reliable, waits for page to load
        print("DEBUG: Navigating to page...", file=sys.stderr)
        try:
            page.goto("https://watchcharts.com/watch_model/862-rolex-datejust-16200/overview", wait_until="load", timeout=30000)
        except Exception as e:
            print(f"DEBUG: Page load timeout, trying with domcontentloaded...", file=sys.stderr)
            # Fallback to domcontentloaded if load times out
            try:
                page.goto("https://watchcharts.com/watch_model/862-rolex-datejust-16200/overview", wait_until="domcontentloaded", timeout=30000)
            except Exception as e2:
                print(f"DEBUG: Both load strategies failed: {e2}", file=sys.stderr)
                # Last resort - just navigate without waiting
                page.goto("https://watchcharts.com/watch_model/862-rolex-datejust-16200/overview", timeout=30000)
        
        # Wait a bit for any JavaScript to execute and Cloudflare challenge to complete
        print("DEBUG: Waiting for page to stabilize...", file=sys.stderr)
        time.sleep(5)
        
        # Get cookies from browser
        cookies = context.cookies()
        cookies_dict = {cookie['name']: cookie['value'] for cookie in cookies}
        print(f"DEBUG: Playwright cookies: {list(cookies_dict.keys())}", file=sys.stderr)
        
        # Check if page loaded successfully
        page_url = page.url
        print(f"DEBUG: Page loaded, URL: {page_url}", file=sys.stderr)
        
        # Get page content
        html_content = page.content()
        print(f"DEBUG: Page content length: {len(html_content)}", file=sys.stderr)
        
        # Check if we got blocked by Cloudflare
        if 'challenge' in html_content.lower() or 'just a moment' in html_content.lower() or len(html_content) < 1000:
            print("DEBUG: Possible Cloudflare challenge, waiting longer...", file=sys.stderr)
            time.sleep(10)
            html_content = page.content()
            cookies = context.cookies()
            cookies_dict = {cookie['name']: cookie['value'] for cookie in cookies}
            print(f"DEBUG: After wait - Content length: {len(html_content)}, Cookies: {list(cookies_dict.keys())}", file=sys.stderr)
        
        # Create a mock response object for compatibility
        class MockResponse:
            def __init__(self, status_code, text, headers, cookies_dict):
                self.status_code = status_code
                self.text = text
                self.headers = headers
                self.cookies_dict = cookies_dict
        
        r = MockResponse(200, html_content, {}, cookies_dict)
        
        browser.close()
        
elif USE_CURL_CFFI:
    # Try with chrome120 first (most recent and best support)
    import random
    time.sleep(random.uniform(1, 3))
    
    try:
        print(f"DEBUG: Making initial request with chrome120...", file=sys.stderr)
        r = session.get("https://watchcharts.com/watch_model/862-rolex-datejust-16200/overview", 
                       impersonate="chrome120", timeout=60)
        cookies_dict = get_cookies_dict(session, USE_CURL_CFFI)
        print(f"DEBUG: Initial request - Status: {r.status_code}, Cookies: {list(cookies_dict.keys())}", file=sys.stderr)
        
        if r.status_code == 403:
            print(f"DEBUG: Got 403, waiting 15 seconds for challenge to complete...", file=sys.stderr)
            time.sleep(15)
            r = session.get("https://watchcharts.com/watch_model/862-rolex-datejust-16200/overview", 
                           impersonate="chrome120", timeout=60)
            cookies_dict = get_cookies_dict(session, USE_CURL_CFFI)
            print(f"DEBUG: Retry after wait - Status: {r.status_code}, Cookies: {list(cookies_dict.keys())}", file=sys.stderr)
    except Exception as e:
        print(f"DEBUG: Request failed: {e}", file=sys.stderr)
        r = session.get("https://watchcharts.com/watch_model/862-rolex-datejust-16200/overview", 
                      impersonate="chrome120", timeout=60)
        cookies_dict = get_cookies_dict(session, USE_CURL_CFFI)
else:
    r = scraper.get("https://watchcharts.com/watch_model/862-rolex-datejust-16200/overview")
    cookies_dict = get_cookies_dict(scraper, USE_CURL_CFFI)

# Debug: Check what we actually got back
print(f"DEBUG: First request status: {r.status_code}", file=sys.stderr)
print(f"DEBUG: Response length: {len(r.text)}", file=sys.stderr)
print(f"DEBUG: Response headers: {dict(r.headers)}", file=sys.stderr)

# Check if we got a Cloudflare challenge page (skip for Playwright as it already handled it)
if not USE_PLAYWRIGHT and ('cloudflare' in r.text.lower() or 'challenge' in r.text.lower() or r.status_code == 403):
    print("DEBUG: Possible Cloudflare challenge detected", file=sys.stderr)
    # Try with a longer delay and different Chrome version
    time.sleep(10)  # Longer delay for challenge to complete
    if USE_CURL_CFFI:
        # Try with chrome120 and longer timeout
        try:
            r = session.get("https://watchcharts.com/watch_model/862-rolex-datejust-16200/overview", 
                          impersonate="chrome120", timeout=60)
            cookies_dict = get_cookies_dict(session, USE_CURL_CFFI)
        except Exception as e:
            print(f"DEBUG: Retry failed: {e}", file=sys.stderr)
    else:
        r = scraper.get("https://watchcharts.com/watch_model/862-rolex-datejust-16200/overview")
        cookies_dict = get_cookies_dict(scraper, USE_CURL_CFFI)
    print(f"DEBUG: Retry request status: {r.status_code}", file=sys.stderr)

# Debug: Print all available cookies (to stderr so it doesn't interfere)
if USE_CURL_CFFI:
    if len(cookies_dict) > 0:
        print(f"DEBUG: Found {len(cookies_dict)} cookies:", file=sys.stderr)
        for name, value in cookies_dict.items():
            print(f"  - {name}: {value[:50]}...", file=sys.stderr)
    else:
        print("DEBUG: No cookies found (curl_cffi)", file=sys.stderr)
else:
    if len(scraper.cookies) > 0:
        print(f"DEBUG: Found {len(scraper.cookies)} cookies:", file=sys.stderr)
        for cookie in scraper.cookies:
            print(f"  - {cookie.name}: {cookie.value[:50]}...", file=sys.stderr)
    else:
        print("DEBUG: No cookies found", file=sys.stderr)
        # If no cookies, check if we got HTML content
        if r.text and len(r.text) > 100:
            print(f"DEBUG: Got HTML response (first 200 chars): {r.text[:200]}", file=sys.stderr)

# Extract CSRF token
csrf = None

# First try cookies (works for all methods)
if USE_PLAYWRIGHT or USE_CURL_CFFI:
    csrf = cookies_dict.get('csrfToken') or cookies_dict.get('csrf_token')
    if csrf:
        print(f"DEBUG: Found CSRF in cookies (csrfToken)", file=sys.stderr)
else:
    csrf = scraper.cookies.get('csrfToken')
    if csrf:
        print(f"DEBUG: Found CSRF in cookies (csrfToken)", file=sys.stderr)

# If not in cookies, try Set-Cookie headers (for non-Playwright methods)
if csrf is None and not USE_PLAYWRIGHT:
    set_cookie_headers = r.headers.get_list('Set-Cookie') if hasattr(r.headers, 'get_list') else [r.headers.get('Set-Cookie', '')]
    for set_cookie in set_cookie_headers:
        if set_cookie:
            csrf_match = re.search(r'csrfToken=([^;,\s]+)', set_cookie, re.IGNORECASE)
            if csrf_match:
                csrf = csrf_match.group(1)
                print(f"DEBUG: Found CSRF in Set-Cookie header", file=sys.stderr)
                break

# If CSRF token not in cookies, try alternative cookie names (case-insensitive search)
if csrf is None:
    cookies_to_check = cookies_dict if USE_CURL_CFFI else scraper.cookies
    if USE_CURL_CFFI:
        for cookie_name, cookie_value in cookies_to_check.items():
            cookie_name_lower = cookie_name.lower()
            if 'csrf' in cookie_name_lower or cookie_name_lower in ['_token', 'token']:
                csrf = cookie_value
                print(f"DEBUG: Found CSRF in cookies ({cookie_name})", file=sys.stderr)
                break
    else:
        for cookie in cookies_to_check:
            cookie_name_lower = cookie.name.lower()
            if 'csrf' in cookie_name_lower or cookie_name_lower in ['_token', 'token']:
                csrf = cookie.value
                print(f"DEBUG: Found CSRF in cookies ({cookie.name})", file=sys.stderr)
                break
    
    # If still not found, try specific cookie names
    if csrf is None:
        for cookie_name in ['csrfToken', 'csrf_token', 'XSRF-TOKEN', '_token', 'csrf-token', 'X-CSRF-TOKEN']:
            if USE_CURL_CFFI:
                csrf = cookies_dict.get(cookie_name)
            else:
                csrf = scraper.cookies.get(cookie_name)
            if csrf is not None:
                print(f"DEBUG: Found CSRF in cookies ({cookie_name})", file=sys.stderr)
                break
    
    # If still not found, try extracting from HTML
    if csrf is None:
        html_content = r.text
        
        # More aggressive regex patterns to find CSRF token
        # Try various patterns that might match CSRF tokens in HTML/JS
        patterns = [
            r'csrf[_-]?token["\']?\s*[:=]\s*["\']([^"\']+)["\']',  # Standard pattern
            r'["\']csrf[_-]?token["\']\s*:\s*["\']([^"\']+)["\']',  # JSON-like
            r'csrf[_-]?token["\']?\s*=\s*["\']([^"\']+)["\']',  # Assignment
            r'X-CSRF-Token["\']?\s*[:=]\s*["\']([^"\']+)["\']',  # Header format
            r'<input[^>]*name=["\']_token["\'][^>]*value=["\']([^"\']+)["\']',  # Form input
            r'<input[^>]*name=["\']csrf_token["\'][^>]*value=["\']([^"\']+)["\']',  # Form input variant
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, html_content, re.IGNORECASE)
            if matches:
                csrf = matches[0]
                print(f"DEBUG: Found CSRF using pattern: {pattern[:30]}...", file=sys.stderr)
                break
        
        # Use BeautifulSoup if available for better parsing
        if csrf is None and HAS_BS4:
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
                            for pattern in patterns:
                                script_match = re.search(pattern, script.string, re.IGNORECASE)
                                if script_match:
                                    csrf = script_match.group(1)
                                    print(f"DEBUG: Found CSRF in script tag", file=sys.stderr)
                                    break
                            if csrf:
                                break
                
                # Try input fields
                if csrf is None:
                    for inp in soup.find_all('input', attrs={'name': re.compile(r'csrf|token', re.I)}):
                        if inp.get('value'):
                            csrf = inp.get('value')
                            print(f"DEBUG: Found CSRF in input field", file=sys.stderr)
                            break
            except Exception as e:
                print(f"DEBUG: BeautifulSoup parsing failed: {e}", file=sys.stderr)

# If still not found, try making a second request (sometimes cookies are set after first request)
if csrf is None:
    print("DEBUG: CSRF not found on first request, trying second request...", file=sys.stderr)
    time.sleep(2)  # Longer delay to allow Cloudflare challenge to complete
    if USE_CURL_CFFI:
        # Try with chrome120 and longer timeout
        r2_check = session.get("https://watchcharts.com/watch_model/862-rolex-datejust-16200/overview", 
                              impersonate="chrome120", timeout=60)
        cookies_dict = get_cookies_dict(session, USE_CURL_CFFI)
    else:
        r2_check = scraper.get("https://watchcharts.com/watch_model/862-rolex-datejust-16200/overview")
        cookies_dict = get_cookies_dict(scraper, USE_CURL_CFFI)
    
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
        if USE_CURL_CFFI:
            csrf = cookies_dict.get('csrfToken')
        else:
            csrf = scraper.cookies.get("csrfToken")
        if csrf:
            print(f"DEBUG: Found CSRF in cookies on second request", file=sys.stderr)
    
    if csrf is None:
        cookies_to_check = cookies_dict if USE_CURL_CFFI else scraper.cookies
        if USE_CURL_CFFI:
            for cookie_name, cookie_value in cookies_to_check.items():
                if 'csrf' in cookie_name.lower():
                    csrf = cookie_value
                    print(f"DEBUG: Found CSRF in cookies ({cookie_name}) on second request", file=sys.stderr)
                    break
        else:
            for cookie in cookies_to_check:
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

if USE_PLAYWRIGHT:
    # Use Playwright to make the API request with cookies
    print("DEBUG: Making API request with Playwright...", file=sys.stderr)
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=['--disable-blink-features=AutomationControlled', '--disable-dev-shm-usage', '--no-sandbox']
        )
        context = browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        )
        
        # Set cookies from previous request
        if cookies_dict:
            context.add_cookies([{'name': k, 'value': v, 'domain': '.watchcharts.com', 'path': '/'} for k, v in cookies_dict.items()])
        
        # Use request context to make API call
        api_response = context.request.get(url, headers=headers)
        
        status = api_response.status
        content = api_response.text()
        
        browser.close()
        
        # Create mock response
        class MockResponse:
            def __init__(self, status_code, text):
                self.status_code = status_code
                self.text = text
            def json(self):
                import json
                return json.loads(self.text)
        
        r2 = MockResponse(status, content)
        
elif USE_CURL_CFFI:
    r2 = session.get(url, headers=headers, impersonate="chrome120", timeout=60)
else:
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
            if USE_CURL_CFFI:
                r_retry = session.get("https://watchcharts.com/watch_model/862-rolex-datejust-16200/overview", 
                                      impersonate="chrome120", timeout=60)
                cookies_dict = get_cookies_dict(session, USE_CURL_CFFI)
            else:
                r_retry = scraper.get("https://watchcharts.com/watch_model/862-rolex-datejust-16200/overview")
                cookies_dict = get_cookies_dict(scraper, USE_CURL_CFFI)
            
            # Try all methods again on retry
            if USE_CURL_CFFI:
                csrf_retry = cookies_dict.get('csrfToken') or cookies_dict.get('csrf_token')
                if not csrf_retry:
                    for cookie_name, cookie_value in cookies_dict.items():
                        if 'csrf' in cookie_name.lower():
                            csrf_retry = cookie_value
                            break
            else:
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
                if USE_CURL_CFFI:
                    r2 = session.get(url, headers=headers, impersonate="chrome120", timeout=60)
                else:
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
