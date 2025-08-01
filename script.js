document.addEventListener('DOMContentLoaded', async () => {
    const apiKey = 'cvneau1r01qq3c7eq690cvneau1r01qq3c7eq69g';
    const REFRESH_INTERVAL = 30 * 1000;
    
    // Portfolio configuration - will be loaded from JSON
    let originalEuroInvestment;
    let initialInvestments;
    let initialEuroInvestments;
    const assetColors = {
        'BINANCE:BTCUSDT': '#FF6384',
        'VOO': '#36A2EB',
        'NANC': '#36A2EB',
        'IAU': '#FFCE56',
        'SGOV': '#4BC0C0'
    };

    const assetClassLabels = {
        'BINANCE:BTCUSDT': 'Crypto',
        'VOO': 'Equities',
        'NANC': 'Equities',
        'IAU': 'Commodities',
        'SGOV': 'Savings'
    };

    let displayCurrency = 'USD';
    let usdToEurRate = 1.0;
    let selectedTimeframe = '8'; // Default to showing all history
    const excludedAssets = new Set();
    let portfolioData = {};
    let refreshTimer;
    let currentPieChart;
    let portfolio = {};
    let cbbiData = null;
    let pieChartViewMode = 'market'; // 'market' or 'invested'

    const currentPieChartEl = document.getElementById('current-pie-chart');
    const chartLegendEl = document.getElementById('chart-legend');
    const portfolioDataEl = document.getElementById('portfolio-data');
    const totalValueEl = document.getElementById('total-value');
    const totalPnlEl = document.getElementById('total-pnl');
    const totalEurosEl = document.getElementById('total-euros');
    const euroPnlEl = document.getElementById('euro-pnl');
    const lastUpdatedEl = document.getElementById('last-updated');
    const loadingEl = document.getElementById('loading');
    const portfolioTable = document.getElementById('portfolio-table');
    const totalPnlPerc = document.getElementById('total-%-pnl');
    const totalEurosPerc = document.getElementById('total-%-pnl-euros');
    const mainTotalValueEl = document.getElementById('main-total-value');
    const mainEuroValueEl = document.getElementById('main-euro-value');
    const mainTotalPnlEl = document.getElementById('main-total-pnl');
    const mainPnlBadgeEl = document.getElementById('main-pnl-badge');
    const currencySwitchBtn = document.getElementById('currency-switch-btn');
    const tableHeaders = portfolioTable.querySelectorAll('th');
    const timeframeSelectEl = document.getElementById('timeframe-select'); // New timeframe selector
    
    // CBBI elements
    const cbbiValueEl = document.getElementById('cbbi-value');
    const cbbiDateEl = document.getElementById('cbbi-date');



    function createYtdSection() {
        // Remove existing section
        const existing = document.querySelector('.ytd-card');
        if (existing) existing.remove();

        // Find the history-section to insert after it
        const historySection = document.querySelector('#history-section');
        if (!historySection) return;

        const currentYear = new Date().getFullYear();
        const ytdCard = document.createElement('div');
        ytdCard.className = 'ytd-card';
        
        // Create the HTML with placeholder values that will be updated by updateYtdDisplay
        ytdCard.innerHTML = `
            <div class="ytd-header">
                <div class="ytd-title-section">
                    <h3>ANNUALIZED RETURNS</h3>
                </div>
            </div>
            <div class="ytd-values">
                <div class="ytd-value-item">
                    <span class="ytd-label">Total</span>
                    <span id="ytd-value-with-sgov" class="ytd-value">N/A</span>
                </div>
                <div class="ytd-value-item">
                    <span class="ytd-label">Risk Assets</span>
                    <span id="ytd-value-excl-sgov" class="ytd-value">N/A</span>
                </div>
            </div>
            <div class="ytd-date" id="ytd-date">Calculating...</div>
            <div class="ytd-assets" id="ytd-assets"></div>
        `;

        // Insert after the cbbi-card (at the very bottom)
        const cbbiCard = document.querySelector('.cbbi-card');
        if (cbbiCard) {
            cbbiCard.parentNode.insertBefore(ytdCard, cbbiCard.nextSibling);
        } else {
            // Fallback: insert at the end of the container
            const container = document.querySelector('.container');
            if (container) {
                container.appendChild(ytdCard);
            }
        }

        updateYtdDisplay();
    }



    function updateYtdDisplay() {
        const ytdDate = document.getElementById('ytd-date');

        // Calculate average yearly return based on current portfolio state
        const portfolioStartDate = new Date('2024-08-01');
        const currentDate = new Date();
        const daysSinceStart = (currentDate - portfolioStartDate) / (1000 * 60 * 60 * 24);
        const yearsSinceStart = daysSinceStart / 365.25;

        // Calculate current total PnL percentages
        let totalValuePrimary = 0;
        let totalPnlPrimary = 0;
        let totalInitialInvestmentPrimary = 0;
        let totalValueExclSgov = 0;
        let totalPnlExclSgov = 0;
        let totalInitialInvestmentExclSgov = 0;

        Object.keys(portfolioData).forEach(symbol => {
            const data = portfolioData[symbol];
            if (data && !data.error && !excludedAssets.has(symbol)) {
                const value = displayCurrency === 'USD' ? data.value : data.valueEur;
                const pnl = displayCurrency === 'USD' ? data.pnl : data.pnlEur;
                const initialInvestment = displayCurrency === 'USD' ? data.initialInvestment : data.initialEuroInvestment;
                
                totalValuePrimary += value;
                totalPnlPrimary += pnl;
                totalInitialInvestmentPrimary += initialInvestment;
                
                // Exclude SGOV for the second calculation
                if (symbol !== 'SGOV') {
                    totalValueExclSgov += value;
                    totalPnlExclSgov += pnl;
                    totalInitialInvestmentExclSgov += initialInvestment;
                }
            }
        });

        // Calculate current PnL percentages
        const currentPnlPercentage = totalInitialInvestmentPrimary > 0 ? (totalPnlPrimary / totalInitialInvestmentPrimary) * 100 : 0;
        const currentPnlPercentageExclSgov = totalInitialInvestmentExclSgov > 0 ? (totalPnlExclSgov / totalInitialInvestmentExclSgov) * 100 : 0;

        // Calculate annualized returns
        let withSgovValue = null;
        let exclSgovValue = null;

        if (yearsSinceStart > 0) {
            // Formula: (1 + total_return)^(1/years) - 1
            const totalReturnWithSgov = currentPnlPercentage / 100;
            const totalReturnExclSgov = currentPnlPercentageExclSgov / 100;
            
            withSgovValue = ((1 + totalReturnWithSgov) ** (1 / yearsSinceStart) - 1) * 100;
            exclSgovValue = ((1 + totalReturnExclSgov) ** (1 / yearsSinceStart) - 1) * 100;
        }

        // Update With SGOV value
        const withSgovEl = document.getElementById('ytd-value-with-sgov');
        if (withSgovEl && withSgovValue !== null) {
            const sign = withSgovValue >= 0 ? '+' : '';
            withSgovEl.textContent = `${sign}${withSgovValue.toFixed(2)}%`;
            withSgovEl.className = `ytd-value ${withSgovValue >= 0 ? 'positive' : 'negative'}`;
        }

        // Update Risk Assets value
        const exclSgovEl = document.getElementById('ytd-value-excl-sgov');
        if (exclSgovEl && exclSgovValue !== null) {
            const sign = exclSgovValue >= 0 ? '+' : '';
            exclSgovEl.textContent = `${sign}${exclSgovValue.toFixed(2)}%`;
            exclSgovEl.className = `ytd-value ${exclSgovValue >= 0 ? 'positive' : 'negative'}`;
        }
        
        if (ytdDate) {
            ytdDate.textContent = '';
        }
        
        // Update individual asset returns (we'll modify this function too)
        updateAssetReturns();
    }

    function updateAssetReturns() {
        const ytdAssets = document.getElementById('ytd-assets');
        if (!ytdAssets) return;

        // Calculate time period for annualization
        const portfolioStartDate = new Date('2024-08-01');
        const currentDate = new Date();
        const daysSinceStart = (currentDate - portfolioStartDate) / (1000 * 60 * 60 * 24);
        const yearsSinceStart = daysSinceStart / 365.25;

        if (yearsSinceStart <= 0) return;

        // Calculate annualized returns for each asset
        const assetReturns = {};
        const assetNames = Object.keys(portfolioData);

        assetNames.forEach(assetName => {
            const data = portfolioData[assetName];
            if (data && !data.error && !excludedAssets.has(assetName)) {
                const pnl = displayCurrency === 'USD' ? data.pnl : data.pnlEur;
                const initialInvestment = displayCurrency === 'USD' ? data.initialInvestment : data.initialEuroInvestment;
                
                if (initialInvestment > 0) {
                    const currentPnlPercentage = (pnl / initialInvestment) * 100;
                    const totalReturn = currentPnlPercentage / 100;
                    const annualizedReturn = ((1 + totalReturn) ** (1 / yearsSinceStart) - 1) * 100;
                    assetReturns[assetName] = annualizedReturn;
                }
            }
        });

        const sortedAssets = Object.keys(assetReturns).sort((a, b) => {
            return assetReturns[b] - assetReturns[a]; // Sort descending (highest first)
        });

        if (sortedAssets.length === 0) return;

        let html = '';
        html += '<div class="ytd-assets-grid">';
        
        sortedAssets.forEach(assetName => {
            const returnValue = assetReturns[assetName];
            
            if (returnValue !== null && returnValue !== undefined) {
                const sign = returnValue >= 0 ? '+' : '';
                const colorClass = returnValue >= 0 ? 'positive' : 'negative';
                
                // Display "BTC" instead of "BINANCE:BTCUSDT"
                const displayName = assetName === 'BINANCE:BTCUSDT' ? 'BTC' : assetName;
                
                html += `
                    <div class="ytd-asset-item">
                        <span class="ytd-asset-name">${displayName}</span>
                        <span class="ytd-asset-value ${colorClass}">${sign}${returnValue.toFixed(2)}%</span>
                    </div>
                `;
            }
        });
        
        html += '</div>';
        ytdAssets.innerHTML = html;
    }

    function createAverageBuyPriceSection() {
        // Remove existing section
        const existing = document.querySelector('.avg-buy-price-card');
        if (existing) existing.remove();

        // Find the history-section to insert after it
        const historySection = document.querySelector('#history-section');
        if (!historySection) return;

        const avgBuyPriceCard = document.createElement('div');
        avgBuyPriceCard.className = 'avg-buy-price-card';
        
        avgBuyPriceCard.innerHTML = `
            <div class="avg-buy-price-header">
                <h3>AVERAGE BUY PRICE</h3>
            </div>
            <div class="avg-buy-price-content" id="avg-buy-price-content">
                <!-- Content will be populated by updateAverageBuyPriceDisplay -->
            </div>
        `;

        // Insert after the history-section
        historySection.parentNode.insertBefore(avgBuyPriceCard, historySection.nextSibling);
        
        updateAverageBuyPriceDisplay();
    }

    function updateAverageBuyPriceDisplay() {
        const contentEl = document.getElementById('avg-buy-price-content');
        if (!contentEl) return;

        const assets = ['IAU', 'BINANCE:BTCUSDT', 'NANC', 'VOO'];
        let html = '<div class="avg-buy-price-grid">';
        
        assets.forEach(symbol => {
            const shares = portfolio[symbol];
            const initialInvestment = displayCurrency === 'USD' ? 
                initialInvestments[symbol] : 
                initialEuroInvestments[symbol];
            
            if (shares && initialInvestment) {
                const avgBuyPrice = initialInvestment / shares;
                const currentPrice = portfolioData[symbol]?.price;
                
                if (currentPrice) {
                    const currentPriceInCurrency = displayCurrency === 'USD' ? 
                        currentPrice : 
                        currentPrice / usdToEurRate;
                    
                    const isHigher = currentPriceInCurrency > avgBuyPrice;
                    const priceColorClass = isHigher ? 'positive' : 'negative';
                    
                    // Display "BTC" instead of "BINANCE:BTCUSDT"
                    const displayName = symbol === 'BINANCE:BTCUSDT' ? 'BTC' : symbol;
                    
                    // Use special formatting for Bitcoin (no decimal places)
                    const formatFunction = symbol === 'BINANCE:BTCUSDT' ? formatBitcoinPrice : formatCurrency;
                    
                    html += `
                        <div class="avg-buy-price-item">
                            <div class="avg-buy-price-asset">
                                <span class="avg-buy-price-name">${displayName}</span>
                            </div>
                            <div class="avg-buy-price-values">
                                <div class="avg-buy-price-row">
                                    <span class="avg-buy-price-label">Buy:</span>
                                    <span class="avg-buy-price-value">${formatFunction(avgBuyPrice, displayCurrency)}</span>
                                </div>
                                <div class="avg-buy-price-row">
                                    <span class="avg-buy-price-label">Current:</span>
                                    <span class="avg-buy-price-value ${priceColorClass}">${formatFunction(currentPriceInCurrency, displayCurrency)}</span>
                                </div>
                            </div>
                        </div>
                    `;
                }
            }
        });
        
        html += '</div>';
        contentEl.innerHTML = html;
    }


    async function fetchInitialData() {
        try {
            // Load portfolio configuration from JSON file
            const response = await fetch('portfolio_config.json');
            if (!response.ok) {
                throw new Error(`Failed to load portfolio config: ${response.status}`);
            }
            const config = await response.json();
            
            // Set global variables from config
            originalEuroInvestment = config.originalEuroInvestment;
            initialInvestments = config.initialInvestments;
            initialEuroInvestments = config.initialEuroInvestments;
            portfolio = config.currentPortfolio;
            
            fetchStockData();
            createAverageBuyPriceSection();
            createYtdSection(); // Create the average yearly return section
            fetchCbbiData(); // Fetch CBBI data
        } catch (error) {
            console.error('Error loading portfolio configuration:', error);
            loadingEl.textContent = 'Error loading portfolio configuration. Please refresh.';
            loadingEl.style.display = 'flex';
            portfolioTable.style.display = 'none';
        }
    }

    async function fetchExchangeRate() {
        try {
            let response = await fetch("https://playersfirst.github.io/exchange_rate.json");
            let data = await response.json();
            usdToEurRate = data.rate;
        } catch (error) {
            console.warn('Failed to fetch exchange rate, using value of 1.0');
        }
        return usdToEurRate;
    }

    async function fetchCbbiData() {
        try {
            const response = await fetch('https://colintalkscrypto.com/cbbi/data/latest.json');
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            const data = await response.json();
            cbbiData = data;
            updateCbbiDisplay();
        } catch (error) {
            console.warn('Failed to fetch CBBI data:', error);
            cbbiValueEl.textContent = '--';
            cbbiSentimentEl.textContent = 'Error loading data';
            cbbiSentimentEl.className = 'cbbi-sentiment';
            cbbiDateEl.textContent = '--';
        }
    }

    function updateCbbiDisplay() {
        if (!cbbiData) return;

        // Get the latest value from the Confidence field
        if (!cbbiData.Confidence) {
            cbbiValueEl.textContent = '--';
            cbbiSentimentEl.textContent = 'No CBBI data found';
            cbbiSentimentEl.className = 'cbbi-sentiment';
            cbbiDateEl.textContent = '--';
            return;
        }

        // Get the latest timestamp and value from Confidence
        const timestamps = Object.keys(cbbiData.Confidence).sort((a, b) => parseInt(a) - parseInt(b));
        const latestTimestamp = timestamps[timestamps.length - 1];
        const latestValue = cbbiData.Confidence[latestTimestamp];

        if (latestValue !== null) {
            // Convert from 0-1 scale to 0-100 scale
            const displayValue = latestValue * 100;
            cbbiValueEl.textContent = displayValue.toFixed(2);
            
            // Add color coding based on value
            cbbiValueEl.className = 'cbbi-value';
            if (displayValue <= 20) {
                cbbiValueEl.classList.add('extreme-fear');
            } else if (displayValue <= 40) {
                cbbiValueEl.classList.add('fear');
            } else if (displayValue <= 60) {
                cbbiValueEl.classList.add('neutral');
            } else if (displayValue <= 80) {
                cbbiValueEl.classList.add('greed');
            } else if (displayValue <= 90) {
                cbbiValueEl.classList.add('greed');
            } else {
                cbbiValueEl.classList.add('extreme-greed');
            }
            
            // Convert timestamp to date
            const date = new Date(parseInt(latestTimestamp) * 1000);
cbbiDateEl.textContent = `Last updated: ${date.toLocaleDateString()}`;
        } else {
            cbbiValueEl.textContent = '--';
            cbbiValueEl.className = 'cbbi-value';
            cbbiDateEl.textContent = '--';
        }
    }

    function formatCurrency(value, currency) {
        const symbol = currency === 'USD' ? '$' : '€';
        const formattedValue = value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return `${symbol}${formattedValue}`;
    }

    function formatBitcoinPrice(value, currency) {
        const symbol = currency === 'USD' ? '$' : '€';
        const formattedValue = Math.round(value).toLocaleString();
        return `${symbol}${formattedValue}`;
    }

    function setupAutoRefresh() {
        if (refreshTimer) {
            clearInterval(refreshTimer);
        }
        refreshTimer = setInterval(() => {
            fetchStockData();
            fetchCbbiData(); // Also refresh CBBI data
        }, REFRESH_INTERVAL);
    }

    function finishLoading() {
        loadingEl.style.display = 'none';
        portfolioTable.style.display = 'table';
        lastUpdatedEl.textContent = new Date().toLocaleString();
        recalculateTotals();
        updateAverageBuyPriceDisplay();
    }

    async function fetchStockData() {
        loadingEl.style.display = 'flex';
        portfolioTable.style.display = 'none';
        portfolioDataEl.innerHTML = '';

        await fetchExchangeRate();

        let completedRequests = 0;
        const totalRequests = Object.keys(portfolio).length;
        portfolioData = {};

        const promises = Object.keys(portfolio).map(symbol => {
            const shares = portfolio[symbol];
            const initialInvestment = initialInvestments[symbol];
            const initialEuroInvestment = initialEuroInvestments[symbol];
            let url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`;

            return fetch(url)
                .then(response => {
                    if (!response.ok) { throw new Error(`HTTP error! Status: ${response.status}`); }
                    return response.json();
                })
                .then(data => {
                    const price = data.c;
                    const percentChange = data.dp;
                    const value = price * shares;
                    const valueEur = value / usdToEurRate;
                    const pnl = value - initialInvestment;
                    const pnlEur = valueEur - initialEuroInvestment;

                    portfolioData[symbol] = {
                        shares, price, value, pnl, valueEur, pnlEur,
                        percentChange, initialInvestment, initialEuroInvestment
                    };
                })
                .catch(error => {
                    portfolioData[symbol] = { error: true };
                    const row = document.createElement('tr');
                    const displaySymbol = symbol.includes('BINANCE:') ? 'BTC' : symbol;
                    row.innerHTML = `
                        <td class="symbol">${displaySymbol}</td>
                        <td>${shares?.toFixed(4) || 'N/A'}</td>
                        <td colspan="5">Error loading data</td>
                    `;
                    portfolioDataEl.appendChild(row); // Append error row immediately
                })
                .finally(() => {
                    completedRequests++;
                    if (completedRequests === totalRequests) {
                        finishLoading();
                    }
                });
        });

        await Promise.allSettled(promises);
        setupAutoRefresh();
        fetchCbbiData(); // Fetch CBBI data after stock data
    }

    function createTableRow(symbol) {
        const data = portfolioData[symbol];
        const displaySymbol = symbol.includes('BINANCE:') ? 'BTC' : symbol;
        const row = document.createElement('tr');
        row.dataset.symbol = symbol;

        if (!data || data.error) {
             const existingErrorRow = portfolioDataEl.querySelector(`tr[data-symbol="${symbol}"] td[colspan="5"]`);
              if (existingErrorRow) return null; // Don't recreate if error row exists
              row.innerHTML = `
                <td class="symbol">${displaySymbol}</td>
                <td>${portfolio[symbol]?.toFixed(4) || 'N/A'}</td>
                <td colspan="5">Error loading data</td>
                `;
               return row;
        }

        const primaryCurrency = displayCurrency;
        const pricePrimary = primaryCurrency === 'USD' ? data.price : data.price / usdToEurRate;
        const valuePrimary = primaryCurrency === 'USD' ? data.value : data.valueEur;
        const pnlPrimary = primaryCurrency === 'USD' ? data.pnl : data.pnlEur;
        const initialInvestmentPrimary = primaryCurrency === 'USD' ? data.initialInvestment : data.initialEuroInvestment;
        const pnlPercentage = initialInvestmentPrimary !== 0 ? (pnlPrimary / initialInvestmentPrimary) * 100 : 0;
        const percentChange = data.percentChange;

        if (excludedAssets.has(symbol)) {
            row.classList.add('excluded');
        }

        row.innerHTML = `
            <td class="symbol">
                <div class="symbol-container">
                    <span class="toggle-asset" title="Click to ${excludedAssets.has(symbol) ? 'include' : 'exclude'} this asset">${excludedAssets.has(symbol) ? '⊕' : '⊖'}</span>${displaySymbol}
                </div>
            </td>
            <td>${data.shares.toFixed(4)}</td>
            <td>${formatCurrency(pricePrimary, primaryCurrency)}</td>
            <td>${formatCurrency(valuePrimary, primaryCurrency)}</td>
            <td class="${pnlPrimary >= 0 ? 'positive' : 'negative'}">${formatCurrency(pnlPrimary, primaryCurrency)}</td>
            <td>
                <span class="badge ${pnlPercentage >= 0 ? 'positive' : 'negative'}">
                    ${pnlPercentage >= 0 ? '+' : ''}${pnlPercentage.toFixed(2)}%
                </span>
            </td>
            <td>
                <span class="badge ${percentChange >= 0 ? 'positive' : 'negative'}">
                    ${percentChange >= 0 ? '+' : ''}${percentChange.toFixed(2)}%
                </span>
            </td>
        `;

        const toggleBtn = row.querySelector('.toggle-asset');
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleAsset(symbol);
        });

        row.addEventListener('click', () => {
            toggleAsset(symbol);
        });

        return row;
    }

    function toggleAsset(symbol) {
        if (excludedAssets.has(symbol)) {
            excludedAssets.delete(symbol);
        } else {
            excludedAssets.add(symbol);
        }

        const row = portfolioDataEl.querySelector(`tr[data-symbol="${symbol}"]`);
        if (row) {
             row.classList.toggle('excluded');
             const toggleBtn = row.querySelector('.toggle-asset');
             if (toggleBtn) { // Check if button exists (might not on error rows)
                 if (excludedAssets.has(symbol)) {
                     toggleBtn.textContent = '⊕';
                     toggleBtn.title = 'Click to include this asset';
                 } else {
                     toggleBtn.textContent = '⊖';
                     toggleBtn.title = 'Click to exclude this asset';
                 }
             }
        }

        recalculateTotals();
    }

    function toggleCurrency() {
        displayCurrency = (displayCurrency === 'USD') ? 'EUR' : 'USD';
        recalculateTotals();
        updateYtdDisplay();
        updateAssetReturns();
        updateAverageBuyPriceDisplay();
        
        // Update historical PnL display when currency changes
        if (pnlHistoryData) {
            updateHistoricalPnlDisplay();
        }
        
        // Update asset returns display when currency changes
        updateAssetReturnsDisplay();
    }

    function togglePieChartView() {
        pieChartViewMode = (pieChartViewMode === 'market') ? 'invested' : 'market';
        
        // Update the description text
        const descriptionEl = document.getElementById('pie-chart-description');
        
        if (pieChartViewMode === 'market') {
            descriptionEl.textContent = 'Based on current market value';
        } else {
            descriptionEl.textContent = 'Based on invested value';
        }
        
        // Recreate the pie chart with new data
        createPieChart();
    }

    function sortTable(columnIndex) {
        const rowsArray = Array.from(portfolioDataEl.querySelectorAll('tr'));
        const header = portfolioTable.querySelector(`th:nth-child(${columnIndex + 1})`);
        if (!header) return; // Header might not exist if table failed to load fully

        let isAscending = header.classList.contains('sort-asc');
        let isDescending = header.classList.contains('sort-desc');
        let directionMultiplier = 1;

        if (isDescending) {
            directionMultiplier = 1;
            header.classList.remove('sort-desc');
            header.classList.add('sort-asc');
        } else if (isAscending) {
            directionMultiplier = -1;
            header.classList.remove('sort-asc');
            header.classList.add('sort-desc');
        } else {
            directionMultiplier = (columnIndex === 0) ? 1 : -1; // Default: Symbol asc, others desc
            header.classList.add(directionMultiplier === 1 ? 'sort-asc' : 'sort-desc');
        }

        portfolioTable.querySelectorAll('th').forEach((th, index) => {
            if (index !== columnIndex) {
                th.classList.remove('sort-asc', 'sort-desc');
            }
        });

        rowsArray.sort((a, b) => {
            const symbolA = a.dataset.symbol;
            const symbolB = b.dataset.symbol;

             const dataA = portfolioData[symbolA];
             const dataB = portfolioData[symbolB];
             const aIsError = !dataA || dataA.error;
             const bIsError = !dataB || dataB.error;

             if (aIsError && bIsError) return 0; // Keep relative order of error rows
             if (aIsError) return 1; // Error rows go to bottom
             if (bIsError) return -1; // Error rows go to bottom

            let valA, valB;

            switch (columnIndex) {
                case 0: // Symbol
                    valA = a.cells[columnIndex].textContent.trim().replace(/[⊖⊕]/g, '').trim();
                    valB = b.cells[columnIndex].textContent.trim().replace(/[⊖⊕]/g, '').trim();
                    return valA.localeCompare(valB) * directionMultiplier;
                case 1: valA = dataA.shares; valB = dataB.shares; break;
                case 2:
                    valA = displayCurrency === 'USD' ? dataA.price : dataA.price / usdToEurRate;
                    valB = displayCurrency === 'USD' ? dataB.price : dataB.price / usdToEurRate;
                    break;
                case 3:
                    valA = displayCurrency === 'USD' ? dataA.value : dataA.valueEur;
                    valB = displayCurrency === 'USD' ? dataB.value : dataB.valueEur;
                    break;
                case 4:
                    valA = displayCurrency === 'USD' ? dataA.pnl : dataA.pnlEur;
                    valB = displayCurrency === 'USD' ? dataB.pnl : dataB.pnlEur;
                    break;
                case 5:
                    const initialA = displayCurrency === 'USD' ? dataA.initialInvestment : dataA.initialEuroInvestment;
                    const pnlA = displayCurrency === 'USD' ? dataA.pnl : dataA.pnlEur;
                    valA = initialA !== 0 ? (pnlA / initialA) * 100 : 0;
                    const initialB = displayCurrency === 'USD' ? dataB.initialInvestment : dataB.initialEuroInvestment;
                    const pnlB = displayCurrency === 'USD' ? dataB.pnl : dataB.pnlEur;
                    valB = initialB !== 0 ? (pnlB / initialB) * 100 : 0;
                    break;
                case 6: valA = dataA.percentChange; valB = dataB.percentChange; break;
                default: return 0;
            }

            if (valA < valB) return -1 * directionMultiplier;
            if (valA > valB) return 1 * directionMultiplier;
            return 0;
        });

        portfolioDataEl.innerHTML = '';
        rowsArray.forEach(row => portfolioDataEl.appendChild(row));
    }

    function createPieChart() {
        const labels = [];
        const data = [];
        const backgroundColors = [];
        const assetTooltips = {};
        let totalValue = 0;

        // Calculate total value in the current display currency and view mode
        Object.keys(portfolio).forEach(symbol => {
            const assetData = portfolioData[symbol];
            if (!excludedAssets.has(symbol) && assetData && !assetData.error) {
                let value;
                if (pieChartViewMode === 'market') {
                    value = displayCurrency === 'USD' ? (assetData.value || 0) : (assetData.valueEur || 0);
                } else {
                    value = displayCurrency === 'USD' ? (assetData.initialInvestment || 0) : (assetData.initialEuroInvestment || 0);
                }
                totalValue += value;
            }
        });

        Object.keys(portfolio).forEach(symbol => {
             const assetData = portfolioData[symbol];
            if (!excludedAssets.has(symbol) && assetData && !assetData.error) {
                const displaySymbol = symbol.includes('BINANCE:') ? 'BTC' : symbol;
                let value;
                if (pieChartViewMode === 'market') {
                    value = displayCurrency === 'USD' ? (assetData.value || 0) : (assetData.valueEur || 0);
                } else {
                    value = displayCurrency === 'USD' ? (assetData.initialInvestment || 0) : (assetData.initialEuroInvestment || 0);
                }
                const percentage = totalValue > 0 ? (value / totalValue * 100) : 0;

                labels.push(displaySymbol);
                data.push(value);
                backgroundColors.push(assetColors[symbol]);
                assetTooltips[displaySymbol] = {
                    value: value,
                    percentage: percentage,
                    class: assetClassLabels[symbol]
                };
            }
        });

        const currentCtx = currentPieChartEl.getContext('2d');
        if (currentPieChart) {
            currentPieChart.data.labels = labels;
            currentPieChart.data.datasets[0].data = data;
            currentPieChart.data.datasets[0].backgroundColor = backgroundColors;
            // Update the tooltip callback to reflect the current view mode
            currentPieChart.options.plugins.tooltip.callbacks.label = function(context) {
                const label = context.label;
                const value = context.raw;
                const percentage = assetTooltips[label].percentage;
                const assetClass = assetTooltips[label].class;
                const currencySymbol = displayCurrency === 'USD' ? '$' : '€';
                const valueLabel = pieChartViewMode === 'market' ? 'Value' : 'Invested';
                return [ `${label} (${assetClass})`, `${valueLabel}: ${currencySymbol}${value.toFixed(2)}`, `Percentage: ${percentage.toFixed(2)}%` ];
            };
            currentPieChart.update();
        } else {
            currentPieChart = new Chart(currentCtx, {
                type: 'pie',
                data: { labels, datasets: [{ data, backgroundColor: backgroundColors, borderWidth: 1 }] },
                options: {
                    responsive: true,
                    plugins: {
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const label = context.label;
                                    const value = context.raw;
                                    const percentage = assetTooltips[label].percentage;
                                    const assetClass = assetTooltips[label].class;
                                    const currencySymbol = displayCurrency === 'USD' ? '$' : '€';
                                    const valueLabel = pieChartViewMode === 'market' ? 'Value' : 'Invested';
                                    return [ `${label} (${assetClass})`, `${valueLabel}: ${currencySymbol}${value.toFixed(2)}`, `Percentage: ${percentage.toFixed(2)}%` ];
                                }
                            }
                        },
                        legend: { display: false }
                    }
                }
            });
        }

        chartLegendEl.innerHTML = '';
        const classGroups = {};
        Object.keys(assetClassLabels).forEach(symbol => {
             const assetData = portfolioData[symbol];
            if (!excludedAssets.has(symbol) && assetData && !assetData.error) {
                const className = assetClassLabels[symbol];
                if (!classGroups[className]) {
                    classGroups[className] = { color: assetColors[symbol], assets: [] };
                }
                const displaySymbol = symbol.includes('BINANCE:') ? 'BTC' : symbol;
                classGroups[className].assets.push(displaySymbol);
            }
        });

        Object.keys(classGroups).forEach(className => {
            const group = classGroups[className];
            const legendItem = document.createElement('div');
            legendItem.className = 'legend-item';
            const assetsList = group.assets.map(asset => {
                const percentage = assetTooltips[asset]?.percentage.toFixed(2) || '0.00';
                return `${asset} (${percentage}%)`;
            }).join(', ');
            legendItem.innerHTML = `<div class="legend-color" style="background-color: ${group.color};"></div><span>${className}</span>`;
            chartLegendEl.appendChild(legendItem);
        });
    }

    async function loadHistoryChart() {
        try {
            if (window.historyChart instanceof Chart) {
                window.historyChart.destroy();
            }

            const historyChartEl = document.getElementById('history-chart');
            const ctx = historyChartEl.getContext('2d');
            const response = await fetch('portfolio_history.json');
            const data = await response.json();
            const historicalEntries = data.history;

            if (!historicalEntries || !Array.isArray(historicalEntries) || historicalEntries.length === 0) {
                document.getElementById('history-section').style.display = 'none';
                return;
            }

            // --- Calculate historical values based on current state ---
            const valueKey = displayCurrency === 'USD' ? 'value_usd' : 'value_eur';
            const calculatedHistory = historicalEntries.map(entry => {
                let dailyTotal = 0;
                if (entry && typeof entry.assets === 'object' && entry.assets !== null) {
                    Object.keys(entry.assets).forEach(symbol => {
                        if (!excludedAssets.has(symbol) && entry.assets[symbol] && typeof entry.assets[symbol] === 'object') {
                            const value = entry.assets[symbol][valueKey];
                            if (typeof value === 'number' && !isNaN(value)) {
                                dailyTotal += value;
                            }
                        }
                    });
                } else {
                }
                return { date: entry.date, value: isNaN(dailyTotal) ? 0 : dailyTotal };
            }).filter(item => item !== null);


            // --- Calculate current value based on live data ---
            let currentTotalValue = 0;
            Object.keys(portfolioData).forEach(symbol => {
                const assetData = portfolioData[symbol];
                if (assetData && !assetData.error && !excludedAssets.has(symbol) && typeof assetData === 'object') {
                    const liveValue = displayCurrency === 'USD' ? assetData.value : assetData.valueEur;
                    if (typeof liveValue === 'number' && !isNaN(liveValue)) {
                        currentTotalValue += liveValue;
                    }
                }
            });
            currentTotalValue = isNaN(currentTotalValue) ? 0 : currentTotalValue;


            const today = new Date();

            if (calculatedHistory && calculatedHistory.length > 0) {
                calculatedHistory.push({ date: today.toISOString().split('T')[0], value: currentTotalValue });
            } else {
                document.getElementById('history-section').style.display = 'none';
                return;
            }


            let displayHistory = [...calculatedHistory]; // Start with the full history
            if (selectedTimeframe !== 'all') {
                const daysToShow = parseInt(selectedTimeframe, 10);
                if (!isNaN(daysToShow) && daysToShow > 0 && daysToShow <= calculatedHistory.length) {
                    displayHistory = calculatedHistory.slice(-daysToShow);
                } else {
                }
            }

            // Ensure calculatedHistory is valid before proceeding
            if (!displayHistory || displayHistory.length === 0) { // Check the potentially filtered array
                document.getElementById('history-section').style.display = 'none';
                return;
            }

            const dates = displayHistory.map(item => new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
            const values = displayHistory.map(item => item.value);


            const numberOfDays = values.length; // Get the total number of data points

            let firstValue = 0, lastValue = 0, changePercentage = 0;
            if (values && values.length > 0) {
                const validValues = values.filter(v => typeof v === 'number' && !isNaN(v));
                if (validValues.length > 1) {
                    firstValue = validValues[0];
                    lastValue = validValues[validValues.length - 1];
                    if (firstValue !== 0) {
                        changePercentage = ((lastValue - firstValue) / firstValue) * 100;
                    } else if (lastValue > 0) {
                        changePercentage = Infinity;
                    }
                } else if (validValues.length === 1) {
                    lastValue = validValues[0];
                }
            }
            if (!isFinite(changePercentage)) {
                changePercentage = 0;
            }

            const changeDirection = changePercentage >= 0 ? '+' : '-';
            const changeColor = changePercentage >= 0 ? '#10b981' : '#ef4444';

            const tooltipStyle = { /* Minimal style object */ };
            const gradient = ctx.createLinearGradient(0, 0, 0, 300);
            gradient.addColorStop(0, 'rgb(34, 153, 247, 0.4)');
            gradient.addColorStop(1, 'rgb(34, 153, 247, 0.05)');

            window.historyChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: dates,
                    datasets: [{
                        label: 'Portfolio Value', data: values, borderColor: '#2299f7', borderWidth: 3,
                        backgroundColor: gradient, fill: true, tension: 0.25, pointRadius: 4, pointHoverRadius: 7,
                        pointBackgroundColor: (c) => c.dataIndex === c.dataset.data.length - 1 ? '#ec4899' : '#2299f7',
                        pointBorderColor: (c) => c.dataIndex === c.dataset.data.length - 1 ? '#ec4899' : '#2299f7',
                        pointBorderWidth: 2, pointHitRadius: 8,
                        pointRadius: (c) => c.dataIndex === c.dataset.data.length - 1 ? 6 : 4,
                        pointHoverBorderWidth: 3
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    layout: { padding: { top: 20, right: 20, bottom: 20, left: 20 } },
                    plugins: {
                        title: {
                            display: true,
                            text: `History`, // Title is now set dynamically after chart creation/update
                            color: changeColor,
                            font: { size: 15, weight: 'bold', family: "'Inter', sans-serif" },
                            padding: { top: 10, bottom: 25 }
                        },
                        legend: { display: false },
                        tooltip: {
                            enabled: true, backgroundColor: 'rgba(30, 41, 59, 0.85)', titleColor: '#f8fafc', bodyColor: '#f1f5f9', borderColor: 'rgba(203, 213, 225, 0.3)', borderWidth: 1, padding: 12, cornerRadius: 8, titleFont: {family: "'Inter', sans-serif", size: 14, weight: 'bold'}, bodyFont: {family: "'Inter', sans-serif", size: 13}, boxPadding: 6,
                            callbacks: {
                                label: (c) => {
                                    const currencySymbol = displayCurrency === 'USD' ? '$' : '€';
                                    const prefix = c.dataIndex === c.dataset.data.length - 1 ? 'Current: ' : '';
                                    const value = (typeof c.raw === 'number' && !isNaN(c.raw)) ? c.raw.toFixed(2).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ",") : 'N/A';
                                    return prefix + currencySymbol + value;
                                },
                                title: (c) => {
                                    const label = c && c.length > 0 && c[0].label ? c[0].label : 'Date N/A';
                                    const isLastPoint = c && c.length > 0 && c[0].dataIndex === c[0].dataset.data.length - 1;
                                    return label + (isLastPoint ? ' (Today)' : '');
                                }
                            }
                        }
                    },
                    scales: {
                        y: { grid: { color: 'rgba(203, 213, 225, 0.5)', borderDash: [5, 5], drawBorder: false }, ticks: { font: { family: "'Inter', sans-serif", size: 12 }, padding: 10, callback: (v) => (displayCurrency === 'USD' ? '$' : '€') + v.toLocaleString() } },
                        x: { grid: { display: false, drawBorder: false }, ticks: { font: { family: "'Inter', sans-serif", size: 12 }, padding: 10, maxRotation: 45, minRotation: 45, autoSkip: true, maxTicksLimit: 7 } }
                    },
                    interaction: { mode: 'index', intersect: false },
                    elements: { line: { borderJoinStyle: 'round' } }
                }
            });

            // --- Update Title Text based on Selection --- //
            let titleText = "History"; // Default base
            const selectedOptionIndex = timeframeSelectEl.selectedIndex;
            if (selectedOptionIndex >= 0) { // Check if an option is selected
                const selectedOptionText = timeframeSelectEl.options[selectedOptionIndex].text;
                // Use the selected option's text, but handle the default case
                if (selectedTimeframe === 'all') {
                    titleText = `History`; // Show actual days for 'all'
                } else {
                    titleText = selectedOptionText; // Use text like "Last week", "Last month"
                }
            } else {
                 // Fallback if no option is somehow selected
                 titleText = `Last ${numberOfDays > 0 ? numberOfDays -1 : 0} days`;
            }

            // Add currency and PnL % to the title
            const finalTitle = `${titleText} (${changeDirection}${Math.abs(changePercentage).toFixed(2)}%)`;

             // Update the chart title using the existing instance
            if (window.historyChart && window.historyChart.options.plugins.title) {
                window.historyChart.options.plugins.title.text = finalTitle;
                 window.historyChart.options.plugins.title.color = changeColor; // Also update color
                window.historyChart.update(); // Update the chart to show the new title
            } else {
                  console.error("Could not update chart title, chart instance or title plugin not found.");
            }
            // --- End Title Update --- //

            document.getElementById('history-section').style.display = 'block';
        } catch (error) {
            document.getElementById('history-section').style.display = 'none';
        }
    }

    function recalculateTotals() {
        let totalValuePrimary = 0;
        let totalValueSecondary = 0;
        let totalPnlPrimary = 0;
        let totalInitialInvestmentPrimary = 0;
        let totalInitialInvestmentSecondary = 0;

        const primaryCurrency = displayCurrency;
        const secondaryCurrency = (primaryCurrency === 'USD') ? 'EUR' : 'USD';

        Object.keys(portfolioData).forEach(symbol => {
            const data = portfolioData[symbol];
            if (data && !data.error && !excludedAssets.has(symbol)) {
                if (primaryCurrency === 'USD') {
                    totalValuePrimary += data.value;
                    totalValueSecondary += data.valueEur;
                    totalPnlPrimary += data.pnl;
                    totalInitialInvestmentPrimary += data.initialInvestment;
                    totalInitialInvestmentSecondary += data.initialEuroInvestment;
                } else {
                    totalValuePrimary += data.valueEur;
                    totalValueSecondary += data.value;
                    totalPnlPrimary += data.pnlEur;
                    totalInitialInvestmentPrimary += data.initialEuroInvestment;
                    totalInitialInvestmentSecondary += data.initialInvestment;
                }
            }
        });

        portfolioDataEl.innerHTML = '';
        let currentSortColumn = -1;
        let currentSortHeader = null;
         portfolioTable.querySelectorAll('th').forEach((th, index) => {
             if (th.classList.contains('sort-asc') || th.classList.contains('sort-desc')) {
                 currentSortColumn = index;
                 currentSortHeader = th; // Store the header element
             }
         });


        Object.keys(portfolioData).forEach(symbol => {
             const row = createTableRow(symbol);
             if(row) { // Only append if row is not null (i.e., not an existing error row)
                 portfolioDataEl.appendChild(row);
             }
         });

        totalValueEl.textContent = formatCurrency(totalValuePrimary, primaryCurrency);
        totalPnlEl.textContent = formatCurrency(totalPnlPrimary, primaryCurrency);
        totalPnlEl.className = totalPnlPrimary >= 0 ? 'positive' : 'negative';

        const totalPnLPercentagePrimary = totalInitialInvestmentPrimary > 0 ? (totalPnlPrimary / totalInitialInvestmentPrimary) * 100 : 0;
        totalPnlPerc.textContent = `${totalPnLPercentagePrimary >= 0 ? '+' : ''}${totalPnLPercentagePrimary.toFixed(2)}%`;
        totalPnlPerc.className = `badge ${totalPnLPercentagePrimary >= 0 ? 'positive' : 'negative'}`;

        const secondaryRow = document.querySelector('.euro-row');
        const secondaryTotalEl = document.getElementById('total-euros');
        const secondaryPnlEl = document.getElementById('euro-pnl');
        const secondaryPnlPercEl = document.getElementById('total-%-pnl-euros');
        const hasExcludedAssets = excludedAssets.size > 0;

        if (secondaryRow) { // Check if the secondary row exists
             secondaryRow.style.display = hasExcludedAssets ? 'none' : 'table-row';
             if (!hasExcludedAssets) {
                 secondaryTotalEl.textContent = formatCurrency(totalValueSecondary, secondaryCurrency);
                 let pnlSecondary, initialSecondaryForPnlPerc, pnlPercentageSecondary;
                 if (secondaryCurrency === 'EUR') {
                     pnlSecondary = totalValueSecondary - originalEuroInvestment;
                     initialSecondaryForPnlPerc = originalEuroInvestment;
                 } else {
                     pnlSecondary = totalValueSecondary - totalInitialInvestmentSecondary;
                     initialSecondaryForPnlPerc = totalInitialInvestmentSecondary;
                 }
                 secondaryPnlEl.textContent = formatCurrency(pnlSecondary, secondaryCurrency);
                 secondaryPnlEl.className = pnlSecondary >= 0 ? 'positive' : 'negative';
                 pnlPercentageSecondary = initialSecondaryForPnlPerc > 0 ? (pnlSecondary / initialSecondaryForPnlPerc) * 100 : 0;
                 secondaryPnlPercEl.textContent = `${pnlPercentageSecondary >= 0 ? '+' : ''}${pnlPercentageSecondary.toFixed(2)}%`;
                 secondaryPnlPercEl.className = `badge ${pnlPercentageSecondary >= 0 ? 'positive' : 'negative'}`;
             }
        }


        mainTotalValueEl.textContent = formatCurrency(totalValuePrimary, primaryCurrency);
        mainEuroValueEl.style.display = hasExcludedAssets ? 'none' : 'inline';
        mainEuroValueEl.textContent = `(${formatCurrency(totalValueSecondary, secondaryCurrency)})`;
        mainTotalPnlEl.textContent = formatCurrency(totalPnlPrimary, primaryCurrency);
        mainTotalPnlEl.className = totalPnlPrimary >= 0 ? 'positive' : 'negative';
        mainPnlBadgeEl.textContent = `${totalPnLPercentagePrimary >= 0 ? '+' : ''}${totalPnLPercentagePrimary.toFixed(2)}%`;
        mainPnlBadgeEl.className = `badge ${totalPnLPercentagePrimary >= 0 ? 'positive' : 'negative'}`;
        currencySwitchBtn.textContent = `${secondaryCurrency}`;

        createPieChart();
        loadHistoryChart();
        updateYtdDisplay(); // Update YTD display when currency changes

         if (currentSortColumn !== -1 && currentSortHeader) {
             const sortClass = currentSortHeader.classList.contains('sort-asc') ? 'sort-asc' : 'sort-desc';
             currentSortHeader.classList.remove(sortClass);
             sortTable(currentSortColumn);
         } else {
            sortTable(3); // Default sort by value if no sort was active
         }
    }

    tableHeaders.forEach((header, index) => {
        header.addEventListener('click', () => sortTable(index));
    });
    currencySwitchBtn.addEventListener('click', toggleCurrency);

    // --- Event Listener for Pie Chart Toggle --- //
    const pieChartToggleBtn = document.getElementById('pie-chart-toggle-btn');
    pieChartToggleBtn.addEventListener('click', togglePieChartView);

    // --- Event Listener for Timeframe Change --- //
    timeframeSelectEl.addEventListener('change', (event) => {
        selectedTimeframe = event.target.value;
        loadHistoryChart(); // Reload the history chart with the new timeframe
    });

    // Historical PnL functionality
    let pnlHistoryData = null;
    let selectedYear = new Date().getFullYear();
    let customDateRange = null;

    function showCustomDatePicker() {
        // Remove existing date picker if it exists
        const existingPicker = document.getElementById('custom-date-picker-modal');
        if (existingPicker) {
            existingPicker.remove();
        }

        // Create modal overlay
        const modal = document.createElement('div');
        modal.id = 'custom-date-picker-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
        `;

        // Create date picker content
        const content = document.createElement('div');
        content.style.cssText = `
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            min-width: 300px;
        `;

        const today = new Date().toISOString().split('T')[0];
        const dataStartDate = '2025-07-23'; // July 23, 2025
        
        content.innerHTML = `
            <h3 style="margin: 0 0 15px 0; color: #333;">Select Date Range</h3>
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: 500;">Start Date:</label>
                <input type="date" id="start-date" value="${dataStartDate}" min="${dataStartDate}" max="${today}" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
            </div>
            <div style="margin-bottom: 20px;">
                <label style="display: block; margin-bottom: 5px; font-weight: 500;">End Date:</label>
                <input type="date" id="end-date" value="${today}" min="${dataStartDate}" max="${today}" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
            </div>
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button id="cancel-date-picker" style="padding: 8px 16px; border: 1px solid #ccc; background: #f8f9fa; border-radius: 4px; cursor: pointer;">Cancel</button>
                <button id="apply-date-picker" style="padding: 8px 16px; border: none; background: #007bff; color: white; border-radius: 4px; cursor: pointer;">Apply</button>
            </div>
        `;

        modal.appendChild(content);
        document.body.appendChild(modal);

        // Add event listeners
        document.getElementById('cancel-date-picker').addEventListener('click', () => {
            modal.remove();
        });

        document.getElementById('apply-date-picker').addEventListener('click', () => {
            const startDate = document.getElementById('start-date').value;
            const endDate = document.getElementById('end-date').value;
            
            if (startDate && endDate) {
                // Validate dates
                const startDateObj = new Date(startDate);
                const endDateObj = new Date(endDate);
                const todayObj = new Date();
                const dataStartDateObj = new Date(dataStartDate);
                
                // Reset time to midnight for accurate comparison
                todayObj.setHours(0, 0, 0, 0);
                startDateObj.setHours(0, 0, 0, 0);
                endDateObj.setHours(0, 0, 0, 0);
                dataStartDateObj.setHours(0, 0, 0, 0);
                
                // Check if dates are valid
                if (startDateObj < dataStartDateObj || startDateObj > todayObj) {
                    alert('Start date must be between July 23, 2025 and today.');
                    return;
                }
                
                if (endDateObj < dataStartDateObj || endDateObj > todayObj) {
                    alert('End date must be between July 23, 2025 and today.');
                    return;
                }
                
                if (startDateObj > endDateObj) {
                    alert('Start date must be before or equal to end date.');
                    return;
                }
                
                customDateRange = {
                    start: startDateObj,
                    end: endDateObj
                };
                updateHistoricalPnlDisplay();
                modal.remove();
            }
        });

        // Add input event listeners to enforce constraints
        const startDateInput = document.getElementById('start-date');
        const endDateInput = document.getElementById('end-date');
        
        startDateInput.addEventListener('change', () => {
            const startDate = startDateInput.value;
            const endDate = endDateInput.value;
            
            if (startDate && endDate && startDate > endDate) {
                endDateInput.value = startDate;
            }
        });
        
        endDateInput.addEventListener('change', () => {
            const startDate = startDateInput.value;
            const endDate = endDateInput.value;
            
            if (startDate && endDate && endDate < startDate) {
                startDateInput.value = endDate;
            }
        });

        // Close modal when clicking outside
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    // Historical PnL elements
    let yearPrevBtn, yearNextBtn, yearDisplayEl, calendarBtn, historicalPeriodTextEl, 
        historicalTotalReturnEl, historicalExclSgovReturnEl, historicalPnlAssetsEl;

    function initializeHistoricalPnlElements() {
        yearPrevBtn = document.getElementById('year-prev');
        yearNextBtn = document.getElementById('year-next');
        yearDisplayEl = document.getElementById('year-display');
        calendarBtn = document.getElementById('calendar-btn');
        historicalPeriodTextEl = document.getElementById('historical-period-text');
        historicalTotalReturnEl = document.getElementById('historical-total-return');
        historicalExclSgovReturnEl = document.getElementById('historical-excl-sgov-return');
        historicalPnlAssetsEl = document.getElementById('historical-pnl-assets');

        // Add event listeners if elements exist
        if (yearPrevBtn) {
            yearPrevBtn.addEventListener('click', () => {
                if (selectedYear > 2025) {
                    selectedYear--;
                    updateYearSelector();
                }
            });
        }

        if (yearNextBtn) {
            yearNextBtn.addEventListener('click', () => {
                const currentYear = new Date().getFullYear();
                if (selectedYear < currentYear) {
                    selectedYear++;
                    updateYearSelector();
                }
            });
        }

        if (calendarBtn) {
            calendarBtn.addEventListener('click', () => {
                showCustomDatePicker();
            });
        }
    }

    async function loadPnlHistory() {
        try {
            const response = await fetch('pnl_history.json');
            if (!response.ok) {
                console.log('PnL history file not found or empty');
                return;
            }
            pnlHistoryData = await response.json();
            updateHistoricalPnlDisplay();
        } catch (error) {
            console.log('Error loading PnL history:', error);
        }
    }

    function updateHistoricalPnlDisplay() {
        // Check if elements exist
        if (!historicalTotalReturnEl || !historicalExclSgovReturnEl || !historicalPeriodTextEl || !historicalPnlAssetsEl) {
            initializeHistoricalPnlElements();
            return;
        }

        if (!pnlHistoryData || !pnlHistoryData.history || pnlHistoryData.history.length === 0) {
            historicalTotalReturnEl.textContent = 'No data';
            historicalExclSgovReturnEl.textContent = 'No data';
            historicalPeriodTextEl.textContent = 'No data available';
            historicalPnlAssetsEl.innerHTML = '';
            return;
        }

        // Get date range based on selected year or custom range
        const dateRange = customDateRange || getDateRangeForYear(selectedYear);
        if (!dateRange) {
            historicalTotalReturnEl.textContent = 'Invalid date range';
            historicalExclSgovReturnEl.textContent = 'Invalid date range';
            historicalPeriodTextEl.textContent = 'Invalid date range';
            return;
        }

        // Filter data for the selected timeframe
        const filteredData = pnlHistoryData.history.filter(entry => {
            const entryDate = new Date(entry.date + 'T00:00:00');
            const startDate = new Date(dateRange.start);
            const endDate = new Date(dateRange.end);
            
            // Normalize dates to midnight for comparison
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(0, 0, 0, 0);
            entryDate.setHours(0, 0, 0, 0);
            
            return entryDate >= startDate && entryDate <= endDate;
        });

        if (filteredData.length < 2) {
            historicalTotalReturnEl.textContent = 'Insufficient data';
            historicalExclSgovReturnEl.textContent = 'Insufficient data';
            historicalPeriodTextEl.textContent = 'Insufficient data for selected period';
            historicalPnlAssetsEl.innerHTML = '';
            return;
        }

        // Sort filtered data by date to ensure chronological order (oldest first)
        filteredData.sort((a, b) => new Date(a.date) - new Date(b.date));

        // Calculate returns
        const firstEntry = filteredData[0]; // Oldest entry (start date)
        const lastEntry = filteredData[filteredData.length - 1]; // Newest entry (end date)
        

        const totalUsdReturn = calculateReturn(firstEntry.percentages.total.usd, lastEntry.percentages.total.usd);
        const totalEurReturn = calculateReturn(firstEntry.percentages.total.eur, lastEntry.percentages.total.eur);
        const exclSgovUsdReturn = calculateReturn(firstEntry.percentages.excl_sgov.usd, lastEntry.percentages.excl_sgov.usd);
        const exclSgovEurReturn = calculateReturn(firstEntry.percentages.excl_sgov.eur, lastEntry.percentages.excl_sgov.eur);

        // Update display based on current currency
        const isEur = displayCurrency === 'EUR';
        const totalReturn = isEur ? totalEurReturn : totalUsdReturn;
        const exclSgovReturn = isEur ? exclSgovEurReturn : exclSgovUsdReturn;

        historicalTotalReturnEl.textContent = `${totalReturn >= 0 ? '+' : ''}${totalReturn.toFixed(2)}%`;
        historicalTotalReturnEl.className = `ytd-value ${totalReturn >= 0 ? 'positive' : 'negative'}`;
        
        historicalExclSgovReturnEl.textContent = `${exclSgovReturn >= 0 ? '+' : ''}${exclSgovReturn.toFixed(2)}%`;
        historicalExclSgovReturnEl.className = `ytd-value ${exclSgovReturn >= 0 ? 'positive' : 'negative'}`;

        // Update period text
        const startDate = new Date(dateRange.start).toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric' 
        });
        const endDate = new Date(dateRange.end).toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric' 
        });
        historicalPeriodTextEl.textContent = `${startDate} - ${endDate}`;

        // Update individual assets
        updateHistoricalPnlAssets(filteredData, isEur);
    }

    function getDateRangeForYear(year) {
        const now = new Date();
        const currentYear = now.getFullYear();
        const dataStartDate = new Date(2025, 6, 23); // July 23, 2025 (month is 0-indexed)
        
        if (year === currentYear) {
            // Current year: Jan 1 to today (or data start date if it's 2025)
            const startDate = year === 2025 ? dataStartDate : new Date(year, 0, 1);
            return {
                start: startDate,
                end: now
            };
        } else if (year < currentYear) {
            // Past year: Jan 1 to Dec 31 (or data start date if it's 2025)
            const startDate = year === 2025 ? dataStartDate : new Date(year, 0, 1);
            return {
                start: startDate,
                end: new Date(year, 11, 31)
            };
        } else {
            // Future year: no data
            return null;
        }
    }

    function calculateReturn(startValue, endValue) {
        // Calculate the change in percentage points between two dates
        return endValue - startValue;
    }

    function updateHistoricalPnlAssets(data, isEur) {
        const firstEntry = data[0]; // Oldest entry (start date)
        const lastEntry = data[data.length - 1]; // Newest entry (end date)
        
        const assets = [
            { key: 'btc', name: 'BTC' },
            { key: 'voo', name: 'VOO' },
            { key: 'iau', name: 'IAU' },
            { key: 'nanc', name: 'NANC' },
            { key: 'sgov', name: 'SGOV' }
        ];

        let assetsHtml = '';
        assetsHtml += '<div class="ytd-assets-grid">';

        assets.forEach(asset => {
            const usdReturn = calculateReturn(firstEntry.percentages[asset.key].usd, lastEntry.percentages[asset.key].usd);
            const eurReturn = calculateReturn(firstEntry.percentages[asset.key].eur, lastEntry.percentages[asset.key].eur);
            const returnValue = isEur ? eurReturn : usdReturn;

            assetsHtml += `
                <div class="ytd-asset-item">
                    <span class="ytd-asset-name">${asset.name}</span>
                    <span class="ytd-asset-value ${returnValue >= 0 ? 'positive' : 'negative'}">
                        ${returnValue >= 0 ? '+' : ''}${returnValue.toFixed(2)}%
                    </span>
                </div>
            `;
        });

        assetsHtml += '</div>';
        historicalPnlAssetsEl.innerHTML = assetsHtml;
    }

    function updateYearSelector() {
        if (!yearDisplayEl || !yearPrevBtn || !yearNextBtn) {
            initializeHistoricalPnlElements();
            return;
        }

        yearDisplayEl.textContent = selectedYear;
        
        // Disable prev button if we're at the earliest year (2025)
        if (selectedYear <= 2025) {
            yearPrevBtn.classList.add('disabled');
        } else {
            yearPrevBtn.classList.remove('disabled');
        }
        
        // Disable next button if we're at the current year
        const currentYear = new Date().getFullYear();
        if (selectedYear >= currentYear) {
            yearNextBtn.classList.add('disabled');
        } else {
            yearNextBtn.classList.remove('disabled');
        }
        
        // Reset custom date range when changing years
        customDateRange = null;
        updateHistoricalPnlDisplay();
    }

    // Initialize historical PnL elements and year selector
    initializeHistoricalPnlElements();
    updateYearSelector();

    // Load PnL history after initial data is loaded
    setTimeout(() => {
        loadPnlHistory();
    }, 2000);

    // Also try to initialize after a short delay in case elements load later
    setTimeout(() => {
        if (!yearPrevBtn || !yearNextBtn || !calendarBtn) {
            initializeHistoricalPnlElements();
            updateYearSelector();
        }
    }, 1000);

    fetchInitialData(); // Start the process

    // Asset Returns Tracker functionality
    const ASSETS_RETURNS = [
        { symbol: 'BTC-USD', name: 'Bitcoin' },
        { symbol: 'IAU', name: 'iShares Gold Trust' },
        { symbol: 'VOO', name: 'Vanguard S&P 500 ETF' },
        { symbol: 'NANC', name: 'NANC ETF' },
    ];

    const PERIOD_DAYS = {
        '1 week': 7,
        '1 month': 30,
        '2 months': 60,
        '6 months': 180,
        '1 year': 365,
        '2 years': 730
    };

    let currentAssetReturns = {};
    let currentAssetReturnsPeriod = '1 month';


    // Initialize asset returns functionality
    function initializeAssetReturns() {
        const periodSelect = document.getElementById('periodSelect');
        const refreshBtn = document.getElementById('refreshReturnsBtn');
        
        if (periodSelect) {
            periodSelect.addEventListener('change', loadAssetReturns);
        }
        
        if (refreshBtn) {
            refreshBtn.addEventListener('click', loadAssetReturns);
        }
        
        // Load initial data
        loadAssetReturns();
    }

    // Make loadAssetReturns globally accessible
    window.loadAssetReturns = async function() {
        const periodSelect = document.getElementById('periodSelect');
        const returnsGrid = document.getElementById('returns-grid');
        const loadingDiv = document.getElementById('returns-loading');
        const errorDiv = document.getElementById('returns-error');
        
        if (!periodSelect || !returnsGrid) {
            return;
        }
        
        const selectedPeriod = periodSelect.value;
        currentAssetReturnsPeriod = selectedPeriod;
        
        showReturnsLoading(true);
        hideReturnsError();
        clearReturnsGrid();

        try {
            const returns = await fetchAssetReturns(selectedPeriod);
            currentAssetReturns = returns;
            displayAssetReturns(returns, selectedPeriod);
        } catch (error) {
            showReturnsError();
        } finally {
            showReturnsLoading(false);
        }
    };

    function updateAssetReturnsDisplay() {
        if (Object.keys(currentAssetReturns).length === 0) {
            return;
        }
        
        displayAssetReturns(currentAssetReturns, currentAssetReturnsPeriod);
    }

    async function fetchAssetReturns(period) {
        const days = PERIOD_DAYS[period];
        const endDate = new Date();
        const startDate = new Date(endDate.getTime() - (days * 24 * 60 * 60 * 1000));

        const returns = { usd: {}, eur: {} };
        let useFallback = false;

        // Calculate EUR/USD exchange rate change for the same period
        let eurUsdReturn = 0;
        try {
            eurUsdReturn = await calculateEurUsdReturn(startDate, endDate);
        } catch (error) {
            eurUsdReturn = 0;
        }

        // Try to get real data first
        for (const asset of ASSETS_RETURNS) {
            try {
                const usdReturn = await calculateAssetReturn(asset.symbol, startDate, endDate);
                
                // Calculate EUR return: (1 + USD return) / (1 + EUR/USD return) - 1
                const eurReturn = ((1 + usdReturn / 100) / (1 + eurUsdReturn / 100) - 1) * 100;
                const roundedEurReturn = Math.round(eurReturn * 100) / 100;
                
                returns.usd[asset.symbol] = usdReturn;
                returns.eur[asset.symbol] = roundedEurReturn;
            } catch (error) {
                useFallback = true;
                break; // If any asset fails, use fallback for all
            }
        }

        // If API failed, throw error
        if (useFallback) {
            throw new Error('Failed to fetch asset data from all sources');
        }

        return returns;
    }

    async function calculateEurUsdReturn(startDate, endDate) {
        try {
            const baseUrl = `https://query1.finance.yahoo.com/v8/finance/chart/EURUSD=X?period1=${Math.floor(startDate.getTime() / 1000)}&period2=${Math.floor(endDate.getTime() / 1000)}&interval=1d`;
            const url = `https://api.allorigins.win/raw?url=${encodeURIComponent(baseUrl)}`;
            
            const response = await fetch(url, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (!data.chart || !data.chart.result || data.chart.result.length === 0) {
                throw new Error('No EUR/USD data available');
            }

            const result = data.chart.result[0];
            const quotes = result.indicators.quote[0];
            
            if (!quotes.close || quotes.close.length < 2) {
                throw new Error('Insufficient EUR/USD data points');
            }

            const prices = quotes.close;
            let startPrice = null;
            let endPrice = null;

            for (let i = 0; i < prices.length; i++) {
                if (prices[i] !== null && prices[i] !== undefined) {
                    startPrice = prices[i];
                    break;
                }
            }

            for (let i = prices.length - 1; i >= 0; i--) {
                if (prices[i] !== null && prices[i] !== undefined) {
                    endPrice = prices[i];
                    break;
                }
            }

            if (startPrice === null || endPrice === null) {
                throw new Error('No valid EUR/USD price data');
            }

            const returnPercentage = ((endPrice - startPrice) / startPrice) * 100;
            return Math.round(returnPercentage * 100) / 100;
        } catch (error) {
            return 0;
        }
    }

    async function calculateAssetReturn(symbol, startDate, endDate) {
        // Try multiple CORS proxies in case one fails
        const baseUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${Math.floor(startDate.getTime() / 1000)}&period2=${Math.floor(endDate.getTime() / 1000)}&interval=1d`;
        
        const proxies = [
            `https://api.allorigins.win/raw?url=${encodeURIComponent(baseUrl)}`,
            `https://cors-anywhere.herokuapp.com/${baseUrl}`,
            `https://thingproxy.freeboard.io/fetch/${baseUrl}`
        ];
        
        let lastError;
        let data;
        
        for (const url of proxies) {
            try {
                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                    }
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                data = await response.json();
                break; // Success, exit the loop
                
            } catch (error) {
                lastError = error;
                continue; // Try next proxy
            }
        }
        
        if (!data) {
            throw lastError || new Error('All proxies failed');
        }
        
        if (!data.chart || !data.chart.result || data.chart.result.length === 0) {
            throw new Error('No data available');
        }

        const result = data.chart.result[0];
        const timestamps = result.timestamp;
        const quotes = result.indicators.quote[0];
        
        if (!timestamps || timestamps.length < 2) {
            throw new Error('Insufficient data points');
        }

        // Get first and last available prices
        const prices = quotes.close;
        let startPrice = null;
        let endPrice = null;

        // Find first valid price
        for (let i = 0; i < prices.length; i++) {
            if (prices[i] !== null && prices[i] !== undefined) {
                startPrice = prices[i];
                break;
            }
        }

        // Find last valid price
        for (let i = prices.length - 1; i >= 0; i--) {
            if (prices[i] !== null && prices[i] !== undefined) {
                endPrice = prices[i];
                break;
            }
        }

        if (startPrice === null || endPrice === null) {
            throw new Error('No valid price data');
        }

        const returnPercentage = ((endPrice - startPrice) / startPrice) * 100;
        return Math.round(returnPercentage * 100) / 100; // Round to 2 decimal places
    }

    function displayAssetReturns(returns, period) {
        const returnsGrid = document.getElementById('returns-grid');
        if (!returnsGrid) {
            return;
        }
        
        returnsGrid.innerHTML = '';

        ASSETS_RETURNS.forEach(asset => {
            const returnValue = displayCurrency === 'USD' ? returns.usd[asset.symbol] : returns.eur[asset.symbol];
            const card = createReturnsCard(asset, returnValue, period);
            returnsGrid.appendChild(card);
        });
    }

    function createReturnsCard(asset, returnValue, period) {
        const card = document.createElement('div');
        card.className = 'returns-item';

        const assetDiv = document.createElement('div');
        assetDiv.className = 'returns-asset';

        const name = document.createElement('span');
        name.className = 'returns-name';
        // Display "BTC" instead of "BTC-USD"
        const displayName = asset.symbol === 'BTC-USD' ? 'BTC' : asset.symbol;
        name.textContent = displayName;

        assetDiv.appendChild(name);

        const returnDiv = document.createElement('div');
        returnDiv.className = 'returns-value';

        if (returnValue === null) {
            returnDiv.textContent = 'N/A';
            returnDiv.className += ' neutral';
        } else {
            const sign = returnValue >= 0 ? '+' : '';
            returnDiv.textContent = `${sign}${returnValue}%`;
            returnDiv.className += returnValue > 0 ? ' positive' : 
                                 returnValue < 0 ? ' negative' : ' neutral';
        }

        card.appendChild(assetDiv);
        card.appendChild(returnDiv);

        return card;
    }

    function showReturnsLoading(show) {
        const loadingDiv = document.getElementById('returns-loading');
        if (loadingDiv) {
            loadingDiv.style.display = show ? 'block' : 'none';
        }
    }

    function showReturnsError(message) {
        const errorDiv = document.getElementById('returns-error');
        if (errorDiv) {
            errorDiv.innerHTML = 'Failed to load data. <a href="#" onclick="loadAssetReturns(); return false;" style="color: inherit; text-decoration: underline;">Retry</a>';
            errorDiv.style.display = 'block';
        }
    }

    function hideReturnsError() {
        const errorDiv = document.getElementById('returns-error');
        if (errorDiv) {
            errorDiv.style.display = 'none';
        }
    }

    function clearReturnsGrid() {
        const returnsGrid = document.getElementById('returns-grid');
        if (returnsGrid) {
            returnsGrid.innerHTML = '';
        }
    }

    // Initialize asset returns after a short delay to ensure DOM is ready
    setTimeout(() => {
        initializeAssetReturns();
    }, 1000);

});
