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

class PortfolioUpdater:
    def __init__(self):
        self.setup_driver()
        self.json_file = Path(__file__).parent / 'portfolio_history.json'
        self.max_entries = 6

    def setup_driver(self):
        chrome_options = Options()
        chrome_options.add_argument("--disable-gpu")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        
        # Use the same initialization that worked in your other script
        self.driver = webdriver.Chrome(options=chrome_options)

    def get_current_portfolio_value(self):
        try:
            self.driver.get("https://playersfirst.github.io/portfolio")
            time.sleep(5)  # Pauses for 5 seconds
            value_element = WebDriverWait(self.driver, 30).until(
                EC.presence_of_element_located((By.ID, "total-value"))
            )
            value_text = value_element.text
            return float(value_text.replace('$', '').replace(',', ''))
        except Exception as e:
            print(f"Error scraping portfolio value: {e}")
            raise

    def update_history(self, new_value):
        today = datetime.now(pytz.timezone('Europe/Paris')).strftime('%Y-%m-%d')
        
        try:
            with open(self.json_file, 'r') as f:
                data = json.load(f)
        except FileNotFoundError:
            data = {"history": []}
        
        if "history" not in data:
            data["history"] = []
        
        if len(data["history"]) >= self.max_entries:
            data["history"].pop(0)
        
        data["history"].append({
            "date": today,
            "value": new_value
        })
        
        with open(self.json_file, 'w') as f:
            json.dump(data, f, indent=2)
        
        return data

    def run(self):
        try:
            current_value = self.get_current_portfolio_value()
            print(f"Current portfolio value: ${current_value:,.2f}")
            updated_data = self.update_history(current_value)
            print("Successfully updated portfolio history:")
            print(json.dumps(updated_data, indent=2))
            return True
        except Exception as e:
            print(f"Error in portfolio update: {e}")
            return False
        finally:
            self.driver.quit()

if __name__ == "__main__":
    updater = PortfolioUpdater()
    success = updater.run()
    exit(0 if success else 1)
