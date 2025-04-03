document.addEventListener('DOMContentLoaded', () => {
    // Portfolio positions from user input
    const portfolio = {
        'VOO': 2.31,
        'NANC': 20.9265,
        'IAU': 34.0794,
        'SGOV': 142.4127,
        'BINANCE:BTCUSDT': 0.09314954 // Use the same format as in the Python script
    };

    // Initial investments as provided
    const initialInvestments = {
        'VOO': 1195,
        'NANC': 782,
        'IAU': 1904,
        'SGOV': 14296,
        'BINANCE:BTCUSDT': 5400 // Investment in Bitcoin
    };

    // Original investment in Euros
    const originalEuroInvestment = 21500;
    
    // API key from the Python script for stock data
    const apiKey = 'cvneau1r01qq3c7eq690cvneau1r01qq3c7eq69g';

    // Elements
    const portfolioDataEl = document.getElementById('portfolio-data');
    const totalValueEl = document.getElementById('total-value');
    const totalPnlEl = document.getElementById('total-pnl');
    const totalEurosEl = document.getElementById('total-euros');
    const euroPnlEl = document.getElementById('euro-pnl');
    const lastUpdatedEl = document.getElementById('last-updated');
    const loadingEl = document.getElementById('loading');
    const refreshBtn = document.getElementById('refresh-btn');
    const portfolioTable = document.getElementById('portfolio-table');
    const totalPnlPerc = document.getElementById('total-%-pnl');
    const totalEurosPerc = document.getElementById('total-%-pnl-euros');
    
    // Initialize
    fetchStockData();
    
    // Add event listener for refresh button
    refreshBtn.addEventListener('click', fetchStockData);

    async function fetchExchangeRate() {
        try {
            let response = await fetch("https://playersfirst.github.io/exchange_rate.json"); // Fetch rate from Flask API
            let data = await response.json(); // Get JSON data
            return data.rate; // Return the exchange rate
        } catch (error) {
            console.error("Error fetching exchange rate:", error);
            return 1.0; // Fallback rate
        }
    }

    // Function to fetch stock data
    async function fetchStockData() {
        // Show loading, hide table
        loadingEl.style.display = 'block';
        portfolioTable.style.display = 'none';
        
        // Clear previous data
        portfolioDataEl.innerHTML = '';
        
        // Get the current USD to EUR exchange rate
        const usdToEurRate = await fetchExchangeRate();
        
        let totalPortfolioValue = 0;
        let totalPnL = 0;
        let completedRequests = 0;
        const totalRequests = Object.keys(portfolio).length;
        
        // Process each stock symbol
        Object.keys(portfolio).forEach(symbol => {
            const shares = portfolio[symbol];
            const initialInvestment = initialInvestments[symbol];

            // Special handling for cryptocurrency (Binance format)
            let url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`;
            
            fetch(url)
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! Status: ${response.status}`);
                    }
                    return response.json();
                })
                .then(data => {
                    const price = data.c; // Current price
                    const priceChange = data.d; // Price change
                    const percentChange = data.dp; // Percent change
                    const value = price * shares;
                    
                    // Calculate P&L (current value - initial investment)
                    const pnl = value - initialInvestment;
                    
                    // Add to total portfolio value and P&L
                    totalPortfolioValue += value;
                    totalPnL += pnl;
                    
                    // Create table row with the new PnL % column
                    const row = createTableRow(symbol, shares, price, value, pnl, percentChange, initialInvestment);
                    portfolioDataEl.appendChild(row);
                    
                    // Update UI when all requests are completed
                    completedRequests++;
                    if (completedRequests === totalRequests) {
                        finishLoading(totalPortfolioValue, totalPnL, usdToEurRate);
                    }
                })
                .catch(error => {
                    console.error(`Error fetching data for ${symbol}:`, error);
                    
                    // Create error row
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${symbol}</td>
                        <td>${shares}</td>
                        <td colspan="4">Error loading data</td>
                    `;
                    portfolioDataEl.appendChild(row);
                    
                    // Update UI when all requests are completed
                    completedRequests++;
                    if (completedRequests === totalRequests) {
                        finishLoading(totalPortfolioValue, totalPnL, usdToEurRate);
                    }
                });
        });
    }
    
    // Function to create a table row for a stock
    function createTableRow(symbol, shares, price, value, pnl, percentChange, initialInvestment) {
        const displaySymbol = symbol.includes('BINANCE:') ? 'BTC' : symbol;
    
        // Calculate PnL percentage
        const pnlPercentage = ((value - initialInvestment) / initialInvestment) * 100;
    
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${displaySymbol}</td>
            <td>${shares.toFixed(4)}</td>
            <td>$${price.toFixed(2)}</td>
            <td>$${value.toFixed(2)}</td>
            <td class="${pnl >= 0 ? 'positive' : 'negative'}">$${pnl.toFixed(2)}</td>
            <td class="${pnlPercentage >= 0 ? 'positive' : 'negative'}">
                ${pnlPercentage >= 0 ? '+' : ''}${pnlPercentage.toFixed(2)}%
            </td>
                        <td class="${percentChange >= 0 ? 'positive' : 'negative'}">
                ${percentChange >= 0 ? '+' : ''}${percentChange.toFixed(2)}%
            </td>
        `;
        return row;
    }
    
    // Function to complete the loading process
    function finishLoading(totalValue, totalPnL, exchangeRate) {
        // Update total value
        totalValueEl.textContent = `$${(totalValue + 2.5).toFixed(2)}`;
        
        // Update total P&L with color coding
        totalPnlEl.textContent = `$${(totalPnL).toFixed(2)}`;
        totalPnlEl.className = totalPnL >= 0 ? 'positive' : 'negative';
        
        // Calculate total PnL %
        const totalPnLPercentage = (totalPnL / Object.values(initialInvestments).reduce((a, b) => a + b, 0)) * 100;
        totalPnlPerc.textContent = `${totalPnLPercentage.toFixed(2)}%`;
        totalPnlPerc.className = totalPnLPercentage >= 0 ? 'positive' : 'negative';
        
        // Calculate and update Euro values
        const totalEuros = (totalValue + 2.5) / exchangeRate;
        const euroPnL = totalEuros - originalEuroInvestment;
        
        totalEurosEl.textContent = `€${totalEuros.toFixed(2)}`;
        euroPnlEl.textContent = `€${euroPnL.toFixed(2)}`;
        euroPnlEl.className = euroPnL >= 0 ? 'positive' : 'negative';
        
        // Calculate total Euro PnL %
        const totalEuroPnLPercentage = (euroPnL / originalEuroInvestment) * 100;
        totalEurosPerc.textContent = `${totalEuroPnLPercentage.toFixed(2)}%`;
        totalEurosPerc.className = totalEuroPnLPercentage >= 0 ? 'positive' : 'negative';
        
        // Update last updated timestamp
        const now = new Date();
        lastUpdatedEl.textContent = now.toLocaleString();
        
        // Hide loading, show table
        loadingEl.style.display = 'none';
        portfolioTable.style.display = 'table';
    }
});
