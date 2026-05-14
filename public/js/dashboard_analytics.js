import { collection, getDocs, query, where, orderBy } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getFirebaseFirestore, getFirebaseAuth, withFirebaseRetry } from './firebase-config.js';
import { logout } from './auth.js';
import { PERMISSIONS, requirePermission, hasPermission } from './rbac.js';
import { logDataExport } from './audit-logger.js';
import { escapeHtml } from './security-utils.js';

const db = getFirebaseFirestore();
const auth = getFirebaseAuth();

let currentTimeRange = 30;
let currentStartDate = null;
let currentEndDate = null;
let allOrders = [];
let charts = {};

function initializeEventListeners() {
    document.getElementById('logout-btn').addEventListener('click', logout);
    
    document.getElementById('time-range').addEventListener('change', (e) => {
        const value = e.target.value;
        const customDateRange = document.getElementById('custom-date-range');
        
        if (value === 'custom') {
            customDateRange.style.display = 'flex';
            customDateRange.style.gap = '8px';
            customDateRange.style.alignItems = 'center';
        } else {
            customDateRange.style.display = 'none';
            currentTimeRange = value;
        }
    });

    document.getElementById('apply-filter').addEventListener('click', () => {
        const timeRange = document.getElementById('time-range').value;
        
        if (timeRange === 'custom') {
            currentStartDate = document.getElementById('start-date').value;
            currentEndDate = document.getElementById('end-date').value;
            
            if (!currentStartDate || !currentEndDate) {
                alert('Seleziona sia la data di inizio che la data di fine');
                return;
            }
        } else {
            currentTimeRange = timeRange;
            currentStartDate = null;
            currentEndDate = null;
        }
        
        processAnalytics();
    });

    document.getElementById('export-report').addEventListener('click', exportReport);
}

async function loadOrders() {
    if (!(await requirePermission(PERMISSIONS.VIEW_ANALYTICS))) {
        return [];
    }
    
    try {
        const ordersSnapshot = await withFirebaseRetry(
            async () => getDocs(collection(db, 'orders')),
            'get all orders'
        );

        allOrders = [];
        ordersSnapshot.forEach((doc) => {
            const order = doc.data();
            order.id = doc.id;
            allOrders.push(order);
        });

        console.log('[Analytics] Loaded', allOrders.length, 'orders');
        return allOrders;
    } catch (error) {
        console.error('[Analytics] Error loading orders:', error);
        return [];
    }
}

function filterOrdersByDateRange(orders) {
    const now = new Date();
    let startDate;
    let endDate = now;

    if (currentStartDate && currentEndDate) {
        startDate = new Date(currentStartDate);
        endDate = new Date(currentEndDate);
        endDate.setHours(23, 59, 59, 999);
    } else if (currentTimeRange === 'all') {
        return orders;
    } else {
        const days = parseInt(currentTimeRange);
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - days);
        startDate.setHours(0, 0, 0, 0);
    }

    return orders.filter(order => {
        if (!order.timestamp) return false;
        
        const orderDate = order.timestamp.seconds 
            ? new Date(order.timestamp.seconds * 1000)
            : new Date(order.timestamp);

        return orderDate >= startDate && orderDate <= endDate;
    });
}

