import { collection, query, orderBy, deleteDoc, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getFirebaseFirestore, getFirebaseAuth, withFirebaseRetry } from './firebase-config.js';
import { PERMISSIONS, requirePermission, hasPermission, hideElementsWithoutPermission } from './rbac.js';
import { logOrderDeletion } from './audit-logger.js';
import { escapeHtml, sanitizeDocumentId, decodeHtml } from './security-utils.js';

const db = getFirebaseFirestore();
const auth = getFirebaseAuth();

function formatTimestamp(timestamp) {
    if (!timestamp) return 'N/A';
    
    try {
        const date = timestamp.seconds 
            ? new Date(timestamp.seconds * 1000) 
            : new Date(timestamp);
        
        const options = {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        };
        
        return date.toLocaleString('it-IT', options);
    } catch (error) {
        console.error('Error formatting timestamp:', error);
        return 'N/A';
    }
}

function formatItemsSummary(items) {
    if (!items || items.length === 0) return 'Nessun articolo';
    
    const totalItems = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
    
    const volumeBreakdown = {};
    items.forEach(item => {
        const volume = escapeHtml(item.volume || item.size || 'N/A');
        if (!volumeBreakdown[volume]) {
            volumeBreakdown[volume] = 0;
        }
        volumeBreakdown[volume] += item.quantity || 0;
    });
    
    const volumeDetails = Object.entries(volumeBreakdown)
        .sort(([a], [b]) => {
            if (a === 'N/A') return 1;
            if (b === 'N/A') return -1;
            return parseFloat(a) - parseFloat(b);
        })
        .map(([volume, qty]) => `${qty}×${volume}`)
        .join(', ');
    
    return `${totalItems} articol${totalItems !== 1 ? 'i' : 'o'} (${items.length} prodott${items.length !== 1 ? 'i' : 'o'})<br><small style="color: #6b7280; font-size: 0.85em;">${escapeHtml(volumeDetails)}</small>`;
}

function getStatusDisplay(status) {
    const statusMap = {
        'pending': { label: 'In attesa', color: '#f59e0b' },
        'processing': { label: 'In elaborazione', color: '#3b82f6' },
        'shipped': { label: 'Spedito', color: '#8b5cf6' },
        'delivered': { label: 'Consegnato', color: '#10b981' },
        'cancelled': { label: 'Annullato', color: '#ef4444' }
    };
    
    const statusInfo = statusMap[status] || { label: status || 'N/A', color: '#6b7280' };
    return `<span style="display: inline-block; padding: 4px 12px; border-radius: 12px; background: ${statusInfo.color}20; color: ${statusInfo.color}; font-weight: 500; font-size: 0.85em;">${statusInfo.label}</span>`;
}

function getPaymentStatusBadge(paymentStatus) {
    const statusMap = {
        'paid': { label: 'Pagato', color: '#10b981', bgColor: '#d1fae5', icon: '✓' },
        'awaiting_payment': { label: 'In attesa di pagamento', color: '#f59e0b', bgColor: '#fef3c7', icon: '⏳' },
        'awaiting payment': { label: 'In attesa di pagamento', color: '#f59e0b', bgColor: '#fef3c7', icon: '⏳' },
        'pending': { label: 'In attesa di pagamento', color: '#f59e0b', bgColor: '#fef3c7', icon: '⏳' },
        'processing': { label: 'In elaborazione', color: '#3b82f6', bgColor: '#dbeafe', icon: '⚙️' },
        'failed': { label: 'Fallito', color: '#ef4444', bgColor: '#fee2e2', icon: '✕' }
    };
    
    const statusInfo = statusMap[paymentStatus] || { label: paymentStatus || 'N/A', color: '#6b7280', bgColor: '#f3f4f6', icon: '?' };
    return `<span style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 12px; border-radius: 12px; background: ${statusInfo.bgColor}; color: ${statusInfo.color}; font-weight: 600; font-size: 0.85em; border: 1px solid ${statusInfo.color}40;"><span style="font-size: 1em;">${statusInfo.icon}</span> ${statusInfo.label}</span>`;
}

