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
    let ytdData = null;
    let ytdIncludeSgov = true;
    let currentYtdYear = new Date().getFullYear();
    const excludedAssets = new Set();
    let portfolioData = {};
    let refreshTimer;
    let currentPieChart;
    let portfolio = {};

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

    async function loadYtdData(year = null) {
        try {
            const targetYear = year || currentYtdYear;
            const filename = targetYear === new Date().getFullYear() 
                ? 'portfolio_ytd_results.json' 
                : `portfolio_ytd_results_${targetYear}.json`;
            
            const response = await fetch(filename);
            if (response.ok) {
                ytdData = await response.json();
                currentYtdYear = targetYear;
                createYtdSection();
            } else {
                console.warn(`Could not load YTD data for year ${targetYear}`);
                // If loading a specific year fails, set ytdData to null and update display
                if (year) {
                    ytdData = null;
                    currentYtdYear = targetYear;
                    createYtdSection();
                }
            }
        } catch (error) {
            console.warn('Could not load YTD data');
            // If there's an error, set ytdData to null and update display
            if (year) {
                ytdData = null;
                currentYtdYear = year;
                createYtdSection();
            }
        }
    }

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
                    <h3>THEORETICAL YTD %</h3>
                    <p>Normalized to exclude cash inflows</p>
                </div>
                <div class="ytd-year-selector">
                    <button id="ytd-year-left" class="year-arrow" aria-label="Previous year">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M15 18l-6-6 6-6"/>
                        </svg>
                    </button>
                    <div class="year-display" id="ytd-year-display">${currentYtdYear}</div>
                    <button id="ytd-year-right" class="year-arrow" aria-label="Next year">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M9 18l6-6-6-6"/>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="ytd-values">
                <div class="ytd-value-item">
                    <span class="ytd-label">Total</span>
                    <span id="ytd-value-with-sgov" class="ytd-value">N/A</span>
                </div>
                <div class="ytd-value-item">
                    <span class="ytd-label">Excl SGOV</span>
                    <span id="ytd-value-excl-sgov" class="ytd-value">N/A</span>
                </div>
            </div>
            <div class="ytd-date" id="ytd-date">No ${currentYtdYear} data</div>
            <div class="ytd-assets" id="ytd-assets"></div>
        `;

        // Insert after the avg-buy-price-card
        const avgBuyPriceCard = document.querySelector('.avg-buy-price-card');
        if (avgBuyPriceCard) {
            avgBuyPriceCard.parentNode.insertBefore(ytdCard, avgBuyPriceCard.nextSibling);
        } else {
            // Fallback: insert after history-section if avg-buy-price-card doesn't exist yet
            historySection.parentNode.insertBefore(ytdCard, historySection.nextSibling);
        }

        // Setup year selector event listeners
        setupYearSelector();
        updateYtdDisplay();
    }

    function setupYearSelector() {
        const leftBtn = document.getElementById('ytd-year-left');
        const rightBtn = document.getElementById('ytd-year-right');
        const yearDisplay = document.getElementById('ytd-year-display');
        
        if (!leftBtn || !rightBtn || !yearDisplay) return;

        // Update year display
        yearDisplay.textContent = currentYtdYear;
        
        // Update arrow states
        const currentYear = new Date().getFullYear();
        rightBtn.disabled = currentYtdYear >= currentYear;
        rightBtn.classList.toggle('disabled', currentYtdYear >= currentYear);
        
        // Add event listeners
        leftBtn.addEventListener('click', async () => {
            if (currentYtdYear > 2020) { // Assuming 2020 is the earliest year
                await loadYtdData(currentYtdYear - 1);
            }
        });
        
        rightBtn.addEventListener('click', async () => {
            if (currentYtdYear < currentYear) {
                await loadYtdData(currentYtdYear + 1);
            }
        });
    }

    function updateYtdDisplay() {
        // Update year display and arrow states regardless of data availability
        const yearDisplay = document.getElementById('ytd-year-display');
        const ytdDate = document.getElementById('ytd-date');
        const rightBtn = document.getElementById('ytd-year-right');
        
        if (yearDisplay) {
            yearDisplay.textContent = currentYtdYear;
        }
        
        // Update arrow states
        if (rightBtn) {
            const currentYear = new Date().getFullYear();
            rightBtn.disabled = currentYtdYear >= currentYear;
            rightBtn.classList.toggle('disabled', currentYtdYear >= currentYear);
        }

        // If no YTD data available, show placeholder values
        if (!ytdData) {
            const withSgovEl = document.getElementById('ytd-value-with-sgov');
            const exclSgovEl = document.getElementById('ytd-value-excl-sgov');
            
            if (withSgovEl) {
                withSgovEl.textContent = 'N/A';
                withSgovEl.className = 'ytd-value';
            }
            
            if (exclSgovEl) {
                exclSgovEl.textContent = 'N/A';
                exclSgovEl.className = 'ytd-value';
            }
            
            if (ytdDate) {
                ytdDate.textContent = `No ${currentYtdYear} data`;
            }
            
            // Clear asset returns when no data
            const ytdAssets = document.getElementById('ytd-assets');
            if (ytdAssets) {
                ytdAssets.innerHTML = '';
            }
            return;
        }

        const returns = ytdData.portfolio_returns;
        
        // Get both values based on current currency
        let withSgovValue = null;
        let exclSgovValue = null;

        if (displayCurrency === 'USD') {
            withSgovValue = returns.total_usd_ytd;
            exclSgovValue = returns.total_usd_ytd_excl_sgov;
        } else {
            withSgovValue = returns.total_eur_ytd;
            exclSgovValue = returns.total_eur_ytd_excl_sgov;
        }

        // Update With SGOV value
        const withSgovEl = document.getElementById('ytd-value-with-sgov');
        if (withSgovEl && withSgovValue !== null) {
            const sign = withSgovValue >= 0 ? '+' : '';
            withSgovEl.textContent = `${sign}${withSgovValue.toFixed(2)}%`;
            withSgovEl.className = `ytd-value ${withSgovValue >= 0 ? 'positive' : 'negative'}`;
        }

        // Update Excl SGOV value
        const exclSgovEl = document.getElementById('ytd-value-excl-sgov');
        if (exclSgovEl && exclSgovValue !== null) {
            const sign = exclSgovValue >= 0 ? '+' : '';
            exclSgovEl.textContent = `${sign}${exclSgovValue.toFixed(2)}%`;
            exclSgovEl.className = `ytd-value ${exclSgovValue >= 0 ? 'positive' : 'negative'}`;
        }
        
        if (ytdDate && ytdData.calculation_date) {
            ytdDate.textContent = `Using invested allocation as of ${new Date(ytdData.calculation_date).toLocaleDateString()}`;
        }
        
        // Update individual asset returns
        updateAssetReturns();
    }

    function updateAssetReturns() {
        const ytdAssets = document.getElementById('ytd-assets');
        if (!ytdAssets || !ytdData || !ytdData.asset_returns) return;

        const assetReturns = ytdData.asset_returns;
        const assetNames = Object.keys(assetReturns);
        
        if (assetNames.length === 0) return;

        // Sort assets by YTD return (highest to lowest)
        const sortedAssets = assetNames.sort((a, b) => {
            const aValue = displayCurrency === 'USD' ? assetReturns[a].usd_ytd : assetReturns[a].eur_ytd;
            const bValue = displayCurrency === 'USD' ? assetReturns[b].usd_ytd : assetReturns[b].eur_ytd;
            return bValue - aValue; // Sort descending (highest first)
        });

        let html = '';
        html += '<div class="ytd-assets-grid">';
        
        sortedAssets.forEach(assetName => {
            const assetData = assetReturns[assetName];
            const returnValue = displayCurrency === 'USD' ? assetData.usd_ytd : assetData.eur_ytd;
            
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
                    
                    html += `
                        <div class="avg-buy-price-item">
                            <div class="avg-buy-price-asset">
                                <span class="avg-buy-price-name">${displayName}</span>
                            </div>
                            <div class="avg-buy-price-values">
                                <div class="avg-buy-price-row">
                                    <span class="avg-buy-price-label">Buy:</span>
                                    <span class="avg-buy-price-value">${formatCurrency(avgBuyPrice, displayCurrency)}</span>
                                </div>
                                <div class="avg-buy-price-row">
                                    <span class="avg-buy-price-label">Current:</span>
                                    <span class="avg-buy-price-value ${priceColorClass}">${formatCurrency(currentPriceInCurrency, displayCurrency)}</span>
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

    function formatCurrency(value, currency) {
        const symbol = currency === 'USD' ? '$' : '€';
        const formattedValue = value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return `${symbol}${formattedValue}`;
    }

    function setupAutoRefresh() {
        if (refreshTimer) {
            clearInterval(refreshTimer);
        }
        refreshTimer = setInterval(fetchStockData, REFRESH_INTERVAL);
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

        Object.keys(portfolio).forEach(symbol => {
            const assetData = portfolioData[symbol];
            if (!excludedAssets.has(symbol) && assetData && !assetData.error) {
                totalValue += assetData.value || 0;
            }
        });

        Object.keys(portfolio).forEach(symbol => {
             const assetData = portfolioData[symbol];
            if (!excludedAssets.has(symbol) && assetData && !assetData.error) {
                const displaySymbol = symbol.includes('BINANCE:') ? 'BTC' : symbol;
                const value = assetData.value || 0;
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
                                    return [ `${label} (${assetClass})`, `Value: $${value.toFixed(2)}`, `Percentage: ${percentage.toFixed(2)}%` ];
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
                            text: `Placeholder Title`, // Title is now set dynamically after chart creation/update
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

    // --- Event Listener for Timeframe Change --- //
    timeframeSelectEl.addEventListener('change', (event) => {
        selectedTimeframe = event.target.value;
        loadHistoryChart(); // Reload the history chart with the new timeframe
    });

    fetchInitialData(); // Start the process
    loadYtdData(); // Load YTD data

});

