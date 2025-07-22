import requests
import datetime
import time
import json

def load_portfolio_config():
    """
    Loads portfolio configuration from portfolio_config.json
    """
    try:
        with open('portfolio_config.json', 'r') as f:
            config = json.load(f)
        return config
    except FileNotFoundError:
        print("Error: portfolio_config.json not found")
        return None
    except json.JSONDecodeError:
        print("Error: Invalid JSON in portfolio_config.json")
        return None

def get_portfolio_ytd_return(asset_results, config, exclude_sgov=False):
    """
    Calculates the total portfolio YTD return based on initial investments
    """
    initial_investments = config.get('initialInvestments', {})
    
    if exclude_sgov:
        # Calculate total invested excluding SGOV
        total_invested = sum(amount for asset, amount in initial_investments.items() if asset != "SGOV")
        sgov_invested = initial_investments.get("SGOV", 0)
        print(f"\nCalculating portfolio YTD return (excluding SGOV):")
        print(f"  SGOV invested amount: ${sgov_invested:,.2f}")
    else:
        total_invested = sum(initial_investments.values())
        print(f"\nCalculating portfolio YTD return (including all assets):")
    
    if total_invested == 0:
        return 0.0
    
    total_portfolio_return = 0.0
    
    for result in asset_results:
        if result['error']:
            print(f"  Skipping {result['asset']} due to error: {result['error']}")
            continue
        
        asset = result['asset']
        invested_amount = initial_investments.get(asset, 0)
        
        if exclude_sgov and asset == "SGOV":
            print(f"  Excluding SGOV (invested: ${invested_amount:,.2f})")
            continue
            
        if invested_amount == 0:
            print(f"  No investment found for {result['asset']}")
            continue
        
        # Calculate this asset's contribution to total portfolio return
        allocation_percent = (invested_amount / total_invested) * 100
        asset_contribution = (result['ytd_return_percent'] * allocation_percent) / 100
        total_portfolio_return += asset_contribution
        
        print(f"  {asset}: {result['ytd_return_percent']:.2f}% return × {allocation_percent:.2f}% allocation = {asset_contribution:.2f}% contribution")
    
    print(f"  Total invested: ${total_invested:,.2f}")
    print(f"  Total portfolio return: {total_portfolio_return:.2f}%")
    
    return total_portfolio_return

def calculate_eur_returns(usd_return, start_eur_usd, current_eur_usd):
    """
    Converts USD return to EUR return based on exchange rate changes
    """
    if start_eur_usd is None or current_eur_usd is None:
        print("Warning: Missing exchange rates, cannot calculate EUR return")
        return None
    
    # EUR return = USD return - exchange rate change
    # If EUR strengthens (EUR/USD increases), EUR return is lower than USD return
    exchange_rate_change = ((current_eur_usd - start_eur_usd) / start_eur_usd) * 100
    eur_return = usd_return - exchange_rate_change
    
    print(f"  EUR return: {eur_return:.2f}%")
    
    return eur_return

def map_asset_symbols(portfolio_assets):
    """
    Maps portfolio asset symbols to API symbols and types
    """
    asset_mapping = {}
    
    for asset in portfolio_assets:
        if asset == "BINANCE:BTCUSDT":
            asset_mapping[asset] = {"type": "crypto", "coin_id": "bitcoin", "api_symbol": "BTC:USD"}
        else:
            asset_mapping[asset] = {"type": "stock", "exchange": "NYSEARCA", "api_symbol": asset}
    
    return asset_mapping

def get_alpha_vantage_price_data(symbol, api_key):
    """
    Fetches daily historical price data (without dividends) for a given stock/ETF from Alpha Vantage.
    Uses TIME_SERIES_DAILY endpoint.
    """
    base_url = "https://www.alphavantage.co/query?"
    params = {
        "function": "TIME_SERIES_DAILY",
        "symbol": symbol,
        "outputsize": "full", # 'full' for all historical data
        "apikey": api_key
    }
    try:
        response = requests.get(base_url, params=params)
        response.raise_for_status()
        data = response.json()

        if "Time Series (Daily)" not in data:
            if "Error Message" in data:
                print(f"Alpha Vantage Error for {symbol}: {data['Error Message']}")
            elif "Note" in data:
                print(f"Alpha Vantage Note for {symbol}: {data['Note']} - This usually means you've hit the rate limit. Please wait a minute.")
            else:
                print(f"Unexpected Alpha Vantage response for {symbol}: {json.dumps(data, indent=2)}")
            return None
        return data["Time Series (Daily)"]
    except requests.exceptions.RequestException as e:
        print(f"Error fetching price data from Alpha Vantage for {symbol}: {e}")
        return None

