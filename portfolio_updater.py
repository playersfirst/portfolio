import json
import time
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, StaleElementReferenceException
import pytz
from pathlib import Path

class PortfolioUpdater:
    def __init__(self):
        self.setup_driver()
        self.json_file = Path(__file__).parent / 'portfolio_history.json'
        self.portfolio_url = "https://playersfirst.github.io/portfolio"
        self.max_retries = 3
        self.retry_delay = 10

    def setup_driver(self):
        chrome_options = Options()
        chrome_options.add_argument("--headless")
        chrome_options.add_argument("--disable-gpu")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--disable-blink-features=AutomationControlled")
        chrome_options.page_load_strategy = 'normal'
        
        self.driver = webdriver.Chrome(options=chrome_options)
        self.driver.set_page_load_timeout(60)

    def check_for_errors(self):
        """Check if 'Error loading data' appears anywhere on the page."""
        try:
            error_elements = self.driver.find_elements(By.XPATH, "//*[contains(text(), 'Error loading data')]")
            if error_elements:
                print("  ✗ Found 'Error loading data' on page")
                return True
            
            # Also check for common error indicators
            page_text = self.driver.find_element(By.TAG_NAME, "body").text.lower()
            error_keywords = ['error loading', 'failed to load', 'connection error', 'network error']
            for keyword in error_keywords:
                if keyword in page_text:
                    print(f"  ✗ Found error indicator: '{keyword}'")
                    return True
            
            return False
        except Exception as e:
            print(f"  ⚠ Error checking for error messages: {e}")
            return False

    def wait_for_all_assets_loaded(self, expected_min_assets=2, timeout=60):
        """
        Wait until all assets have valid, non-zero values loaded.
        Returns True if successful, False if timeout or errors detected.
        """
        print(f"Waiting up to {timeout}s for all assets to load (min {expected_min_assets} assets)...")
        start_time = time.time()
        
        while time.time() - start_time < timeout:
            try:
                # Check for error messages first
                if self.check_for_errors():
                    return False
                
                rows = self.driver.find_elements(By.CSS_SELECTOR, "#portfolio-data tr")
                
                if not rows:
                    print(f"  ⏳ No rows yet... ({int(time.time() - start_time)}s elapsed)")
                    time.sleep(2)
                    continue
                
                if len(rows) < expected_min_assets:
                    print(f"  ⏳ Only {len(rows)} rows, expecting at least {expected_min_assets}... ({int(time.time() - start_time)}s elapsed)")
                    time.sleep(2)
                    continue
                
                all_loaded = True
                loaded_count = 0
                
                for idx, row in enumerate(rows):
                    try:
                        cells = row.find_elements(By.TAG_NAME, "td")
                        if len(cells) >= 4:
                            value_text = cells[3].text.strip()
                            
                            # Check if value is missing or invalid
                            if not value_text:
                                all_loaded = False
                                break
                            
                            # Check for placeholder/loading indicators
                            if value_text in ['$0', '€0', '$0.00', '€0.00', '-', '...', 'Loading...', '--']:
                                all_loaded = False
                                break
                            
                            # Try to extract numeric value to ensure it's valid
                            cleaned = value_text.replace('$', '').replace('€', '').replace(',', '').replace('.', '', value_text.count('.') - 1)
                            try:
                                numeric_val = float(cleaned.replace(',', '.') if ',' in cleaned else cleaned)
                                if numeric_val == 0:
                                    all_loaded = False
                                    break
                                loaded_count += 1
                            except ValueError:
                                all_loaded = False
                                break
                    except StaleElementReferenceException:
                        all_loaded = False
                        break
                    except Exception as e:
                        print(f"  ⚠ Error checking row {idx}: {e}")
                        all_loaded = False
                        break
                
                if all_loaded and loaded_count >= expected_min_assets:
                    print(f"  ✓ All {loaded_count} assets loaded successfully ({int(time.time() - start_time)}s)")
                    return True
                
                # Status update every 10 seconds
                elapsed = int(time.time() - start_time)
                if elapsed % 10 == 0 and elapsed > 0:
                    print(f"  ⏳ Still waiting... {loaded_count}/{len(rows)} assets loaded ({elapsed}s elapsed)")
                
                time.sleep(2)
                
            except StaleElementReferenceException:
                time.sleep(2)
                continue
            except Exception as e:
                print(f"  ⚠ Error in wait loop: {e}")
                time.sleep(2)
                continue
        
        print(f"  ✗ Timeout: Not all assets loaded within {timeout}s")
        return False

    def load_page_with_retry(self, currency='USD', retry_count=0):
        """
        Load the page and wait for all assets. Retry if errors detected.
        Returns True if successful, False if all retries exhausted.
        """
        if retry_count >= self.max_retries:
            print(f"✗ Failed after {self.max_retries} attempts")
            return False
        
        attempt_num = retry_count + 1
        print(f"\n{'='*60}")
        print(f"Attempt {attempt_num}/{self.max_retries} - Loading {currency} view")
        print(f"{'='*60}")
        
        try:
            if retry_count == 0:
                # First load
                print(f"Navigating to {self.portfolio_url}")
                self.driver.get(self.portfolio_url)
            else:
                # Retry - reload the page
                print(f"Reloading page (attempt {attempt_num})...")
                self.driver.refresh()
            
            # Wait for table structure
            print("Waiting for table structure...")
            WebDriverWait(self.driver, 30).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "#portfolio-data tr"))
            )
            
            # Check for errors immediately
            if self.check_for_errors():
                print(f"Errors detected on page load, retrying in {self.retry_delay}s...")
                time.sleep(self.retry_delay)
                return self.load_page_with_retry(currency, retry_count + 1)
            
            # Wait for all assets to load
            if not self.wait_for_all_assets_loaded(expected_min_assets=2, timeout=60):
                print(f"Assets failed to load, retrying in {self.retry_delay}s...")
                time.sleep(self.retry_delay)
                return self.load_page_with_retry(currency, retry_count + 1)
            
            print(f"✓ {currency} view loaded successfully")
            return True
            
        except TimeoutException:
            print(f"✗ Timeout waiting for page elements, retrying in {self.retry_delay}s...")
            time.sleep(self.retry_delay)
            return self.load_page_with_retry(currency, retry_count + 1)
        except Exception as e:
            print(f"✗ Error loading page: {e}, retrying in {self.retry_delay}s...")
            time.sleep(self.retry_delay)
            return self.load_page_with_retry(currency, retry_count + 1)

    def switch_currency_with_retry(self, retry_count=0):
        """
        Switch currency and wait for all assets to reload. Retry if errors detected.
        Returns True if successful, False if all retries exhausted.
        """
        if retry_count >= self.max_retries:
            print(f"✗ Failed to switch currency after {self.max_retries} attempts")
            return False
        
        attempt_num = retry_count + 1
        print(f"\n{'='*60}")
        print(f"Attempt {attempt_num}/{self.max_retries} - Switching to EUR")
        print(f"{'='*60}")
        
        try:
            # Get sample value before switch
            rows = self.driver.find_elements(By.CSS_SELECTOR, "#portfolio-data tr")
            sample_value_before = None
            if rows:
                cells = rows[0].find_elements(By.TAG_NAME, "td")
                if len(cells) >= 4:
                    sample_value_before = cells[3].text
            
            # Click currency button
            print("Clicking currency switch button...")
            currency_button = WebDriverWait(self.driver, 10).until(
                EC.element_to_be_clickable((By.ID, "floating-currency-switch-btn"))
            )
            currency_button.click()
            print("Button clicked, waiting for currency change...")
            
            # Wait for currency to change
            time.sleep(3)
            
            # Verify currency changed
            if sample_value_before:
                rows_after = self.driver.find_elements(By.CSS_SELECTOR, "#portfolio-data tr")
                if rows_after:
                    cells_after = rows_after[0].find_elements(By.TAG_NAME, "td")
                    if len(cells_after) >= 4:
                        sample_value_after = cells_after[3].text
                        if sample_value_before == sample_value_after:
                            print("✗ Currency didn't change, retrying...")
                            time.sleep(self.retry_delay)
                            return self.switch_currency_with_retry(retry_count + 1)
                        print(f"✓ Currency changed: {sample_value_before} → {sample_value_after}")
            
            # Check for errors after switch
            if self.check_for_errors():
                print(f"Errors detected after currency switch, retrying...")
                time.sleep(self.retry_delay)
                return self.switch_currency_with_retry(retry_count + 1)
            
            # Wait for all assets to reload with new currency
            if not self.wait_for_all_assets_loaded(expected_min_assets=2, timeout=60):
                print(f"Assets failed to load after currency switch, retrying...")
                time.sleep(self.retry_delay)
                return self.switch_currency_with_retry(retry_count + 1)
            
            print("✓ EUR view loaded successfully")
            return True
            
        except Exception as e:
            print(f"✗ Error switching currency: {e}")
            time.sleep(self.retry_delay)
            return self.switch_currency_with_retry(retry_count + 1)

    def extract_values(self, currency='USD'):
        """Extract asset values from the currently loaded page."""
        print(f"\nExtracting {currency} values...")
        asset_values = {}
        
        try:
            table_body = self.driver.find_element(By.ID, "portfolio-data")
            rows = table_body.find_elements(By.TAG_NAME, "tr")
            
            for row in rows:
                try:
                    cells = row.find_elements(By.TAG_NAME, "td")
                    if len(cells) >= 4:
                        symbol_container = cells[0].find_element(By.CLASS_NAME, "symbol-container")
                        raw_symbol_text = symbol_container.text
                        symbol = raw_symbol_text.replace('⊕', '').replace('⊖', '').strip()
                        if symbol == 'BTC':
                            internal_symbol = 'BINANCE:BTCUSDT'
                        elif symbol == 'IWDE.L':
                            internal_symbol = 'IWDE'
                        elif symbol == 'XUSE.L' or symbol == 'XUSE.AS':
                            internal_symbol = 'XUSE'
                        else:
                            internal_symbol = symbol
                        
                        value_text = cells[3].text.strip()
                        
                        # Parse based on currency
                        if currency == 'USD':
                            cleaned = value_text.replace('$', '').replace(',', '')
                            value = float(cleaned)
                        else:  # EUR
                            cleaned_text = value_text.replace('€', '').strip()
                            last_comma = cleaned_text.rfind(',')
                            last_dot = cleaned_text.rfind('.')
                            
                            if last_comma > last_dot:
                                cleaned_value_text = cleaned_text.replace('.', '').replace(',', '.')
                            else:
                                cleaned_value_text = cleaned_text.replace(',', '')
                            
                            value = float(cleaned_value_text)
                        
                        asset_values[internal_symbol] = value
                        print(f"  ✓ {internal_symbol}: {value_text} = {value}")
                        
                except Exception as row_e:
                    print(f"  ⚠ Error processing row: {row_e}")
            
            return asset_values
            
        except Exception as e:
            print(f"✗ Error extracting {currency} values: {e}")
            return {}

    def get_asset_values(self):
        """Main method to scrape USD and EUR values with retry logic."""
        # Load page and get USD values
        if not self.load_page_with_retry(currency='USD'):
            raise ValueError("Failed to load USD view after all retries")
        
        asset_values_usd = self.extract_values(currency='USD')
        if not asset_values_usd:
            raise ValueError("Failed to extract USD values")
        
        # Switch to EUR and get EUR values
        if not self.switch_currency_with_retry():
            raise ValueError("Failed to switch to EUR view after all retries")
        
        asset_values_eur = self.extract_values(currency='EUR')
        if not asset_values_eur:
            raise ValueError("Failed to extract EUR values")
        
        return asset_values_usd, asset_values_eur

    def update_history(self, asset_values_usd, asset_values_eur):
        """Updates portfolio_history.json with detailed asset values in USD and EUR."""
        today = datetime.now(pytz.timezone('Europe/Paris')).strftime('%Y-%m-%d')
        history_data = {"history": []}

        if self.json_file.exists():
            try:
                with open(self.json_file, 'r') as f:
                    content = f.read()
                    if content.strip():
                        history_data = json.loads(content)
                    if "history" not in history_data:
                        history_data["history"] = []
            except json.JSONDecodeError:
                print(f"Warning: Invalid JSON in {self.json_file}. Starting fresh.")
            except Exception as e:
                print(f"Error reading {self.json_file}: {e}")

        today_assets = {}
        for symbol, value_usd in asset_values_usd.items():
            value_eur = asset_values_eur.get(symbol, 0)
            today_assets[symbol] = {
                "value_usd": round(value_usd, 2),
                "value_eur": round(value_eur, 2)
            }

        new_entry = {
            "date": today,
            "assets": today_assets
        }

        # Update or append today's entry
        entry_updated = False
        for i, entry in enumerate(history_data["history"]):
            if entry.get("date") == today:
                history_data["history"][i] = new_entry
                entry_updated = True
                print(f"\n✓ Updated entry for {today}")
                break

        if not entry_updated:
            history_data["history"].append(new_entry)
            print(f"\n✓ Added new entry for {today}")

        try:
            with open(self.json_file, 'w') as f:
                json.dump(history_data, f, indent=2)
            return history_data
        except Exception as e:
            print(f"ERROR writing to {self.json_file}: {e}")
            return None

    def run(self):
        """Main execution flow."""
        try:
            print("="*60)
            print("PORTFOLIO UPDATER STARTING")
            print("="*60)
            
            asset_values_usd, asset_values_eur = self.get_asset_values()

            print(f"\n{'='*60}")
            print(f"✓ Successfully extracted all values")
            print(f"  USD: {len(asset_values_usd)} assets")
            print(f"  EUR: {len(asset_values_eur)} assets")
            print(f"{'='*60}")

            updated_data = self.update_history(asset_values_usd, asset_values_eur)

            if updated_data:
                print(f"\n✓ Successfully updated {self.json_file}")
                print("="*60)
                return True
            else:
                print("\n✗ Failed to update history file")
                return False

        except Exception as e:
            print(f"\n✗ FATAL ERROR: {e}")
            return False
        finally:
            if hasattr(self, 'driver'):
                self.driver.quit()
                print("Driver closed")

if __name__ == "__main__":
    updater = PortfolioUpdater()
    success = updater.run()
    exit(0 if success else 1)
