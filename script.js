document.addEventListener('DOMContentLoaded', async () => {
    const apiKey = 'cvneau1r01qq3c7eq690cvneau1r01qq3c7eq69g';
    const REFRESH_INTERVAL = 2 * 60 * 1000; // 2 minutes
    const WARNING_TIMEOUT = 60 * 1000; // 1 minute before showing warning
    
    // Cache for price data from price-updater.onrender.com
    let priceDataCache = null;
    let priceDataTimestamp = null;
    
    // Track failed assets and their warning status
    const failedAssets = new Map(); // Map<assetName, {failureStartTime, warningShown}>
    const warningModals = new Map(); // Map<assetName, modalElement>
    
    // Create modal for warnings
    function createWarningModal(assetName) {
        let modal = warningModals.get(assetName);
        if (!modal) {
            modal = document.createElement('div');
            modal.className = 'asset-warning-modal';
            modal.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: white;
                padding: 20px;
                border-radius: 10px;
                max-width: 350px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                z-index: 10000;
                border-left: 4px solid #ef4444;
            `;
            document.body.appendChild(modal);
            warningModals.set(assetName, modal);
        }
        return modal;
    }
    
    function showWarningModal(assetName) {
        const modal = createWarningModal(assetName);
        modal.innerHTML = `
            <div style="display: flex; align-items: start; gap: 10px;">
                <div style="font-size: 24px;">⚠️</div>
                <div style="flex: 1;">
                    <h3 style="margin: 0 0 8px 0; color: #ef4444; font-size: 16px;">Asset Loading Warning</h3>
                    <p style="margin: 0 0 8px 0; font-size: 14px; color: #333;">
                        <strong>${assetName}</strong> did not load after 1 minute.
                    </p>
                    <p style="margin: 0; font-size: 12px; color: #666;">
                        Still retrying in the background...
                    </p>
                </div>
                <button onclick="this.closest('.asset-warning-modal').style.display='none'" style="
                    background: transparent;
                    border: none;
                    font-size: 20px;
                    cursor: pointer;
                    color: #999;
                    padding: 0;
                    width: 24px;
                    height: 24px;
                    line-height: 1;
                ">×</button>
            </div>
        `;
        modal.style.display = 'block';
    }
    
    function hideWarningModal(assetName) {
        const modal = warningModals.get(assetName);
        if (modal) {
            modal.style.display = 'none';
        }
    }
    
    // Retry function that keeps trying indefinitely - NEVER FAILS, NEVER THROWS
    async function fetchWithInfiniteRetry(fetchFn, assetName, retryDelay = 2000) {
        const startTime = Date.now();
        let attempt = 0;
        let warningShown = false;
        
        while (true) {
            try {
                const result = await fetchFn();
                // Success - clear failure tracking and hide warning
                failedAssets.delete(assetName);
                hideWarningModal(assetName);
                return result;
            } catch (error) {
                // SILENTLY catch all errors - never log, never throw, just retry
                attempt++;
                const elapsed = Date.now() - startTime;
                
                // Track failure start time
                if (!failedAssets.has(assetName)) {
                    failedAssets.set(assetName, { failureStartTime: Date.now(), warningShown: false });
                }
                
                const failureInfo = failedAssets.get(assetName);
                
                // Show warning after 1 minute (only once per asset)
                if (elapsed >= WARNING_TIMEOUT && !failureInfo.warningShown) {
                    showWarningModal(assetName);
                    failureInfo.warningShown = true;
                }
                
                // Wait before retrying (exponential backoff, max 10 seconds)
                const delay = Math.min(retryDelay * Math.pow(1.5, Math.min(attempt, 5)), 10000);
                await new Promise(resolve => setTimeout(resolve, delay));
                // Continue loop - NEVER throw, NEVER give up
            }
        }
    }
    
    // Portfolio configuration - will be loaded from JSON
    let originalEuroInvestment;
    let initialInvestments;
    let initialEuroInvestments;
    const assetColors = {
        'BINANCE:BTCUSDT': '#FF6384',
        'VOO': '#36A2EB',
        'NANC': '#36A2EB',
        'IAU': '#FFCE56',
        'SGOV': '#4BC0C0',
        'IWDE': '#36A2EB',
        'RLX': '#9966FF',
        'XUSE': '#36A2EB',
        'OTR': '#FFCE56',
        'EQY': '#36A2EB'
    };

    const assetClassLabels = {
        'BINANCE:BTCUSDT': 'Crypto',
        'VOO': 'Equities',
        'NANC': 'Equities',
        'IAU': 'Commodities',
        'SGOV': 'Savings',
        'IWDE': 'Equities',
        'RLX': 'Collectibles',
        'XUSE': 'Equities',
        'OTR': 'Commodities',
        'EQY': 'Equities'
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
    let otrCombinedMode = true; // true = OTR combined, false = individual URNU/COPX/PALL/SIVR
    let eqyCombinedMode = true; // true = EQY combined, false = individual VOO/NANC/IWDE/XUSE
    let isLoadingHistoryChart = false; // Prevent concurrent calls

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
    const floatingCurrencySwitchBtn = document.getElementById('floating-currency-switch-btn');
    const currencyPrimary = document.getElementById('currency-primary');
    const currencySecondary = document.getElementById('currency-secondary');
    const tableHeaders = portfolioTable.querySelectorAll('th');
    const timeframeSelectEl = document.getElementById('timeframe-select'); // New timeframe selector
    
    // CBBI elements
    const cbbiValueEl = document.getElementById('cbbi-value');
    const cbbiDateEl = document.getElementById('cbbi-date');



    function createYtdSection() {
        // Remove existing section
        const existing = document.querySelector('.ytd-card');
        if (existing) existing.remove();

        // Find the historical-pnl-card (Historical Returns) to insert after it
        const historicalReturnsSection = document.querySelector('.historical-pnl-card');
        if (!historicalReturnsSection) return;

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

        // Insert after the Historical Returns section
        historicalReturnsSection.parentNode.insertBefore(ytdCard, historicalReturnsSection.nextSibling);

        updateYtdDisplay();
    }



    function updateYtdDisplay() {
        const ytdDate = document.getElementById('ytd-date');

        // Calculate average yearly return based on current portfolio state
        const portfolioStartDate = new Date('2024-10-01');
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
                
                // Exclude SGOV and RLX for the second calculation (risk assets)
                if (symbol !== 'SGOV' && symbol !== 'RLX') {
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
            
            // Risk assets (excluding SGOV) should use October 1, 2024 as start date
            const riskAssetsStartDate = new Date('2024-10-01');
            const daysSinceRiskStart = (currentDate - riskAssetsStartDate) / (1000 * 60 * 60 * 24);
            const yearsSinceRiskStart = daysSinceRiskStart / 365.25;
            
            if (yearsSinceRiskStart > 0) {
                exclSgovValue = ((1 + totalReturnExclSgov) ** (1 / yearsSinceRiskStart) - 1) * 100;
            }
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

    function getAssetStartDate(assetName) {
        // Return the correct start date for each asset
        switch (assetName) {
            case 'BINANCE:BTCUSDT':
                return new Date('2024-10-01');
            case 'VOO':
            case 'NANC':
            case 'IAU':
            case 'SGOV':
                return new Date('2025-03-01');
            case 'IWDE':
                return new Date('2025-09-04');
            case 'RLX':
                return new Date('2025-12-24');
            case 'XUSE':
            case 'OTR':
            case 'EQY':
            case 'URNU':
            case 'COPX':
            case 'PALL':
            case 'SIVR':
            case 'VOO':
            case 'NANC':
            case 'IWDE':
                return new Date('2026-01-26'); // Today's date as start date for new assets
            default:
                return new Date('2024-10-01'); // Default fallback
        }
    }

    function updateAssetReturns() {
        const ytdAssets = document.getElementById('ytd-assets');
        if (!ytdAssets) return;

        // Calculate annualized returns for each asset
        const assetReturns = {};
        // Use ordered assets list to ensure correct order and filtering
        let assetNames = ['BINANCE:BTCUSDT', 'IAU'];
        if (eqyCombinedMode) {
            assetNames.push('EQY');
        } else {
            assetNames.push('VOO', 'NANC', 'IWDE', 'XUSE');
        }
        assetNames.push('SGOV', 'RLX');
        if (otrCombinedMode) {
            assetNames.push('OTR');
        } else {
            assetNames.push('URNU', 'COPX', 'PALL', 'SIVR');
        }
        
        const currentDate = new Date();

        assetNames.forEach(assetName => {
            // Only process if asset exists in portfolioData
            if (!portfolioData[assetName]) return;
            const data = portfolioData[assetName];
            if (data && !data.error && !excludedAssets.has(assetName)) {
                const pnl = displayCurrency === 'USD' ? data.pnl : data.pnlEur;
                const initialInvestment = displayCurrency === 'USD' ? data.initialInvestment : data.initialEuroInvestment;
                
                if (initialInvestment > 0) {
                    // Calculate time period for this specific asset
                    const assetStartDate = getAssetStartDate(assetName);
                    const daysSinceStart = (currentDate - assetStartDate) / (1000 * 60 * 60 * 24);
                    const yearsSinceStart = daysSinceStart / 365.25;
                    
                    // Only annualize if at least 1 month (30 days) has passed
                    if (daysSinceStart >= 30) {
                        const currentPnlPercentage = (pnl / initialInvestment) * 100;
                        const totalReturn = currentPnlPercentage / 100;
                        const annualizedReturn = ((1 + totalReturn) ** (1 / yearsSinceStart) - 1) * 100;
                        assetReturns[assetName] = annualizedReturn;
                    } else {
                        // For assets with less than 1 month, show simple return (not annualized)
                        const currentPnlPercentage = (pnl / initialInvestment) * 100;
                        assetReturns[assetName] = currentPnlPercentage;
                    }
                }
            }
        });

        // Use consistent order: BTC, IAU, then EQY/equities, SGOV, RLX, then OTR/metals
        let orderedAssets = ['BINANCE:BTCUSDT', 'IAU'];
        if (eqyCombinedMode) {
            orderedAssets.push('EQY');
        } else {
            orderedAssets.push('VOO', 'NANC', 'IWDE', 'XUSE');
        }
        orderedAssets.push('SGOV', 'RLX');
        if (otrCombinedMode) {
            orderedAssets.push('OTR');
        } else {
            orderedAssets.push('URNU', 'COPX', 'PALL', 'SIVR');
        }
        
        let html = '';
        html += '<div class="ytd-assets-grid">';
        
        orderedAssets.forEach(assetName => {
            if (assetReturns[assetName] === undefined || assetReturns[assetName] === null) return; // Skip if no data for this asset
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

        // Find the asset-returns-card (Price Action) to insert after it
        const priceActionSection = document.querySelector('.asset-returns-card');
        if (!priceActionSection) return;

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

        // Insert after the Price Action section
        priceActionSection.parentNode.insertBefore(avgBuyPriceCard, priceActionSection.nextSibling);
        
        updateAverageBuyPriceDisplay();
    }

    function updateAverageBuyPriceDisplay() {
        const contentEl = document.getElementById('avg-buy-price-content');
        if (!contentEl) return;

        let assets = ['BINANCE:BTCUSDT', 'IAU'];
        if (eqyCombinedMode) {
            assets.push('EQY');
        } else {
            assets.push('VOO', 'NANC', 'IWDE', 'XUSE');
        }
        if (otrCombinedMode) {
            assets.push('OTR');
        } else {
            assets.push('URNU', 'COPX', 'PALL', 'SIVR');
        }
        let html = '<div class="avg-buy-price-grid">';
        
        assets.forEach(symbol => {
            // Get shares and initial investment - handle combined assets
            let shares = 0;
            let initialInvestment = 0;
            
            if (otrCombinedMode && symbol === 'OTR') {
                shares = (portfolio['URNU'] || 0) + (portfolio['COPX'] || 0) + (portfolio['PALL'] || 0) + (portfolio['SIVR'] || 0);
                if (displayCurrency === 'USD') {
                    initialInvestment = (initialInvestments['URNU'] || 0) + (initialInvestments['COPX'] || 0) + 
                                      (initialInvestments['PALL'] || 0) + (initialInvestments['SIVR'] || 0);
                } else {
                    initialInvestment = (initialEuroInvestments['URNU'] || 0) + (initialEuroInvestments['COPX'] || 0) + 
                                      (initialEuroInvestments['PALL'] || 0) + (initialEuroInvestments['SIVR'] || 0);
                }
            } else if (eqyCombinedMode && symbol === 'EQY') {
                shares = (portfolio['VOO'] || 0) + (portfolio['NANC'] || 0) + (portfolio['IWDE'] || 0) + (portfolio['XUSE'] || 0);
                if (displayCurrency === 'USD') {
                    initialInvestment = (initialInvestments['VOO'] || 0) + (initialInvestments['NANC'] || 0) + 
                                      (initialInvestments['IWDE'] || 0) + (initialInvestments['XUSE'] || 0);
                } else {
                    initialInvestment = (initialEuroInvestments['VOO'] || 0) + (initialEuroInvestments['NANC'] || 0) + 
                                      (initialEuroInvestments['IWDE'] || 0) + (initialEuroInvestments['XUSE'] || 0);
                }
            } else {
                shares = portfolio[symbol] || 0;
                initialInvestment = displayCurrency === 'USD' ? 
                    (initialInvestments[symbol] || 0) : 
                    (initialEuroInvestments[symbol] || 0);
            }
            
            if (shares && initialInvestment) {
                const avgBuyPrice = initialInvestment / shares;
                const assetData = portfolioData[symbol];
                const currentPrice = assetData?.price;
                
                if (currentPrice) {
                    // Handle currency conversion for EUR-denominated assets
                    let currentPriceInCurrency;
                    if (assetData?.isEurDenominated) {
                        // For EUR-denominated assets (like IWDE), convert price based on display currency
                        currentPriceInCurrency = displayCurrency === 'USD' ? 
                            currentPrice * usdToEurRate : 
                            currentPrice;
                    } else {
                        // For USD-denominated assets, convert as before
                        currentPriceInCurrency = displayCurrency === 'USD' ? 
                            currentPrice : 
                            currentPrice / usdToEurRate;
                    }
                    
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
            // Failed to fetch exchange rate, using value of 1.0
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
        // Use timestamp from price data if available, otherwise use current time
        if (priceDataTimestamp) {
            const timestampDate = new Date(priceDataTimestamp);
            lastUpdatedEl.textContent = timestampDate.toLocaleString();
        } else {
            lastUpdatedEl.textContent = new Date().toLocaleString();
        }
        recalculateTotals();
        createPieChart();
        updateAverageBuyPriceDisplay();
        updateYtdDisplay();
        if (typeof loadHistoryChart === 'function') {
            loadHistoryChart();
        }
        if (typeof loadAssetReturns === 'function') {
            loadAssetReturns();
        }
    }
    
    // Fetch all prices from price-updater.onrender.com (single call)
    async function fetchAllPrices() {
        try {
            // Use CORS proxy to avoid CORS issues
            const url = 'https://price-updater.onrender.com/';
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
            const response = await fetch(proxyUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            const data = await response.json();
            priceDataCache = data.assets;
            priceDataTimestamp = data.timestamp;
            return data;
        } catch (error) {
            console.error('Error fetching prices from price-updater:', error);
            throw error;
        }
    }
    
    // Get price from cache (with symbol mapping)
    function getPriceFromCache(symbol) {
        if (!priceDataCache) {
            return null;
        }
        
        // Map internal symbols to cache keys
        let cacheKey = symbol;
        
        // Handle special symbol mappings
        if (symbol === 'BINANCE:BTCUSDT') {
            cacheKey = 'BINANCE:BTCUSDT';
        } else if (symbol === 'IWDE' || symbol === 'IWDE.L') {
            cacheKey = 'IWDE';
        } else if (symbol === 'XUSE' || symbol === 'XUSE.AS') {
            cacheKey = 'XUSE';
        } else if (symbol === 'URNU' || symbol === 'URNU.L') {
            cacheKey = 'URNU';
        } else if (symbol === 'COPX' || symbol === 'COPX.L') {
            cacheKey = 'COPX';
        }
        // VOO, NANC, PALL, SIVR, IAU, SGOV should match directly
        
        const assetData = priceDataCache[cacheKey];
        if (assetData) {
            return {
                price: assetData.price,
                percentChange: assetData.percentChange
            };
        }
        
        return null;
    }

    async function fetchStockData() {
        loadingEl.style.display = 'flex';
        portfolioTable.style.display = 'none';
        portfolioDataEl.innerHTML = '';

        await fetchExchangeRate();
        
        // Fetch all prices from price-updater.onrender.com (single call)
        await fetchWithInfiniteRetry(fetchAllPrices, 'price-updater');

        let completedRequests = 0;
        const otrComponentSymbols = ['URNU', 'COPX', 'PALL', 'SIVR'];
        const eqyComponentSymbols = ['VOO', 'NANC', 'IWDE', 'XUSE'];
        // Clear portfolioData to ensure we don't use stale data
        portfolioData = {};

        let portfolioKeys, totalRequests, otrPromise, eqyPromise;
        
        // Filter out components based on mode
        let filteredPortfolio = Object.keys(portfolio);
        if (otrCombinedMode) {
            filteredPortfolio = filteredPortfolio.filter(symbol => !otrComponentSymbols.includes(symbol));
        }
        if (eqyCombinedMode) {
            filteredPortfolio = filteredPortfolio.filter(symbol => !eqyComponentSymbols.includes(symbol));
        }
        
        portfolioKeys = filteredPortfolio;
        totalRequests = portfolioKeys.length;
        if (otrCombinedMode) totalRequests += 1; // +1 for OTR
        if (eqyCombinedMode) totalRequests += 1; // +1 for EQY
        
        if (otrCombinedMode) {

            // Get OTR component shares and initial investments
            const otrShares = {
                'URNU': portfolio['URNU'] || 0,
                'COPX': portfolio['COPX'] || 0,
                'PALL': portfolio['PALL'] || 0,
                'SIVR': portfolio['SIVR'] || 0
            };
            const otrInitialInvestment = (initialInvestments['URNU'] || 0) + (initialInvestments['COPX'] || 0) + 
                                         (initialInvestments['PALL'] || 0) + (initialInvestments['SIVR'] || 0);
            const otrInitialEuroInvestment = (initialEuroInvestments['URNU'] || 0) + (initialEuroInvestments['COPX'] || 0) + 
                                             (initialEuroInvestments['PALL'] || 0) + (initialEuroInvestments['SIVR'] || 0);

            // Create OTR promise - combine URNU, COPX, PALL, SIVR
            otrPromise = (() => {
                const otrComponents = [
                    { symbol: 'URNU.L', name: 'URNU', shares: otrShares.URNU },
                    { symbol: 'COPX.L', name: 'COPX', shares: otrShares.COPX },
                    { symbol: 'PALL', name: 'PALL', shares: otrShares.PALL },
                    { symbol: 'SIVR', name: 'SIVR', shares: otrShares.SIVR }
                ];
                
                // Get prices from cache (no API calls needed)
                const componentPromises = otrComponents.map(comp => {
                    const fetchFn = async () => {
                        const priceData = getPriceFromCache(comp.name);
                        if (!priceData) {
                            throw new Error(`Price data not found for ${comp.name}`);
                        }
                        return { name: comp.name, price: priceData.price, percentChange: priceData.percentChange, shares: comp.shares };
                    };
                    return fetchWithInfiniteRetry(fetchFn, comp.name);
                });
                
                return Promise.all(componentPromises)
                    .then(components => {
                        // Calculate combined metrics based on actual shares and prices
                        let totalValue = 0;
                        let totalShares = 0;
                        let totalValueWeightedPercentChange = 0;
                        
                        // Store individual component data even in combined mode (for toggling without refetch)
                        components.forEach(comp => {
                            if (!comp.error && comp.price > 0) {
                                const compShares = comp.shares || 0;
                                const compValue = comp.price * compShares;
                                const compValueEur = compValue / usdToEurRate;
                                const compInitialInvestment = initialInvestments[comp.name] || 0;
                                const compInitialEuroInvestment = initialEuroInvestments[comp.name] || 0;
                                
                                portfolioData[comp.name] = {
                                    shares: compShares,
                                    price: comp.price,
                                    value: compValue,
                                    valueEur: compValueEur,
                                    pnl: compValue - compInitialInvestment,
                                    pnlEur: compValueEur - compInitialEuroInvestment,
                                    percentChange: comp.percentChange,
                                    initialInvestment: compInitialInvestment,
                                    initialEuroInvestment: compInitialEuroInvestment,
                                    displayPrice: comp.price,
                                    isEurDenominated: false
                                };
                                
                                if (compShares > 0) {
                                    const componentValue = compValue;
                                    totalValue += componentValue;
                                    totalShares += compShares;
                                    totalValueWeightedPercentChange += componentValue * comp.percentChange;
                                }
                            }
                        });
                        
                        // If no shares, create empty OTR entry
                        if (totalShares === 0) {
                            portfolioData['OTR'] = {
                                shares: 0, price: 0, value: 0, pnl: 0, valueEur: 0, pnlEur: 0,
                                percentChange: 0, initialInvestment: otrInitialInvestment, 
                                initialEuroInvestment: otrInitialEuroInvestment,
                                displayPrice: 0, isEurDenominated: false
                            };
                            completedRequests++;
                            if (completedRequests === totalRequests) {
                                finishLoading();
                            }
                            return;
                        }
                        
                        // Calculate weighted average price
                        const avgPrice = totalValue / totalShares;
                        
                        // Calculate weighted average percent change (weighted by value)
                        const avgPercentChange = totalValue > 0 ? totalValueWeightedPercentChange / totalValue : 0;
                        
                        // Calculate values
                        const value = totalValue; // Total value in USD
                        const valueEur = value / usdToEurRate; // Convert to EUR
                        
                        // Calculate PnL by summing individual component PnLs (more accurate)
                        // This ensures OTR PnL matches the sum of individual component PnLs
                        const otrComponentSymbols = ['URNU', 'COPX', 'PALL', 'SIVR'];
                        let totalPnl = 0;
                        let totalPnlEur = 0;
                        let totalInitialInvestment = 0;
                        let totalInitialEuroInvestment = 0;
                        
                        otrComponentSymbols.forEach(compName => {
                            const compData = portfolioData[compName];
                            if (compData && !compData.error) {
                                totalPnl += compData.pnl || 0;
                                totalPnlEur += compData.pnlEur || 0;
                                totalInitialInvestment += compData.initialInvestment || 0;
                                totalInitialEuroInvestment += compData.initialEuroInvestment || 0;
                            }
                        });
                        
                        // Use calculated PnL from components, or fallback to direct calculation
                        const pnl = totalPnl !== 0 ? totalPnl : (value - otrInitialInvestment);
                        const pnlEur = totalPnlEur !== 0 ? totalPnlEur : (valueEur - otrInitialEuroInvestment);
                        
                        portfolioData['OTR'] = {
                            shares: totalShares, price: avgPrice, value, pnl, valueEur, pnlEur,
                            percentChange: avgPercentChange, 
                            initialInvestment: totalInitialInvestment || otrInitialInvestment, 
                            initialEuroInvestment: totalInitialEuroInvestment || otrInitialEuroInvestment,
                            displayPrice: avgPrice, isEurDenominated: false
                        };
                    })
                    .finally(() => {
                        completedRequests++;
                        if (completedRequests === totalRequests) {
                            finishLoading();
                        }
                    });
        })();
        } else {
            otrPromise = Promise.resolve(); // No-op promise for individual mode
        }

        // Handle EQY combination
        if (eqyCombinedMode) {
            // Get EQY component shares and initial investments
            const eqyShares = {
                'VOO': portfolio['VOO'] || 0,
                'NANC': portfolio['NANC'] || 0,
                'IWDE': portfolio['IWDE'] || 0,
                'XUSE': portfolio['XUSE'] || 0
            };
            const eqyInitialInvestment = (initialInvestments['VOO'] || 0) + (initialInvestments['NANC'] || 0) + 
                                         (initialInvestments['IWDE'] || 0) + (initialInvestments['XUSE'] || 0);
            const eqyInitialEuroInvestment = (initialEuroInvestments['VOO'] || 0) + (initialEuroInvestments['NANC'] || 0) + 
                                             (initialEuroInvestments['IWDE'] || 0) + (initialEuroInvestments['XUSE'] || 0);

            // Create EQY promise - combine VOO, NANC, IWDE, XUSE
            eqyPromise = (() => {
                const eqyComponents = [
                    { symbol: 'VOO', name: 'VOO', shares: eqyShares.VOO, useYahooFinance: false },
                    { symbol: 'NANC', name: 'NANC', shares: eqyShares.NANC, useYahooFinance: false },
                    { symbol: 'IWDE.L', name: 'IWDE', shares: eqyShares.IWDE, useYahooFinance: true },
                    { symbol: 'XUSE.AS', name: 'XUSE', shares: eqyShares.XUSE, useYahooFinance: true }
                ];
                
                // Get prices from cache (no API calls needed)
                const componentPromises = eqyComponents.map(comp => {
                    const fetchFn = async () => {
                        const priceData = getPriceFromCache(comp.name);
                        if (!priceData) {
                            throw new Error(`Price data not found for ${comp.name}`);
                        }
                        // IWDE is EUR-denominated, others are USD
                        const isEurDenominated = comp.symbol === 'IWDE.L';
                        return { name: comp.name, price: priceData.price, percentChange: priceData.percentChange, shares: comp.shares, isEurDenominated };
                    };
                    return fetchWithInfiniteRetry(fetchFn, comp.name);
                });
                
                return Promise.all(componentPromises)
                    .then(components => {
                        // Calculate combined metrics based on actual shares and prices
                        let totalValue = 0;
                        let totalShares = 0;
                        let totalValueWeightedPercentChange = 0;
                        
                        // Store individual component data even in combined mode (for toggling without refetch)
                        components.forEach(comp => {
                            if (!comp.error && comp.price > 0) {
                                const compShares = comp.shares || 0;
                                let compValue, compValueEur;
                                
                                // Handle EUR-denominated assets (IWDE only - XUSE is USD-denominated)
                                if (comp.isEurDenominated) {
                                    compValueEur = comp.price * compShares;
                                    compValue = compValueEur * usdToEurRate; // Convert to USD
                                } else {
                                    compValue = comp.price * compShares;
                                    compValueEur = compValue / usdToEurRate;
                                }
                                
                                const compInitialInvestment = initialInvestments[comp.name] || 0;
                                const compInitialEuroInvestment = initialEuroInvestments[comp.name] || 0;
                                
                                portfolioData[comp.name] = {
                                    shares: compShares,
                                    price: comp.price,
                                    value: compValue,
                                    valueEur: compValueEur,
                                    pnl: compValue - compInitialInvestment,
                                    pnlEur: compValueEur - compInitialEuroInvestment,
                                    percentChange: comp.percentChange,
                                    initialInvestment: compInitialInvestment,
                                    initialEuroInvestment: compInitialEuroInvestment,
                                    displayPrice: comp.price,
                                    isEurDenominated: comp.isEurDenominated
                                };
                                
                                if (compShares > 0) {
                                    totalValue += compValue;
                                    totalShares += compShares;
                                    totalValueWeightedPercentChange += compValue * comp.percentChange;
                                }
                            }
                        });
                        
                        // If no shares, create empty EQY entry
                        if (totalShares === 0) {
                            portfolioData['EQY'] = {
                                shares: 0, price: 0, value: 0, pnl: 0, valueEur: 0, pnlEur: 0,
                                percentChange: 0, initialInvestment: eqyInitialInvestment, 
                                initialEuroInvestment: eqyInitialEuroInvestment,
                                displayPrice: 0, isEurDenominated: false
                            };
                            completedRequests++;
                            if (completedRequests === totalRequests) {
                                finishLoading();
                            }
                            return;
                        }
                        
                        // Calculate weighted average price
                        const avgPrice = totalValue / totalShares;
                        
                        // Calculate weighted average percent change (weighted by value)
                        const avgPercentChange = totalValue > 0 ? totalValueWeightedPercentChange / totalValue : 0;
                        
                        // Calculate values
                        const value = totalValue; // Total value in USD
                        const valueEur = value / usdToEurRate; // Convert to EUR
                        
                        // Calculate PnL by summing individual component PnLs (more accurate)
                        // This ensures EQY PnL matches the sum of individual component PnLs
                        const eqyComponentSymbols = ['VOO', 'NANC', 'IWDE', 'XUSE'];
                        let totalPnl = 0;
                        let totalPnlEur = 0;
                        let totalInitialInvestment = 0;
                        let totalInitialEuroInvestment = 0;
                        
                        eqyComponentSymbols.forEach(compName => {
                            const compData = portfolioData[compName];
                            if (compData && !compData.error) {
                                totalPnl += compData.pnl || 0;
                                totalPnlEur += compData.pnlEur || 0;
                                totalInitialInvestment += compData.initialInvestment || 0;
                                totalInitialEuroInvestment += compData.initialEuroInvestment || 0;
                            }
                        });
                        
                        // Use calculated PnL from components, or fallback to direct calculation
                        const pnl = totalPnl !== 0 ? totalPnl : (value - eqyInitialInvestment);
                        const pnlEur = totalPnlEur !== 0 ? totalPnlEur : (valueEur - eqyInitialEuroInvestment);
                        
                        portfolioData['EQY'] = {
                            shares: totalShares, price: avgPrice, value, pnl, valueEur, pnlEur,
                            percentChange: avgPercentChange, 
                            initialInvestment: totalInitialInvestment || eqyInitialInvestment, 
                            initialEuroInvestment: totalInitialEuroInvestment || eqyInitialEuroInvestment,
                            displayPrice: avgPrice, isEurDenominated: false
                        };
                    })
                    .finally(() => {
                        completedRequests++;
                        if (completedRequests === totalRequests) {
                            finishLoading();
                        }
                    });
        })();
        } else {
            eqyPromise = Promise.resolve(); // No-op promise for individual mode
        }

        // Process all other assets
        const promises = portfolioKeys.map(symbol => {
            const shares = portfolio[symbol];
            const initialInvestment = initialInvestments[symbol];
            const initialEuroInvestment = initialEuroInvestments[symbol];
            
            // Special handling for RLX - fetch from JSON file with infinite retry
            if (symbol === 'RLX') {
                const fetchFn = async () => {
                    const response = await fetch('rlx_price.json');
                    if (!response.ok) { throw new Error(`HTTP error! Status: ${response.status}`); }
                    const data = await response.json();
                    const price = data.price;
                    const percentChange = data['24h_change'] || 0; // Use 24h change from JSON
                    
                    // RLX is now EUR-denominated
                    const valueEur = price * shares;
                    const value = valueEur * usdToEurRate; // Convert to USD for consistency
                    const pnlEur = valueEur - initialEuroInvestment;
                    const pnl = value - initialInvestment;
                    const displayPrice = price;
                    
                    portfolioData[symbol] = {
                        shares, price, value, pnl, valueEur, pnlEur,
                        percentChange, initialInvestment, initialEuroInvestment,
                        displayPrice, isEurDenominated: true
                    };
                };
                
                return fetchWithInfiniteRetry(fetchFn, symbol)
                    .finally(() => {
                        completedRequests++;
                        if (completedRequests === totalRequests) {
                            finishLoading();
                        }
                    });
            }
            
            // Map internal symbols to API symbols
            let apiSymbol = symbol;
            let useYahooFinance = false;
            
            if (symbol === 'BINANCE:BTCUSDT') {
                apiSymbol = 'BINANCE:BTCUSDT'; // Keep Bitcoin on Finnhub
                useYahooFinance = false;
            } else if (symbol === 'IWDE' && !eqyCombinedMode) {
                apiSymbol = 'IWDE.L'; // iShares World Developed Markets on London exchange
                useYahooFinance = true;
            } else if (symbol === 'XUSE' && !eqyCombinedMode) {
                apiSymbol = 'XUSE.AS'; // iShares MSCI World ex-USA UCITS ETF on Amsterdam Euronext
                useYahooFinance = true;
            } else if (symbol === 'VOO' && !eqyCombinedMode) {
                apiSymbol = 'VOO';
                useYahooFinance = false;
            } else if (symbol === 'NANC' && !eqyCombinedMode) {
                apiSymbol = 'NANC';
                useYahooFinance = false;
            } else if (symbol === 'URNU') {
                apiSymbol = 'URNU.L'; // Uranium UCITS ETF on London Stock Exchange
                useYahooFinance = true;
            } else if (symbol === 'COPX') {
                apiSymbol = 'COPX.L'; // Global X Copper Miners ETF on London Stock Exchange
                useYahooFinance = true;
            } else if (symbol === 'PALL') {
                apiSymbol = 'PALL'; // abrdn Physical Palladium Shares ETF on US exchange
                useYahooFinance = true;
            } else if (symbol === 'SIVR') {
                apiSymbol = 'SIVR'; // abrdn Physical Silver Shares ETF on US exchange
                useYahooFinance = true;
            }
            
            const fetchFn = async () => {
                // Get price from cache instead of API calls
                const priceData = getPriceFromCache(symbol);
                if (!priceData) {
                    throw new Error(`Price data not found for ${symbol}`);
                }
                
                const price = priceData.price;
                const percentChange = priceData.percentChange;
                
                // Handle currency conversion for EUR-denominated assets
                let value, valueEur, pnl, pnlEur, displayPrice;
                
                if ((symbol === 'IWDE' && !eqyCombinedMode) || (symbol === 'XUSE' && !eqyCombinedMode)) {
                    // IWDE and XUSE are EUR-denominated, so price is in EUR
                    valueEur = price * shares; // Value in EUR
                    value = valueEur * usdToEurRate; // Convert to USD
                    pnlEur = valueEur - initialEuroInvestment;
                    pnl = value - initialInvestment;
                    // Store the original EUR price for display
                    displayPrice = price; // This is in EUR
                } else {
                    // Other assets are USD-denominated
                    value = price * shares; // Value in USD
                    valueEur = value / usdToEurRate; // Convert to EUR
                    pnl = value - initialInvestment;
                    pnlEur = valueEur - initialEuroInvestment;
                    displayPrice = price; // This is in USD
                }

                portfolioData[symbol] = {
                    shares, price, value, pnl, valueEur, pnlEur,
                    percentChange, initialInvestment, initialEuroInvestment,
                    displayPrice, isEurDenominated: (symbol === 'IWDE' && !eqyCombinedMode) || (symbol === 'XUSE' && !eqyCombinedMode)
                };
            };
            
            return fetchWithInfiniteRetry(fetchFn, symbol)
                .finally(() => {
                    completedRequests++;
                    if (completedRequests === totalRequests) {
                        finishLoading();
                    }
                });
        });

        const allPromises = [];
        if (otrCombinedMode) allPromises.push(otrPromise);
        if (eqyCombinedMode) allPromises.push(eqyPromise);
        allPromises.push(...promises);
        await Promise.allSettled(allPromises);
        setupAutoRefresh();
        fetchCbbiData(); // Fetch CBBI data after stock data
    }

    function createTableRow(symbol) {
        const data = portfolioData[symbol];
        const displaySymbol = symbol.includes('BINANCE:') ? 'BTC' : symbol;
        const row = document.createElement('tr');
        row.dataset.symbol = symbol;

        // Don't show rows for assets that haven't loaded yet - they're still retrying
        if (!data || data.error) {
            return null; // Return null so row isn't created - asset is still loading
        }

        const primaryCurrency = displayCurrency;
        
        // Handle price display for EUR-denominated assets
        let pricePrimary;
        if (data.isEurDenominated) {
            // For EUR-denominated assets (like IWDE), price is already in EUR
            pricePrimary = primaryCurrency === 'USD' ? data.price * usdToEurRate : data.price;
        } else {
            // For USD-denominated assets, convert as before
            pricePrimary = primaryCurrency === 'USD' ? data.price : data.price / usdToEurRate;
        }
        
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
        
        // Update historical returns display when currency changes
        calculateHistoricalReturns();
        
        // Update asset returns display when currency changes
        updateAssetReturnsDisplay();
    }

    function updateDualCurrencyButton() {
        if (displayCurrency === 'USD') {
            currencyPrimary.textContent = '$';
            currencySecondary.textContent = '€';
            currencyPrimary.className = 'currency-primary';
            currencySecondary.className = 'currency-secondary';
        } else {
            currencyPrimary.textContent = '€';
            currencySecondary.textContent = '$';
            currencyPrimary.className = 'currency-primary';
            currencySecondary.className = 'currency-secondary';
        }
    }

    function toggleCurrencyWithAnimation() {
        // Add animation classes
        currencyPrimary.classList.add('currency-swap-out');
        currencySecondary.classList.add('currency-swap-in');
        
        // Wait for animation to reach midpoint, then swap content
        setTimeout(() => {
            toggleCurrency();
            
            // Remove animation classes and reset
            setTimeout(() => {
                currencyPrimary.classList.remove('currency-swap-out');
                currencySecondary.classList.remove('currency-swap-in');
            }, 150);
        }, 150);
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

    async function toggleOTRView() {
        otrCombinedMode = !otrCombinedMode;
        
        // Update button text and active state
        const otrToggleBtn = document.getElementById('mtl-toggle-btn');
        const otrToggleText = document.getElementById('mtl-toggle-text');
        if (otrToggleBtn && otrToggleText) {
            otrToggleText.textContent = otrCombinedMode ? 'OTR' : 'Individual';
            otrToggleBtn.title = otrCombinedMode ? 'Switch to individual metals view' : 'Switch to OTR (combined) view';
            otrToggleBtn.classList.toggle('active', otrCombinedMode);
        }
        
        // Just recalculate from existing data - no need to fetch new prices
        recalculateTotals();
        updateAverageBuyPriceDisplay();
        updateYtdDisplay();
        createPieChart();
        if (typeof loadHistoryChart === 'function') {
            loadHistoryChart();
        }
        if (typeof loadAssetReturns === 'function') {
            loadAssetReturns();
        }
        if (typeof calculateHistoricalReturns === 'function') {
            calculateHistoricalReturns();
        }
    }

    async function toggleEQYView() {
        eqyCombinedMode = !eqyCombinedMode;
        
        // Update button text and active state
        const eqyToggleBtn = document.getElementById('eqy-toggle-btn');
        const eqyToggleText = document.getElementById('eqy-toggle-text');
        if (eqyToggleBtn && eqyToggleText) {
            eqyToggleText.textContent = eqyCombinedMode ? 'EQY' : 'Individual';
            eqyToggleBtn.title = eqyCombinedMode ? 'Switch to individual equities view' : 'Switch to EQY (combined) view';
            eqyToggleBtn.classList.toggle('active', eqyCombinedMode);
        }
        
        // Just recalculate from existing data - no need to fetch new prices
        recalculateTotals();
        updateAverageBuyPriceDisplay();
        updateYtdDisplay();
        createPieChart();
        if (typeof loadHistoryChart === 'function') {
            loadHistoryChart();
        }
        if (typeof loadAssetReturns === 'function') {
            loadAssetReturns();
        }
        if (typeof calculateHistoricalReturns === 'function') {
            calculateHistoricalReturns();
        }
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
        
        // Define component symbols
        const otrComponentSymbols = ['URNU', 'COPX', 'PALL', 'SIVR'];
        const eqyComponentSymbols = ['VOO', 'NANC', 'IWDE', 'XUSE'];

        // First, collect all assets with their data
        const assetsArray = [];
        let allSymbols = Object.keys(portfolioData);
        
        // Filter out components based on mode (OTR/EQY are already in portfolioData from fetchStockData)
        if (otrCombinedMode) {
            allSymbols = allSymbols.filter(symbol => !otrComponentSymbols.includes(symbol));
        } else {
            // In individual mode, filter out OTR
            allSymbols = allSymbols.filter(symbol => symbol !== 'OTR');
        }
        if (eqyCombinedMode) {
            allSymbols = allSymbols.filter(symbol => !eqyComponentSymbols.includes(symbol));
        } else {
            // In individual mode, filter out EQY
            allSymbols = allSymbols.filter(symbol => symbol !== 'EQY');
        }
        
        allSymbols.forEach(symbol => {
            const assetData = portfolioData[symbol];
            if (!excludedAssets.has(symbol) && assetData && !assetData.error) {
                let value;
                if (pieChartViewMode === 'market') {
                    value = displayCurrency === 'USD' ? (assetData.value || 0) : (assetData.valueEur || 0);
                } else {
                    value = displayCurrency === 'USD' ? (assetData.initialInvestment || 0) : (assetData.initialEuroInvestment || 0);
                }
                totalValue += value;
                
                // Determine asset class and color
                let assetClass = assetClassLabels[symbol] || 'Other';
                let assetColor = assetColors[symbol];
                
                // For OTR components in individual mode, use Commodities
                if (otrComponentSymbols.includes(symbol)) {
                    assetClass = 'Commodities';
                    assetColor = '#FFCE56';
                }
                // For EQY components in individual mode, use Equities
                if (eqyComponentSymbols.includes(symbol)) {
                    assetClass = 'Equities';
                    assetColor = '#36A2EB';
                }
                
                assetsArray.push({
                    symbol: symbol,
                    displaySymbol: symbol.includes('BINANCE:') ? 'BTC' : symbol,
                    value: value,
                    assetClass: assetClass,
                    color: assetColor
                });
            }
        });

        // Sort assets by class first, then by value (descending) within each class
        // This groups similar colored assets together
        assetsArray.sort((a, b) => {
            // First sort by asset class
            if (a.assetClass !== b.assetClass) {
                return a.assetClass.localeCompare(b.assetClass);
            }
            // Within same class, sort by value (descending)
            return b.value - a.value;
        });

        // Build chart data in sorted order
        assetsArray.forEach(asset => {
            const percentage = totalValue > 0 ? (asset.value / totalValue * 100) : 0;
            
            labels.push(asset.displaySymbol);
            data.push(asset.value);
            backgroundColors.push(asset.color);
            assetTooltips[asset.displaySymbol] = {
                value: asset.value,
                percentage: percentage,
                class: asset.assetClass
            };
        });

        const currentCtx = currentPieChartEl.getContext('2d');
        if (currentPieChart) {
            currentPieChart.data.labels = labels;
            currentPieChart.data.datasets[0].data = data;
            currentPieChart.data.datasets[0].backgroundColor = backgroundColors;
            // Update the tooltip callback to reflect the current view mode
            currentPieChart.options.plugins.tooltip.displayColors = false;
            currentPieChart.options.plugins.tooltip.callbacks.title = function(context) {
                return context[0].label;
            };
            currentPieChart.options.plugins.tooltip.callbacks.label = function(context) {
                const value = context.raw;
                const percentage = assetTooltips[context.label].percentage;
                const currencySymbol = displayCurrency === 'USD' ? '$' : '€';
                return [ `${currencySymbol}${value.toFixed(2)}`, `${percentage.toFixed(2)}%` ];
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
                            displayColors: false,
                            callbacks: {
                                title: function(context) {
                                    return context[0].label;
                                },
                                label: function(context) {
                                    const value = context.raw;
                                    const percentage = assetTooltips[context.label].percentage;
                                    const currencySymbol = displayCurrency === 'USD' ? '$' : '€';
                                    return [ `${currencySymbol}${value.toFixed(2)}`, `${percentage.toFixed(2)}%` ];
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
        let allSymbolsForLegend = Object.keys(portfolioData);
        
        // Filter out components based on mode (OTR/EQY are already in portfolioData from fetchStockData)
        if (otrCombinedMode) {
            allSymbolsForLegend = allSymbolsForLegend.filter(symbol => !otrComponentSymbols.includes(symbol));
        } else {
            // In individual mode, filter out OTR
            allSymbolsForLegend = allSymbolsForLegend.filter(symbol => symbol !== 'OTR');
        }
        if (eqyCombinedMode) {
            allSymbolsForLegend = allSymbolsForLegend.filter(symbol => !eqyComponentSymbols.includes(symbol));
        } else {
            // In individual mode, filter out EQY
            allSymbolsForLegend = allSymbolsForLegend.filter(symbol => symbol !== 'EQY');
        }
        
        allSymbolsForLegend.forEach(symbol => {
             const assetData = portfolioData[symbol];
            if (!excludedAssets.has(symbol) && assetData && !assetData.error) {
                // For OTR components in individual mode, use Commodities class
                let className = assetClassLabels[symbol] || 'Other';
                if (otrComponentSymbols.includes(symbol)) {
                    className = 'Commodities';
                }
                // For EQY components in individual mode, use Equities class
                if (eqyComponentSymbols.includes(symbol)) {
                    className = 'Equities';
                }
                
                if (!classGroups[className]) {
                    // Use commodity color for OTR components, equity color for EQY components
                    const color = otrComponentSymbols.includes(symbol) ? '#FFCE56' : 
                                 (eqyComponentSymbols.includes(symbol) ? '#36A2EB' : 
                                 (assetColors[symbol] || '#999999'));
                    classGroups[className] = { color: color, assets: [], totalPercentage: 0 };
                }
                const displaySymbol = symbol.includes('BINANCE:') ? 'BTC' : symbol;
                const assetPercentage = assetTooltips[displaySymbol]?.percentage || 0;
                classGroups[className].assets.push(displaySymbol);
                classGroups[className].totalPercentage += assetPercentage;
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
            
            // Add hover tooltip for total percentage
            const tooltipText = `${group.totalPercentage.toFixed(2)}%`;
            legendItem.addEventListener('mouseenter', function(e) {
                const tooltip = document.createElement('div');
                tooltip.className = 'legend-tooltip';
                tooltip.textContent = tooltipText;
                tooltip.style.position = 'fixed';
                tooltip.style.background = 'rgba(0, 0, 0, 0.8)';
                tooltip.style.color = 'white';
                tooltip.style.padding = '4px 8px';
                tooltip.style.borderRadius = '4px';
                tooltip.style.fontSize = '12px';
                tooltip.style.pointerEvents = 'none';
                tooltip.style.zIndex = '1000';
                tooltip.style.whiteSpace = 'nowrap';
                tooltip.style.opacity = '0';
                document.body.appendChild(tooltip);
                
                // Calculate position after element is in DOM
                const rect = legendItem.getBoundingClientRect();
                const tooltipWidth = tooltip.offsetWidth;
                const tooltipHeight = tooltip.offsetHeight;
                tooltip.style.left = (rect.left + rect.width / 2 - tooltipWidth / 2) + 'px';
                tooltip.style.top = (rect.top - tooltipHeight - 8) + 'px';
                tooltip.style.opacity = '1';
                
                legendItem._tooltip = tooltip;
            });
            
            legendItem.addEventListener('mouseleave', function(e) {
                if (legendItem._tooltip) {
                    document.body.removeChild(legendItem._tooltip);
                    legendItem._tooltip = null;
                }
            });
            
            chartLegendEl.appendChild(legendItem);
        });
    }

    async function loadHistoryChart() {
        // Prevent concurrent calls
        if (isLoadingHistoryChart) {
            return;
        }
        
        const historySection = document.getElementById('history-section');
        if (!historySection) {
            console.error('History section element not found');
            return;
        }
        
        isLoadingHistoryChart = true;
        
        try {
            const historyChartEl = document.getElementById('history-chart');
            if (!historyChartEl) {
                console.error('History chart element not found');
                historySection.style.display = 'none';
                return;
            }
            
            // Always show the section - never hide it unless there's truly no data
            historySection.style.display = 'block';
            // Use !important to prevent other code from hiding it
            historySection.style.setProperty('display', 'block', 'important');
            
            if (window.historyChart instanceof Chart) {
                window.historyChart.destroy();
            }

            const ctx = historyChartEl.getContext('2d');
            const response = await fetch('portfolio_history.json');
            const data = await response.json();
            const historicalEntries = data.history;

            if (!historicalEntries || !Array.isArray(historicalEntries) || historicalEntries.length === 0) {
                // Only hide if there's truly no data
                console.warn('No historical entries found');
                historySection.style.display = 'none';
                return;
            }

            // --- Calculate historical values based on current state ---
            const valueKey = displayCurrency === 'USD' ? 'value_usd' : 'value_eur';
            const otrComponentSymbols = ['URNU', 'COPX', 'PALL', 'SIVR'];
            const eqyComponentSymbols = ['VOO', 'NANC', 'IWDE', 'XUSE'];
            const calculatedHistory = historicalEntries.map(entry => {
                let dailyTotal = 0;
                if (entry && typeof entry.assets === 'object' && entry.assets !== null) {
                    Object.keys(entry.assets).forEach(symbol => {
                        // Skip OTR components if in combined mode
                        if (otrCombinedMode && otrComponentSymbols.includes(symbol)) {
                            return;
                        }
                        // Skip EQY components if in combined mode
                        if (eqyCombinedMode && eqyComponentSymbols.includes(symbol)) {
                            return;
                        }
                        
                        if (!excludedAssets.has(symbol) && entry.assets[symbol] && typeof entry.assets[symbol] === 'object') {
                            const value = entry.assets[symbol][valueKey];
                            if (typeof value === 'number' && !isNaN(value)) {
                                dailyTotal += value;
                            }
                        }
                    });
                    
                    // Add OTR if in combined mode
                    if (otrCombinedMode) {
                        let otrValue = 0;
                        otrComponentSymbols.forEach(compSymbol => {
                            if (entry.assets[compSymbol] && typeof entry.assets[compSymbol] === 'object') {
                                const value = entry.assets[compSymbol][valueKey];
                                if (typeof value === 'number' && !isNaN(value)) {
                                    otrValue += value;
                                }
                            }
                        });
                        if (otrValue > 0 && !excludedAssets.has('OTR')) {
                            dailyTotal += otrValue;
                        }
                    }
                    
                    // Add EQY if in combined mode
                    if (eqyCombinedMode) {
                        let eqyValue = 0;
                        eqyComponentSymbols.forEach(compSymbol => {
                            if (entry.assets[compSymbol] && typeof entry.assets[compSymbol] === 'object') {
                                const value = entry.assets[compSymbol][valueKey];
                                if (typeof value === 'number' && !isNaN(value)) {
                                    eqyValue += value;
                                }
                            }
                        });
                        if (eqyValue > 0 && !excludedAssets.has('EQY')) {
                            dailyTotal += eqyValue;
                        }
                    }
                }
                // Always return an object, even if dailyTotal is 0
                return { date: entry.date, value: isNaN(dailyTotal) ? 0 : dailyTotal };
            }).filter(item => item !== null && item !== undefined && item.date);


            // --- Calculate current value based on live data ---
            // Use the EXACT same value that was calculated in recalculateTotals() to ensure consistency
            // This ensures the chart always matches what's displayed in the totals
            let currentTotalValue = lastCalculatedTotal;
            
            // If lastCalculatedTotal is 0 or not set, fall back to calculating it
            // (this can happen if loadHistoryChart is called before recalculateTotals)
            // Use the EXACT same logic as recalculateTotals
            if (currentTotalValue === 0 || isNaN(currentTotalValue)) {
                const otrComponentSymbols = ['URNU', 'COPX', 'PALL', 'SIVR'];
                const eqyComponentSymbols = ['VOO', 'NANC', 'IWDE', 'XUSE'];
                
                if (portfolioData && Object.keys(portfolioData).length > 0) {
                    let assetsToProcess = Object.keys(portfolioData);
                    
                    // Same logic as recalculateTotals: prefer combined if available, otherwise use components
                    if (otrCombinedMode) {
                        const hasValidOTR = portfolioData['OTR'] && !portfolioData['OTR'].error;
                        if (hasValidOTR) {
                            assetsToProcess = assetsToProcess.filter(symbol => !otrComponentSymbols.includes(symbol));
                        } else {
                            assetsToProcess = assetsToProcess.filter(symbol => symbol !== 'OTR');
                        }
                    } else {
                        assetsToProcess = assetsToProcess.filter(symbol => symbol !== 'OTR');
                    }
                    
                    if (eqyCombinedMode) {
                        const hasValidEQY = portfolioData['EQY'] && !portfolioData['EQY'].error;
                        if (hasValidEQY) {
                            assetsToProcess = assetsToProcess.filter(symbol => !eqyComponentSymbols.includes(symbol));
                        } else {
                            assetsToProcess = assetsToProcess.filter(symbol => symbol !== 'EQY');
                        }
                    } else {
                        assetsToProcess = assetsToProcess.filter(symbol => symbol !== 'EQY');
                    }
                    
                    assetsToProcess.forEach(symbol => {
                        const assetData = portfolioData[symbol];
                        if (assetData && !assetData.error && !excludedAssets.has(symbol) && typeof assetData === 'object') {
                            const liveValue = displayCurrency === 'USD' ? assetData.value : assetData.valueEur;
                            if (typeof liveValue === 'number' && !isNaN(liveValue)) {
                                currentTotalValue += liveValue;
                            }
                        }
                    });
                }
            }
            
            currentTotalValue = isNaN(currentTotalValue) ? 0 : currentTotalValue;


            const today = new Date();

            if (calculatedHistory && calculatedHistory.length > 0) {
                // Always add today's value, even if it's 0 (portfolioData might not be loaded yet)
                calculatedHistory.push({ date: today.toISOString().split('T')[0], value: currentTotalValue });
            } else {
                // If calculatedHistory is empty, it might be because all values were filtered out
                // But we still have historicalEntries, so let's create a basic history from the raw data
                console.warn('calculatedHistory is empty, creating fallback from raw historical entries');
                if (historicalEntries && historicalEntries.length > 0) {
                    // Create a simple history from the raw entries
                    calculatedHistory = historicalEntries.map(entry => {
                        let total = 0;
                        if (entry && entry.assets) {
                            Object.keys(entry.assets).forEach(symbol => {
                                const assetData = entry.assets[symbol];
                                if (assetData && assetData[valueKey]) {
                                    total += assetData[valueKey] || 0;
                                }
                            });
                        }
                        return { date: entry.date, value: total };
                    });
                    calculatedHistory.push({ date: today.toISOString().split('T')[0], value: currentTotalValue });
                } else {
                    // If no historical data at all, hide the section
                    historySection.style.display = 'none';
                    return;
                }
            }


            let displayHistory = [...calculatedHistory]; // Start with the full history
            if (selectedTimeframe !== 'all') {
                const daysToShow = parseInt(selectedTimeframe, 10);
                if (!isNaN(daysToShow) && daysToShow > 0 && daysToShow <= calculatedHistory.length) {
                    displayHistory = calculatedHistory.slice(-daysToShow);
                } else {
                }
            }

            // Ensure displayHistory is valid before proceeding
            if (!displayHistory || displayHistory.length === 0) {
                // If no data to display, hide the section
                console.warn('No display history data available');
                historySection.style.display = 'none';
                return;
            }
            
            // Ensure we have at least some valid data points (including zeros - they're still valid)
            const hasValidData = displayHistory.some(item => item && typeof item.value === 'number' && !isNaN(item.value));
            if (!hasValidData) {
                console.warn('No valid data points in display history');
                historySection.style.display = 'none';
                return;
            }
            
            // Log for debugging
            console.log('History chart data:', {
                calculatedHistoryLength: calculatedHistory.length,
                displayHistoryLength: displayHistory.length,
                hasValidData: hasValidData,
                firstValue: displayHistory[0]?.value,
                lastValue: displayHistory[displayHistory.length - 1]?.value
            });

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
            }
            // --- End Title Update --- //

            // Force show the section - use important to override any other styles
            historySection.style.setProperty('display', 'block', 'important');
        } catch (error) {
            console.error('Error loading history chart:', error);
            // Keep section visible even on error - don't hide it
            if (historySection) {
                historySection.style.setProperty('display', 'block', 'important');
            }
        } finally {
            isLoadingHistoryChart = false;
        }
    }

    // Store the calculated total so the chart can use it
    let lastCalculatedTotal = 0;
    
    function recalculateTotals() {
        let totalValuePrimary = 0;
        let totalValueSecondary = 0;
        let totalPnlPrimary = 0;
        let totalInitialInvestmentPrimary = 0;
        let totalInitialInvestmentSecondary = 0;

        const primaryCurrency = displayCurrency;
        const secondaryCurrency = (primaryCurrency === 'USD') ? 'EUR' : 'USD';
        
        // Define component symbols
        const otrComponentSymbols = ['URNU', 'COPX', 'PALL', 'SIVR'];
        const eqyComponentSymbols = ['VOO', 'NANC', 'IWDE', 'XUSE'];
        
        // Get assets to process (filter based on combined/individual mode)
        // IMPORTANT: Always calculate the same total regardless of toggle state
        let assetsToProcess = Object.keys(portfolioData);
        
        // For OTR: In combined mode, prefer OTR if available, otherwise use components
        // In individual mode, always use components
        if (otrCombinedMode) {
            // Combined mode: Use OTR if it's loaded and valid, otherwise use components
            const hasValidOTR = portfolioData['OTR'] && !portfolioData['OTR'].error;
            if (hasValidOTR) {
                // OTR is loaded, exclude individual components
                assetsToProcess = assetsToProcess.filter(symbol => !otrComponentSymbols.includes(symbol));
            } else {
                // OTR not loaded yet, use individual components instead
                assetsToProcess = assetsToProcess.filter(symbol => symbol !== 'OTR');
            }
        } else {
            // Individual mode: filter out OTR, keep components
            assetsToProcess = assetsToProcess.filter(symbol => symbol !== 'OTR');
        }
        
        // For EQY: Same logic
        if (eqyCombinedMode) {
            // Combined mode: Use EQY if it's loaded and valid, otherwise use components
            const hasValidEQY = portfolioData['EQY'] && !portfolioData['EQY'].error;
            if (hasValidEQY) {
                // EQY is loaded, exclude individual components
                assetsToProcess = assetsToProcess.filter(symbol => !eqyComponentSymbols.includes(symbol));
            } else {
                // EQY not loaded yet, use individual components instead
                assetsToProcess = assetsToProcess.filter(symbol => symbol !== 'EQY');
            }
        } else {
            // Individual mode: filter out EQY, keep components
            assetsToProcess = assetsToProcess.filter(symbol => symbol !== 'EQY');
        }

        assetsToProcess.forEach(symbol => {
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
        
        // Debug logging (commented out to reduce noise, uncomment if needed for debugging)
        //         // Debug logging (commented out to reduce noise, uncomment if needed for debugging)
        // console.log('recalculateTotals:', {
        //     otrCombinedMode,
        //     eqyCombinedMode,
        //     hasOTR: !!portfolioData['OTR'],
        //     hasEQY: !!portfolioData['EQY'],
        //     otrError: portfolioData['OTR']?.error,
        //     eqyError: portfolioData['EQY']?.error,
        //     otrValue: portfolioData['OTR']?.value,
        //     eqyValue: portfolioData['EQY']?.value,
        //     assetsToProcess,
        //     totalValuePrimary,
        //     portfolioDataKeys: Object.keys(portfolioData),
        //     assetValues: assetsToProcess.map(s => ({ symbol: s, value: portfolioData[s]?.value, error: portfolioData[s]?.error }))
        // });

        portfolioDataEl.innerHTML = '';
        let currentSortColumn = -1;
        let currentSortHeader = null;
        portfolioTable.querySelectorAll('th').forEach((th, index) => {
            if (th.classList.contains('sort-asc') || th.classList.contains('sort-desc')) {
                currentSortColumn = index;
                currentSortHeader = th; // Store the header element
            }
        });
        
        // Get the correct asset list based on toggle state
        let assetsToDisplay = Object.keys(portfolioData);
        // Filter out components if in combined mode (OTR/EQY are already in portfolioData from fetchStockData)
        if (otrCombinedMode) {
            assetsToDisplay = assetsToDisplay.filter(symbol => !otrComponentSymbols.includes(symbol));
        } else {
            // In individual mode, filter out OTR
            assetsToDisplay = assetsToDisplay.filter(symbol => symbol !== 'OTR');
        }
        if (eqyCombinedMode) {
            assetsToDisplay = assetsToDisplay.filter(symbol => !eqyComponentSymbols.includes(symbol));
        } else {
            // In individual mode, filter out EQY
            assetsToDisplay = assetsToDisplay.filter(symbol => symbol !== 'EQY');
        }

        assetsToDisplay.forEach(symbol => {
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
        // Update dual currency button display
        updateDualCurrencyButton();
        
        // Store the calculated total for the chart to use
        lastCalculatedTotal = totalValuePrimary;

        createPieChart();
        // Don't call loadHistoryChart here - it's already called by finishLoading()
        updateYtdDisplay(); // Update YTD display when currency changes

        if (currentSortColumn !== -1 && currentSortHeader) {
            const sortClass = currentSortHeader.classList.contains('sort-asc') ? 'sort-asc' : 'sort-desc';
            currentSortHeader.classList.remove(sortClass);
            sortTable(currentSortColumn);
        } else {
            sortTable(6); // Default sort by 24hr change if no sort was active
        }
    }

    tableHeaders.forEach((header, index) => {
        header.addEventListener('click', () => sortTable(index));
    });
    floatingCurrencySwitchBtn.addEventListener('click', toggleCurrencyWithAnimation);

    // --- Event Listener for Pie Chart Toggle --- //
    const pieChartToggleBtn = document.getElementById('pie-chart-toggle-btn');
    pieChartToggleBtn.addEventListener('click', togglePieChartView);
    
    const otrToggleBtn = document.getElementById('mtl-toggle-btn');
    if (otrToggleBtn) {
        otrToggleBtn.addEventListener('click', toggleOTRView);
        // Initialize button state
        const otrToggleText = document.getElementById('mtl-toggle-text');
        if (otrToggleText) {
            otrToggleText.textContent = otrCombinedMode ? 'OTR' : 'Individual';
            otrToggleBtn.classList.toggle('active', otrCombinedMode);
        }
    }
    
    const eqyToggleBtn = document.getElementById('eqy-toggle-btn');
    if (eqyToggleBtn) {
        eqyToggleBtn.addEventListener('click', toggleEQYView);
        // Initialize button state
        const eqyToggleText = document.getElementById('eqy-toggle-text');
        if (eqyToggleText) {
            eqyToggleText.textContent = eqyCombinedMode ? 'EQY' : 'Individual';
            eqyToggleBtn.classList.toggle('active', eqyCombinedMode);
        }
    }

    // --- Event Listener for Timeframe Change --- //
    timeframeSelectEl.addEventListener('change', (event) => {
        selectedTimeframe = event.target.value;
        loadHistoryChart(); // Reload the history chart with the new timeframe
    });

    // Historical PnL functionality
    let pnlHistoryData = null;
    let selectedYear = new Date().getFullYear();
    let customDateRange = null;

    // Historical PnL elements
    let yearPrevBtn, yearNextBtn, yearDisplayEl, historicalPeriodTextEl;

    function initializeHistoricalPnlElements() {
        yearPrevBtn = document.getElementById('year-prev');
        yearNextBtn = document.getElementById('year-next');
        yearDisplayEl = document.getElementById('year-display');

        historicalPeriodTextEl = document.getElementById('historical-period-text');
        
        // Get the new toggle buttons
        const mwrToggle = document.getElementById('mwr-toggle');
        const twrToggle = document.getElementById('twr-toggle');

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

        // Add toggle button event listeners
        if (mwrToggle) {
            mwrToggle.addEventListener('click', () => {
                if (currentReturnType !== 'mwr') {
                    currentReturnType = 'mwr';
                    mwrToggle.classList.add('active');
                    twrToggle.classList.remove('active');
                    updateHistoricalPnlDisplay();
                }
            });
        }

        if (twrToggle) {
            twrToggle.addEventListener('click', () => {
                if (currentReturnType !== 'twr') {
                    currentReturnType = 'twr';
                    twrToggle.classList.add('active');
                    mwrToggle.classList.remove('active');
                    updateHistoricalPnlDisplay();
                }
            });
        }
    }

    async function loadPnlHistory() {
        try {
            const response = await fetch('pnl_history.json');
            if (!response.ok) {
                return;
            }
            pnlHistoryData = await response.json();
            updateHistoricalPnlDisplay();
        } catch (error) {
            // Error loading PnL history
        }
    }

    function updateHistoricalPnlDisplay() {
        // Check if elements exist
        if (!historicalPeriodTextEl) {
            initializeHistoricalPnlElements();
            return;
        }

        const resultsDiv = document.getElementById('historical-results');
        if (!resultsDiv) return;

        // Get date range based on selected year or custom range
        const dateRange = customDateRange || getDateRangeForYear(selectedYear);
        if (!dateRange) {
            resultsDiv.innerHTML = '<div class="message message-error">Invalid date range</div>';
            historicalPeriodTextEl.textContent = 'Invalid date range';
            return;
        }

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

        resultsDiv.innerHTML = '<div class="historical-loading">Calculating returns...</div>';

        calculateHistoricalReturnsWithDates(dateRange.start, dateRange.end);
    }

    function getDateRangeForYear(year) {
        const now = new Date();
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]; // Yesterday as string
        const currentYear = now.getFullYear();
        
        if (year === currentYear) {
            // Current year: Aug 1 to yesterday (for 2025)
            const startDateStr = year === 2025 ? '2025-08-01' : `${year}-01-01`;
            const endDateStr = yesterday;
            return {
                start: new Date(startDateStr + 'T00:00:00'),
                end: new Date(endDateStr + 'T00:00:00')
            };
        } else if (year < currentYear) {
            // Past year: Jan 1 to Dec 31 (or Aug 1 to Dec 31 for 2025)
            const startDateStr = year === 2025 ? '2025-08-01' : `${year}-01-01`;
            const endDateStr = `${year}-12-31`;
            return {
                start: new Date(startDateStr + 'T00:00:00'),
                end: new Date(endDateStr + 'T00:00:00')
            };
        } else {
            // Future year: no data
            return null;
        }
    }

function calculateReturn(startValue, endValue) {
    return ((endValue / startValue) - 1) * 100;
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

    // Initialize historical returns with new date inputs
    window.addEventListener('load', function() {
        const startDateInput = document.getElementById('startDate');
        const endDateInput = document.getElementById('endDate');
        
        if (startDateInput && endDateInput) {
            // Set default date range
            const startDate = '2026-01-01';
            
            startDateInput.value = startDate;
            endDateInput.value = new Date(Date.now() - 86400000).toISOString().split('T')[0];
            
            // Set max dates to yesterday for both inputs
            startDateInput.max = yesterday;
            endDateInput.max = yesterday;
            
            updateEndDateMin();
            
            // Add event listeners
            startDateInput.addEventListener('change', () => {
                updateEndDateMin();
                calculateHistoricalReturns();
            });
            
            startDateInput.addEventListener('input', validateDates);
            
            endDateInput.addEventListener('change', calculateHistoricalReturns);
            endDateInput.addEventListener('input', validateDates);

            // Add toggle button event listeners
            const mwrToggle = document.getElementById('mwr-toggle');
            const twrToggle = document.getElementById('twr-toggle');

            if (mwrToggle) {
                mwrToggle.addEventListener('click', () => {
                    if (currentReturnType !== 'mwr') {
                        currentReturnType = 'mwr';
                        mwrToggle.classList.add('active');
                        twrToggle.classList.remove('active');
                        calculateHistoricalReturns();
                    }
                });
            }

            if (twrToggle) {
                twrToggle.addEventListener('click', () => {
                    if (currentReturnType !== 'twr') {
                        currentReturnType = 'twr';
                        twrToggle.classList.add('active');
                        mwrToggle.classList.remove('active');
                        calculateHistoricalReturns();
                    }
                });
            }
            
            // Initial calculation
            calculateHistoricalReturns();
        }
    });

    // Historical returns functionality with direct date inputs from new.html
    let currentReturnType = 'mwr'; // 'mwr' or 'twr'
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    
    function updateEndDateMin() {
        const startDateInput = document.getElementById('startDate');
        const endDateInput = document.getElementById('endDate');
        
        if (!startDateInput || !endDateInput) return;
        
        const startDate = new Date(startDateInput.value);
        const nextDay = new Date(startDate);
        nextDay.setDate(nextDay.getDate() + 1);
        
        const minEndDate = nextDay.toISOString().split('T')[0];
        endDateInput.min = minEndDate;
        endDateInput.max = yesterday; // Prevent future dates (yesterday max)
        
        // If current end date is not after start date or in future, update it
        const currentEndDate = new Date(endDateInput.value);
        if (currentEndDate <= startDate || currentEndDate > new Date(yesterday)) {
            // Set to the earlier of: nextDay or yesterday
            const validEndDate = nextDay > new Date(yesterday) ? yesterday : minEndDate;
            endDateInput.value = validEndDate;
        }
    }
    
    function validateDates() {
        const startDateInput = document.getElementById('startDate');
        const endDateInput = document.getElementById('endDate');
        
        if (!startDateInput || !endDateInput) return true;
        
        const startDate = new Date(startDateInput.value);
        const endDate = new Date(endDateInput.value);
        const yesterdayDate = new Date(yesterday);
        
        let dateChanged = false;
        
        // Check if start date is in the future (after yesterday)
        if (startDate > yesterdayDate) {
            startDateInput.value = yesterday;
            startDate.setTime(yesterdayDate.getTime());
            dateChanged = true;
        }
        
        // Check if end date is in the future (after yesterday)
        if (endDate > yesterdayDate) {
            endDateInput.value = yesterday;
            endDate.setTime(yesterdayDate.getTime());
            dateChanged = true;
        }
        
        // Check if end date is not after start date
        if (endDate <= startDate) {
            const nextDay = new Date(startDate);
            nextDay.setDate(nextDay.getDate() + 1);
            
            // If next day would be in future, set end date to yesterday (if possible)
            if (nextDay > yesterdayDate) {
                if (startDate.getTime() === yesterdayDate.getTime()) {
                    // Can't have valid date range - start is yesterday
                    startDateInput.value = new Date(yesterdayDate.getTime() - 86400000).toISOString().split('T')[0];
                    endDateInput.value = yesterday;
                } else {
                    endDateInput.value = yesterday;
                }
            } else {
                endDateInput.value = nextDay.toISOString().split('T')[0];
            }
            dateChanged = true;
        }
        
        return !dateChanged;
    }

    function calculateHistoricalReturns() {
        const startDateInput = document.getElementById('startDate');
        const endDateInput = document.getElementById('endDate');
        
        if (!startDateInput || !endDateInput) return;
        
        // Validate dates first
        if (!validateDates()) {
            return; // Don't calculate if dates were invalid and had to be corrected
        }
        
        const startDate = new Date(startDateInput.value);
        const endDate = new Date(endDateInput.value);
        
        calculateHistoricalReturnsWithDates(startDate, endDate);
    }
    
    function solveIRR(cashFlows, guess = 0.1, maxIterations = 1000, tolerance = 1e-10) {
        let rate = guess;
        
        for (let i = 0; i < maxIterations; i++) {
            let npv = 0;
            let dnpv = 0;
            
            for (let j = 0; j < cashFlows.length; j++) {
                const t = cashFlows[j].time;
                const cf = cashFlows[j].amount;
                const factor = Math.pow(1 + rate, -t);
                
                npv += cf * factor;
                dnpv += cf * (-t) * factor / (1 + rate);
            }
            
            if (Math.abs(npv) < tolerance) {
                return rate;
            }
            
            if (Math.abs(dnpv) < tolerance) {
                throw new Error("Cannot converge");
            }
            
            const newRate = rate - npv / dnpv;
            
            if (Math.abs(newRate - rate) < tolerance) {
                return newRate;
            }
            
            rate = newRate;
        }
        
        throw new Error("IRR calculation did not converge");
    }

    function calculateIRRForCurrency(historyData, transactionData, startDate, endDate, currency) {
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    const startEntry = historyData.history.find(entry => entry.date === startDateStr);
    const endEntry = historyData.history.find(entry => entry.date === endDateStr);

    if (!startEntry || !endEntry) {
        throw new Error(`Could not find portfolio values for ${currency} on the specified dates`);
    }

    const valueKey = currency === 'USD' ? 'value_usd' : 'value_eur';
    
    const calculateTotalValue = (entry) => {
        let total = 0;
        for (const asset in entry.assets) {
            if (entry.assets[asset] && entry.assets[asset][valueKey]) {
                total += entry.assets[asset][valueKey];
            }
        }
        return total;
    };

    let startValue = calculateTotalValue(startEntry);
    const endValue = calculateTotalValue(endEntry);

    // Handle start date transactions - these increase the initial investment
    const startDateTransactions = transactionData.transactions.filter(tx => {
        const txDate = new Date(tx.timestamp);
        return txDate.getTime() === startDate.getTime() && tx.currency === currency;
    });

    if (currency === 'USD') {
        startDateTransactions.forEach(tx => {
            if (tx.action === 'increase') {
                startValue += tx.amount;
            }
        });
    } else if (currency === 'EUR') {
        // For EUR, only count EURO_INVESTMENT transactions
        startDateTransactions.forEach(tx => {
            if (tx.ticker === 'EURO_INVESTMENT' && tx.action === 'increase') {
                startValue += tx.amount;
            }
        });
    }

    // Get transactions between start and end dates
    const relevantTransactions = transactionData.transactions.filter(tx => {
        const txDate = new Date(tx.timestamp);
        return txDate > startDate && txDate < endDate && tx.currency === currency;
    });

    const cashFlows = [];
    const totalDays = (endDate - startDate) / (1000 * 60 * 60 * 24);

    // Initial investment (negative cash flow)
    cashFlows.push({ time: 0, amount: -startValue });

    if (currency === 'USD') {
        // Aggregate USD transactions by date
        const aggregatedTransactions = new Map();
        
        relevantTransactions.forEach(tx => {
            const txDate = new Date(tx.timestamp);
            const dateKey = txDate.toISOString().split('T')[0];
            
            if (!aggregatedTransactions.has(dateKey)) {
                aggregatedTransactions.set(dateKey, {
                    date: txDate,
                    totalAmount: 0
                });
            }
            
            const cashFlowAmount = tx.action === 'increase' ? -tx.amount : tx.amount;
            aggregatedTransactions.get(dateKey).totalAmount += cashFlowAmount;
        });

        aggregatedTransactions.forEach((tx) => {
            const daysFromStart = (tx.date - startDate) / (1000 * 60 * 60 * 24);
            const timeRatio = daysFromStart / totalDays;
            cashFlows.push({ time: timeRatio, amount: tx.totalAmount });
        });
    } else {
        // For EUR, only process EURO_INVESTMENT transactions
        const euroTransactions = relevantTransactions.filter(tx => tx.ticker === 'EURO_INVESTMENT');
        
        euroTransactions.forEach(tx => {
            const txDate = new Date(tx.timestamp);
            const daysFromStart = (txDate - startDate) / (1000 * 60 * 60 * 24);
            const timeRatio = daysFromStart / totalDays;
            const cashFlowAmount = tx.action === 'increase' ? -tx.amount : tx.amount;
            
            cashFlows.push({ time: timeRatio, amount: cashFlowAmount });
        });
    }

    // Final value (positive cash flow)
    cashFlows.push({ time: 1, amount: endValue });

    return { irr: solveIRR(cashFlows), cashFlows };
}

    // New function to calculate MWR for Risk Assets (excluding SGOV)
    function calculateIRRForRiskAssets(historyData, transactionData, startDate, endDate, currency) {
        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];
        
        const startEntry = historyData.history.find(entry => entry.date === startDateStr);
        const endEntry = historyData.history.find(entry => entry.date === endDateStr);

        if (!startEntry || !endEntry) {
            throw new Error(`Could not find portfolio values for ${currency} on the specified dates`);
        }

        const valueKey = currency === 'USD' ? 'value_usd' : 'value_eur';
        
        const calculateRiskAssetsValue = (entry) => {
            let total = 0;
            for (const asset in entry.assets) {
                if (asset !== 'SGOV' && asset !== 'RLX' && entry.assets[asset] && entry.assets[asset][valueKey]) {
                    total += entry.assets[asset][valueKey];
                }
            }
            return total;
        };

        let startValue = calculateRiskAssetsValue(startEntry);
        const endValue = calculateRiskAssetsValue(endEntry);

        // Check for investments on the start date and include them in the starting value (excluding SGOV and RLX)
        const startDateTransactions = transactionData.transactions.filter(tx => {
            const txDate = new Date(tx.timestamp);
            return txDate.getTime() === startDate.getTime() && tx.currency === currency && tx.ticker !== 'SGOV' && tx.ticker !== 'RLX' && tx.ticker !== 'EURO_INVESTMENT';
        });
    

        startDateTransactions.forEach(tx => {
            if (tx.action === 'increase') {
                startValue += tx.amount;
            }
        });

        const relevantTransactions = transactionData.transactions.filter(tx => {
            const txDate = new Date(tx.timestamp);
            return txDate > startDate && txDate < endDate && tx.currency === currency && tx.ticker !== 'SGOV' && tx.ticker !== 'RLX' && tx.ticker !== 'EURO_INVESTMENT';
        });

        const cashFlows = [];
        const totalDays = (endDate - startDate) / (1000 * 60 * 60 * 24);

        cashFlows.push({ time: 0, amount: -startValue });

        if (currency === 'USD') {
            const aggregatedTransactions = new Map();
            
            relevantTransactions.forEach(tx => {
                if (tx.ticker !== 'SGOV' && tx.ticker !== 'RLX') {
                    const txDate = new Date(tx.timestamp);
                    const dateKey = txDate.toISOString().split('T')[0];
                    
                    if (!aggregatedTransactions.has(dateKey)) {
                        aggregatedTransactions.set(dateKey, {
                            date: txDate,
                            totalAmount: 0
                        });
                    }
                    
                    const cashFlowAmount = tx.action === 'increase' ? -tx.amount : tx.amount;
                    aggregatedTransactions.get(dateKey).totalAmount += cashFlowAmount;
                }
            });

            aggregatedTransactions.forEach((tx, dateKey) => {
                const daysFromStart = (tx.date - startDate) / (1000 * 60 * 60 * 24);
                const timeRatio = daysFromStart / totalDays;
                cashFlows.push({ time: timeRatio, amount: tx.totalAmount });
            });
        } else {
            const aggregatedTransactions = new Map();
            
            relevantTransactions.forEach(tx => {
                const txDate = new Date(tx.timestamp);
                const dateKey = txDate.toISOString().split('T')[0];
                
                if (!aggregatedTransactions.has(dateKey)) {
                    aggregatedTransactions.set(dateKey, {
                        date: txDate,
                        totalAmount: 0
                    });
                }
                
                const amount = tx.action === 'increase' ? tx.amount : -tx.amount;
                aggregatedTransactions.get(dateKey).totalAmount += amount;
            });
            
            aggregatedTransactions.forEach(({ date, totalAmount }) => {
                const daysFromStart = (date - startDate) / (1000 * 60 * 60 * 24);
                const timeRatio = daysFromStart / totalDays;
                
                const cashFlowAmount = -totalAmount;
                cashFlows.push({ time: timeRatio, amount: cashFlowAmount });
            });
        }

        cashFlows.push({ time: 1, amount: endValue });

        return { irr: solveIRR(cashFlows), cashFlows };
    }

  

    // New function to calculate MWR for individual assets
    function calculateIRRForAsset(historyData, transactionData, startDate, endDate, currency, assetSymbol) {
        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];
        
        const startEntry = historyData.history.find(entry => entry.date === startDateStr);
        const endEntry = historyData.history.find(entry => entry.date === endDateStr);

        if (!startEntry || !endEntry) {
            throw new Error(`Could not find portfolio values for ${currency} on the specified dates`);
        }

        const valueKey = currency === 'USD' ? 'value_usd' : 'value_eur';
        const otrComponentSymbols = ['URNU', 'COPX', 'PALL', 'SIVR'];
        const eqyComponentSymbols = ['VOO', 'NANC', 'IWDE', 'XUSE'];
        
        const calculateAssetValue = (entry) => {
            // Handle OTR - combine components
            if (assetSymbol === 'OTR') {
                let total = 0;
                otrComponentSymbols.forEach(compSymbol => {
                    if (entry.assets[compSymbol] && entry.assets[compSymbol][valueKey]) {
                        total += entry.assets[compSymbol][valueKey];
                    }
                });
                return total;
            }
            // Handle EQY - combine components
            if (assetSymbol === 'EQY') {
                let total = 0;
                eqyComponentSymbols.forEach(compSymbol => {
                    if (entry.assets[compSymbol] && entry.assets[compSymbol][valueKey]) {
                        total += entry.assets[compSymbol][valueKey];
                    }
                });
                return total;
            }
            // Regular asset
            if (entry.assets[assetSymbol] && entry.assets[assetSymbol][valueKey]) {
                return entry.assets[assetSymbol][valueKey];
            }
            return 0;
        };

        let startValue = calculateAssetValue(startEntry);
        const endValue = calculateAssetValue(endEntry);

        // Get transactions for this asset during the period
        let assetTransactions;
        if (assetSymbol === 'OTR') {
            // Get transactions for all OTR components
            assetTransactions = transactionData.transactions.filter(tx => 
                otrComponentSymbols.includes(tx.ticker) && tx.currency === currency
            );
        } else if (assetSymbol === 'EQY') {
            // Get transactions for all EQY components
            assetTransactions = transactionData.transactions.filter(tx => 
                eqyComponentSymbols.includes(tx.ticker) && tx.currency === currency
            );
        } else {
            assetTransactions = transactionData.transactions.filter(tx => 
                tx.ticker === assetSymbol && tx.currency === currency
            );
        }

        // Check for investments on the start date for this specific asset
        let startDateTransactions;
        if (assetSymbol === 'OTR') {
            startDateTransactions = transactionData.transactions.filter(tx => {
                const txDate = new Date(tx.timestamp);
                return txDate.getTime() === startDate.getTime() && tx.currency === currency && otrComponentSymbols.includes(tx.ticker);
            });
        } else if (assetSymbol === 'EQY') {
            startDateTransactions = transactionData.transactions.filter(tx => {
                const txDate = new Date(tx.timestamp);
                return txDate.getTime() === startDate.getTime() && tx.currency === currency && eqyComponentSymbols.includes(tx.ticker);
            });
        } else {
            startDateTransactions = transactionData.transactions.filter(tx => {
                const txDate = new Date(tx.timestamp);
                return txDate.getTime() === startDate.getTime() && tx.currency === currency && tx.ticker === assetSymbol;
            });
        }

        if (currency === 'USD') {
            startDateTransactions.forEach(tx => {
                if (tx.action === 'increase') {
                    startValue += tx.amount;
                }
            });
        } else         if (currency === 'EUR') {
            startDateTransactions.forEach(tx => {
                if (tx.action === 'increase') {
                    startValue += tx.amount;
                }
            });
        }

        // Get transactions between start and end dates (excluding start date transactions)
        const relevantTransactions = assetTransactions.filter(tx => {
            const txDate = new Date(tx.timestamp);
            return txDate > startDate && txDate < endDate;
        });

        const cashFlows = [];
        const totalDays = (endDate - startDate) / (1000 * 60 * 60 * 24);

        // If asset wasn't held at start date, find the first transaction to determine the actual start
        let actualStartDate = startDate;
        let actualStartValue = startValue;
        
        if (startValue === 0 && relevantTransactions.length > 0) {
            // Find the first transaction for this asset during the period
            const firstTx = relevantTransactions
                .filter(tx => tx.ticker === assetSymbol)
                .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))[0];
            
            if (firstTx) {
                actualStartDate = new Date(firstTx.timestamp);
                actualStartValue = firstTx.action === 'increase' ? firstTx.amount : 0;
            }
        }

        // Recalculate time ratios based on actual start date
        const actualTotalDays = (endDate - actualStartDate) / (1000 * 60 * 60 * 24);
        
        // Only add start value if it's not zero
        if (actualStartValue !== 0) {
            cashFlows.push({ time: 0, amount: -actualStartValue });
        }

        relevantTransactions.forEach(tx => {
            if (tx.ticker === assetSymbol) {
                const txDate = new Date(tx.timestamp);
                // Skip the first transaction if it's the same as the actual start transaction
                if (actualStartDate.getTime() === txDate.getTime() && actualStartValue === tx.amount) {
                    return; // Skip this transaction as it's already included as the start value
                }
                const daysFromActualStart = (txDate - actualStartDate) / (1000 * 60 * 60 * 24);
                const timeRatio = daysFromActualStart / actualTotalDays;
                const cashFlowAmount = tx.action === 'increase' ? -tx.amount : tx.amount;
                cashFlows.push({ time: timeRatio, amount: cashFlowAmount });
            }
        });

        cashFlows.push({ time: 1, amount: endValue });

        if (startValue === 0 && endValue === 0 && relevantTransactions.length === 0) {
            return { irr: 0, cashFlows };
        }

        try {
            const irr = solveIRR(cashFlows);
            return { irr, cashFlows };
        } catch (error) {
            console.error(`IRR calculation failed for ${assetSymbol}:`, error, 'Cash flows:', cashFlows);
            return { irr: 0, cashFlows };
        }
    }
// Fixed TWR calculation for total portfolio
function calculateTWRForCurrency(historyData, transactionData, startDate, endDate, currency) {
    const valueKey = currency === 'USD' ? 'value_usd' : 'value_eur';
    
    const calculateTotalValue = (entry) => {
        let total = 0;
        for (const asset in entry.assets) {
            if (entry.assets[asset] && entry.assets[asset][valueKey]) {
                total += entry.assets[asset][valueKey];
            }
        }
        return total;
    };

    // Get relevant transactions (AFTER start, BEFORE end)
    const relevantTransactions = transactionData.transactions.filter(tx => {
        const txDate = new Date(tx.timestamp);
        return txDate > startDate && txDate < endDate && tx.currency === currency;
    });

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    const startEntry = historyData.history.find(entry => entry.date === startDateStr);
    const endEntry = historyData.history.find(entry => entry.date === endDateStr);
    
    if (!startEntry || !endEntry) {
        throw new Error(`Could not find portfolio values for ${currency} on the specified dates`);
    }
    
    let startValue = calculateTotalValue(startEntry);
    const endValue = calculateTotalValue(endEntry);

    // Include start date investments in starting value
    const startDateTransactions = transactionData.transactions.filter(tx => {
        const txDate = new Date(tx.timestamp);
        return txDate.getTime() === startDate.getTime() && tx.currency === currency;
    });

    if (currency === 'USD') {
        startDateTransactions.forEach(tx => {
            if (tx.action === 'increase') {
                startValue += tx.amount;
            }
        });
    } else if (currency === 'EUR') {
        const euroInvestmentTx = startDateTransactions.find(tx => tx.ticker === 'EURO_INVESTMENT');
        if (euroInvestmentTx && euroInvestmentTx.action === 'increase') {
            startValue += euroInvestmentTx.amount;
        }
    }

    // If no cash flows during the period
    if (relevantTransactions.length === 0) {
        if (startValue === 0) return { twr: 0, subPeriodReturns: [0] };
        const twr = (endValue / startValue) - 1;
        return { twr, subPeriodReturns: [twr] };
    }

    // Group cash flows by date
    const cashFlowsByDate = new Map();
    relevantTransactions.forEach(tx => {
        const dateKey = new Date(tx.timestamp).toISOString().split('T')[0];
        
        if (!cashFlowsByDate.has(dateKey)) {
            cashFlowsByDate.set(dateKey, 0);
        }
        
        let amount = 0;
        if (currency === 'EUR' && tx.ticker !== 'EURO_INVESTMENT') {
            return; // Skip non-EURO_INVESTMENT transactions for EUR
        }
        
        if (currency === 'USD' || (currency === 'EUR' && tx.ticker === 'EURO_INVESTMENT')) {
            amount = tx.action === 'increase' ? tx.amount : -tx.amount;
            cashFlowsByDate.set(dateKey, cashFlowsByDate.get(dateKey) + amount);
        }
    });

    const cashFlowDates = Array.from(cashFlowsByDate.keys()).sort();
    const periodDates = [startDateStr, ...cashFlowDates, endDateStr];
    
    const subPeriodReturns = [];
    
    for (let i = 0; i < periodDates.length - 1; i++) {
        const periodStartEntry = historyData.history.find(entry => entry.date === periodDates[i]);
        const periodEndEntry = historyData.history.find(entry => entry.date === periodDates[i + 1]);
        
        if (!periodStartEntry || !periodEndEntry) continue;
        
        let periodStartValue = calculateTotalValue(periodStartEntry);
        const periodEndValue = calculateTotalValue(periodEndEntry);
        
        // FIXED: Handle cash flows correctly for TWR
        // If there's a cash flow on the start date of this period (except the very first period),
        // it should be added to the period start value
        if (i > 0) {
            const periodStartCashFlow = cashFlowsByDate.get(periodDates[i]) || 0;
            periodStartValue += periodStartCashFlow;
        }
        
        // Calculate the return for this sub-period
        if (periodStartValue === 0) {
            subPeriodReturns.push(0);
        } else {
            const subPeriodReturn = (periodEndValue / periodStartValue) - 1;
            subPeriodReturns.push(subPeriodReturn);
        }
    }

    // Compound the returns
    const twr = subPeriodReturns.reduce((acc, ret) => acc * (1 + ret), 1) - 1;
    
    return { twr, subPeriodReturns };
}

// Fixed TWR calculation for Risk Assets (excluding SGOV)
function calculateTWRForRiskAssets(historyData, transactionData, startDate, endDate, currency) {
    const valueKey = currency === 'USD' ? 'value_usd' : 'value_eur';
    
    const calculateRiskAssetsValue = (entry) => {
        let total = 0;
        for (const asset in entry.assets) {
            if (asset !== 'SGOV' && asset !== 'RLX' && entry.assets[asset] && entry.assets[asset][valueKey]) {
                total += entry.assets[asset][valueKey];
            }
        }
        return total;
    };

    // Get relevant transactions (excluding SGOV, RLX, and EURO_INVESTMENT)
    const relevantTransactions = transactionData.transactions.filter(tx => {
        const txDate = new Date(tx.timestamp);
        return txDate > startDate && txDate < endDate && 
               tx.currency === currency && 
               tx.ticker !== 'SGOV' && 
               tx.ticker !== 'RLX' && 
               tx.ticker !== 'EURO_INVESTMENT';
    });

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    const startEntry = historyData.history.find(entry => entry.date === startDateStr);
    const endEntry = historyData.history.find(entry => entry.date === endDateStr);
    
    if (!startEntry || !endEntry) {
        throw new Error(`Could not find portfolio values for ${currency} on the specified dates`);
    }
    
    let startValue = calculateRiskAssetsValue(startEntry);
    const endValue = calculateRiskAssetsValue(endEntry);

    // Include start date risk asset investments (excluding SGOV and RLX)
    const startDateTransactions = transactionData.transactions.filter(tx => {
        const txDate = new Date(tx.timestamp);
        return txDate.getTime() === startDate.getTime() && 
               tx.currency === currency && 
               tx.ticker !== 'SGOV' && 
               tx.ticker !== 'RLX' && 
               tx.ticker !== 'EURO_INVESTMENT';
    });

    startDateTransactions.forEach(tx => {
        if (tx.action === 'increase') {
            startValue += tx.amount;
        }
    });

    // If no cash flows during the period
    if (relevantTransactions.length === 0) {
        if (startValue === 0) return { twr: 0, subPeriodReturns: [0] };
        const twr = (endValue / startValue) - 1;
        return { twr, subPeriodReturns: [twr] };
    }

    // Group cash flows by date
    const cashFlowsByDate = new Map();
    relevantTransactions.forEach(tx => {
        const dateKey = new Date(tx.timestamp).toISOString().split('T')[0];
        if (!cashFlowsByDate.has(dateKey)) {
            cashFlowsByDate.set(dateKey, 0);
        }
        const amount = tx.action === 'increase' ? tx.amount : -tx.amount;
        cashFlowsByDate.set(dateKey, cashFlowsByDate.get(dateKey) + amount);
    });

    const cashFlowDates = Array.from(cashFlowsByDate.keys()).sort();
    const periodDates = [startDateStr, ...cashFlowDates, endDateStr];
    
    const subPeriodReturns = [];
    
    for (let i = 0; i < periodDates.length - 1; i++) {
        const periodStartEntry = historyData.history.find(entry => entry.date === periodDates[i]);
        const periodEndEntry = historyData.history.find(entry => entry.date === periodDates[i + 1]);
        
        if (!periodStartEntry || !periodEndEntry) continue;
        
        let periodStartValue = calculateRiskAssetsValue(periodStartEntry);
        const periodEndValue = calculateRiskAssetsValue(periodEndEntry);
        
        // FIXED: Handle cash flows correctly for TWR
        // If there's a cash flow on the start date of this period (except the very first period),
        // it should be added to the period start value
        if (i > 0) {
            const periodStartCashFlow = cashFlowsByDate.get(periodDates[i]) || 0;
            periodStartValue += periodStartCashFlow;
        }
        
        // Calculate the return for this sub-period
        if (periodStartValue === 0) {
            subPeriodReturns.push(0);
        } else {
            const subPeriodReturn = (periodEndValue / periodStartValue) - 1;
            subPeriodReturns.push(subPeriodReturn);
        }
    }

    // Compound the returns
    const twr = subPeriodReturns.reduce((acc, ret) => acc * (1 + ret), 1) - 1;
    
    return { twr, subPeriodReturns };
}

// Fixed TWR calculation for individual assets
function calculateTWRForAsset(historyData, transactionData, startDate, endDate, currency, assetSymbol) {
    const valueKey = currency === 'USD' ? 'value_usd' : 'value_eur';
    const otrComponentSymbols = ['URNU', 'COPX', 'PALL', 'SIVR'];
        const eqyComponentSymbols = ['VOO', 'NANC', 'IWDE', 'XUSE'];
    
    // Define the asset value calculation function
    const calculateAssetValue = (entry) => {
        // Handle OTR - combine components
        if (assetSymbol === 'OTR') {
            let total = 0;
            otrComponentSymbols.forEach(compSymbol => {
                if (entry.assets[compSymbol] && entry.assets[compSymbol][valueKey]) {
                    total += entry.assets[compSymbol][valueKey];
                }
            });
            return total;
        }
        // Handle EQY - combine components
        if (assetSymbol === 'EQY') {
            let total = 0;
            eqyComponentSymbols.forEach(compSymbol => {
                if (entry.assets[compSymbol] && entry.assets[compSymbol][valueKey]) {
                    total += entry.assets[compSymbol][valueKey];
                }
            });
            return total;
        }
        // Regular asset
        if (entry.assets[assetSymbol] && entry.assets[assetSymbol][valueKey]) {
            return entry.assets[assetSymbol][valueKey];
        }
        return 0;
    };

    // Get relevant transactions (AFTER start, BEFORE end)
    let relevantTransactions;
    if (assetSymbol === 'OTR') {
        relevantTransactions = transactionData.transactions.filter(tx => {
            const txDate = new Date(tx.timestamp);
            return txDate > startDate && txDate < endDate && 
                   tx.currency === currency && otrComponentSymbols.includes(tx.ticker);
        });
    } else if (assetSymbol === 'EQY') {
        relevantTransactions = transactionData.transactions.filter(tx => {
            const txDate = new Date(tx.timestamp);
            return txDate > startDate && txDate < endDate && 
                   tx.currency === currency && eqyComponentSymbols.includes(tx.ticker);
        });
    } else {
        relevantTransactions = transactionData.transactions.filter(tx => {
            const txDate = new Date(tx.timestamp);
            return txDate > startDate && txDate < endDate && 
                   tx.currency === currency && tx.ticker === assetSymbol;
        });
    }

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    const startEntry = historyData.history.find(entry => entry.date === startDateStr);
    const endEntry = historyData.history.find(entry => entry.date === endDateStr);
    
    if (!startEntry || !endEntry) {
        throw new Error(`Could not find portfolio values for ${currency} on the specified dates`);
    }
    
    let startValue = calculateAssetValue(startEntry);
    const endValue = calculateAssetValue(endEntry);

    // Include start date transactions in the starting value
    let startDateTransactions;
    if (assetSymbol === 'OTR') {
        startDateTransactions = transactionData.transactions.filter(tx => {
            const txDate = new Date(tx.timestamp);
            return txDate.getTime() === startDate.getTime() && 
                   tx.currency === currency && otrComponentSymbols.includes(tx.ticker);
        });
    } else if (assetSymbol === 'EQY') {
        startDateTransactions = transactionData.transactions.filter(tx => {
            const txDate = new Date(tx.timestamp);
            return txDate.getTime() === startDate.getTime() && 
                   tx.currency === currency && eqyComponentSymbols.includes(tx.ticker);
        });
    } else {
        startDateTransactions = transactionData.transactions.filter(tx => {
            const txDate = new Date(tx.timestamp);
            return txDate.getTime() === startDate.getTime() && 
                   tx.currency === currency && tx.ticker === assetSymbol;
        });
    }

    startDateTransactions.forEach(tx => {
        if (tx.action === 'increase') {
            startValue += tx.amount;
        }
    });

    // If no cash flows during the period, simple calculation
    if (relevantTransactions.length === 0) {
        if (startValue === 0) return { twr: 0, subPeriodReturns: [0] };
        const twr = (endValue / startValue) - 1;
        return { twr, subPeriodReturns: [twr] };
    }

    // Group cash flows by date
    const cashFlowsByDate = new Map();
    relevantTransactions.forEach(tx => {
        const dateKey = new Date(tx.timestamp).toISOString().split('T')[0];
        if (!cashFlowsByDate.has(dateKey)) {
            cashFlowsByDate.set(dateKey, 0);
        }
        const amount = tx.action === 'increase' ? tx.amount : -tx.amount;
        cashFlowsByDate.set(dateKey, cashFlowsByDate.get(dateKey) + amount);
    });

    const cashFlowDates = Array.from(cashFlowsByDate.keys()).sort();
    const periodDates = [startDateStr, ...cashFlowDates, endDateStr];
    
    const subPeriodReturns = [];
    
    for (let i = 0; i < periodDates.length - 1; i++) {
        const periodStartEntry = historyData.history.find(entry => entry.date === periodDates[i]);
        const periodEndEntry = historyData.history.find(entry => entry.date === periodDates[i + 1]);
        
        if (!periodStartEntry || !periodEndEntry) continue;
        
        let periodStartValue = calculateAssetValue(periodStartEntry);
        const periodEndValue = calculateAssetValue(periodEndEntry);
        
        // FIXED: Handle cash flows correctly for TWR
        // If there's a cash flow on the start date of this period (except the very first period),
        // it should be added to the period start value
        if (i > 0) {
            const periodStartCashFlow = cashFlowsByDate.get(periodDates[i]) || 0;
            periodStartValue += periodStartCashFlow;
        }
        
        // Calculate the return for this sub-period
        if (periodStartValue === 0) {
            subPeriodReturns.push(0);
        } else {
            const subPeriodReturn = (periodEndValue / periodStartValue) - 1;
            subPeriodReturns.push(subPeriodReturn);
        }
    }

    // Compound the returns
    const twr = subPeriodReturns.reduce((acc, ret) => acc * (1 + ret), 1) - 1;
    
    return { twr, subPeriodReturns };
}
    async function calculateHistoricalReturnsWithDates(startDate, endDate) {
        const resultsDiv = document.getElementById('historical-results');
        
        try {
            const historyResponse = await fetch('portfolio_history.json');
            const transactionResponse = await fetch('portfolio_transactions.json');
            
            if (!historyResponse.ok || !transactionResponse.ok) {
                throw new Error('Failed to load portfolio data');
            }
            
            const historyData = await historyResponse.json();
            const transactionData = await transactionResponse.json();
            
            let usdResult, eurResult, usdRiskResult, eurRiskResult;
            const assetResults = {};
            let assets = ['IAU', 'SGOV', 'BINANCE:BTCUSDT', 'RLX'];
            if (eqyCombinedMode) {
                assets.push('EQY');
            } else {
                assets.push('VOO', 'NANC', 'IWDE', 'XUSE');
            }
            if (otrCombinedMode) {
                assets.push('OTR');
            } else {
                assets.push('URNU', 'COPX', 'PALL', 'SIVR');
            }

            if (currentReturnType === 'mwr') {
                // Total portfolio
                usdResult = calculateIRRForCurrency(historyData, transactionData, startDate, endDate, 'USD');
                eurResult = calculateIRRForCurrency(historyData, transactionData, startDate, endDate, 'EUR');
                
                // Risk Assets 
                usdRiskResult = calculateIRRForRiskAssets(historyData, transactionData, startDate, endDate, 'USD');
                eurRiskResult = calculateIRRForRiskAssets(historyData, transactionData, startDate, endDate, 'EUR');
                
                // Individual assets
                assets.forEach(asset => {
                    try {
                        assetResults[asset] = {
                            usd: calculateIRRForAsset(historyData, transactionData, startDate, endDate, 'USD', asset),
                            eur: calculateIRRForAsset(historyData, transactionData, startDate, endDate, 'EUR', asset)
                        };
                    } catch (error) {
                        assetResults[asset] = { usd: null, eur: null };
                    }
                });
            } else {
                // Total portfolio
                usdResult = calculateTWRForCurrency(historyData, transactionData, startDate, endDate, 'USD');
                eurResult = calculateTWRForCurrency(historyData, transactionData, startDate, endDate, 'EUR');
                
                // Risk Assets (excluding SGOV)
                usdRiskResult = calculateTWRForRiskAssets(historyData, transactionData, startDate, endDate, 'USD');
                eurRiskResult = calculateTWRForRiskAssets(historyData, transactionData, startDate, endDate, 'EUR');
                
                // Individual assets
                assets.forEach(asset => {
                    try {
                        assetResults[asset] = {
                            usd: calculateTWRForAsset(historyData, transactionData, startDate, endDate, 'USD', asset),
                            eur: calculateTWRForAsset(historyData, transactionData, startDate, endDate, 'EUR', asset)
                        };
                    } catch (error) {
                        assetResults[asset] = { usd: null, eur: null };
                    }
                });
            }

            const usdValue = currentReturnType === 'mwr' ? usdResult.irr : usdResult.twr;
            const eurValue = currentReturnType === 'mwr' ? eurResult.irr : eurResult.twr;
            const usdRiskValue = currentReturnType === 'mwr' ? usdRiskResult.irr : usdRiskResult.twr;
            const eurRiskValue = currentReturnType === 'mwr' ? eurRiskResult.irr : eurRiskResult.twr;

            // Show only the currency that matches the current display currency
            let htmlContent = '';
            const currency = displayCurrency;
            const totalValue = currency === 'EUR' ? eurValue : usdValue;
            const riskValue = currency === 'EUR' ? eurRiskValue : usdRiskValue;
            
            htmlContent = `
                <div class="historical-results-container">
                    <div class="historical-portfolio-values">
                        <div class="historical-value-item">
                            <span class="historical-label">Total</span>
                            <span class="historical-value ${totalValue >= 0 ? 'positive' : 'negative'}">
                                ${totalValue >= 0 ? '+' : ''}${(totalValue * 100).toFixed(2)}%
                            </span>
                        </div>
                        <div class="historical-value-item">
                            <span class="historical-label">Risk Assets</span>
                            <span class="historical-value ${riskValue >= 0 ? 'positive' : 'negative'}">
                                ${riskValue >= 0 ? '+' : ''}${(riskValue * 100).toFixed(2)}%
                            </span>
                        </div>
                    </div>
                    <div class="historical-assets">
                        <div class="historical-assets-grid">
            `;
            
            // Use consistent order: BTC, IAU, then EQY/equities, SGOV, RLX, then OTR/metals
            let orderedAssets = ['BINANCE:BTCUSDT', 'IAU'];
            if (eqyCombinedMode) {
                orderedAssets.push('EQY');
            } else {
                orderedAssets.push('VOO', 'NANC', 'IWDE', 'XUSE');
            }
            orderedAssets.push('SGOV', 'RLX');
            if (otrCombinedMode) {
                orderedAssets.push('OTR');
            } else {
                orderedAssets.push('URNU', 'COPX', 'PALL', 'SIVR');
            }

            orderedAssets.forEach(asset => {
                const assetResult = assetResults[asset];
                const assetValue = assetResult && assetResult[currency.toLowerCase()] ? 
                    (currentReturnType === 'mwr' ? assetResult[currency.toLowerCase()].irr : assetResult[currency.toLowerCase()].twr) : null;
                const displayName = asset === 'BINANCE:BTCUSDT' ? 'BTC' : asset;
                
                if (assetValue !== null) {
                    htmlContent += `
                        <div class="historical-asset-item">
                            <span class="historical-asset-name">${displayName}</span>
                            <span class="historical-asset-value ${assetValue >= 0 ? 'positive' : 'negative'}">
                                ${assetValue >= 0 ? '+' : ''}${(assetValue * 100).toFixed(2)}%
                            </span>
                        </div>
                    `;
                } else {
                    htmlContent += `
                        <div class="historical-asset-item">
                            <span class="historical-asset-name">${displayName}</span>
                            <span class="historical-asset-value neutral">N/A</span>
                        </div>
                    `;
                }
            });
            
            htmlContent += `
                        </div>
                    </div>
                </div>
            `;

            resultsDiv.innerHTML = htmlContent;

        } catch (error) {
            resultsDiv.innerHTML = `
                <div class="message message-error">
                    Error: ${error.message}
                </div>
            `;
        }
    }

    fetchInitialData(); // Start the process

    // Asset Returns Tracker functionality - make it a function to recalculate when mode changes
    function getAssetsReturns() {
        const assets = [
            { symbol: 'BTC-USD', name: 'Bitcoin' },
            { symbol: 'IAU', name: 'iShares Gold Trust' }
        ];
        
        if (eqyCombinedMode) {
            assets.push({ symbol: 'EQY', name: 'Equities (VOO, NANC, IWDE, XUSE)' });
        } else {
            assets.push(
                { symbol: 'VOO', name: 'Vanguard S&P 500 ETF' },
                { symbol: 'NANC', name: 'NANC ETF' },
                { symbol: 'IWDE.L', name: 'iShares World Developed Markets' },
                { symbol: 'XUSE.AS', name: 'iShares MSCI World ex-USA UCITS ETF' }
            );
        }
        
        if (otrCombinedMode) {
            assets.push({ symbol: 'OTR', name: 'Metals (URNU, COPX, PALL, SIVR)' });
        } else {
            assets.push(
                { symbol: 'URNU.L', name: 'Uranium UCITS ETF' },
                { symbol: 'COPX.L', name: 'Global X Copper Miners ETF' },
                { symbol: 'PALL', name: 'abrdn Physical Palladium Shares ETF' },
                { symbol: 'SIVR', name: 'abrdn Physical Silver Shares ETF' }
            );
        }
        
        return assets;
    }

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
            console.log('Loading asset returns for period:', selectedPeriod);
            const returns = await fetchAssetReturns(selectedPeriod);
            console.log('Asset returns loaded successfully:', returns);
            currentAssetReturns = returns;
            displayAssetReturns(returns, selectedPeriod);
        } catch (error) {
            console.error('Error loading asset returns:', error);
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
        const ASSETS_RETURNS = getAssetsReturns();
        for (let i = 0; i < ASSETS_RETURNS.length; i++) {
            const asset = ASSETS_RETURNS[i];
            try {
                let usdReturn, eurReturn;
                
                if (eqyCombinedMode && asset.symbol === 'EQY') {
                    // EQY combines VOO, NANC, IWDE.L, XUSE.AS - calculate average return
                    const eqyComponents = ['VOO', 'NANC', 'IWDE.L', 'XUSE.AS'];
                    const componentReturns = [];
                    
                    for (const compSymbol of eqyComponents) {
                        try {
                            const compReturn = await calculateAssetReturn(compSymbol, startDate, endDate);
                            componentReturns.push(compReturn);
                            await new Promise(resolve => setTimeout(resolve, 200)); // Delay between requests
                        } catch (error) {
                            // Silently retry - don't log errors
                        }
                    }
                    
                    if (componentReturns.length > 0) {
                        // Calculate average return
                        usdReturn = componentReturns.reduce((sum, r) => sum + r, 0) / componentReturns.length;
                        usdReturn = Math.round(usdReturn * 100) / 100;
                        // Calculate EUR return: (1 + USD return) / (1 + EUR/USD return) - 1
                        eurReturn = ((1 + usdReturn / 100) / (1 + eurUsdReturn / 100) - 1) * 100;
                        eurReturn = Math.round(eurReturn * 100) / 100;
                    } else {
                        // If no components loaded, set to 0 instead of throwing
                        usdReturn = 0;
                        eurReturn = 0;
                    }
                } else if (otrCombinedMode && asset.symbol === 'OTR') {
                    // OTR combines URNU.L, COPX.L, PALL, SIVR - calculate average return
                    const otrComponents = ['URNU.L', 'COPX.L', 'PALL', 'SIVR'];
                    const componentReturns = [];
                    
                    for (const compSymbol of otrComponents) {
                        try {
                            const compReturn = await calculateAssetReturn(compSymbol, startDate, endDate);
                            componentReturns.push(compReturn);
                            await new Promise(resolve => setTimeout(resolve, 200)); // Delay between requests
                        } catch (error) {
                            // Silently retry - don't log errors
                        }
                    }
                    
                    if (componentReturns.length > 0) {
                        // Calculate average return
                        usdReturn = componentReturns.reduce((sum, r) => sum + r, 0) / componentReturns.length;
                        usdReturn = Math.round(usdReturn * 100) / 100;
                        // Calculate EUR return: (1 + USD return) / (1 + EUR/USD return) - 1
                        eurReturn = ((1 + usdReturn / 100) / (1 + eurUsdReturn / 100) - 1) * 100;
                        eurReturn = Math.round(eurReturn * 100) / 100;
                    } else {
                        // If no components loaded, set to 0 instead of throwing
                        usdReturn = 0;
                        eurReturn = 0;
                    }
                } else if (asset.symbol === 'IWDE.L' && !eqyCombinedMode) {
                    // IWDE is EUR-denominated, so calculate return directly in EUR
                    eurReturn = await calculateAssetReturn(asset.symbol, startDate, endDate);
                    // Convert EUR return to USD: (1 + EUR return) * (1 + EUR/USD return) - 1
                    usdReturn = ((1 + eurReturn / 100) * (1 + eurUsdReturn / 100) - 1) * 100;
                    usdReturn = Math.round(usdReturn * 100) / 100;
                } else if (asset.symbol === 'XUSE.AS' && !eqyCombinedMode) {
                    // XUSE is USD-denominated but trades on Amsterdam, calculate normally
                    usdReturn = await calculateAssetReturn(asset.symbol, startDate, endDate);
                    eurReturn = ((1 + usdReturn / 100) / (1 + eurUsdReturn / 100) - 1) * 100;
                    eurReturn = Math.round(eurReturn * 100) / 100;
                } else {
                    // Other assets are USD-denominated
                    usdReturn = await calculateAssetReturn(asset.symbol, startDate, endDate);
                    // Calculate EUR return: (1 + USD return) / (1 + EUR/USD return) - 1
                    eurReturn = ((1 + usdReturn / 100) / (1 + eurUsdReturn / 100) - 1) * 100;
                    eurReturn = Math.round(eurReturn * 100) / 100;
                }
                
                returns.usd[asset.symbol] = usdReturn;
                returns.eur[asset.symbol] = eurReturn;
                
                // Small delay between assets to avoid overwhelming proxies
                const ASSETS_RETURNS_LOCAL = getAssetsReturns();
                if (i < ASSETS_RETURNS_LOCAL.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay
                }
            } catch (error) {
                // Silently continue - don't log, don't throw, just skip this asset
                // Asset will keep retrying in the background via infinite retry
                continue;
            }
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
            `https://corsproxy.io/?${encodeURIComponent(baseUrl)}`,
            `https://api.allorigins.win/raw?url=${encodeURIComponent(baseUrl)}`,
            `https://cors-anywhere.herokuapp.com/${baseUrl}`,
            `https://thingproxy.freeboard.io/fetch/${baseUrl}`
        ];
        
        // Different User-Agent strings to make requests look like different browsers
        const userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ];
        
        // Get a different User-Agent for each symbol to avoid rate limiting
        const ASSETS_RETURNS = getAssetsReturns();
        const symbolIndex = ASSETS_RETURNS.findIndex(asset => asset.symbol === symbol);
        const userAgent = userAgents[symbolIndex % userAgents.length];
        
        // Add small random delay to make requests more unique
        const randomDelay = Math.random() * 500; // 0-500ms random delay
        await new Promise(resolve => setTimeout(resolve, randomDelay));
        
        let lastError;
        let data;
        
        for (const url of proxies) {
            try {
                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': userAgent,
                        'Accept-Language': 'en-US,en;q=0.9'
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

        const ASSETS_RETURNS = getAssetsReturns();
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
        // Display "BTC" instead of "BTC-USD" and "IWDE" instead of "IWDE.L", etc.
        let displayName = asset.symbol;
        if (asset.symbol === 'BTC-USD') {
            displayName = 'BTC';
        } else if (asset.symbol === 'IWDE.L') {
            displayName = 'IWDE';
        } else if (asset.symbol === 'XUSE.AS') {
            displayName = 'XUSE';
        } else if (asset.symbol === 'EQY') {
            displayName = 'EQY';
        } else if (asset.symbol === 'OTR') {
            displayName = 'OTR';
        } else if (asset.symbol === 'URNU.L') {
            displayName = 'URNU';
        } else if (asset.symbol === 'COPX.L') {
            displayName = 'COPX';
        }
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
            errorDiv.className = 'message message-error';
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