def get_tiingo_dividend_data(symbol, api_key, start_date_str, end_date_str):
    """
    Fetches historical dividend data for a given stock/ETF from Tiingo.
    """
    base_url = f"https://api.tiingo.com/tiingo/daily/{symbol}/prices"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Token {api_key}"
    }
    params = {
        "startDate": start_date_str,
        "endDate": end_date_str,
        "columns": "divCash" # Requesting only dividend cash amounts
    }
    try:
        response = requests.get(base_url, headers=headers, params=params)
        response.raise_for_status()
        data = response.json()
        
        dividends = []
        for entry in data:
            if 'divCash' in entry and entry['divCash'] is not None and entry['divCash'] > 0:
                dividends.append({
                    'date': entry['date'].split('T')[0], # Format to YYYY-MM-DD
                    'amount': float(entry['divCash'])
                })
        return dividends
    except requests.exceptions.RequestException as e:
        print(f"Error fetching dividend data from Tiingo for {symbol}: {e}")
        return None
    except json.JSONDecodeError:
        print(f"Error decoding JSON from Tiingo for {symbol}. Response: {response.text}")
        return None

def get_coingecko_data(coin_id, vs_currency="usd"):
    """
    Fetches historical and current price data for a cryptocurrency from CoinGecko.
    """
    # Get current price
    current_price_url = f"https://api.coingecko.com/api/v3/simple/price?ids={coin_id}&vs_currencies={vs_currency}"
    try:
        response = requests.get(current_price_url)
        response.raise_for_status()
        current_data = response.json()
        current_price = current_data.get(coin_id, {}).get(vs_currency)
        if current_price is None:
            print(f"Could not fetch current price for {coin_id} from CoinGecko.")
            return None, None
    except requests.exceptions.RequestException as e:
        print(f"Error fetching current price from CoinGecko for {coin_id}: {e}")
        return None, None

    # Get historical data for the last year (to ensure Jan 1st is included)
    historical_url = f"https://api.coingecko.com/api/v3/coins/{coin_id}/market_chart?vs_currency={vs_currency}&days=365&interval=daily"
    try:
        response = requests.get(historical_url)
        response.raise_for_status()
        historical_data = response.json()
        prices_raw = historical_data.get('prices', [])
        historical_prices = {}
        for timestamp_ms, price in prices_raw:
            dt_object = datetime.datetime.fromtimestamp(timestamp_ms / 1000)
            historical_prices[dt_object.strftime('%Y-%m-%d')] = float(price)
        return current_price, historical_prices
    except requests.exceptions.RequestException as e:
        print(f"Error fetching historical data from CoinGecko for {coin_id}: {e}")
        return None, None

