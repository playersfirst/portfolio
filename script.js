document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('dividend_history.json');
        const dividendData = await response.json();

        const portfolio = {
            'VOO': dividendData.holdings.VOO.total_shares,
            'NANC': dividendData.holdings.NANC.total_shares,
            'IAU': 34.0794,
            'SGOV': dividendData.holdings.SGOV.total_shares,
            'BINANCE:BTCUSDT': 0.09314954
        };

    // Initial investments as provided
    const initialInvestments = {
        'VOO': 1195,
        'NANC': 782,
        'IAU': 1904,
        'SGOV': 14296,
        'BINANCE:BTCUSDT': 5400
    };

    // Original investment in Euros
    const originalEuroInvestment = 21500;
    
    // API key from the Python script for stock data
    const apiKey = 'cvneau1r01qq3c7eq690cvneau1r01qq3c7eq69g';
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

    async function fetchExchangeRate() {
        try {
            let response = await fetch("https://playersfirst.github.io/exchange_rate.json");
            let data = await response.json();
            return data.rate;
        } catch (error) {
            console.error("Error fetching exchange rate:", error);
            return 1.0; // Fallback rate
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
        const usdToEurRate = await fetchExchangeRate();
        
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
                    const price = data.c; // Current price
                    const percentChange = data.dp; // Percent change
                    const value = price * shares;
                    
                    // Calculate P&L (current value - initial investment)
                    const pnl = value - initialInvestment;
                    
                    // Add to total portfolio value and P&L
                    totalPortfolioValue += value;
                    totalPnL += pnl;
                    
                    // Store data for charts
                    portfolioData[symbol] = {
                        price,
                        value,
                        pnl,
                        percentChange
                    };
                    
                    // Create table row with the new PnL % column
                    const row = createTableRow(symbol, shares, price, value, pnl, percentChange, initialInvestment);
                    portfolioDataEl.appendChild(row);
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
                        finishLoading(totalPortfolioValue, totalPnL, usdToEurRate);
                    }
                });
        });
        
        // Wait for all requests to complete
        await Promise.allSettled(promises);
        
        // Reset the auto-refresh timer to ensure consistent intervals
        setupAutoRefresh();
    }
    
    // Function to create a table row for a stock
    function createTableRow(symbol, shares, price, value, pnl, percentChange, initialInvestment) {
        const displaySymbol = symbol.includes('BINANCE:') ? 'BTC' : symbol;
    
        // Calculate PnL percentage
        const pnlPercentage = ((value - initialInvestment) / initialInvestment) * 100;
    
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="symbol">${displaySymbol}</td>
            <td>${shares.toFixed(4)}</td>
            <td>$${price.toFixed(2)}</td>
            <td>$${value.toFixed(2)}</td>
            <td class="${pnl >= 0 ? 'positive' : 'negative'}">$${pnl.toFixed(2)}</td>
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
        return row;
    }
    
    // Function to sort the table
    function sortTable(columnIndex) {
        const rows = Array.from(portfolioDataEl.querySelectorAll('tr'));
        const isValueColumn = columnIndex === 3; // Value column is index 3
        
        rows.sort((a, b) => {
            const aCell = a.cells[columnIndex];
            const bCell = b.cells[columnIndex];
            
            // Special handling for value column (default sort)
            if (isValueColumn) {
                const aValue = parseFloat(aCell.textContent.replace('$', ''));
                const bValue = parseFloat(bCell.textContent.replace('$', ''));
                return bValue - aValue; // Descending by default for value
            }
            
            // Handle percentage columns (index 5 and 6)
            if (columnIndex === 5 || columnIndex === 6) {
                const aBadge = aCell.querySelector('.badge');
                const bBadge = bCell.querySelector('.badge');
                
                if (aBadge && bBadge) {
                    const aPerc = parseFloat(aBadge.textContent.replace('%', '').replace('+', ''));
                    const bPerc = parseFloat(bBadge.textContent.replace('%', '').replace('+', ''));
                    return bPerc - aPerc;
                }
                return 0;
            }
            
            // Handle P&L column (index 4)
            if (columnIndex === 4) {
                const aValue = parseFloat(aCell.textContent.replace('$', ''));
                const bValue = parseFloat(bCell.textContent.replace('$', ''));
                return bValue - aValue;
            }
            
            // Default text comparison for other columns
            return aCell.textContent.localeCompare(bCell.textContent);
        });
        
        // Clear the table
        portfolioDataEl.innerHTML = '';
        
        // Re-add the sorted rows
        rows.forEach(row => {
            portfolioDataEl.appendChild(row);
        });
    }
    
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
    
        // Calculate total portfolio value for percentages
        let totalValue = 0;
        Object.keys(portfolio).forEach(symbol => {
            const value = portfolioData[symbol]?.value || 0;
            totalValue += value;
        });
    
        // Process each asset
        Object.keys(portfolio).forEach(symbol => {
            const displaySymbol = symbol.includes('BINANCE:') ? 'BTC' : symbol;
            const value = portfolioData[symbol]?.value || 0;
            const percentage = totalValue > 0 ? (value / totalValue * 100) : 0;
            
            labels.push(displaySymbol);
            data.push(value);
            backgroundColors.push(assetColors[symbol]);
            
            // Store tooltip information
            assetTooltips[displaySymbol] = {
                value: value,
                percentage: percentage,
                class: assetClassLabels[symbol]
            };
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
                                    const value = context.raw;
                                    const percentage = assetTooltips[label].percentage;
                                    const assetClass = assetTooltips[label].class;
                                    
                                    return [
                                        `${label} (${assetClass})`,
                                        `Value: $${value.toFixed(2)}`,
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
            const className = assetClassLabels[symbol];
            if (!classGroups[className]) {
                classGroups[className] = {
                    color: assetColors[symbol],
                    assets: []
                };
            }
            const displaySymbol = symbol.includes('BINANCE:') ? 'BTC' : symbol;
            classGroups[className].assets.push(displaySymbol);
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
    
    // Function to complete the loading process
    function finishLoading(totalValue, totalPnL, exchangeRate) {
        const adjustedTotalValue = totalValue + 2.5;
        
        // Update table total value
        totalValueEl.textContent = `$${adjustedTotalValue.toFixed(2)}`;
        
        // Update total P&L with color coding
        totalPnlEl.textContent = `$${totalPnL.toFixed(2)}`;
        totalPnlEl.className = totalPnL >= 0 ? 'positive' : 'negative';
        
        // Calculate total PnL %
        const totalInitialInvestment = Object.values(initialInvestments).reduce((a, b) => a + b, 0);
        const totalPnLPercentage = (totalPnL / totalInitialInvestment) * 100;
        
        // Update the percentage badge in the table footer
        totalPnlPerc.textContent = `${totalPnLPercentage >= 0 ? '+' : ''}${totalPnLPercentage.toFixed(2)}%`;
        totalPnlPerc.className = `badge ${totalPnLPercentage >= 0 ? 'positive' : 'negative'}`;
        
        // Calculate and update Euro values
        const totalEuros = adjustedTotalValue / exchangeRate;
        const euroPnL = totalEuros - originalEuroInvestment;
        
        totalEurosEl.textContent = `€${totalEuros.toFixed(2)}`;
        euroPnlEl.textContent = `€${euroPnL.toFixed(2)}`;
        euroPnlEl.className = euroPnL >= 0 ? 'positive' : 'negative';
        
        // Calculate total Euro PnL %
        const totalEuroPnLPercentage = (euroPnL / originalEuroInvestment) * 100;
        
        // Update the Euro percentage badge in the table footer
        totalEurosPerc.textContent = `${totalEuroPnLPercentage >= 0 ? '+' : ''}${totalEuroPnLPercentage.toFixed(2)}%`;
        totalEurosPerc.className = `badge ${totalEuroPnLPercentage >= 0 ? 'positive' : 'negative'}`;
        
        // Update the main summary elements
        mainTotalValueEl.textContent = `$${adjustedTotalValue.toFixed(2)}`;
        mainEuroValueEl.textContent = `(€${totalEuros.toFixed(2)})`;
        mainTotalPnlEl.textContent = `$${totalPnL.toFixed(2)}`;
        mainTotalPnlEl.className = totalPnL >= 0 ? 'positive' : 'negative';
        
        // Update the main P&L percentage badge
        mainPnlBadgeEl.textContent = `${totalPnLPercentage >= 0 ? '+' : ''}${totalPnLPercentage.toFixed(2)}%`;
        mainPnlBadgeEl.className = `badge ${totalPnLPercentage >= 0 ? 'positive' : 'negative'}`;
        
        // Update last updated timestamp
        const now = new Date();
        lastUpdatedEl.textContent = now.toLocaleString();
        
        // Hide loading, show table
        loadingEl.style.display = 'none';
        portfolioTable.style.display = 'table';
        
        // Sort by value by default
        sortTable(3);
        
        // Create pie charts
        createPieChart();
        loadHistoryChart(adjustedTotalValue);
    }
} catch (error) {
    console.error('Error loading portfolio data:', error);
}
async function loadHistoryChart(currentPortfolioValue) {
    try {
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
        
        // Get the canvas element
        const historyChartEl = document.getElementById('history-chart');
        const ctx = historyChartEl.getContext('2d');
        
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
        gradient.addColorStop(0, 'rgba(99, 102, 241, 0.4)');
        gradient.addColorStop(1, 'rgba(99, 102, 241, 0.05)');
        
        // Create chart
        window.historyChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dates,
                datasets: [{
                    label: 'Portfolio Value',
                    data: values,
                    borderColor: '#3b82f6',
                    borderWidth: 3,
                    backgroundColor: gradient,
                    fill: true,
                    tension: 0.25,
                    pointRadius: 4,
                    pointHoverRadius: 7,
                    pointBackgroundColor: function(context) {
                        // Highlight the last point (today's value)
                        return context.dataIndex === context.dataset.data.length - 1 ? 
                               '#ec4899' : '#6366f1';
                    },
                    pointBorderColor: function(context) {
                        // Highlight the last point (today's value)
                        return context.dataIndex === context.dataset.data.length - 1 ? 
                               '#ec4899' : '#6366f1';
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
                        text: `Last seven days (${changeDirection} ${Math.abs(changePercentage).toFixed(2)}%)`,
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
                                return (isToday ? 'Current: $' : '$') + context.raw.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
                            },
                            title: function(context) {
                                const isToday = context[0].dataIndex === context[0].dataset.data.length - 1;
                                return context[0].label + (isToday ? ' (Today)' : '');
                            }
                        }
                    }
                },
                scales: {
                    y: {
                    
                        grid: {
                            color: 'rgba(203, 213, 225, 0.5)',
                            borderDash: [5, 5],
                            drawBorder: false
                        },
                        ticks: {
                            font: {
                                family: "'Inter', sans-serif",
                                size: 12
                            },
                            padding: 10,
                            callback: function(value) {
                                return '$' + value.toLocaleString();
                            }
                        }
                    },
                    x: {
                        grid: {
                            display: false,
                            drawBorder: false
                        },
                        ticks: {
                            font: {
                                family: "'Inter', sans-serif",
                                size: 12
                            },
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
            }
        });
        
        // Show the history section
        document.getElementById('history-section').style.display = 'block';
        
    } catch (error) {
        console.error("Error loading historical chart:", error);
    }
}


// Call this function after the initial portfolio data loads
// Add this line to the end of your finishLoading function:
// 
});