function getPaymentMethodDisplay(paymentMethod) {
    const methodMap = {
        'bank_transfer': { label: 'Bonifico', icon: '🏦', color: '#f59e0b', bgColor: '#fef3c7' },
        'card': { label: 'Carta', icon: '💳', color: '#10b981', bgColor: '#d1fae5' },
        'credit card': { label: 'Carta di Credito', icon: '💳', color: '#10b981', bgColor: '#d1fae5' },
        'debit card': { label: 'Carta di Debito', icon: '💳', color: '#10b981', bgColor: '#d1fae5' },
        'paypal': { label: 'PayPal', icon: '💵', color: '#3b82f6', bgColor: '#dbeafe' },
        'PayPal': { label: 'PayPal', icon: '💵', color: '#3b82f6', bgColor: '#dbeafe' },
        'IBAN': { label: 'Bonifico', icon: '🏦', color: '#f59e0b', bgColor: '#fef3c7' },
        'Apple Pay': { label: 'Apple Pay', icon: '🍎', color: '#000000', bgColor: '#e5e7eb' },
        'Google Pay': { label: 'Google Pay', icon: '🔵', color: '#4285f4', bgColor: '#e8f0fe' }
    };
    
    const methodInfo = methodMap[paymentMethod] || { label: paymentMethod || 'N/A', icon: '❓', color: '#6b7280', bgColor: '#f3f4f6' };
    return `<span style="display: inline-block; padding: 4px 10px; border-radius: 8px; background: ${methodInfo.bgColor}; color: ${methodInfo.color}; font-weight: 500; font-size: 0.85em;">${methodInfo.icon} ${methodInfo.label}</span>`;
}

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 16px 24px;
        background: ${type === 'success' ? '#10b981' : '#ef4444'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        z-index: 1000;
        font-weight: 500;
        animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

async function handleDeleteOrder(orderId, customerName, total = 0) {
    if (!(await hasPermission(PERMISSIONS.DELETE_ORDERS))) {
        showNotification('Non hai i permessi per eliminare ordini', 'error');
        return;
    }
    
    if (!confirm(`Sei sicuro di voler eliminare l'ordine ${orderId} per ${customerName}?`)) {
        return;
    }
    
    try {
        await withFirebaseRetry(async () => {
            await deleteDoc(doc(db, 'orders', orderId));
        }, 'delete order');
        
        await logOrderDeletion(orderId, customerName, total);
        
        showNotification('Ordine eliminato con successo', 'success');
    } catch (error) {
        console.error('Error deleting order:', error);
        showNotification('Errore durante l\'eliminazione dell\'ordine', 'error');
    }
}

let unsubscribeOrders = null;

function renderOrdersTable(querySnapshot, ordersContainer) {
    console.log('[Dashboard Orders] ✅ Processing', querySnapshot.size, 'order document(s)...');
    
    let html = '<table>';
    html += '<thead><tr>';
    html += '<th>ID Ordine</th>';
    html += '<th>Cliente</th>';
    html += '<th>Articoli</th>';
    html += '<th>Totale</th>';
    html += '<th>Pagamento</th>';
    html += '<th>Stato Pagamento</th>';
    html += '<th>Stato</th>';
    html += '<th>Data</th>';
    html += '<th>Azioni</th>';
    html += '</tr></thead>';
    html += '<tbody>';
    
    querySnapshot.forEach((doc, index) => {
        const order = doc.data();
        console.log(`[Dashboard Orders] --------- Document ${index + 1}/${querySnapshot.size} ---------`);
        console.log('[Dashboard Orders] Document ID:', doc.id);
        console.log('[Dashboard Orders] Document path:', doc.ref.path);
        console.log('[Dashboard Orders] Order data structure:', {
            orderId: order.orderId,
            customerInfo: order.customerInfo,
            items: order.items?.length || 0,
            subtotal: order.subtotal,
            shipping: order.shipping,
            total: order.total,
            paymentMethod: order.paymentMethod,
            paymentStatus: order.paymentStatus,
            status: order.status,
            timestamp: order.timestamp,
            createdAt: order.createdAt
        });
        console.log('[Dashboard Orders] Full order data:', order);
        
        const date = formatTimestamp(order.timestamp || order.createdAt);
        const customerName = escapeHtml(decodeHtml(order.customerInfo?.name || 'N/A'));
        const customerEmail = escapeHtml(decodeHtml(order.customerInfo?.email || ''));
        const total = order.total ? `€${escapeHtml(order.total.toFixed(2))}` : 'N/A';
        const itemsSummary = formatItemsSummary(order.items);
        const statusDisplay = getStatusDisplay(order.status);
        const paymentDisplay = getPaymentMethodDisplay(order.paymentMethod);
        const paymentStatusDisplay = getPaymentStatusBadge(order.paymentStatus);
        
        const isPaid = order.paymentStatus === 'paid';
        const hasStripePayment = !!(order.stripePaymentIntentId || order.stripeCustomerId);
        const rowStyle = isPaid ? 'background: #f0fdf4;' : '';
        
        const sanitizedDocId = sanitizeDocumentId(doc.id);
        
        const stripePaymentIntentId = order.stripePaymentIntentId || '';
        const stripeCheckoutSessionId = order.stripeCheckoutSessionId || '';
        const hasStripeVerification = !!(stripePaymentIntentId || stripeCheckoutSessionId);
        
        const stripeIndicator = hasStripePayment ? '<span style="display: inline-flex; align-items: center; gap: 4px; margin-left: 6px; padding: 4px 10px; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; border-radius: 6px; font-size: 0.75em; font-weight: 600; box-shadow: 0 2px 4px rgba(99, 102, 241, 0.3);"><span style="font-size: 1.1em;">💳</span> Stripe</span>' : '';
        
        const verificationBadge = hasStripeVerification 
            ? '<span style="display: inline-flex; align-items: center; gap: 4px; margin-left: 6px; padding: 4px 10px; background: #10b981; color: white; border-radius: 6px; font-size: 0.75em; font-weight: 600; box-shadow: 0 2px 4px rgba(16, 185, 129, 0.3);"><span style="font-size: 1em;">✓</span> Verificato</span>'
            : '';
        
        html += `<tr style="${rowStyle}">
            <td data-label="ID Ordine"><a href="dashboard_order_detail.html?id=${encodeURIComponent(sanitizedDocId)}" class="id-link">${escapeHtml(doc.id)}</a></td>
            <td data-label="Cliente">${customerName}${customerEmail ? ` (${customerEmail})` : ''}</td>
            <td data-label="Articoli">${itemsSummary}</td>
            <td data-label="Totale" style="font-weight: ${isPaid ? '700' : '600'};">${total}</td>
            <td data-label="Pagamento">${paymentDisplay}${stripeIndicator}${verificationBadge}</td>
            <td data-label="Stato Pagamento">${paymentStatusDisplay}</td>
            <td data-label="Stato">${statusDisplay}</td>
            <td data-label="Data">${escapeHtml(date)}</td>
            <td data-label="Azioni">
                <a href="dashboard_order_detail.html?id=${encodeURIComponent(sanitizedDocId)}" style="color: #eab308; text-decoration: none; font-weight: 500; margin-right: 10px;">Visualizza Dettagli</a>
                <button class="delete-btn" data-order-id="${escapeHtml(sanitizedDocId)}" data-customer-name="${customerName}" style="background: #ef4444; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-weight: 500; font-size: 0.85em;">Elimina</button>
            </td>
        </tr>`;
    });
    
    html += '</tbody></table>';
    ordersContainer.innerHTML = html;
    
    console.log('[Dashboard Orders] ✅ Orders table rendered successfully');
    
    document.querySelectorAll('.delete-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const orderId = e.target.dataset.orderId;
            const customerName = e.target.dataset.customerName;
            handleDeleteOrder(orderId, customerName, 0);
        });
    });
    
    hideElementsWithoutPermission('.delete-btn', PERMISSIONS.DELETE_ORDERS);
}

