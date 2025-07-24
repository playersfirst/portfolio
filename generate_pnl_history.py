#!/usr/bin/env python3
"""
Script to generate PnL history data based on current portfolio PnL percentages.
This script scrapes the current PnL percentages from the portfolio page and generates
realistic historical data starting from July 23, 2025 up to today.
"""

import json
import os
import requests
from datetime import datetime, timedelta
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time
import random

def setup_driver():
    """Setup Chrome driver with headless options"""
    chrome_options = Options()
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--window-size=1920,1080")
    
    try:
        driver = webdriver.Chrome(options=chrome_options)
        return driver
    except Exception as e:
        print(f"Error setting up Chrome driver: {e}")
        return None

def get_current_pnl_data():
    """Scrape current PnL percentages and portfolio totals from the portfolio page"""
    driver = setup_driver()
    if not driver:
        return None, None
    
    try:
        # Load the portfolio page
        driver.get("https://playersfirst.github.io/portfolio")
        
        # Wait for the table to load (same as portfolio updater)
        print("Waiting for table to load...")
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "#portfolio-data tr"))
        )
        
        # Give JS time to populate data
        print("Initial load complete, waiting 5s...")
        time.sleep(5)
        
        # 1. Get total in USD
        main_pnl_badge = driver.find_element(By.ID, "main-pnl-badge")
        total_usd_text = main_pnl_badge.text.strip()
        total_usd = float(total_usd_text.replace('%', '').replace('(', '').replace(')', ''))
        print(f"Total USD: {total_usd}%")
        
        # 2. Get each individual asset in USD
        pnl_percentages_usd = scrape_asset_pnls(driver, "USD")
        
        # 3. Click SGOV to get total(-sgov) in USD
        click_sgov_row(driver)
        time.sleep(2)
        total_minus_sgov_usd_text = main_pnl_badge.text.strip()
        total_minus_sgov_usd = float(total_minus_sgov_usd_text.replace('%', '').replace('(', '').replace(')', ''))
        print(f"Total(-SGOV) USD: {total_minus_sgov_usd}%")
        
        # 4. Click EUR button
        currency_button = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.ID, "currency-switch-btn"))
        )
        currency_button.click()
        time.sleep(5)
        
        # 5. Get total(-sgov) in EUR
        total_minus_sgov_eur_text = main_pnl_badge.text.strip()
        total_minus_sgov_eur = float(total_minus_sgov_eur_text.replace('%', '').replace('(', '').replace(')', ''))
        print(f"Total(-SGOV) EUR: {total_minus_sgov_eur}%")
        
        # 6. Click SGOV again to get total in EUR
        click_sgov_row(driver)
        time.sleep(2)
        total_eur_text = main_pnl_badge.text.strip()
        total_eur = float(total_eur_text.replace('%', '').replace('(', '').replace(')', ''))
        print(f"Total EUR: {total_eur}%")
        
        # 7. Get each individual asset in EUR
        pnl_percentages_eur = scrape_asset_pnls(driver, "EUR")
        
        # Combine USD and EUR data
        pnl_percentages = {}
        for symbol in pnl_percentages_usd:
            pnl_percentages[symbol] = {
                'usd': pnl_percentages_usd[symbol],
                'eur': pnl_percentages_eur.get(symbol, 0.0)
            }
        
        # Create portfolio totals
        portfolio_totals = {
            'total': {'usd': total_usd, 'eur': total_eur},
            'excl_sgov': {'usd': total_minus_sgov_usd, 'eur': total_minus_sgov_eur}
        }
        
        print("Current PnL percentages scraped:")
        for symbol, values in pnl_percentages.items():
            print(f"  {symbol}: USD {values['usd']}%, EUR {values['eur']}%")
        
        return pnl_percentages, portfolio_totals
        
    except Exception as e:
        print(f"Error scraping PnL percentages: {e}")
        return None, None
    finally:
        driver.quit()

def click_sgov_row(driver):
    """Click on the SGOV row to toggle SGOV exclusion"""
    try:
        table_body = driver.find_element(By.ID, "portfolio-data")
        rows = table_body.find_elements(By.TAG_NAME, "tr")
        
        for row in rows:
            try:
                cells = row.find_elements(By.TAG_NAME, "td")
                if len(cells) >= 1:
                    symbol_container = cells[0].find_element(By.CLASS_NAME, "symbol-container")
                    symbol_text = symbol_container.text.replace('⊕', '').replace('⊖', '').strip()
                    if symbol_text == 'SGOV':
                        row.click()
                        return True
            except:
                continue
        return False
    except Exception as e:
        print(f"Error clicking SGOV: {e}")
        return False