def calculate_ytd_return(asset_symbol, price_data, dividend_data, start_date_str, current_date_str, tax_rate=0.305):
    """
    Calculates the YTD return for a single asset, including dividend reinvestment.
    Assumes 1 share purchased on the start_date.
    """
    details = {
        "asset": asset_symbol,
        "start_date": start_date_str,
        "current_date": current_date_str,
        "start_price": None,
        "current_price": None,
        "initial_shares": 1.0,
        "dividends_paid": [],
        "total_raw_dividends": 0.0,
        "total_taxed_dividends": 0.0,
        "shares_bought_with_dividends": 0.0,
        "final_shares": 0.0,
        "final_portfolio_value": 0.0,
        "ytd_return_percent": None,
        "error": None,
        "dividends_included": False
    }

    if not price_data:
        details["error"] = "No price data available."
        return details

    # Find the closest available start date price
    start_price = None
    current_date_obj = datetime.datetime.strptime(start_date_str, '%Y-%m-%d').date()
    for _ in range(7):
        date_key = current_date_obj.strftime('%Y-%m-%d')
        if date_key in price_data:
            start_price = float(price_data[date_key]['4. close']) if '4. close' in price_data[date_key] else None
            if start_price is None and '2. high' in price_data[date_key]:
                 start_price = float(price_data[date_key]['2. high'])
            if start_price is not None:
                break
        current_date_obj -= datetime.timedelta(days=1)

    if start_price is None:
        details["error"] = f"Could not find a valid price for start date {start_date_str} or nearby."
        return details
    details["start_price"] = start_price

    # Get current price (most recent entry in Alpha Vantage data)
    current_price_key = next(iter(price_data))
    current_price = float(price_data[current_price_key]['4. close']) if '4. close' in price_data[current_price_key] else None
    if current_price is None and '2. high' in price_data[current_price_key]:
        current_price = float(price_data[current_price_key]['2. high'])

    if current_price is None:
        details["error"] = "Could not find current price."
        return details
    details["current_price"] = current_price

    current_shares = details["initial_shares"]
    portfolio_value_start = start_price

    if dividend_data:
        details["dividends_included"] = True
        # Sort dividends by date to process them chronologically
        sorted_dividends = sorted(dividend_data, key=lambda x: x['date'])

        for dividend in sorted_dividends:
            div_date = dividend['date']
            div_amount = dividend['amount']

            # Only consider dividends paid within the YTD period
            if div_date >= start_date_str and div_date <= current_date_str:
                details["dividends_paid"].append({'date': div_date, 'amount': div_amount})
                details["total_raw_dividends"] += div_amount

                # Find the price on the dividend date for reinvestment
                price_on_div_date = None
                div_date_obj = datetime.datetime.strptime(div_date, '%Y-%m-%d').date()
                for _ in range(7):
                    date_key = div_date_obj.strftime('%Y-%m-%d')
                    if date_key in price_data:
                        price_on_div_date = float(price_data[date_key]['4. close']) if '4. close' in price_data[date_key] else None
                        if price_on_div_date is None and '2. high' in price_data[date_key]:
                            price_on_div_date = float(price_data[date_key]['2. high'])
                        if price_on_div_date is not None:
                            break
                    div_date_obj -= datetime.timedelta(days=1)

                if price_on_div_date is None:
                    print(f"Warning: Could not find price for dividend reinvestment on {div_date} for {asset_symbol}. Skipping this dividend.")
                    continue

                taxed_dividend = div_amount * (1 - tax_rate)
                details["total_taxed_dividends"] += taxed_dividend
                shares_bought = taxed_dividend / price_on_div_date
                details["shares_bought_with_dividends"] += shares_bought
                current_shares += shares_bought
    else:
        details["dividends_included"] = False


    details["final_shares"] = current_shares
    final_portfolio_value = current_shares * current_price
    details["final_portfolio_value"] = final_portfolio_value

    ytd_return_percent = ((final_portfolio_value - portfolio_value_start) / portfolio_value_start) * 100
    details["ytd_return_percent"] = ytd_return_percent

    return details

def calculate_coingecko_ytd_return(current_price, historical_prices, start_date_str, current_date_str):
    """
    Calculates YTD return for Bitcoin (no dividends).
    """
    details = {
        "asset": "BTC:USD",
        "start_date": start_date_str,
        "current_date": current_date_str,
        "start_price": None,
        "current_price": current_price,
        "initial_shares": 1.0,
        "dividends_paid": [], # N/A for crypto
        "total_raw_dividends": 0.0, # N/A for crypto
        "total_taxed_dividends": 0.0, # N/A for crypto
        "shares_bought_with_dividends": 0.0, # N/A for crypto
        "final_shares": 1.0,
        "final_portfolio_value": 0.0,
        "ytd_return_percent": None,
        "error": None,
        "dividends_included": False
    }

    if current_price is None or not historical_prices:
        details["error"] = "No data available."
        return details

    start_price = None
    current_date_obj = datetime.datetime.strptime(start_date_str, '%Y-%m-%d').date()
    for _ in range(7):
        date_key = current_date_obj.strftime('%Y-%m-%d')
        if date_key in historical_prices:
            start_price = historical_prices[date_key]
            break
        current_date_obj -= datetime.timedelta(days=1)

    if start_price is None:
        details["error"] = f"Could not find a valid price for start date {start_date_str} or nearby for BTC:USD."
        return details
    details["start_price"] = start_price

    details["final_portfolio_value"] = details["initial_shares"] * current_price
    ytd_return_percent = ((details["final_portfolio_value"] - start_price) / start_price) * 100
    details["ytd_return_percent"] = ytd_return_percent

    return details