function handleQueryError(error, ordersContainer) {
    console.error('[Dashboard Orders] ==================== SNAPSHOT ERROR ====================');
    console.error('[Dashboard Orders] ❌ Error type:', error.name);
    console.error('[Dashboard Orders] ❌ Error code:', error.code);
    console.error('[Dashboard Orders] ❌ Error message:', error.message);
    console.error('[Dashboard Orders] ❌ Full error object:', error);
    console.error('[Dashboard Orders] ❌ Error stack:', error.stack);
    let errorMessage = '<div style="padding: 20px; text-align: center;">';
    errorMessage += '<p style="color: #ef4444; font-weight: 500;">Errore nel caricamento degli ordini</p>';
    errorMessage += '<p style="color: #9ca3af; font-size: 0.9em; margin-top: 10px;">';
    
    if (error.code === 'permission-denied') {
        errorMessage += 'Permessi insufficienti per accedere agli ordini.';
    } else if (error.code === 'unavailable') {
        errorMessage += 'Servizio temporaneamente non disponibile. Riprova tra qualche istante.';
    } else {
        errorMessage += 'Si è verificato un errore. Riprova più tardi.';
    }
    
    errorMessage += '</p>';
    errorMessage += `<button onclick="location.reload()" style="margin-top: 15px; padding: 8px 16px; background: #eab308; color: #1a1a1a; border: none; border-radius: 4px; cursor: pointer; font-weight: 500;">Riprova</button>`;
    errorMessage += '</div>';
    
    ordersContainer.innerHTML = errorMessage;
}

