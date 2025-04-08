import requests
import json
from datetime import datetime, timedelta
import os

# Configuration
PORTFOLIO = {
    "VOO": {
        "shares": 3.2086,
        "tax_rate": 0.30  # 30% tax for VOO
    },
    "SGOV": {
        "shares": 134.4527,
        "tax_rate": 0.00  # 0% tax for SGOV (Treasury bills)
    },
    "NANC": {
        "shares": 20.5685,
        "tax_rate": 0.30  # 30% tax for NANC
    }
}
API_KEY = "G8FHWSAW9XXFUWJ8"  # Your Alpha Vantage API key
DATA_FILE = "dividend_history.json"
IGNORE_BEFORE_DATE = "2025-04-08"  # Ignore dividends before this date

def load_previous_data():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, 'r') as f:
            return json.load(f)
    # Initialize if no data exists
    return {
        "last_checked": None,
        "holdings": {
            symbol: {
                "total_shares": PORTFOLIO[symbol]["shares"],
                "total_dividends": 0,
                "processed_dividends": []
            }
            for symbol in PORTFOLIO
        }
    }

def save_data(data):
    with open(DATA_FILE, 'w') as f:
        json.dump(data, f, indent=2)

def get_alpha_dividends(symbol):
    """Fetch dividend data from Alpha Vantage"""
    url = f"https://www.alphavantage.co/query?function=TIME_SERIES_MONTHLY_ADJUSTED&symbol={symbol}&apikey={API_KEY}"
    
    try:
        response = requests.get(url, timeout=10)
        data = response.json()
        
        dividends = []
        if "Monthly Adjusted Time Series" in data:
            for date, values in data["Monthly Adjusted Time Series"].items():
                dividend = float(values["7. dividend amount"])
                if dividend > 0:
                    dividends.append({
                        "date": date,
                        "amount": dividend
                    })
        
        # Sort by date (newest first)
        return sorted(dividends, key=lambda x: x["date"], reverse=True)
    except Exception as e:
        print(f"Alpha Vantage error for {symbol}: {e}")
        return None

def get_alpha_price(symbol):
    """Fetch current price from Alpha Vantage"""
    url = f"https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol={symbol}&apikey={API_KEY}"
    
    try:
        response = requests.get(url, timeout=10)
        data = response.json()
        return float(data["Global Quote"]["05. price"])
    except Exception as e:
        print(f"Price fetch error for {symbol}: {e}")
        return None

def process_dividends(symbol, dividend_data, portfolio_data):
    if not dividend_data:
        print(f"Warning: No dividend data available for {symbol}")
        return None
    
    holding_data = portfolio_data["holdings"][symbol]
    processed_dates = [d["date"] for d in holding_data["processed_dividends"]]
    
    # Date range checks
    today = datetime.now().date()
    two_weeks_ago = today - timedelta(days=14)
    ignore_before = datetime.strptime(IGNORE_BEFORE_DATE, "%Y-%m-%d").date()
    
    for dividend in dividend_data:
        try:
            dividend_date = datetime.strptime(dividend["date"], "%Y-%m-%d").date()
            
            # Skip if:
            # 1. Before our ignore date (April 4th 2025)
            # 2. Older than two weeks
            # 3. Already processed
            if (dividend_date < ignore_before or 
                dividend_date < two_weeks_ago or 
                dividend["date"] in processed_dates):
                continue
                
            amount = dividend["amount"]
            shares = holding_data["total_shares"]
            tax_rate = PORTFOLIO[symbol]["tax_rate"]
            gross = shares * amount
            tax = gross * tax_rate
            net = gross - tax
            price = get_alpha_price(symbol)
            new_shares = net / price if price else 0
            
            # Return only the first (most recent) dividend that meets criteria
            return {
                "symbol": symbol,
                "date": dividend["date"],
                "amount": amount,
                "shares_at_payment": shares,
                "gross_payment": gross,
                "tax_paid": tax,
                "net_payment": net,
                "reinvestment_price": price,
                "additional_shares": new_shares,
                "source": "Alpha Vantage"
            }
        except Exception as e:
            print(f"Error processing dividend for {symbol}: {e}")
    
    return None

def main():
    print("Dividend Calculator")
    print(f"Checking dividends from the past two weeks (ignoring before {IGNORE_BEFORE_DATE})")
    print("Tracking: VOO (1.7 shares), SGOV (141 shares), NANC (21 shares)")
    
    data = load_previous_data()
    print(f"Last checked: {data.get('last_checked') or 'Never'}")

    all_new_dividends = []
    for symbol in PORTFOLIO:
        dividend_data = get_alpha_dividends(symbol)
        new_dividend = process_dividends(symbol, dividend_data, data)
        if new_dividend:
            all_new_dividends.append(new_dividend)
    
    if all_new_dividends:
        print(f"\nFound {len(all_new_dividends)} new dividend(s) in the past two weeks:")
        for div in all_new_dividends:
            print(f"\nSymbol: {div['symbol']}")
            print(f"Date: {div['date']} (Source: {div['source']})")
            print(f"Dividend: ${div['amount']:.4f} per share")
            print(f"Shares: {div['shares_at_payment']:.4f}")
            print(f"Gross: ${div['gross_payment']:.2f}")
            print(f"Tax ({int(div['tax_paid']/div['gross_payment']*100)}%): ${div['tax_paid']:.2f}")
            print(f"Net: ${div['net_payment']:.2f}")
            if div['reinvestment_price']:
                print(f"Price: ${div['reinvestment_price']:.2f}")
                print(f"New shares: {div['additional_shares']:.6f}")
            
            # Update portfolio
            holding = data["holdings"][div["symbol"]]
            holding["total_shares"] += div["additional_shares"]
            holding["total_dividends"] += div["net_payment"]
            holding["processed_dividends"].append(div)
    else:
        print("\nNo new dividends found in the past two weeks")
    
    data["last_checked"] = datetime.now().isoformat()
    save_data(data)
    
    print("\nUpdated totals:")
    for symbol in PORTFOLIO:
        holding = data["holdings"][symbol]
        print(f"\n{symbol}:")
        print(f"Total shares: {holding['total_shares']:.6f}")
        print(f"Total dividends (after tax): ${holding['total_dividends']:.2f}")

if __name__ == "__main__":
    # Install required package:
    # pip install requests
    main()