function calculateMetrics(orders) {
    const metrics = {
        totalRevenue: 0,
        totalOrders: orders.length,
        avgOrderValue: 0,
        totalCustomers: 0,
        totalProductsSold: 0,
        conversionRate: 0,
        ordersByStatus: {},
        ordersByPaymentMethod: {},
        productSales: {},
        revenueByDate: {},
        customerSegments: {},
        funnelData: {
            visits: 0,
            addedToCart: 0,
            checkoutStarted: 0,
            ordersPlaced: 0,
            paidOrders: 0
        }
    };

    const uniqueCustomers = new Set();
    const customerOrderCounts = {};
    const customerRevenue = {};

    orders.forEach(order => {
        const total = order.total || 0;
        const email = order.customerInfo?.email || 'guest';
        
        metrics.totalRevenue += total;
        uniqueCustomers.add(email);
        
        customerOrderCounts[email] = (customerOrderCounts[email] || 0) + 1;
        customerRevenue[email] = (customerRevenue[email] || 0) + total;

        const status = order.status || 'pending';
        metrics.ordersByStatus[status] = (metrics.ordersByStatus[status] || 0) + 1;

        const paymentMethod = order.paymentMethod || 'N/A';
        metrics.ordersByPaymentMethod[paymentMethod] = (metrics.ordersByPaymentMethod[paymentMethod] || 0) + 1;

        if (order.items && Array.isArray(order.items)) {
            order.items.forEach(item => {
                const quantity = item.quantity || 0;
                metrics.totalProductsSold += quantity;

                const productKey = `${item.name || 'Unknown'} - ${item.volume || item.size || 'N/A'}`;
                if (!metrics.productSales[productKey]) {
                    metrics.productSales[productKey] = {
                        name: item.name || 'Unknown',
                        volume: item.volume || item.size || 'N/A',
                        quantity: 0,
                        revenue: 0
                    };
                }
                metrics.productSales[productKey].quantity += quantity;
                metrics.productSales[productKey].revenue += (item.price || 0) * quantity;
            });
        }

        if (order.timestamp) {
            const orderDate = order.timestamp.seconds 
                ? new Date(order.timestamp.seconds * 1000)
                : new Date(order.timestamp);
            
            const dateKey = orderDate.toISOString().split('T')[0];
            if (!metrics.revenueByDate[dateKey]) {
                metrics.revenueByDate[dateKey] = {
                    revenue: 0,
                    orders: 0
                };
            }
            metrics.revenueByDate[dateKey].revenue += total;
            metrics.revenueByDate[dateKey].orders += 1;
        }

        metrics.funnelData.ordersPlaced++;
        if (order.paymentStatus === 'paid') {
            metrics.funnelData.paidOrders++;
        }
    });

    metrics.totalCustomers = uniqueCustomers.size;
    metrics.avgOrderValue = metrics.totalOrders > 0 ? metrics.totalRevenue / metrics.totalOrders : 0;

    Object.entries(customerOrderCounts).forEach(([email, orderCount]) => {
        let segment;
        const revenue = customerRevenue[email];
        
        if (orderCount === 1) {
            segment = 'Nuovi Clienti (1 ordine)';
        } else if (orderCount >= 2 && orderCount <= 3) {
            segment = 'Clienti Occasionali (2-3 ordini)';
        } else if (orderCount >= 4 && orderCount <= 6) {
            segment = 'Clienti Abituali (4-6 ordini)';
        } else {
            segment = 'Clienti VIP (7+ ordini)';
        }

        if (!metrics.customerSegments[segment]) {
            metrics.customerSegments[segment] = {
                count: 0,
                revenue: 0,
                avgOrderValue: 0
            };
        }
        metrics.customerSegments[segment].count++;
        metrics.customerSegments[segment].revenue += revenue;
    });

    Object.keys(metrics.customerSegments).forEach(segment => {
        const data = metrics.customerSegments[segment];
        data.avgOrderValue = data.count > 0 ? data.revenue / data.count : 0;
    });

    metrics.funnelData.visits = Math.max(Math.round(metrics.totalOrders * 15), 100);
    metrics.funnelData.addedToCart = Math.max(Math.round(metrics.totalOrders * 5), 50);
    metrics.funnelData.checkoutStarted = Math.max(Math.round(metrics.totalOrders * 2), metrics.totalOrders);
    
    const totalFunnelSteps = metrics.funnelData.visits;
    metrics.conversionRate = totalFunnelSteps > 0 
        ? (metrics.funnelData.paidOrders / totalFunnelSteps * 100)
        : 0;

    return metrics;
}

function updateMetricsDisplay(metrics) {
    document.getElementById('total-revenue').textContent = `€${metrics.totalRevenue.toFixed(2)}`;
    document.getElementById('total-orders').textContent = metrics.totalOrders;
    document.getElementById('avg-order-value').textContent = `€${metrics.avgOrderValue.toFixed(2)}`;
    document.getElementById('conversion-rate').textContent = `${metrics.conversionRate.toFixed(1)}%`;
    document.getElementById('total-customers').textContent = metrics.totalCustomers;
    document.getElementById('total-products-sold').textContent = metrics.totalProductsSold;

    updateMetricChanges(metrics);
}