async function loadOrders() {
    if (!(await requirePermission(PERMISSIONS.VIEW_ORDERS))) {
        return;
    }
    const ordersContainer = document.getElementById('orders');
    if (!ordersContainer) {
        console.error('[Dashboard Orders] ❌ Orders container element not found!');
        return;
    }
    
    console.log('[Dashboard Orders] ✅ Orders container found');
    
    if (unsubscribeOrders) {
        console.log('[Dashboard Orders] Unsubscribing from previous orders listener');
        unsubscribeOrders();
    }
    
    ordersContainer.innerHTML = '<p style="text-align: center; color: #9ca3af;">Caricamento ordini...</p>';
    
    try {
        console.log('[Dashboard Orders] ==================== STARTING ORDERS QUERY ====================');
        console.log('[Dashboard Orders] Firestore instance exists:', !!db);
        console.log('[Dashboard Orders] Firestore instance type:', typeof db);
        console.log('[Dashboard Orders] Collection name: "orders"');
        console.log('[Dashboard Orders] Current timestamp:', new Date().toISOString());
        
        const ordersCollection = collection(db, 'orders');
        console.log('[Dashboard Orders] Collection reference created:', !!ordersCollection);
        console.log('[Dashboard Orders] Collection path:', ordersCollection.path);
        
        const ordersQuery = query(ordersCollection, orderBy('timestamp', 'desc'));
        console.log('[Dashboard Orders] Query object created:', !!ordersQuery);
        console.log('[Dashboard Orders] Query type:', typeof ordersQuery);
        
        console.log('[Dashboard Orders] Setting up onSnapshot listener...');
        
        unsubscribeOrders = onSnapshot(ordersQuery, (querySnapshot) => {
            console.log('[Dashboard Orders] ==================== SNAPSHOT CALLBACK FIRED ====================');
            console.log('[Dashboard Orders] ✅ Snapshot received at:', new Date().toISOString());
            console.log('[Dashboard Orders] Snapshot object exists:', !!querySnapshot);
            console.log('[Dashboard Orders] Snapshot is empty:', querySnapshot.empty);
            console.log('[Dashboard Orders] Document count:', querySnapshot.size);
            console.log('[Dashboard Orders] Metadata - fromCache:', querySnapshot.metadata?.fromCache);
            console.log('[Dashboard Orders] Metadata - hasPendingWrites:', querySnapshot.metadata?.hasPendingWrites);
            
            if (querySnapshot.empty) {
                console.warn('[Dashboard Orders] ⚠️ Query returned ZERO documents from "orders" collection with timestamp field');
                console.log('[Dashboard Orders] Attempting fallback query with createdAt field...');
                
                const fallbackQuery = query(ordersCollection, orderBy('createdAt', 'desc'));
                
                unsubscribeOrders = onSnapshot(fallbackQuery, (fallbackSnapshot) => {
                    console.log('[Dashboard Orders] ==================== FALLBACK SNAPSHOT CALLBACK FIRED ====================');
                    console.log('[Dashboard Orders] Fallback snapshot received at:', new Date().toISOString());
                    console.log('[Dashboard Orders] Fallback snapshot is empty:', fallbackSnapshot.empty);
                    console.log('[Dashboard Orders] Fallback document count:', fallbackSnapshot.size);
                    
                    if (fallbackSnapshot.empty) {
                        console.warn('[Dashboard Orders] ⚠️ Fallback query also returned ZERO documents');
                        console.log('[Dashboard Orders] This could mean:');
                        console.log('[Dashboard Orders]   1. No orders have been written to Firestore yet');
                        console.log('[Dashboard Orders]   2. Orders are being written to a different collection name');
                        console.log('[Dashboard Orders]   3. Firestore security rules are blocking read access');
                        ordersContainer.innerHTML = '<p style="text-align: center; color: #9ca3af;">Nessun ordine trovato.</p>';
                        return;
                    }
                    
                    console.warn('[Dashboard Orders] ⚠️ WARNING: Orders exist with "createdAt" field instead of "timestamp"!');
                    console.warn('[Dashboard Orders] ⚠️ Found', fallbackSnapshot.size, 'order(s) with incorrect field name');
                    console.warn('[Dashboard Orders] ⚠️ This indicates a data inconsistency that should be fixed');
                    
                    renderOrdersTable(fallbackSnapshot, ordersContainer);
                }, (error) => {
                    handleQueryError(error, ordersContainer);
                });
                
                return;
            }
            
            renderOrdersTable(querySnapshot, ordersContainer);
        }, (error) => {
            handleQueryError(error, ordersContainer);
        });
        
        console.log('[Dashboard Orders] ✅ onSnapshot listener successfully attached');
        
    } catch (error) {
        console.error('[Dashboard Orders] ==================== SETUP ERROR ====================');
        console.error('[Dashboard Orders] ❌ Error during query setup:', error.name);
        console.error('[Dashboard Orders] ❌ Error code:', error.code);
        console.error('[Dashboard Orders] ❌ Error message:', error.message);
        console.error('[Dashboard Orders] ❌ Full error object:', error);
        console.error('[Dashboard Orders] ❌ Error stack:', error.stack);
        let errorMessage = '<div style="padding: 20px; text-align: center;">';
        errorMessage += '<p style="color: #ef4444; font-weight: 500;">Errore nel caricamento degli ordini</p>';
        errorMessage += '<p style="color: #9ca3af; font-size: 0.9em; margin-top: 10px;">Si è verificato un errore. Riprova più tardi.</p>';
        errorMessage += `<button onclick="location.reload()" style="margin-top: 15px; padding: 8px 16px; background: #eab308; color: #1a1a1a; border: none; border-radius: 4px; cursor: pointer; font-weight: 500;">Riprova</button>`;
        errorMessage += '</div>';
        
        ordersContainer.innerHTML = errorMessage;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            loadOrders();
        }
    });
});
