#!/usr/bin/env python3
"""
Rolex 16200 Europe Region Price (USD)

"""
import cloudscraper
import urllib.parse
import time

scraper = cloudscraper.create_scraper()

r = scraper.get("https://watchcharts.com/watch_model/862-rolex-datejust-16200/overview")
csrf = scraper.cookies.get('csrfToken')

headers = {
    'Referer': 'https://watchcharts.com/watch_model/862-rolex-datejust-16200/overview',
    'X-Requested-With': 'XMLHttpRequest',
    'X-CSRF-Token': urllib.parse.unquote(csrf),
}

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