def scrape_asset_pnls(driver, currency):
    """Scrape PnL percentages for individual assets in the specified currency"""
    pnl_percentages = {}
    
    try:
        # Get all rows
        table_body = driver.find_element(By.ID, "portfolio-data")
        rows = table_body.find_elements(By.TAG_NAME, "tr")
        
        for row in rows:
            try:
                cells = row.find_elements(By.TAG_NAME, "td")
                if len(cells) >= 6:
                    # Get symbol (first column) - same as portfolio updater
                    symbol_container = cells[0].find_element(By.CLASS_NAME, "symbol-container")
                    raw_symbol_text = symbol_container.text
                    symbol = raw_symbol_text.replace('⊕', '').replace('⊖', '').strip()
                    internal_symbol = 'BINANCE:BTCUSDT' if symbol == 'BTC' else symbol
                    
                    # Get PnL percentage (6th column, index 5)
                    pnl_percent_text = cells[5].text.strip()
                    
                    # Parse percentage value
                    if pnl_percent_text and pnl_percent_text != '--':
                        # Remove % and parentheses, handle negative values
                        pnl_percent_text = pnl_percent_text.replace('%', '').replace('(', '').replace(')', '')
                        try:
                            pnl_percent = float(pnl_percent_text)
                            pnl_percentages[internal_symbol] = pnl_percent
                            print(f"  Found {currency} PnL: {internal_symbol} = {pnl_percent}%")
                        except ValueError:
                            print(f"Could not parse {currency} PnL percentage for {internal_symbol}: {pnl_percent_text}")
            except Exception as row_e:
                print(f"Error processing row for {currency}: {row_e}")
                
    except Exception as e:
        print(f"Error scraping {currency} PnL percentages: {e}")
    
    return pnl_percentages



def create_today_entry(current_pnl_percentages, portfolio_totals):
    """Create a single entry for today with current PnL percentages"""
    today = datetime.now().strftime("%Y-%m-%d")
    
    # Asset mapping for internal names
    asset_mapping = {
        'BINANCE:BTCUSDT': 'btc',
        'VOO': 'voo', 
        'IAU': 'iau',
        'NANC': 'nanc',
        'SGOV': 'sgov'
    }
    
    entry = {
        "date": today,
        "percentages": {
            "total": portfolio_totals['total'],
            "excl_sgov": portfolio_totals['excl_sgov']
        }
    }
    
    # Add individual assets
    for symbol, internal_name in asset_mapping.items():
        if symbol in current_pnl_percentages:
            entry["percentages"][internal_name] = {
                "usd": current_pnl_percentages[symbol]['usd'],
                "eur": current_pnl_percentages[symbol]['eur']
            }
    
    return entry



def main():
    """Main function to generate PnL history"""
    print("Getting current PnL percentages from portfolio...")
    
    # Try to get current PnL percentages and portfolio totals
    current_pnl_percentages, portfolio_totals = get_current_pnl_data()
    
    if current_pnl_percentages and portfolio_totals:
        print("Successfully scraped current PnL percentages!")
        today_entry = create_today_entry(current_pnl_percentages, portfolio_totals)
        
        # Load existing data if file exists
        pnl_history = {"history": []}
        if os.path.exists('pnl_history.json'):
            try:
                with open('pnl_history.json', 'r') as f:
                    pnl_history = json.load(f)
                print("Loaded existing pnl_history.json")
            except Exception as e:
                print(f"Error loading existing file: {e}")
                pnl_history = {"history": []}
        
        # Check if today's entry already exists
        today_date = today_entry['date']
        existing_dates = [entry['date'] for entry in pnl_history['history']]
        
        if today_date in existing_dates:
            print(f"Entry for {today_date} already exists. Updating...")
            # Remove existing entry for today
            pnl_history['history'] = [entry for entry in pnl_history['history'] if entry['date'] != today_date]
        
        # Add today's entry
        pnl_history['history'].append(today_entry)
        
        # Sort by date (newest first)
        pnl_history['history'].sort(key=lambda x: x['date'], reverse=True)
        
        # Save to file
        with open('pnl_history.json', 'w') as f:
            json.dump(pnl_history, f, indent=2)
        
        print(f"Data saved to pnl_history.json (Total entries: {len(pnl_history['history'])})")
        print(f"Date: {today_entry['date']}")
        print(f"Total USD: {today_entry['percentages']['total']['usd']}%")
        print(f"Total EUR: {today_entry['percentages']['total']['eur']}%")
        print(f"Risk Assets USD: {today_entry['percentages']['excl_sgov']['usd']}%")
        print(f"Risk Assets EUR: {today_entry['percentages']['excl_sgov']['eur']}%")
        
        print("\nIndividual assets:")
        for asset, data in today_entry['percentages'].items():
            if asset not in ['total', 'excl_sgov']:
                print(f"  {asset.upper()}: USD {data['usd']}%, EUR {data['eur']}%")
    else:
        print("Could not scrape current data!")

if __name__ == "__main__":
    main() 