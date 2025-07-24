import json
import time
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import pytz
import os
from pathlib import Path
# import requests # Removed

class PortfolioUpdater:
    def __init__(self):
        self.setup_driver()
        self.json_file = Path(__file__).parent / 'portfolio_history.json'
        self.portfolio_url = "https://playersfirst.github.io/portfolio"

    def setup_driver(self):
        chrome_options = Options()
        chrome_options.add_argument("--headless") # Optional: Run headless
        chrome_options.add_argument("--disable-gpu")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        
        self.driver = webdriver.Chrome(options=chrome_options)



    def get_asset_values(self):
        """Scrapes the current USD and EUR values for each asset from the portfolio page by clicking the currency switch."""
        asset_values_usd = {}
        asset_values_eur = {}
        try:
            print(f"Navigating to {self.portfolio_url}")
            self.driver.get(self.portfolio_url)
            # Wait for the table body to be populated (USD view)
            print("Waiting for table to load (USD view)...")
            WebDriverWait(self.driver, 30).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "#portfolio-data tr"))
            )
            # Give JS a bit more time to potentially update values after initial load
            print("Initial load complete, waiting 5s...")
            time.sleep(5)

            print("Scraping USD values...")
            table_body = self.driver.find_element(By.ID, "portfolio-data")
            rows = table_body.find_elements(By.TAG_NAME, "tr")

            if not rows:
                print("Warning: No rows found in the portfolio table (USD view).")
                # Decide how to handle this - maybe return empty dicts or raise error
                return {}, {}

            for row in rows:
                try:
                    cells = row.find_elements(By.TAG_NAME, "td")
                    if len(cells) >= 4: # Need symbol, shares, price, value
                        symbol_container = cells[0].find_element(By.CLASS_NAME, "symbol-container")
                        raw_symbol_text = symbol_container.text
                        symbol = raw_symbol_text.replace('⊕', '').replace('⊖', '').strip()
                        internal_symbol = 'BINANCE:BTCUSDT' if symbol == 'BTC' else symbol

                        value_text_usd = cells[3].text # Value is in the 4th column (index 3)
                        value_usd = float(value_text_usd.replace('$', '').replace(',', ''))
                        asset_values_usd[internal_symbol] = value_usd
                        print(f"  Found USD Value: {internal_symbol} = {value_usd}")
                    else:
                         print(f"  Warning: Row found with insufficient cells (USD view): {row.text}")
                except Exception as row_e:
                    print(f"  Error processing row (USD view) {row.text}: {row_e}")

            # --- Switch to EUR --- #
            print("Finding and clicking currency switch button...")
            currency_button = WebDriverWait(self.driver, 10).until(
                EC.element_to_be_clickable((By.ID, "currency-switch-btn"))
            )
            currency_button.click()
            print("Clicked. Waiting for button text to change to 'Switch to USD'...")

            # Wait for the page to update - check button text
            WebDriverWait(self.driver, 15).until(
                EC.text_to_be_present_in_element((By.ID, "currency-switch-btn"), "USD")
            )
            print("Page updated to EUR view. Waiting 3s for stability...")
            time.sleep(3) # Short extra pause just in case rendering lags

            # --- Scrape EUR values --- #
            print("Scraping EUR values...")
            # Re-find table elements as the DOM might have changed
            table_body_eur = self.driver.find_element(By.ID, "portfolio-data")
            rows_eur = table_body_eur.find_elements(By.TAG_NAME, "tr")

            if not rows_eur:
                print("Warning: No rows found in the portfolio table (EUR view).")
                # Return what we have for USD, but EUR will be empty
                return asset_values_usd, {}

            for row in rows_eur:
                 try:
                    cells = row.find_elements(By.TAG_NAME, "td")
                    if len(cells) >= 4: # Need symbol, shares, price, value
                        symbol_container = cells[0].find_element(By.CLASS_NAME, "symbol-container")
                        raw_symbol_text = symbol_container.text
                        symbol = raw_symbol_text.replace('⊕', '').replace('⊖', '').strip()
                        internal_symbol = 'BINANCE:BTCUSDT' if symbol == 'BTC' else symbol

                        value_text_eur_raw = cells[3].text # Value is still in the 4th column
                        print(f"  Raw EUR Text for {internal_symbol}: '{value_text_eur_raw}'") # DEBUG PRINT

                        # Improved Parsing:
                        # 1. Remove currency symbol and leading/trailing whitespace
                        cleaned_text = value_text_eur_raw.replace('€', '').strip()

                        # 2. Check for comma as decimal separator (common in Europe)
                        #    If comma exists and is preceded by digits and potentially thousand separators (.),
                        #    assume it's the decimal separator.
                        last_comma = cleaned_text.rfind(',')
                        last_dot = cleaned_text.rfind('.')

                        if last_comma > last_dot: # Handles cases like 1.234,56 or 1234,56
                            # Remove thousand separators (.) and replace decimal comma (,) with dot (.)
                            cleaned_value_text = cleaned_text.replace('.', '').replace(',', '.')
                        else: # Handles cases like 1,234.56 (less common for EUR display usually) or 1234.56
                            # Remove thousand separators (,)
                            cleaned_value_text = cleaned_text.replace(',', '')
                        
                        # 3. Remove any remaining non-numeric characters except the decimal point and potential minus sign
                        # This is a bit aggressive, might be better to rely on float conversion error handling
                        # cleaned_value_text = re.sub(r"[^0-9.-]", "", cleaned_value_text) 

                        try:
                            value_eur = float(cleaned_value_text)
                            asset_values_eur[internal_symbol] = value_eur
                            print(f"  Parsed EUR Value: {internal_symbol} = {value_eur}")
                        except ValueError:
                            print(f"  Warning: Could not parse EUR value for {internal_symbol} from cleaned text '{cleaned_value_text}'")
                            # Optionally set a default value like 0 or skip this asset
                            asset_values_eur[internal_symbol] = 0 # Set to 0 on parse failure

                    else:
                        print(f"  Warning: Row found with insufficient cells (EUR view): {row.text}")
                 except Exception as row_e:
                    print(f"  Error processing row (EUR view) {row.text}: {row_e}")

            return asset_values_usd, asset_values_eur

        except Exception as e:
            print(f"Error scraping asset values: {e}")
            raise # Re-raise the exception to be caught in run()

    def update_history(self, asset_values_usd, asset_values_eur):
        """Updates portfolio_history.json with detailed asset values in USD and EUR, provided directly."""
        today = datetime.now(pytz.timezone('Europe/Paris')).strftime('%Y-%m-%d')
        history_data = {"history": []}

        # Read existing history
        if self.json_file.exists():
            try:
                with open(self.json_file, 'r') as f:
                    content = f.read()
                    if content.strip():
                        history_data = json.loads(content)
                    if "history" not in history_data:
                        history_data["history"] = []
            except json.JSONDecodeError:
                 print(f"Warning: {self.json_file} contains invalid JSON. Starting fresh history.")
            except Exception as e:
                print(f"Error reading {self.json_file}: {e}. Starting fresh history.")
        else:
             print(f"Warning: {self.json_file} not found. Creating new history file.")

        # Construct today's entry using provided values
        today_assets = {}
        # Ensure we iterate over the symbols found in the USD values as primary
        for symbol, value_usd in asset_values_usd.items():
            # Get corresponding EUR value, defaulting to 0 if not found (shouldn't happen ideally)
            value_eur = asset_values_eur.get(symbol, 0)
            today_assets[symbol] = {
                "value_usd": round(value_usd, 2),
                "value_eur": round(value_eur, 2)
            }

        new_entry = {
            "date": today,
            "assets": today_assets
        }

        # Check if today's entry already exists and update it, otherwise append
        entry_updated = False
        for i, entry in enumerate(history_data["history"]):
            if entry.get("date") == today:
                history_data["history"][i] = new_entry
                entry_updated = True
                print(f"Updating entry for today: {today}")
                break

        if not entry_updated:
             history_data["history"].append(new_entry)
             print(f"Adding new entry for today: {today}")

        # Write updated history back to file
        try:
            with open(self.json_file, 'w') as f:
                json.dump(history_data, f, indent=2)
            return history_data
        except Exception as e:
             print(f"Error writing updated history to {self.json_file}: {e}")
             return None # Indicate failure

    def run(self):
        """Main execution flow."""
        try:
            print("Fetching current asset values (USD and EUR)...")
            asset_values_usd, asset_values_eur = self.get_asset_values()

            # Validate results
            if not asset_values_usd:
                 raise ValueError("Failed to retrieve USD asset values.")
            if not asset_values_eur:
                 raise ValueError("Failed to retrieve EUR asset values after switching currency.")

            print(f"Retrieved USD Values: {asset_values_usd}")
            print(f"Retrieved EUR Values: {asset_values_eur}")

            print("Updating history file...")
            updated_data = self.update_history(asset_values_usd, asset_values_eur)

            if updated_data:
                 print("Successfully updated portfolio history:")
                 print(f"History file '{self.json_file}' updated.")
                 return True
            else:
                 print("Failed to update history file.")
                 return False

        except Exception as e:
            print(f"Error in portfolio update run: {e}")
            return False
        finally:
            if hasattr(self, 'driver'):
                self.driver.quit()
            print("Driver quit.")

if __name__ == "__main__":
    updater = PortfolioUpdater()
    success = updater.run()
    exit(0 if success else 1)