def get_eur_usd_exchange_rate(date_str):
    """
    Fetches EUR/USD exchange rate for a specific date from Alpha Vantage
    """
    base_url = "https://www.alphavantage.co/query?"
    params = {
        "function": "FX_DAILY",
        "from_symbol": "EUR",
        "to_symbol": "USD",
        "outputsize": "full",
        "apikey": "573740WTWZQNE2IQ"
    }
    
    try:
        response = requests.get(base_url, params=params)
        response.raise_for_status()
        data = response.json()
        
        if "Time Series FX (Daily)" not in data:
            if "Error Message" in data:
                print(f"Alpha Vantage Error for EUR/USD: {data['Error Message']}")
            elif "Note" in data:
                print(f"Alpha Vantage Note for EUR/USD: {data['Note']} - This usually means you've hit the rate limit.")
            else:
                print(f"Unexpected Alpha Vantage response for EUR/USD: {json.dumps(data, indent=2)}")
            return None
        
        time_series = data["Time Series FX (Daily)"]
        
        # Find the closest available date
        target_date = datetime.datetime.strptime(date_str, '%Y-%m-%d').date()
        for _ in range(7):  # Try up to 7 days back
            date_key = target_date.strftime('%Y-%m-%d')
            if date_key in time_series:
                return float(time_series[date_key]['4. close'])
            target_date -= datetime.timedelta(days=1)
        
        print(f"Could not find EUR/USD rate for {date_str} or nearby dates")
        return None
        
    except requests.exceptions.RequestException as e:
        print(f"Error fetching EUR/USD exchange rate: {e}")
        return None


