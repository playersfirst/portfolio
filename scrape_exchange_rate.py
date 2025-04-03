import requests
from bs4 import BeautifulSoup
import json

# Function to scrape EUR/USD exchange rate
def get_exchange_rate():
    url = 'https://www.x-rates.com/calculator/?from=EUR&to=USD&amount=1'
    response = requests.get(url)

    if response.status_code == 200:
        soup = BeautifulSoup(response.text, 'html.parser')
        rate_element = soup.find('span', class_='ccOutputRslt')
        if rate_element:
            rate_text = rate_element.get_text(strip=True)
            rate = ''.join(c for c in rate_text if c.isdigit() or c == '.')  # Keep only numbers and dots
            return float(rate)  # Convert to float
    return None

# Function to save the exchange rate to a JSON file
def save_exchange_rate():
    rate = get_exchange_rate()
    if rate:
        data = {'rate': rate}
        with open('exchange_rate.json', 'w') as f:
            json.dump(data, f)
        print(f"Exchange rate saved: {rate}")
    else:
        print("Failed to fetch exchange rate")

if __name__ == '__main__':
    save_exchange_rate()
