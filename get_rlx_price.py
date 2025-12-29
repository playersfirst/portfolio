from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
import re

# 1. Your Cookie
MY_COOKIE = "chronosessid=4aa43ca7-3535-4644-9176-3d97c179f49d; timezone=Asia/Beirut; c24-consent=AAEAJ4/nwEjO; pu=true; shippingCountryId=FR; userAccountActivationReminder=; mobile-app-pu=true; filter-combinations=8:Man|PrT|Spe|Cou|CaD|DIC|Con|Qry,1:Qry; last-search-result-ids=43013361.43842359.35462545.42568509; cfctGroup=AAIIXXV01%3D%26NBPR01%3D%26AAXXV00%3D%26NBPF01%3D%26ABSI01%3D%26AAAXXV01%3D%26LTRS00%3D; JSESSIONID=worker3219ra8st11vth71v7i2v8qmzmwz2838971.worker32; c24-user-session=d642a867-00c6-4a52-a25f-e740da2f5831.6a8af338-6aa6-4b08-aaa1-dddb99d6e446; __cflb=0H28vBCZxXf5QcKQeRkZ1C8DmQMbuepX8LYoaaCTUaY; csrf-token=1767021893.WHkeHiapZRDFdMwRPVA5sBjm5PHQOZqmd1_BC9JkwSc.AXG1VdgxRdZSXEMqtDWVLMwt3sjF; userHistory=41883165|1767024099624|26+43013361|1766439020188|4+43941406|1766438992294|7+33648234|1766438696313|6+43294583|1766417364070|3+42894213|1766417316083|5+42568509|1766417090043|1+37077578|1766416895029|3+32398087|1766416893399|4+43882467|1766416318384|3+42891274|1766416314094|5+38743905|1766416088070|3+43908103|1766415769546|2+44135199|1766415769271|3+44033543|1766415769270|2+44023508|1766411433866|3+43355176|1766411205069|1+44017889|1766411197731|1+43088216|1766411194016|1+43266020|1766411193411|1; cf_clearance=oirkrSqn5CdqkaziKXvIKeG4kOk9htFtPkiNwUV48_M-1767025363-1.2.1.1-4QkwDFwwcwQ0KPVszlQcIgDFbFUh4xdi8Wa9lARPHUUmHDM4xODasmCiEe9MQHVCBGbNXEMf05QINt_hROruQzhxx2U7t6fVKuwT1XAnoS7EQx70ZYY_BDrGPQLyZRWSAV9Hbk72mnaCrUTjrZFe6FOW4xLPVjzfDweGY_oX1XlXWIgNkOTw3uhlTlVNb0riC_8_PpTjX.dGRdCsR_O4hx7wOhFVD9mehACZWixuwjA; c24-data=eyI0NCI6eyJlIjoiMTc2NzYzMTUzNCIsInYiOiIxIn0sIjI3Ijp7ImUiOiIxNzk4NTYxMzYzIiwidiI6IjU4In0sIjE5NCI6eyJlIjoiMTc5ODA0ODMyNyIsInYiOiIifSwiMTczIjp7ImUiOiIxNzk3OTA2NDYxIiwidiI6IjEifSwiMTk1Ijp7ImUiOiIxNzY3ODA4MzI3IiwidiI6IjM3In0sIjE3NCI6eyJlIjoiMTc2NzY2NjQ2MSIsInYiOiIxMiJ9LCIxOTYiOnsiZSI6IjE3ODIwNjQzMjciLCJ2IjoiMSJ9LCIxNzUiOnsiZSI6IjE3ODE5MjI0NjEiLCJ2IjoiMSJ9LCIyMzIiOnsiZSI6IjE3OTc4NzE1MzMiLCJ2IjoiMTc2NjMzNTUzMTQ3OCJ9LCI0MzMiOnsiZSI6IjE3NjkwMDkxMzIiLCJ2IjoiMTU4In0sIjQ1NSI6eyJlIjoiMTc2OTA1MzQxOSIsInYiOiIifSwiNDU2Ijp7ImUiOiIxNzY5MDUzNDE5IiwidiI6IjM0In0sIjMwIjp7ImUiOiIxNzY3NjMxNTM0IiwidiI6IjEifSwiOTgiOnsiZSI6IjE3OTg1NjEzNjkiLCJ2IjoiMiJ9LCIzMyI6eyJlIjoiMTc2NzYzMTU3NSIsInYiOiIxIn0sIjEyIjp7ImUiOiIxNzY3NjMxNTc1IiwidiI6IjE3NjYzMzU1NzI5NzMifSwiMzYiOnsiZSI6IjE3OTg1NjEzNjkiLCJ2IjoiMTc2NzAyNTM2OTAxMiJ9LCIzNyI6eyJlIjoiMTc5ODU2MTM2MyIsInYiOiIxNzY3MDI1MzYzNDYwIn0sIjM4Ijp7ImUiOiIxNzk3ODcxNTA0IiwidiI6IjE3NjM3NDM1MDQyODUifSwiNDY1Ijp7ImUiOiIxODYwOTQzNTA2IiwidiI6IjE4NjA5NDM1MDY0NTYifSwiMTI1Ijp7ImUiOiIxNzY3NjQ0NzMxIiwidiI6IjE3NjYzNDg3MjU5NDkifSwiNSI6eyJlIjoiMTc2OTYxNzM2OSIsInYiOiIyIn0sIjEyNiI6eyJlIjoiMTc2NzY0NDczMSIsInYiOiIzIn0sIjYiOnsiZSI6IjE3Njk2MTczNjkiLCJ2IjoiMiJ9LCIxMjciOnsiZSI6IjE3Njc2NDQ3MzEiLCJ2IjoiMSJ9LCI5Ijp7ImUiOiIxNzY3NjMxNTM0IiwidiI6IjE3NjYzMzU1MzE0NzgifSwiNDEiOnsiZSI6IjE3OTc4NzE1MDQiLCJ2IjoiMTc2NjMzNTUwNDAwMCJ9fQ=="

URL = "https://www.chrono24.fr/user/watch-collection/view-item.htm?itemId=20188576"

def get_price():
    # Set up Chrome options
    chrome_options = Options()
    chrome_options.add_argument('--no-sandbox')
    chrome_options.add_argument('--disable-dev-shm-usage')
    
    driver = webdriver.Chrome(options=chrome_options)
    
    try:
        # Set cookies via CDP before navigation
        driver.execute_cdp_cmd('Network.enable', {})
        
        # Parse and set all cookies
        cookies = []
        for cookie_str in MY_COOKIE.split('; '):
            if '=' in cookie_str:
                name, value = cookie_str.split('=', 1)
                cookies.append({
                    'name': name,
                    'value': value,
                    'domain': '.chrono24.fr',
                    'path': '/'
                })
        
        # Set cookies via CDP
        for cookie in cookies:
            driver.execute_cdp_cmd('Network.setCookie', cookie)
        
        driver.execute_cdp_cmd('Network.disable', {})
        
        # Navigate to the page (ONLY ONCE)
        driver.get(URL)
        
        # Wait for the price element to appear (loaded by JavaScript)
        wait = WebDriverWait(driver, 10)
        price_element = wait.until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "p.h3.m-y-0"))
        )
        
        # Get the text content
        price_text = price_element.text.strip()
        
        # Extract just the price part (number and euro symbol)
        price_match = re.search(r'([\d\s]+€)', price_text)
        if price_match:
            price = price_match.group(1).strip()
            print(price)
        else:
            print(price_text)
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        driver.quit()

if __name__ == "__main__":
    get_price()