def main():
    # Load portfolio configuration
    config = load_portfolio_config()
    if not config:
        return
    
    # Get asset mapping
    portfolio_assets = list(config.get('currentPortfolio', {}).keys())
    asset_mapping = map_asset_symbols(portfolio_assets)
    
    # IMPORTANT: Replace with your Alpha Vantage API key
    ALPHA_VANTAGE_API_KEY = "K6CPFIXKXRI871JN"
    # IMPORTANT: Replace with your Tiingo API key
    TIINGO_API_KEY = "ac91bda587a538e43a255056ee50432c52eaf391"

    current_year = datetime.datetime.now().year
    start_date = datetime.date(current_year, 1, 1)
    current_date = datetime.date.today()

    start_date_str = start_date.strftime('%Y-%m-%d')
    current_date_str = current_date.strftime('%Y-%m-%d')

    print(f"Calculating YTD returns from {start_date_str} to {current_date_str} (including 30.5% dividend tax).\n")

    # Fetch EUR/USD exchange rates
    print("Fetching EUR/USD exchange rates...")
    start_eur_usd = get_eur_usd_exchange_rate(start_date_str)
    time.sleep(15)  # Alpha Vantage rate limit
    current_eur_usd = get_eur_usd_exchange_rate(current_date_str)
    
    if start_eur_usd and current_eur_usd:
        print(f"EUR/USD rates - Start: {start_eur_usd:.4f}, Current: {current_eur_usd:.4f}")
    else:
        print("Warning: Could not fetch exchange rates")

    all_results = []

    for portfolio_asset, asset_info in asset_mapping.items():
        api_symbol = asset_info["api_symbol"]
        print(f"Fetching data for {portfolio_asset} (API symbol: {api_symbol})...")
        
        if asset_info["type"] == "stock":
            price_data = get_alpha_vantage_price_data(api_symbol, ALPHA_VANTAGE_API_KEY)
            time.sleep(15) # Alpha Vantage free tier rate limit
            
            dividend_data = get_tiingo_dividend_data(api_symbol, TIINGO_API_KEY, start_date_str, current_date_str)
            time.sleep(1) # Tiingo free tier rate limit (50 requests/hour, 1000/day)

            result_details = calculate_ytd_return(api_symbol, price_data, dividend_data, start_date_str, current_date_str)
            # Update the asset name to match portfolio config
            result_details["asset"] = portfolio_asset
            all_results.append(result_details)

        elif asset_info["type"] == "crypto":
            current_price, historical_prices = get_coingecko_data(asset_info["coin_id"])
            result_details = calculate_coingecko_ytd_return(current_price, historical_prices, start_date_str, current_date_str)
            # Update the asset name to match portfolio config
            result_details["asset"] = portfolio_asset
            all_results.append(result_details)

    # Calculate all portfolio returns
    print("\n" + "="*60)
    print("PORTFOLIO YTD RETURN CALCULATIONS")
    print("="*60)
    
    # USD returns
    total_usd_ytd = get_portfolio_ytd_return(all_results, config, exclude_sgov=False)
    total_usd_ytd_excl_sgov = get_portfolio_ytd_return(all_results, config, exclude_sgov=True)
    
    # EUR returns
    total_eur_ytd = calculate_eur_returns(total_usd_ytd, start_eur_usd, current_eur_usd)
    total_eur_ytd_excl_sgov = calculate_eur_returns(total_usd_ytd_excl_sgov, start_eur_usd, current_eur_usd)
    
    # Save results to JSON
    results_data = {
        "calculation_date": current_date_str,
        "start_date": start_date_str,
        "portfolio_returns": {
            "total_usd_ytd": round(total_usd_ytd, 2),
            "total_usd_ytd_excl_sgov": round(total_usd_ytd_excl_sgov, 2),
            "total_eur_ytd": round(total_eur_ytd, 2) if total_eur_ytd else None,
            "total_eur_ytd_excl_sgov": round(total_eur_ytd_excl_sgov, 2) if total_eur_ytd_excl_sgov else None
        },
        "asset_returns": {}
    }
    
    # Add individual asset returns
    for result in all_results:
        if not result['error']:
            asset_name = result['asset']
            results_data["asset_returns"][asset_name] = {
                "usd_ytd": round(result['ytd_return_percent'], 2),
                "eur_ytd": round(calculate_eur_returns(result['ytd_return_percent'], start_eur_usd, current_eur_usd), 2) if start_eur_usd and current_eur_usd else None
            }
    
    with open('portfolio_ytd_results.json', 'w') as f:
        json.dump(results_data, f, indent=2)
    
    # Check if this is December 31st and create yearly archive
    current_date_obj = datetime.datetime.strptime(current_date_str, '%Y-%m-%d').date()
    
    if current_date_obj.month == 12 and current_date_obj.day == 31:
        year = current_year
        archive_filename = f'portfolio_ytd_results_{year}.json'
        with open(archive_filename, 'w') as f:
            json.dump(results_data, f, indent=2)
        print(f"Yearly archive created: {archive_filename}")
        print(f"Both {archive_filename} and portfolio_ytd_results.json contain the same {year} data")
    
    print(f"\nResults saved to portfolio_ytd_results.json")
    print(f"TOTAL USD YTD RETURN: {total_usd_ytd:.2f}%")
    print(f"TOTAL USD YTD RETURN (excl SGOV): {total_usd_ytd_excl_sgov:.2f}%")
    if total_eur_ytd:
        print(f"TOTAL EUR YTD RETURN: {total_eur_ytd:.2f}%")
    if total_eur_ytd_excl_sgov:
        print(f"TOTAL EUR YTD RETURN (excl SGOV): {total_eur_ytd_excl_sgov:.2f}%")

    print("\n--- Detailed Asset Calculations ---")
    for result in all_results:
        print(f"\nAsset: {result['asset']}")
        if result['error']:
            print(f"  Error: {result['error']}")
            continue
        
        print(f"  Start Date: {result['start_date']}")
        print(f"  Start Price (on or near start date): ${result['start_price']:.2f}")
        print(f"  Current Date: {result['current_date']}")
        print(f"  Current Price: ${result['current_price']:.2f}")
        print(f"  Initial Shares: {result['initial_shares']:.4f}")

        if result['dividends_included']:
            print(f"  --- Dividends (30.5% tax applied) ---")
            if result['dividends_paid']:
                for div in result['dividends_paid']:
                    print(f"    - Paid on {div['date']}: ${div['amount']:.4f}")
                print(f"  Total Raw Dividends Paid: ${result['total_raw_dividends']:.4f}")
                print(f"  Total Taxed Dividends for Reinvestment: ${result['total_taxed_dividends']:.4f}")
                print(f"  Shares Bought with Reinvested Dividends: {result['shares_bought_with_dividends']:.4f}")
            else:
                print("    No dividends paid in the period.")
        else:
            print("  --- Dividends: Not applicable or data not available for this asset. ---")

        print(f"  Final Shares: {result['final_shares']:.4f}")
        print(f"  Final Portfolio Value: ${result['final_portfolio_value']:.2f}")
        print(f"  YTD Return: {result['ytd_return_percent']:.2f}%")

if __name__ == "__main__":
    main()
