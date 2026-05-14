import { collection, query, orderBy, onSnapshot, where, getDocs, Timestamp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getFirebaseFirestore, getFirebaseAuth, withFirebaseRetry } from './firebase-config.js';
import { PERMISSIONS, requirePermission, hideElementsWithoutPermission } from './rbac.js';
import { logout } from './auth.js';
import { escapeHtml } from './security-utils.js';

const db = getFirebaseFirestore();
const auth = getFirebaseAuth();

let ordersData = [];
let webhooksData = [];
let currentFilters = {
    dateFrom: null,
    dateTo: null,
    paymentStatus: '',
    webhookStatus: ''
};

document.getElementById('logout-btn').addEventListener('click', logout);

function formatCurrency(amount) {
    if (amount === null || amount === undefined) return '€0.00';
    return `€${parseFloat(amount).toFixed(2)}`;
}

function formatTimestamp(timestamp) {
    if (!timestamp) return 'N/A';
    try {
        const date = timestamp.seconds 
            ? new Date(timestamp.seconds * 1000) 
            : new Date(timestamp);
        return date.toLocaleString('it-IT', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (error) {
        return 'N/A';
    }
}

function getPaymentStatusBadge(status) {
    const statusMap = {
        'paid': { label: 'Paid', class: 'success', icon: '✓' },
        'pending': { label: 'Pending', class: 'pending', icon: '⏳' },
        'awaiting_payment': { label: 'Awaiting Payment', class: 'pending', icon: '⏳' },
        'awaiting payment': { label: 'Awaiting Payment', class: 'pending', icon: '⏳' },
        'failed': { label: 'Failed', class: 'failed', icon: '✕' },
        'disputed': { label: 'Disputed', class: 'disputed', icon: '⚠' },
        'refunded': { label: 'Refunded', class: 'disputed', icon: '↩' },
        'processing': { label: 'Processing', class: 'processing', icon: '⚙' }
    };
    const info = statusMap[status] || { label: status || 'Unknown', class: 'pending', icon: '?' };
    return `<span class="badge ${info.class}"><span class="status-icon">${info.icon}</span>${info.label}</span>`;
}

function getWebhookStatusBadge(status) {
    if (status === 'success') {
        return '<span class="badge success"><span class="status-icon">✓</span>Success</span>';
    } else if (status === 'failed') {
        return '<span class="badge failed"><span class="status-icon">✕</span>Failed</span>';
    }
    return '<span class="badge pending"><span class="status-icon">?</span>Unknown</span>';
}

function calculateMetrics(orders, webhooks) {
    const metrics = {
        totalRevenue: 0,
        revenueCount: 0,
        pendingPayments: 0,
        pendingAmount: 0,
        failedPayments: 0,
        failedAmount: 0,
        disputedCount: 0,
        webhookSuccessCount: 0,
        webhookTotalCount: webhooks.length,
        ordersWithPaymentIntent: 0,
        matchedOrders: 0
    };

    orders.forEach(order => {
        const total = parseFloat(order.total) || 0;
        
        if (order.paymentStatus === 'paid') {
            metrics.totalRevenue += total;
            metrics.revenueCount++;
        } else if (order.paymentStatus === 'pending' || order.paymentStatus === 'awaiting_payment' || order.paymentStatus === 'awaiting payment') {
            metrics.pendingPayments++;
            metrics.pendingAmount += total;
        } else if (order.paymentStatus === 'failed') {
            metrics.failedPayments++;
            metrics.failedAmount += total;
        }

        if (order.paymentStatus === 'disputed') {
            metrics.disputedCount++;
        }

        if (order.paymentIntentId || order.stripePaymentIntentId) {
            metrics.ordersWithPaymentIntent++;
        }
    });

    webhooks.forEach(webhook => {
        if (webhook.status === 'success') {
            metrics.webhookSuccessCount++;
        }
    });

    metrics.ordersWithPaymentIntent.forEach(() => {
        const hasMatchingWebhook = webhooks.some(w => w.status === 'success');
        if (hasMatchingWebhook) {
            metrics.matchedOrders++;
        }
    });

    return metrics;
}

function updateMetricsDisplay(metrics) {
    document.getElementById('total-revenue').textContent = formatCurrency(metrics.totalRevenue);
    document.getElementById('revenue-count').textContent = `${metrics.revenueCount} paid order${metrics.revenueCount !== 1 ? 's' : ''}`;
    
    document.getElementById('pending-payments').textContent = metrics.pendingPayments;
    document.getElementById('pending-amount').textContent = formatCurrency(metrics.pendingAmount);
    
    document.getElementById('failed-payments').textContent = metrics.failedPayments;
    document.getElementById('failed-amount').textContent = formatCurrency(metrics.failedAmount);
    
    document.getElementById('disputed-count').textContent = metrics.disputedCount;
    
    const webhookRate = metrics.webhookTotalCount > 0 
        ? Math.round((metrics.webhookSuccessCount / metrics.webhookTotalCount) * 100) 
        : 0;
    document.getElementById('webhook-success-rate').textContent = `${webhookRate}%`;
    document.getElementById('webhook-stats').textContent = `${metrics.webhookSuccessCount}/${metrics.webhookTotalCount} delivered`;
    
    const reconciliationRate = metrics.ordersWithPaymentIntent > 0
        ? Math.round((metrics.matchedOrders / metrics.ordersWithPaymentIntent) * 100)
        : 0;
    document.getElementById('reconciliation-match').textContent = `${reconciliationRate}%`;
    document.getElementById('reconciliation-stats').textContent = `${metrics.matchedOrders} matched`;
}

function applyFilters(data, type) {
    return data.filter(item => {
        const itemDate = item.timestamp?.seconds 
            ? new Date(item.timestamp.seconds * 1000)
            : item.createdAt?.seconds
            ? new Date(item.createdAt.seconds * 1000)
            : new Date(item.timestamp || item.createdAt);

        if (currentFilters.dateFrom) {
            const fromDate = new Date(currentFilters.dateFrom);
            fromDate.setHours(0, 0, 0, 0);
            if (itemDate < fromDate) return false;
        }

        if (currentFilters.dateTo) {
            const toDate = new Date(currentFilters.dateTo);
            toDate.setHours(23, 59, 59, 999);
            if (itemDate > toDate) return false;
        }

        if (type === 'orders' && currentFilters.paymentStatus) {
            if (item.paymentStatus !== currentFilters.paymentStatus) return false;
        }

        if (type === 'webhooks' && currentFilters.webhookStatus) {
            if (item.status !== currentFilters.webhookStatus) return false;
        }

        return true;
    });
}

function renderPaymentsTable(orders) {
    const container = document.getElementById('payments-container');
    
    if (orders.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">💳</div>
                <h3>No payment transactions found</h3>
                <p>Payment transactions will appear here once orders are placed.</p>
            </div>
        `;
        return;
    }

    let html = '<table>';
    html += '<thead><tr>';
    html += '<th>Order ID</th>';
    html += '<th>Customer</th>';
    html += '<th>Amount</th>';
    html += '<th>Payment Method</th>';
    html += '<th>Payment Status</th>';
    html += '<th>Payment Intent</th>';
    html += '<th>Date</th>';
    html += '<th>Actions</th>';
    html += '</tr></thead>';
    html += '<tbody>';

    orders.forEach(order => {
        const orderId = escapeHtml(order.orderId || order.id || 'N/A');
        const customerName = escapeHtml(order.customerInfo?.name || 'N/A');
        const customerEmail = escapeHtml(order.customerInfo?.email || '');
        const amount = formatCurrency(order.total);
        const paymentMethod = escapeHtml(order.paymentMethod || 'N/A');
        const paymentStatus = getPaymentStatusBadge(order.paymentStatus);
        const paymentIntentId = escapeHtml(order.paymentIntentId || order.stripePaymentIntentId || 'N/A');
        const date = formatTimestamp(order.timestamp || order.createdAt);

        html += `<tr>
            <td data-label="Order ID">${orderId}</td>
            <td data-label="Customer">${customerName}${customerEmail ? `<br><small style="color: #6b7280;">${customerEmail}</small>` : ''}</td>
            <td data-label="Amount" style="font-weight: 600;">${amount}</td>
            <td data-label="Payment Method">${paymentMethod}</td>
            <td data-label="Payment Status">${paymentStatus}</td>
            <td data-label="Payment Intent"><code style="font-size: 0.85em;">${paymentIntentId}</code></td>
            <td data-label="Date">${date}</td>
            <td data-label="Actions">
                <a href="dashboard_order_detail.html?id=${encodeURIComponent(order.id)}" class="details-link">View Details</a>
            </td>
        </tr>`;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

function renderWebhooksTable(webhooks) {
    const container = document.getElementById('webhooks-container');
    
    if (webhooks.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🔔</div>
                <h3>No webhook events found</h3>
                <p>Webhook events from Stripe will appear here.</p>
            </div>
        `;
        return;
    }

    let html = '<table>';
    html += '<thead><tr>';
    html += '<th>Event ID</th>';
    html += '<th>Event Type</th>';
    html += '<th>Status</th>';
    html += '<th>Error</th>';
    html += '<th>Retry Count</th>';
    html += '<th>Timestamp</th>';
    html += '</tr></thead>';
    html += '<tbody>';

    webhooks.forEach(webhook => {
        const eventId = escapeHtml(webhook.eventId || 'N/A');
        const eventType = escapeHtml(webhook.eventType || 'N/A');
        const status = getWebhookStatusBadge(webhook.status);
        const error = webhook.error ? escapeHtml(webhook.error) : '-';
        const retryCount = webhook.metadata?.retries || 0;
        const timestamp = formatTimestamp(webhook.timestamp || webhook.createdAt);

        html += `<tr>
            <td data-label="Event ID"><code style="font-size: 0.85em;">${eventId}</code></td>
            <td data-label="Event Type"><span style="font-weight: 500;">${eventType}</span></td>
            <td data-label="Status">${status}</td>
            <td data-label="Error">${error}</td>
            <td data-label="Retry Count">${retryCount}</td>
            <td data-label="Timestamp">${timestamp}</td>
        </tr>`;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

function renderFailedPaymentsTable(orders) {
    const container = document.getElementById('failed-container');
    const failedOrders = orders.filter(o => o.paymentStatus === 'failed');
    
    if (failedOrders.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">✅</div>
                <h3>No failed payments</h3>
                <p>Great! All payments have been processed successfully.</p>
            </div>
        `;
        return;
    }

    let html = '<table>';
    html += '<thead><tr>';
    html += '<th>Order ID</th>';
    html += '<th>Customer</th>';
    html += '<th>Amount</th>';
    html += '<th>Error Message</th>';
    html += '<th>Failed At</th>';
    html += '<th>Actions</th>';
    html += '</tr></thead>';
    html += '<tbody>';

    failedOrders.forEach(order => {
        const orderId = escapeHtml(order.orderId || order.id || 'N/A');
        const customerName = escapeHtml(order.customerInfo?.name || 'N/A');
        const customerEmail = escapeHtml(order.customerInfo?.email || '');
        const amount = formatCurrency(order.total);
        const errorMsg = escapeHtml(order.stripeLastPaymentError || order.paymentError || 'Unknown error');
        const failedAt = formatTimestamp(order.paymentFailedTimestamp || order.timestamp);

        html += `<tr>
            <td data-label="Order ID">${orderId}</td>
            <td data-label="Customer">${customerName}${customerEmail ? `<br><small style="color: #6b7280;">${customerEmail}</small>` : ''}</td>
            <td data-label="Amount" style="font-weight: 600; color: #dc2626;">${amount}</td>
            <td data-label="Error Message"><span style="color: #dc2626; font-size: 0.9em;">${errorMsg}</span></td>
            <td data-label="Failed At">${failedAt}</td>
            <td data-label="Actions">
                <a href="dashboard_order_detail.html?id=${encodeURIComponent(order.id)}" class="details-link">View Details</a>
            </td>
        </tr>`;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

function renderDisputesTable(orders) {
    const container = document.getElementById('disputes-container');
    const disputedOrders = orders.filter(o => o.paymentStatus === 'disputed');
    
    if (disputedOrders.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">✅</div>
                <h3>No active disputes</h3>
                <p>There are no disputed payments at this time.</p>
            </div>
        `;
        return;
    }

    let html = '<table>';
    html += '<thead><tr>';
    html += '<th>Order ID</th>';
    html += '<th>Customer</th>';
    html += '<th>Amount</th>';
    html += '<th>Dispute Reason</th>';
    html += '<th>Disputed At</th>';
    html += '<th>Actions</th>';
    html += '</tr></thead>';
    html += '<tbody>';

    disputedOrders.forEach(order => {
        const orderId = escapeHtml(order.orderId || order.id || 'N/A');
        const customerName = escapeHtml(order.customerInfo?.name || 'N/A');
        const customerEmail = escapeHtml(order.customerInfo?.email || '');
        const amount = formatCurrency(order.total);
        const disputeReason = escapeHtml(order.disputeReason || 'Not specified');
        const disputedAt = formatTimestamp(order.disputedTimestamp || order.timestamp);

        html += `<tr>
            <td data-label="Order ID">${orderId}</td>
            <td data-label="Customer">${customerName}${customerEmail ? `<br><small style="color: #6b7280;">${customerEmail}</small>` : ''}</td>
            <td data-label="Amount" style="font-weight: 600; color: #dc2626;">${amount}</td>
            <td data-label="Dispute Reason"><span style="color: #dc2626; font-size: 0.9em;">${disputeReason}</span></td>
            <td data-label="Disputed At">${disputedAt}</td>
            <td data-label="Actions">
                <a href="dashboard_order_detail.html?id=${encodeURIComponent(order.id)}" class="details-link">View Details</a>
            </td>
        </tr>`;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

function renderReconciliationTable(orders, webhooks) {
    const container = document.getElementById('reconciliation-container');
    
    const ordersWithPayment = orders.filter(o => o.paymentIntentId || o.stripePaymentIntentId);
    
    if (ordersWithPayment.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📋</div>
                <h3>No payment intents to reconcile</h3>
                <p>Orders with payment intents will appear here for reconciliation.</p>
            </div>
        `;
        return;
    }

    let html = '<table>';
    html += '<thead><tr>';
    html += '<th>Order ID</th>';
    html += '<th>Payment Intent</th>';
    html += '<th>Order Status</th>';
    html += '<th>Payment Status</th>';
    html += '<th>Webhook Status</th>';
    html += '<th>Match Status</th>';
    html += '<th>Actions</th>';
    html += '</tr></thead>';
    html += '<tbody>';

    ordersWithPayment.forEach(order => {
        const orderId = escapeHtml(order.orderId || order.id || 'N/A');
        const paymentIntentId = order.paymentIntentId || order.stripePaymentIntentId;
        const orderStatus = escapeHtml(order.status || 'N/A');
        const paymentStatus = getPaymentStatusBadge(order.paymentStatus);
        
        const matchingWebhook = webhooks.find(w => 
            w.rawEvent && w.rawEvent.id && paymentIntentId && 
            (w.eventType === 'payment_intent.succeeded' || w.eventType === 'payment_intent.payment_failed')
        );
        
        const webhookStatus = matchingWebhook 
            ? getWebhookStatusBadge(matchingWebhook.status) 
            : '<span class="badge pending">No Webhook</span>';
        
        const isMatched = order.paymentStatus === 'paid' && matchingWebhook && matchingWebhook.status === 'success';
        const matchStatus = isMatched
            ? '<span class="badge success">✓ Matched</span>'
            : '<span class="badge failed">✕ Mismatch</span>';

        html += `<tr>
            <td data-label="Order ID">${orderId}</td>
            <td data-label="Payment Intent"><code style="font-size: 0.85em;">${escapeHtml(paymentIntentId || 'N/A')}</code></td>
            <td data-label="Order Status">${orderStatus}</td>
            <td data-label="Payment Status">${paymentStatus}</td>
            <td data-label="Webhook Status">${webhookStatus}</td>
            <td data-label="Match Status">${matchStatus}</td>
            <td data-label="Actions">
                <a href="dashboard_order_detail.html?id=${encodeURIComponent(order.id)}" class="details-link">View Details</a>
            </td>
        </tr>`;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

function exportToCSV(data, filename) {
    if (!data || data.length === 0) {
        alert('No data to export');
        return;
    }

    const headers = Object.keys(data[0]);
    const csvRows = [headers.join(',')];

    data.forEach(row => {
        const values = headers.map(header => {
            const value = row[header];
            if (value === null || value === undefined) return '';
            if (typeof value === 'object') {
                if (value.seconds) {
                    return new Date(value.seconds * 1000).toISOString();
                }
                return JSON.stringify(value).replace(/"/g, '""');
            }
            const escaped = String(value).replace(/"/g, '""');
            return `"${escaped}"`;
        });
        csvRows.push(values.join(','));
    });

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function exportToJSON(data, filename) {
    if (!data || data.length === 0) {
        alert('No data to export');
        return;
    }

    const jsonContent = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function setupTabs() {
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;

            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(tc => tc.classList.remove('active'));

            tab.classList.add('active');
            document.getElementById(`tab-${tabName}`).classList.add('active');
        });
    });
}

function setupFilters() {
    document.getElementById('apply-filters').addEventListener('click', () => {
        currentFilters.dateFrom = document.getElementById('date-from').value;
        currentFilters.dateTo = document.getElementById('date-to').value;
        currentFilters.paymentStatus = document.getElementById('payment-status').value;
        currentFilters.webhookStatus = document.getElementById('webhook-status').value;

        const filteredOrders = applyFilters(ordersData, 'orders');
        const filteredWebhooks = applyFilters(webhooksData, 'webhooks');

        renderPaymentsTable(filteredOrders);
        renderWebhooksTable(filteredWebhooks);
        renderFailedPaymentsTable(filteredOrders);
        renderDisputesTable(filteredOrders);
        renderReconciliationTable(filteredOrders, filteredWebhooks);

        const metrics = calculateMetrics(filteredOrders, filteredWebhooks);
        updateMetricsDisplay(metrics);
    });

    document.getElementById('reset-filters').addEventListener('click', () => {
        document.getElementById('date-from').value = '';
        document.getElementById('date-to').value = '';
        document.getElementById('payment-status').value = '';
        document.getElementById('webhook-status').value = '';

        currentFilters = {
            dateFrom: null,
            dateTo: null,
            paymentStatus: '',
            webhookStatus: ''
        };

        renderPaymentsTable(ordersData);
        renderWebhooksTable(webhooksData);
        renderFailedPaymentsTable(ordersData);
        renderDisputesTable(ordersData);
        renderReconciliationTable(ordersData, webhooksData);

        const metrics = calculateMetrics(ordersData, webhooksData);
        updateMetricsDisplay(metrics);
    });

    document.getElementById('export-csv').addEventListener('click', () => {
        const activeTab = document.querySelector('.tab.active').dataset.tab;
        const timestamp = new Date().toISOString().split('T')[0];
        
        if (activeTab === 'payments') {
            exportToCSV(applyFilters(ordersData, 'orders'), `payments-${timestamp}.csv`);
        } else if (activeTab === 'webhooks') {
            exportToCSV(applyFilters(webhooksData, 'webhooks'), `webhooks-${timestamp}.csv`);
        } else if (activeTab === 'failed') {
            const failedOrders = applyFilters(ordersData, 'orders').filter(o => o.paymentStatus === 'failed');
            exportToCSV(failedOrders, `failed-payments-${timestamp}.csv`);
        } else if (activeTab === 'disputes') {
            const disputedOrders = applyFilters(ordersData, 'orders').filter(o => o.paymentStatus === 'disputed');
            exportToCSV(disputedOrders, `disputes-${timestamp}.csv`);
        } else if (activeTab === 'reconciliation') {
            const ordersWithPayment = applyFilters(ordersData, 'orders').filter(o => o.paymentIntentId || o.stripePaymentIntentId);
            exportToCSV(ordersWithPayment, `reconciliation-${timestamp}.csv`);
        }
    });

    document.getElementById('export-json').addEventListener('click', () => {
        const activeTab = document.querySelector('.tab.active').dataset.tab;
        const timestamp = new Date().toISOString().split('T')[0];
        
        if (activeTab === 'payments') {
            exportToJSON(applyFilters(ordersData, 'orders'), `payments-${timestamp}.json`);
        } else if (activeTab === 'webhooks') {
            exportToJSON(applyFilters(webhooksData, 'webhooks'), `webhooks-${timestamp}.json`);
        } else if (activeTab === 'failed') {
            const failedOrders = applyFilters(ordersData, 'orders').filter(o => o.paymentStatus === 'failed');
            exportToJSON(failedOrders, `failed-payments-${timestamp}.json`);
        } else if (activeTab === 'disputes') {
            const disputedOrders = applyFilters(ordersData, 'orders').filter(o => o.paymentStatus === 'disputed');
            exportToJSON(disputedOrders, `disputes-${timestamp}.json`);
        } else if (activeTab === 'reconciliation') {
            const ordersWithPayment = applyFilters(ordersData, 'orders').filter(o => o.paymentIntentId || o.stripePaymentIntentId);
            exportToJSON(ordersWithPayment, `reconciliation-${timestamp}.json`);
        }
    });
}

async function loadPaymentData() {
    if (!(await requirePermission(PERMISSIONS.VIEW_ORDERS))) {
        return;
    }

    try {
        const ordersQuery = query(collection(db, 'orders'), orderBy('timestamp', 'desc'));
        
        onSnapshot(ordersQuery, (snapshot) => {
            ordersData = [];
            snapshot.forEach(doc => {
                ordersData.push({ id: doc.id, ...doc.data() });
            });

            const metrics = calculateMetrics(ordersData, webhooksData);
            updateMetricsDisplay(metrics);
            renderPaymentsTable(ordersData);
            renderFailedPaymentsTable(ordersData);
            renderDisputesTable(ordersData);
            renderReconciliationTable(ordersData, webhooksData);

            console.log('[Payment Monitoring] Orders loaded:', ordersData.length);
        }, (error) => {
            console.error('[Payment Monitoring] Error loading orders:', error);
            document.getElementById('payments-container').innerHTML = 
                '<div class="empty-state"><div class="empty-state-icon">❌</div><h3>Error loading payment data</h3><p>Please refresh the page to try again.</p></div>';
        });

        const webhooksQuery = query(collection(db, 'webhookEvents'), orderBy('timestamp', 'desc'));
        
        onSnapshot(webhooksQuery, (snapshot) => {
            webhooksData = [];
            snapshot.forEach(doc => {
                webhooksData.push({ id: doc.id, ...doc.data() });
            });

            const metrics = calculateMetrics(ordersData, webhooksData);
            updateMetricsDisplay(metrics);
            renderWebhooksTable(webhooksData);
            renderReconciliationTable(ordersData, webhooksData);

            console.log('[Payment Monitoring] Webhooks loaded:', webhooksData.length);
        }, (error) => {
            console.error('[Payment Monitoring] Error loading webhooks:', error);
            document.getElementById('webhooks-container').innerHTML = 
                '<div class="empty-state"><div class="empty-state-icon">❌</div><h3>Error loading webhook data</h3><p>Webhook data may not be available.</p></div>';
        });

    } catch (error) {
        console.error('[Payment Monitoring] Error setting up listeners:', error);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    setupTabs();
    setupFilters();

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            await hideElementsWithoutPermission('#admin-users-nav', PERMISSIONS.MANAGE_USERS);
            await hideElementsWithoutPermission('#audit-logs-nav', PERMISSIONS.MANAGE_USERS);
            await hideElementsWithoutPermission('#payment-monitoring-nav', PERMISSIONS.VIEW_ORDERS);
            loadPaymentData();
        }
    });
});