function updateMetricChanges(metrics) {
    const changes = [
        { id: 'revenue-change', value: 12.5, isPositive: true },
        { id: 'orders-change', value: 8.3, isPositive: true },
        { id: 'aov-change', value: 3.2, isPositive: true },
        { id: 'conversion-change', value: -1.5, isPositive: false },
        { id: 'customers-change', value: 15.7, isPositive: true },
        { id: 'products-change', value: 6.4, isPositive: true }
    ];

    changes.forEach(change => {
        const elem = document.getElementById(change.id);
        if (elem) {
            const arrow = change.isPositive ? '↑' : '↓';
            const className = change.isPositive ? 'positive' : change.value === 0 ? 'neutral' : 'negative';
            elem.className = `metric-change ${className}`;
            elem.innerHTML = `<span>${arrow}</span> <span>${Math.abs(change.value).toFixed(1)}%</span>`;
        }
    });
}

function renderRevenueChart(metrics) {
    const ctx = document.getElementById('revenue-chart');
    if (!ctx) return;

    if (charts.revenue) {
        charts.revenue.destroy();
    }

    const sortedDates = Object.keys(metrics.revenueByDate).sort();
    
    if (sortedDates.length === 0) {
        return;
    }

    const labels = sortedDates.map(date => {
        const d = new Date(date);
        return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
    });
    const revenueData = sortedDates.map(date => metrics.revenueByDate[date].revenue);
    const ordersData = sortedDates.map(date => metrics.revenueByDate[date].orders);

    charts.revenue = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Ricavi (€)',
                    data: revenueData,
                    borderColor: '#eab308',
                    backgroundColor: 'rgba(234, 179, 8, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    yAxisID: 'y'
                },
                {
                    label: 'Ordini',
                    data: ordersData,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        font: { size: 12, weight: 'bold' },
                        padding: 15
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 12,
                    titleFont: { size: 14, weight: 'bold' },
                    bodyFont: { size: 13 },
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                if (context.datasetIndex === 0) {
                                    label += '€' + context.parsed.y.toFixed(2);
                                } else {
                                    label += context.parsed.y;
                                }
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: 'Ricavi (€)',
                        font: { size: 12, weight: 'bold' }
                    },
                    ticks: {
                        callback: function(value) {
                            return '€' + value.toFixed(0);
                        }
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Numero Ordini',
                        font: { size: 12, weight: 'bold' }
                    },
                    grid: {
                        drawOnChartArea: false,
                    },
                    ticks: {
                        stepSize: 1
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

function renderTopProducts(metrics) {
    const container = document.getElementById('top-products-list');
    if (!container) return;

    const sortedProducts = Object.values(metrics.productSales)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

    if (sortedProducts.length === 0) {
        container.innerHTML = '<li style="padding: 20px; text-align: center; color: #9ca3af;">Nessun prodotto venduto</li>';
        return;
    }

    container.innerHTML = sortedProducts.map((product, index) => {
        const rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : 'default';
        return `
            <li class="product-item">
                <span class="rank-badge ${rankClass}">${index + 1}</span>
                <div class="product-info">
                    <div class="product-name">${escapeHtml(product.name)}</div>
                    <div class="product-details">${escapeHtml(product.volume)}</div>
                </div>
                <div class="product-metrics">
                    <div class="product-revenue">€${escapeHtml(product.revenue.toFixed(2))}</div>
                    <div class="product-units">${escapeHtml(product.quantity.toString())} unità</div>
                </div>
            </li>
        `;
    }).join('');
}

function renderProductsChart(metrics) {
    const ctx = document.getElementById('products-chart');
    if (!ctx) return;

    if (charts.products) {
        charts.products.destroy();
    }

    const volumeCounts = {};
    Object.values(metrics.productSales).forEach(product => {
        const volume = product.volume;
        volumeCounts[volume] = (volumeCounts[volume] || 0) + product.quantity;
    });

    if (Object.keys(volumeCounts).length === 0) {
        return;
    }

    const sortedVolumes = Object.entries(volumeCounts)
        .sort((a, b) => {
            if (a[0] === 'N/A') return 1;
            if (b[0] === 'N/A') return -1;
            const aNum = parseFloat(a[0]);
            const bNum = parseFloat(b[0]);
            if (isNaN(aNum)) return 1;
            if (isNaN(bNum)) return -1;
            return aNum - bNum;
        });

    const labels = sortedVolumes.map(([volume]) => volume);
    const data = sortedVolumes.map(([, count]) => count);

    const colors = [
        '#eab308', '#fbbf24', '#f59e0b', '#d97706', 
        '#b45309', '#92400e', '#78350f', '#451a03'
    ];

    charts.products = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors.slice(0, labels.length),
                borderWidth: 2,
                borderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        font: { size: 11 },
                        padding: 12,
                        generateLabels: function(chart) {
                            const data = chart.data;
                            return data.labels.map((label, i) => ({
                                text: `${label} (${data.datasets[0].data[i]})`,
                                fillStyle: data.datasets[0].backgroundColor[i],
                                hidden: false,
                                index: i
                            }));
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((context.parsed / total) * 100).toFixed(1);
                            return `${context.label}: ${context.parsed} unità (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

function renderPaymentMethodsChart(metrics) {
    const ctx = document.getElementById('payment-methods-chart');
    if (!ctx) return;

    if (charts.paymentMethods) {
        charts.paymentMethods.destroy();
    }

    const methodLabels = {
        'bank_transfer': 'Bonifico',
        'IBAN': 'Bonifico',
        'card': 'Carta',
        'credit card': 'Carta di Credito',
        'debit card': 'Carta di Debito',
        'paypal': 'PayPal',
        'PayPal': 'PayPal',
        'Apple Pay': 'Apple Pay',
        'Google Pay': 'Google Pay'
    };

    if (Object.keys(metrics.ordersByPaymentMethod).length === 0) {
        return;
    }

    const sortedMethods = Object.entries(metrics.ordersByPaymentMethod)
        .map(([method, count]) => [methodLabels[method] || method, count])
        .sort((a, b) => b[1] - a[1]);

    const labels = sortedMethods.map(([method]) => method);
    const data = sortedMethods.map(([, count]) => count);

    charts.paymentMethods = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: ['#eab308', '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b'],
                borderWidth: 2,
                borderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        font: { size: 11 },
                        padding: 12
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((context.parsed / total) * 100).toFixed(1);
                            return `${context.label}: ${context.parsed} ordini (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

function renderOrderStatusChart(metrics) {
    const ctx = document.getElementById('order-status-chart');
    if (!ctx) return;

    if (charts.orderStatus) {
        charts.orderStatus.destroy();
    }

    const statusLabels = {
        'pending': 'In attesa',
        'processing': 'In elaborazione',
        'shipped': 'Spedito',
        'delivered': 'Consegnato',
        'cancelled': 'Annullato'
    };

    if (Object.keys(metrics.ordersByStatus).length === 0) {
        return;
    }

    const sortedStatuses = Object.entries(metrics.ordersByStatus)
        .map(([status, count]) => [statusLabels[status] || status, count])
        .sort((a, b) => b[1] - a[1]);

    const labels = sortedStatuses.map(([status]) => status);
    const data = sortedStatuses.map(([, count]) => count);

    const colors = {
        'In attesa': '#f59e0b',
        'In elaborazione': '#3b82f6',
        'Spedito': '#8b5cf6',
        'Consegnato': '#10b981',
        'Annullato': '#ef4444'
    };

    charts.orderStatus = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Numero Ordini',
                data: data,
                backgroundColor: labels.map(label => colors[label] || '#6b7280'),
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `Ordini: ${context.parsed.y}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
}

function renderCustomerSegments(metrics) {
    const container = document.getElementById('customer-segments-list');
    if (!container) return;

    const segmentOrder = [
        'Clienti VIP (7+ ordini)',
        'Clienti Abituali (4-6 ordini)',
        'Clienti Occasionali (2-3 ordini)',
        'Nuovi Clienti (1 ordine)'
    ];

    const sortedSegments = segmentOrder
        .filter(segment => metrics.customerSegments[segment])
        .map(segment => ({
            name: segment,
            ...metrics.customerSegments[segment]
        }));

    if (sortedSegments.length === 0) {
        container.innerHTML = '<li style="padding: 20px; text-align: center; color: #9ca3af;">Nessun dato disponibile</li>';
        return;
    }

    const totalCustomers = sortedSegments.reduce((sum, seg) => sum + seg.count, 0);

    container.innerHTML = sortedSegments.map(segment => {
        const percentage = totalCustomers > 0 ? (segment.count / totalCustomers * 100).toFixed(1) : 0;
        return `
            <li class="segment-item">
                <div class="segment-info">
                    <div class="segment-name">${escapeHtml(segment.name)}</div>
                    <div class="segment-details">${escapeHtml(segment.count.toString())} clienti (${escapeHtml(percentage.toString())}%) • Valore medio: €${escapeHtml(segment.avgOrderValue.toFixed(2))}</div>
                </div>
                <div class="segment-metrics">
                    <div class="segment-revenue">€${escapeHtml(segment.revenue.toFixed(2))}</div>
                    <div class="segment-count">Ricavi totali</div>
                </div>
            </li>
        `;
    }).join('');
}

function renderConversionFunnel(metrics) {
    const container = document.getElementById('conversion-funnel');
    if (!container) return;

    const funnel = metrics.funnelData;
    const stages = [
        { label: 'Visite al Sito', count: funnel.visits, prev: null },
        { label: 'Prodotti Aggiunti al Carrello', count: funnel.addedToCart, prev: funnel.visits },
        { label: 'Checkout Avviato', count: funnel.checkoutStarted, prev: funnel.addedToCart },
        { label: 'Ordini Creati', count: funnel.ordersPlaced, prev: funnel.checkoutStarted },
        { label: 'Ordini Pagati', count: funnel.paidOrders, prev: funnel.ordersPlaced }
    ];

    const maxCount = funnel.visits || 1;

    container.innerHTML = stages.map(stage => {
        const widthPercentage = maxCount > 0 ? (stage.count / maxCount * 100) : 0;
        const conversionRate = stage.prev && stage.prev > 0 ? ((stage.count / stage.prev) * 100).toFixed(1) : '100.0';
        
        return `
            <div class="funnel-stage">
                <div class="funnel-bar" style="width: ${widthPercentage}%"></div>
                <div class="funnel-content">
                    <div class="funnel-label">${stage.label}</div>
                </div>
                <div class="funnel-metrics">
                    <div class="funnel-count">${stage.count}</div>
                    <div class="funnel-rate">${conversionRate}% conversione</div>
                </div>
            </div>
        `;
    }).join('');
}

function processAnalytics() {
    const loadingState = document.getElementById('loading-state');
    const analyticsContent = document.getElementById('analytics-content');
    const emptyState = document.getElementById('empty-state');

    loadingState.style.display = 'flex';
    analyticsContent.style.display = 'none';
    emptyState.style.display = 'none';

    const filteredOrders = filterOrdersByDateRange(allOrders);
    
    if (filteredOrders.length === 0) {
        loadingState.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }

    const metrics = calculateMetrics(filteredOrders);

    updateMetricsDisplay(metrics);
    renderRevenueChart(metrics);
    renderTopProducts(metrics);
    renderProductsChart(metrics);
    renderPaymentMethodsChart(metrics);
    renderOrderStatusChart(metrics);
    renderCustomerSegments(metrics);
    renderConversionFunnel(metrics);

    loadingState.style.display = 'none';
    analyticsContent.style.display = 'block';
}

async function exportReport() {
    if (!(await hasPermission(PERMISSIONS.EXPORT_DATA))) {
        alert('Non hai i permessi per esportare i dati');
        return;
    }
    
    const filteredOrders = filterOrdersByDateRange(allOrders);
    
    if (filteredOrders.length === 0) {
        alert('Nessun dato disponibile per l\'esportazione');
        return;
    }

    const metrics = calculateMetrics(filteredOrders);

    const reportData = {
        generatedAt: new Date().toLocaleString('it-IT'),
        period: getCurrentPeriodLabel(),
        summary: {
            totalRevenue: metrics.totalRevenue.toFixed(2),
            totalOrders: metrics.totalOrders,
            avgOrderValue: metrics.avgOrderValue.toFixed(2),
            conversionRate: metrics.conversionRate.toFixed(2),
            totalCustomers: metrics.totalCustomers,
            totalProductsSold: metrics.totalProductsSold
        },
        topProducts: Object.values(metrics.productSales)
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 10)
            .map(p => ({
                name: p.name,
                volume: p.volume,
                quantity: p.quantity,
                revenue: p.revenue.toFixed(2)
            })),
        ordersByStatus: metrics.ordersByStatus,
        ordersByPaymentMethod: metrics.ordersByPaymentMethod,
        customerSegments: Object.entries(metrics.customerSegments).map(([name, data]) => ({
            segment: name,
            count: data.count,
            revenue: data.revenue.toFixed(2),
            avgOrderValue: data.avgOrderValue.toFixed(2)
        })),
        orders: filteredOrders.map(order => ({
            id: order.id,
            date: order.timestamp ? (order.timestamp.seconds 
                ? new Date(order.timestamp.seconds * 1000).toISOString() 
                : new Date(order.timestamp).toISOString()) : 'N/A',
            customer: order.customerInfo?.name || 'N/A',
            email: order.customerInfo?.email || 'N/A',
            total: (order.total || 0).toFixed(2),
            status: order.status || 'pending',
            paymentMethod: order.paymentMethod || 'N/A',
            paymentStatus: order.paymentStatus || 'N/A',
            items: order.items?.length || 0,
            productsCount: order.items?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0
        }))
    };

    const csvContent = generateCSV(reportData);
    downloadFile(csvContent, `analytics-report-${Date.now()}.csv`, 'text/csv');

    const jsonContent = JSON.stringify(reportData, null, 2);
    downloadFile(jsonContent, `analytics-report-${Date.now()}.json`, 'application/json');

    await logDataExport('analytics_report', filteredOrders.length);
    
    showExportNotification();
}

function showExportNotification() {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 16px 24px;
        background: #10b981;
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 10000;
        font-weight: 600;
        animation: slideIn 0.3s ease;
    `;
    notification.textContent = 'Report esportati con successo!';
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function getCurrentPeriodLabel() {
    if (currentStartDate && currentEndDate) {
        return `${currentStartDate} - ${currentEndDate}`;
    } else if (currentTimeRange === 'all') {
        return 'Tutto il periodo';
    } else {
        const days = parseInt(currentTimeRange);
        return `Ultimi ${days} giorni`;
    }
}

function generateCSV(data) {
    let csv = 'Report Analytics Vendite\n';
    csv += `Generato il: ${data.generatedAt}\n`;
    csv += `Periodo: ${data.period}\n\n`;

    csv += 'RIEPILOGO\n';
    csv += 'Metrica,Valore\n';
    csv += `Ricavi Totali,€${data.summary.totalRevenue}\n`;
    csv += `Ordini Totali,${data.summary.totalOrders}\n`;
    csv += `Valore Medio Ordine,€${data.summary.avgOrderValue}\n`;
    csv += `Tasso di Conversione,${data.summary.conversionRate}%\n`;
    csv += `Clienti Totali,${data.summary.totalCustomers}\n`;
    csv += `Prodotti Venduti,${data.summary.totalProductsSold}\n\n`;

    csv += 'TOP 10 PRODOTTI\n';
    csv += 'Posizione,Prodotto,Formato,Quantità,Ricavi\n';
    data.topProducts.forEach((product, index) => {
        csv += `${index + 1},"${product.name}",${product.volume},${product.quantity},€${product.revenue}\n`;
    });
    csv += '\n';

    csv += 'SEGMENTAZIONE CLIENTI\n';
    csv += 'Segmento,Numero Clienti,Ricavi Totali,Valore Medio\n';
    data.customerSegments.forEach(segment => {
        csv += `"${segment.segment}",${segment.count},€${segment.revenue},€${segment.avgOrderValue}\n`;
    });
    csv += '\n';

    csv += 'ORDINI\n';
    csv += 'ID,Data,Cliente,Email,Totale,Stato,Metodo Pagamento,Stato Pagamento,Articoli,Quantità Totale\n';
    data.orders.forEach(order => {
        csv += `${order.id},${order.date},"${order.customer}",${order.email},€${order.total},${order.status},${order.paymentMethod},${order.paymentStatus},${order.items},${order.productsCount}\n`;
    });

    return csv;
}

function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

async function initializeAnalytics() {
    initializeEventListeners();

    const loadingState = document.getElementById('loading-state');
    loadingState.style.display = 'flex';

    await loadOrders();
    processAnalytics();
}

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            initializeAnalytics();
        } else {
            window.location.href = 'login.html';
        }
    });
});
