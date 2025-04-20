document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('dividend_history.json');
        const dividendData = await response.json();

        const portfolio = {
            'VOO': dividendData.holdings.VOO.total_shares,
            'NANC': dividendData.holdings.NANC.total_shares,
            'IAU': 38.463,
            'SGOV': dividendData.holdings.SGOV.total_shares,
            'BINANCE:BTCUSDT': 0.09580427
        };

    // Initial investments as provided (USD)
    const initialInvestments = {
        'VOO': 1591,
        'NANC': 721,
        'IAU': 2155,
        'SGOV': 13496,
        'BINANCE:BTCUSDT': 5620
    };

    // Add initial investments in EUR
    const initialEuroInvestments = {
        'VOO': 1455,
        'NANC': 660,
        'IAU': 1972,
        'SGOV': 12213,
        'BINANCE:BTCUSDT': 5200
    };

    // Original investment in Euros
    const originalEuroInvestment = 21500;
    
    // API key from the Python script for stock data
    const apiKey = 'cvneau1r01qq3c7eq690cvneau1r01qq3c7eq69g';
    
    // Track excluded assets
    const excludedAssets = new Set();

    // --- STATE ---
    let displayCurrency = 'USD'; // 'USD' or 'EUR'
    let usdToEurRate = 1.0; // Default/Fallback rate

    // Chart elements
    const currentPieChartEl = document.getElementById('current-pie-chart');
    const chartLegendEl = document.getElementById('chart-legend');
    let currentPieChart;

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
    
    // New main summary elements
    const mainTotalValueEl = document.getElementById('main-total-value');
    const mainEuroValueEl = document.getElementById('main-euro-value');
    const mainTotalPnlEl = document.getElementById('main-total-pnl');
    const mainPnlBadgeEl = document.getElementById('main-pnl-badge');
    
    // Currency switch button
    const currencySwitchBtn = document.getElementById('currency-switch-btn');

    // Auto-refresh settings (every 5 minutes)
    const REFRESH_INTERVAL = 30 * 1000;
    let refreshTimer;
    
    // Object to store portfolio data for charts
    let portfolioData = {};
    
    // Initialize
    fetchStockData();
    
    // Set up auto-refresh
    function setupAutoRefresh() {
        if (refreshTimer) {
            clearInterval(refreshTimer);
        }
        refreshTimer = setInterval(fetchStockData, REFRESH_INTERVAL);
    }
    
    // Set up sorting functionality
    const tableHeaders = portfolioTable.querySelectorAll('th');
    tableHeaders.forEach((header, index) => {
        header.addEventListener('click', () => {
            sortTable(index);
        });
    });

    // --- NEW: Event listener for currency switch ---
    currencySwitchBtn.addEventListener('click', toggleCurrency);

    async function fetchExchangeRate() {
        try {
            let response = await fetch("https://playersfirst.github.io/exchange_rate.json");
            let data = await response.json();
            usdToEurRate = data.rate; // Store the rate
            return usdToEurRate;
        } catch (error) {
            console.error("Error fetching exchange rate:", error);
            usdToEurRate = 0.92; // Use a fallback rate
            return usdToEurRate; // Fallback rate
        }
    }

    // Function to fetch stock data
    async function fetchStockData() {
        // Show loading, hide table
        loadingEl.style.display = 'flex';
        portfolioTable.style.display = 'none';
        
        // Clear previous data
        portfolioDataEl.innerHTML = '';
        
        // Get the current USD to EUR exchange rate
        await fetchExchangeRate(); // Fetch and store the rate
        
        let totalPortfolioValue = 0;
        let totalPnL = 0;
        let completedRequests = 0;
        const totalRequests = Object.keys(portfolio).length;
        
        // Reset portfolio data
        portfolioData = {};
        
        // Process each stock symbol
        const promises = Object.keys(portfolio).map(symbol => {
            const shares = portfolio[symbol];
            const initialInvestment = initialInvestments[symbol];
            const initialEuroInvestment = initialEuroInvestments[symbol]; // Get EUR initial investment

            // API URL for stock data
            let url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`;
            
            return fetch(url)
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! Status: ${response.status}`);
                    }
                    return response.json();
                })
                .then(data => {
                    const price = data.c; // Current price (USD)
                    const percentChange = data.dp; // Percent change
                    const value = price * shares; // Value in USD
                    const valueEur = value / usdToEurRate; // Value in EUR
                    
                    // Calculate P&L (current value - initial investment)
                    const pnl = value - initialInvestment; // P&L in USD
                    const pnlEur = valueEur - initialEuroInvestment; // P&L in EUR
                    
                    // Add to total portfolio value and P&L only if not excluded (using USD totals for original flow)
                    if (!excludedAssets.has(symbol)) {
                        totalPortfolioValue += value;
                        totalPnL += pnl;
                    }
                    
                    // Store data for charts and display (Store both USD and EUR)
                    portfolioData[symbol] = {
                        shares, // Store shares
                        price, // Store USD price
                        value, // Store USD value
                        pnl,   // Store USD P&L
                        valueEur, // Store EUR value
                        pnlEur, // Store EUR P&L
                        percentChange,
                        initialInvestment, // Store USD initial
                        initialEuroInvestment // Store EUR initial
                    };
                    
                    // Create table row (This will now be done in finishLoading/recalculateTotals)
                    // const row = createTableRow(symbol, shares, price, value, pnl, percentChange, initialInvestment);
                    // portfolioDataEl.appendChild(row);
                })
                .catch(error => {
                    console.error(`Error fetching data for ${symbol}:`, error);
                    
                    // Create error row
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td class="symbol">${symbol}</td>
                        <td>${shares.toFixed(4)}</td>
                        <td colspan="4">Error loading data</td>
                        <td></td>
                    `;
                    portfolioDataEl.appendChild(row);
                })
                .finally(() => {
                    // Update UI when all requests are completed
                    completedRequests++;
                    if (completedRequests === totalRequests) {
                        finishLoading(totalPortfolioValue, totalPnL, usdToEurRate); // Pass USD totals
                    }
                });
        });
        
        // Wait for all requests to complete
        await Promise.allSettled(promises);
        
        // Reset the auto-refresh timer to ensure consistent intervals
        setupAutoRefresh();
    }
    
    // --- NEW: Helper to format currency ---
    function formatCurrency(value, currency) {
        const symbol = currency === 'USD' ? '$' : '€';
        const formattedValue = value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return `${symbol}${formattedValue}`;
    }

    // --- UPDATED: Create table row to use portfolioData and displayCurrency ---
    function createTableRow(symbol) {
        const data = portfolioData[symbol];
        const displaySymbol = symbol.includes('BINANCE:') ? 'BTC' : symbol;
        const row = document.createElement('tr');
        row.dataset.symbol = symbol; // Store the symbol

        if (!data || data.error) { // Handle potential errors during fetch
            row.innerHTML = `
                <td class="symbol">${displaySymbol}</td>
                <td>${portfolio[symbol]?.toFixed(4) || 'N/A'}</td>
                <td colspan="5">Error loading data</td>
            `;
            return row;
        }

        // Determine which values to display based on displayCurrency
        const primaryCurrency = displayCurrency;
        const pricePrimary = primaryCurrency === 'USD' ? data.price : data.price / usdToEurRate;
        const valuePrimary = primaryCurrency === 'USD' ? data.value : data.valueEur;
        const pnlPrimary = primaryCurrency === 'USD' ? data.pnl : data.pnlEur;
        const initialInvestmentPrimary = primaryCurrency === 'USD' ? data.initialInvestment : data.initialEuroInvestment;

        // Calculate PnL percentage based on the displayed currency
        const pnlPercentage = initialInvestmentPrimary !== 0 ? (pnlPrimary / initialInvestmentPrimary) * 100 : 0;
        const percentChange = data.percentChange; // 24h change is independent of display currency

        // Add excluded class if necessary
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

        // Add click event to toggle button
        const toggleBtn = row.querySelector('.toggle-asset');
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent triggering row selection
            toggleAsset(symbol);
        });

        // Add click event to the entire row
        row.addEventListener('click', () => {
            toggleAsset(symbol);
        });

        return row;
    }

    // Function to toggle an asset's inclusion in totals
    function toggleAsset(symbol) {
        // Toggle the asset in the excluded set
        if (excludedAssets.has(symbol)) {
            excludedAssets.delete(symbol);
        } else {
            excludedAssets.add(symbol);
        }
        
        // Find the corresponding row and toggle its class
        const rows = portfolioDataEl.querySelectorAll('tr');
        rows.forEach(row => {
            if (row.dataset.symbol === symbol) {
                row.classList.toggle('excluded');
                
                // Change the toggle symbol
                const toggleBtn = row.querySelector('.toggle-asset');
                if (excludedAssets.has(symbol)) {
                    toggleBtn.textContent = '⊕';
                    toggleBtn.title = 'Click to include this asset';
                } else {
                    toggleBtn.textContent = '⊖';
                    toggleBtn.title = 'Click to exclude this asset';
                }
            }
        });
        
        // Recalculate totals
        recalculateTotals();
    }

    // --- NEW: Function to toggle currency ---
    function toggleCurrency() {
        displayCurrency = (displayCurrency === 'USD') ? 'EUR' : 'USD';
        recalculateTotals(); // Recalculate and update display
    }

    // --- UPDATED: Recalculate totals and update display ---
    function recalculateTotals() {
        // Calculate new totals based on current displayCurrency and exclusions
        let totalValuePrimary = 0;
        let totalValueSecondary = 0;
        let totalPnlPrimary = 0;
        let totalInitialInvestmentPrimary = 0;
        let totalInitialInvestmentSecondary = 0; // For secondary PnL % if needed

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
                    totalInitialInvestmentSecondary += data.initialEuroInvestment; // Track secondary initial
                } else { // Primary is EUR
                    totalValuePrimary += data.valueEur;
                    totalValueSecondary += data.value; // Secondary is USD
                    totalPnlPrimary += data.pnlEur;
                    totalInitialInvestmentPrimary += data.initialEuroInvestment;
                    totalInitialInvestmentSecondary += data.initialInvestment; // Track secondary initial
                }
            }
        });

        // --- Update display elements ---

        // Update table rows first
        portfolioDataEl.innerHTML = '';
        Object.keys(portfolioData).forEach(symbol => {
             const row = createTableRow(symbol);
             portfolioDataEl.appendChild(row);
         });

        // Update table totals
        totalValueEl.textContent = formatCurrency(totalValuePrimary, primaryCurrency);
        totalPnlEl.textContent = formatCurrency(totalPnlPrimary, primaryCurrency);
        totalPnlEl.className = totalPnlPrimary >= 0 ? 'positive' : 'negative';

        const totalPnLPercentagePrimary = totalInitialInvestmentPrimary > 0 ? (totalPnlPrimary / totalInitialInvestmentPrimary) * 100 : 0;
        totalPnlPerc.textContent = `${totalPnLPercentagePrimary >= 0 ? '+' : ''}${totalPnLPercentagePrimary.toFixed(2)}%`;
        totalPnlPerc.className = `badge ${totalPnLPercentagePrimary >= 0 ? 'positive' : 'negative'}`;

        // Update secondary row (rename IDs if needed, but keep structure)
        const secondaryRow = document.querySelector('.euro-row'); // Find the secondary row
        const secondaryTotalEl = document.getElementById('total-euros');
        const secondaryPnlEl = document.getElementById('euro-pnl');
        const secondaryPnlPercEl = document.getElementById('total-%-pnl-euros');

        const hasExcludedAssets = excludedAssets.size > 0;
        secondaryRow.style.display = hasExcludedAssets ? 'none' : 'table-row';

        if (!hasExcludedAssets) {
            secondaryTotalEl.textContent = formatCurrency(totalValueSecondary, secondaryCurrency);

            // Calculate secondary P&L (Original EUR PnL is fixed, USD depends on current rate)
            let pnlSecondary, initialSecondaryForPnlPerc, pnlPercentageSecondary;
            if (secondaryCurrency === 'EUR') {
                // Calculate total EUR PnL based on original total EUR investment
                pnlSecondary = totalValueSecondary - originalEuroInvestment;
                initialSecondaryForPnlPerc = originalEuroInvestment;
            } else { // Secondary is USD
                // Calculate total USD P&L based on sum of initial USD investments
                pnlSecondary = totalValueSecondary - totalInitialInvestmentSecondary;
                initialSecondaryForPnlPerc = totalInitialInvestmentSecondary;
            }

            secondaryPnlEl.textContent = formatCurrency(pnlSecondary, secondaryCurrency);
            secondaryPnlEl.className = pnlSecondary >= 0 ? 'positive' : 'negative';

            pnlPercentageSecondary = initialSecondaryForPnlPerc > 0 ? (pnlSecondary / initialSecondaryForPnlPerc) * 100 : 0;
            secondaryPnlPercEl.textContent = `${pnlPercentageSecondary >= 0 ? '+' : ''}${pnlPercentageSecondary.toFixed(2)}%`;
            secondaryPnlPercEl.className = `badge ${pnlPercentageSecondary >= 0 ? 'positive' : 'negative'}`;
        }

        // Update main summary
        mainTotalValueEl.textContent = formatCurrency(totalValuePrimary, primaryCurrency);
        mainEuroValueEl.style.display = hasExcludedAssets ? 'none' : 'inline';
        mainEuroValueEl.textContent = `(${formatCurrency(totalValueSecondary, secondaryCurrency)})`;

        mainTotalPnlEl.textContent = formatCurrency(totalPnlPrimary, primaryCurrency);
        mainTotalPnlEl.className = totalPnlPrimary >= 0 ? 'positive' : 'negative';
        mainPnlBadgeEl.textContent = `${totalPnLPercentagePrimary >= 0 ? '+' : ''}${totalPnLPercentagePrimary.toFixed(2)}%`;
        mainPnlBadgeEl.className = `badge ${totalPnLPercentagePrimary >= 0 ? 'positive' : 'negative'}`;

        // Update button text
        currencySwitchBtn.textContent = `Switch to ${secondaryCurrency}`;

        // Update charts (using USD values from portfolioData)
        // Calculate total USD value for charts, considering exclusions
        let totalUsdValueForCharts = 0;
        Object.keys(portfolioData).forEach(symbol => {
             const data = portfolioData[symbol];
             if (data && !data.error && !excludedAssets.has(symbol)) {
                 totalUsdValueForCharts += data.value; // Use the stored USD value
             }
         });

        createPieChart(); // Pie chart implicitly uses portfolioData (which has USD values)
        loadHistoryChart(totalUsdValueForCharts); // Pass the calculated total USD value

        // Ensure table is sorted correctly
        // Find current sort column and re-sort
        let currentSortColumn = 3; // Default to value
        const sortedHeader = portfolioTable.querySelector('th.sort-asc, th.sort-desc');
        if (sortedHeader) {
            currentSortColumn = Array.from(portfolioTable.querySelectorAll('th')).indexOf(sortedHeader);
            // Remove class temporarily so sortTable applies correct direction
            sortedHeader.classList.remove('sort-asc', 'sort-desc');
        }
        sortTable(currentSortColumn);
    }

    // Function to sort the table (Updated for currency)
    function sortTable(columnIndex) {
        const rowsArray = Array.from(portfolioDataEl.querySelectorAll('tr')); // Use Array.from
        const header = portfolioTable.querySelector(`th:nth-child(${columnIndex + 1})`);
        let isAscending = header.classList.contains('sort-asc');
        let isDescending = header.classList.contains('sort-desc');
        let directionMultiplier = 1; // Default ascending for symbol, descending for others

        // Determine next sort direction
        if (isDescending) {
            directionMultiplier = 1; // Switch to ascending
            header.classList.remove('sort-desc');
            header.classList.add('sort-asc');
        } else if (isAscending) {
            directionMultiplier = -1; // Keep descending (or switch back if needed)
            header.classList.remove('sort-asc');
            header.classList.add('sort-desc');
        } else {
             // Default sort: descending for numeric, ascending for text
            directionMultiplier = (columnIndex === 0) ? 1 : -1;
            header.classList.add(directionMultiplier === 1 ? 'sort-asc' : 'sort-desc');
        }
         // Remove sort classes from other headers
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

            if (!dataA || dataA.error) return 1 * directionMultiplier;
            if (!dataB || dataB.error) return -1 * directionMultiplier;

            let valA, valB;

            switch (columnIndex) {
                case 0: // Symbol
                    valA = a.cells[columnIndex].textContent.trim().replace(/[⊖⊕]/g, '').trim();
                    valB = b.cells[columnIndex].textContent.trim().replace(/[⊖⊕]/g, '').trim();
                    return valA.localeCompare(valB) * directionMultiplier;
                case 1: // Shares
                    valA = dataA.shares;
                    valB = dataB.shares;
                    break;
                case 2: // Price
                    valA = displayCurrency === 'USD' ? dataA.price : dataA.price / usdToEurRate;
                    valB = displayCurrency === 'USD' ? dataB.price : dataB.price / usdToEurRate;
                    break;
                case 3: // Value
                    valA = displayCurrency === 'USD' ? dataA.value : dataA.valueEur;
                    valB = displayCurrency === 'USD' ? dataB.value : dataB.valueEur;
                    break;
                case 4: // P&L ($/€)
                    valA = displayCurrency === 'USD' ? dataA.pnl : dataA.pnlEur;
                    valB = displayCurrency === 'USD' ? dataB.pnl : dataB.pnlEur;
                    break;
                case 5: // P&L (%)
                    const initialA = displayCurrency === 'USD' ? dataA.initialInvestment : dataA.initialEuroInvestment;
                    const pnlA = displayCurrency === 'USD' ? dataA.pnl : dataA.pnlEur;
                    valA = initialA !== 0 ? (pnlA / initialA) * 100 : 0;
                    const initialB = displayCurrency === 'USD' ? dataB.initialInvestment : dataB.initialEuroInvestment;
                    const pnlB = displayCurrency === 'USD' ? dataB.pnl : dataB.pnlEur;
                    valB = initialB !== 0 ? (pnlB / initialB) * 100 : 0;
                    break;
                case 6: // 24H %
                    valA = dataA.percentChange;
                    valB = dataB.percentChange;
                    break;
                default:
                    return 0;
            }

            // Numeric comparison
             if (valA < valB) return -1 * directionMultiplier;
             if (valA > valB) return 1 * directionMultiplier;
             return 0;
        });

        // Clear the table body and re-add sorted rows
        portfolioDataEl.innerHTML = '';
        rowsArray.forEach(row => portfolioDataEl.appendChild(row));
    }

    // --- UPDATED: Complete loading uses recalculateTotals for display logic ---
    function finishLoading(totalValueUsd, totalPnlUsd, exchangeRate) {

        // Hide loading, show table
        loadingEl.style.display = 'none';
        portfolioTable.style.display = 'table';

        // Update timestamp
        const now = new Date();
        lastUpdatedEl.textContent = now.toLocaleString();

        // Perform initial display update and sort
        recalculateTotals(); // This now handles the full display update

        // Initial sort by Value (USD) after first load
        // sortTable(3); // recalculateTotals now handles sorting
    }

    // Create pie chart (Unchanged - Uses USD values from portfolioData)
    function createPieChart() {
        // Colors for each asset class
        const assetColors = {
            'BINANCE:BTCUSDT': '#FF6384',  // Cryptocurrency
            'VOO': '#36A2EB',               // Funds (same color)
            'NANC': '#36A2EB',              // Funds (same color)
            'IAU': '#FFCE56',               // Commodities
            'SGOV': '#4BC0C0'              // Savings
        };
    
        // Asset class labels for legend
        const assetClassLabels = {
            'BINANCE:BTCUSDT': 'Crypto',
            'VOO': 'Equities',
            'NANC': 'Equities',
            'IAU': 'Commodities',
            'SGOV': 'Savings'
        };
    
        // Prepare chart data - each asset gets its own segment
        const labels = [];
        const data = [];
        const backgroundColors = [];
        const assetTooltips = {};
    
        // Calculate total portfolio value for percentages (only include non-excluded assets)
        let totalValue = 0;
        Object.keys(portfolio).forEach(symbol => {
            if (!excludedAssets.has(symbol) && portfolioData[symbol] && !portfolioData[symbol].error) {
                const value = portfolioData[symbol].value || 0; // Use USD value
                totalValue += value;
            }
        });
    
        // Process each asset (only include non-excluded assets)
        Object.keys(portfolio).forEach(symbol => {
            if (!excludedAssets.has(symbol) && portfolioData[symbol] && !portfolioData[symbol].error) {
                const displaySymbol = symbol.includes('BINANCE:') ? 'BTC' : symbol;
                const value = portfolioData[symbol].value || 0; // Use USD value
                const percentage = totalValue > 0 ? (value / totalValue * 100) : 0;
                
                labels.push(displaySymbol);
                data.push(value);
                backgroundColors.push(assetColors[symbol]);
                
                // Store tooltip information
                assetTooltips[displaySymbol] = {
                    value: value, // USD Value
                    percentage: percentage,
                    class: assetClassLabels[symbol]
                };
            }
        });
    
        // Create or update current value pie chart
        const currentCtx = currentPieChartEl.getContext('2d');
        if (currentPieChart) {
            currentPieChart.data.labels = labels;
            currentPieChart.data.datasets[0].data = data;
            currentPieChart.data.datasets[0].backgroundColor = backgroundColors;
            currentPieChart.update();
        } else {
            currentPieChart = new Chart(currentCtx, {
                type: 'pie',
                data: {
                    labels: labels,
                    datasets: [{
                        data: data,
                        backgroundColor: backgroundColors,
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const label = context.label;
                                    const value = context.raw; // USD Value
                                    const percentage = assetTooltips[label].percentage;
                                    const assetClass = assetTooltips[label].class;
                                    
                                    return [
                                        `${label} (${assetClass})`,
                                        `Value: $${value.toFixed(2)}`, // Display USD
                                        `Percentage: ${percentage.toFixed(2)}%`
                                    ];
                                }
                            }
                        },
                        legend: {
                            display: false // We'll use our custom legend
                        }
                    }
                }
            });
        }
    
        // Create custom legend grouped by asset class
        chartLegendEl.innerHTML = '';
        
        // Group assets by class
        const classGroups = {};
        Object.keys(assetClassLabels).forEach(symbol => {
            if (!excludedAssets.has(symbol)) {
                const className = assetClassLabels[symbol];
                if (!classGroups[className]) {
                    classGroups[className] = {
                        color: assetColors[symbol],
                        assets: []
                    };
                }
                const displaySymbol = symbol.includes('BINANCE:') ? 'BTC' : symbol;
                classGroups[className].assets.push(displaySymbol);
            }
        });
    
        // Create legend items
        Object.keys(classGroups).forEach(className => {
            const group = classGroups[className];
            const legendItem = document.createElement('div');
            legendItem.className = 'legend-item';
            
            const assetsList = group.assets.map(asset => {
                const percentage = assetTooltips[asset]?.percentage.toFixed(2) || '0.00';
                return `${asset} (${percentage}%)`;
            }).join(', ');
            
            legendItem.innerHTML = `
                <div class="legend-color" style="background-color: ${group.color};"></div>
                <span>${className}</span>
            `;
            chartLegendEl.appendChild(legendItem);
        });
    }
    
    // Load history chart (Unchanged - Expects total USD value)
    async function loadHistoryChart(currentPortfolioValue) {
        try {
            // --- FIX: Destroy previous chart instance if it exists ---
            if (window.historyChart instanceof Chart) {
                window.historyChart.destroy();
            }
            // --- End FIX ---

            // Get the canvas element (declarations were already here)
            const historyChartEl = document.getElementById('history-chart');
            const ctx = historyChartEl.getContext('2d');

            // Fetch the mock historical data JSON file
            const response = await fetch('portfolio_history.json');
            const data = await response.json();
            const historicalData = data.history;
            
            // Create a copy of the historical data
            const chartData = [...historicalData];
            
            // Add today's data point with the current portfolio value
            const today = new Date();
            chartData.push({
                date: today.toISOString().split('T')[0],  // YYYY-MM-DD format
                value: currentPortfolioValue
            });
            
            // Extract dates and values for the chart
            const dates = chartData.map(item => {
                // Format date to be more readable (e.g., "Mar 8")
                const date = new Date(item.date);
                return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            });
            
            const values = chartData.map(item => item.value);
            
            // Calculate min and max for better Y-axis scaling
            const minValue = Math.min(...values) * 0.995; // 0.5% buffer below minimum
            const maxValue = Math.max(...values) * 1.005; // 0.5% buffer above maximum
            
            // Calculate the overall change percentage for labeling
            const firstValue = values[0];
            const lastValue = values[values.length - 1];
            const changePercentage = ((lastValue - firstValue) / firstValue) * 100;
            const changeDirection = changePercentage >= 0 ? '+' : '-';
            const changeColor = changePercentage >= 0 ? '#10b981' : '#ef4444';
            
            // Custom tooltip styling
            const tooltipStyle = {
                backgroundColor: 'rgba(30, 41, 59, 0.85)',
                borderColor: 'rgba(203, 213, 225, 0.3)',
                borderWidth: 1,
                titleColor: '#f8fafc',
                bodyColor: '#f1f5f9',
                bodySpacing: 6,
                padding: 12,
                boxPadding: 6,
                cornerRadius: 8,
                bodyFont: {
                    family: "'Inter', sans-serif",
                    size: 13
                },
                titleFont: {
                    family: "'Inter', sans-serif",
                    size: 14,
                    weight: 'bold'
                }
            };
            
            // Create gradient fill
            const gradient = ctx.createLinearGradient(0, 0, 0, 300);
            gradient.addColorStop(0, 'rgb(34, 153, 247, 0.4)');
            gradient.addColorStop(1, 'rgb(34, 153, 247, 0.05)');
            
            // Create chart
            window.historyChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: dates,
                    datasets: [{
                        label: 'Portfolio Value',
                        data: values,
                        borderColor: '#2299f7',
                        borderWidth: 3,
                        backgroundColor: gradient,
                        fill: true,
                        tension: 0.25,
                        pointRadius: 4,
                        pointHoverRadius: 7,
                        pointBackgroundColor: function(context) {
                            // Highlight the last point (today's value)
                            return context.dataIndex === context.dataset.data.length - 1 ? 
                                   '#ec4899' : '#2299f7';
                        },
                        pointBorderColor: function(context) {
                            // Highlight the last point (today's value)
                            return context.dataIndex === context.dataset.data.length - 1 ? 
                                   '#ec4899' : '#2299f7';
                        },
                        pointBorderWidth: 2,
                        pointHitRadius: 8,
                        pointRadius: function(context) {
                            // Make the last point (today's value) larger
                            return context.dataIndex === context.dataset.data.length - 1 ? 6 : 4;
                        },
                        pointHoverBorderWidth: 3,
                        pointShadowOffsetX: 1,
                        pointShadowOffsetY: 1,
                        pointShadowBlur: 5,
                        pointShadowColor: 'rgba(0, 0, 0, 0.1)'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: {
                        padding: {
                            top: 20,
                            right: 20,
                            bottom: 20,
                            left: 20
                        }
                    },
                    plugins: {
                        title: {
                            display: true,
                            text: `Last seven days (${changeDirection}${Math.abs(changePercentage).toFixed(2)}%)`,
                            color: changeColor,
                            font: {
                                size: 15,
                                weight: 'bold',
                                family: "'Inter', sans-serif"
                            },
                            padding: {
                                top: 10,
                                bottom: 25
                            }
                        },
                        legend: {
                            display: false
                        },
                        tooltip: {
                            enabled: true,
                            backgroundColor: tooltipStyle.backgroundColor,
                            titleColor: tooltipStyle.titleColor,
                            bodyColor: tooltipStyle.bodyColor,
                            borderColor: tooltipStyle.borderColor,
                            borderWidth: tooltipStyle.borderWidth,
                            padding: tooltipStyle.padding,
                            cornerRadius: tooltipStyle.cornerRadius,
                            titleFont: tooltipStyle.titleFont,
                            bodyFont: tooltipStyle.bodyFont,
                            boxPadding: tooltipStyle.boxPadding,
                            callbacks: {
                                label: function(context) {
                                    const isToday = context.dataIndex === context.dataset.data.length - 1;
                                    return (isToday ? 'Current: $' : '$') + context.raw.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ","); // USD
                                },
                                title: function(context) {
                                    const isToday = context[0].dataIndex === context[0].dataset.data.length - 1;
                                    return context[0].label + (isToday ? ' (Today)' : '');
                                }
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        grid: { color: 'rgba(203, 213, 225, 0.5)', borderDash: [5, 5], drawBorder: false },
                        ticks: {
                            font: { family: "'Inter', sans-serif", size: 12 },
                            padding: 10,
                            callback: function(value) {
                                return '$' + value.toLocaleString(); // USD
                            }
                        }
                    },
                    x: {
                        grid: { display: false, drawBorder: false },
                        ticks: {
                            font: { family: "'Inter', sans-serif", size: 12 },
                            padding: 10,
                            maxRotation: 45,
                            minRotation: 45,
                            autoSkip: true,
                            maxTicksLimit: 7
                        }
                    }
                },
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                elements: {
                    line: {
                        borderJoinStyle: 'round'
                    }
                }
            });

            document.getElementById('history-section').style.display = 'block';

        } catch (error) {
            console.error("Error loading historical chart:", error);
             document.getElementById('history-section').style.display = 'none'; // Hide section on error
        } // End catch for history chart
    } // End loadHistoryChart function

} catch (error) {
    console.error('Error loading initial portfolio data:', error);
     // Optionally display error to user
     loadingEl.textContent = 'Error loading data. Please refresh.';
     loadingEl.style.display = 'flex';
     portfolioTable.style.display = 'none';
} // End main try-catch

}); // End DOMContentLoaded
