import { doc, getDoc, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getFirebaseFirestore, getFirebaseAuth, withFirebaseRetry } from './firebase-config.js';
import { getEmailStatusBadge, resendOrderConfirmation } from './email-service.js';
import { PERMISSIONS, requirePermission, hasPermission, disableElementsWithoutPermission } from './rbac.js';
import { logOrderStatusChange, logOrderDeletion, logOrderPaymentUpdate, logEmailSent } from './audit-logger.js';
import { escapeHtml, sanitizeDocumentId, validateOrderId } from './security-utils.js';

const db = getFirebaseFirestore();
const auth = getFirebaseAuth();

let currentOrderId = null;
let currentOrderData = null;

function getStatusBadge(status) {
    const statusMap = {
        'pending': { label: 'In attesa', color: '#f59e0b', bgColor: '#fef3c7', icon: '⏳' },
        'processing': { label: 'In elaborazione', color: '#3b82f6', bgColor: '#dbeafe', icon: '⚙️' },
        'shipped': { label: 'Spedito', color: '#8b5cf6', bgColor: '#ede9fe', icon: '📦' },
        'delivered': { label: 'Consegnato', color: '#10b981', bgColor: '#d1fae5', icon: '✅' },
        'cancelled': { label: 'Annullato', color: '#ef4444', bgColor: '#fee2e2', icon: '❌' }
    };
    
    const statusInfo = statusMap[status] || { label: status || 'N/A', color: '#6b7280', bgColor: '#f3f4f6', icon: '❓' };
    return `<span style="display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px; border-radius: 12px; background: ${statusInfo.bgColor}; color: ${statusInfo.color}; font-weight: 700; font-size: 1.05em; border: 2px solid ${statusInfo.color}60; box-shadow: 0 1px 4px ${statusInfo.color}20;"><span style="font-size: 1.2em;">${statusInfo.icon}</span> <span>${statusInfo.label}</span></span>`;
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
    return `<span style="display: inline-flex; align-items: center; gap: 8px; padding: 12px 20px; border-radius: 16px; background: linear-gradient(135deg, ${statusInfo.bgColor} 0%, ${statusInfo.bgColor}cc 100%); color: ${statusInfo.color}; font-weight: 700; font-size: 1.15em; border: 2px solid ${statusInfo.color}; box-shadow: 0 2px 8px ${statusInfo.color}30; text-transform: uppercase; letter-spacing: 0.5px;"><span style="font-size: 1.3em; font-weight: bold;">${statusInfo.icon}</span> <span>${statusInfo.label}</span></span>`;
}

function getPaymentMethodBadge(paymentMethod) {
    const methodMap = {
        'bank_transfer': { label: 'Bonifico Bancario', icon: '🏦', color: '#f59e0b', bgColor: '#fef3c7' },
        'card': { label: 'Carta di Credito', icon: '💳', color: '#10b981', bgColor: '#d1fae5' },
        'credit card': { label: 'Carta di Credito', icon: '💳', color: '#10b981', bgColor: '#d1fae5' },
        'debit card': { label: 'Carta di Debito', icon: '💳', color: '#10b981', bgColor: '#d1fae5' },
        'paypal': { label: 'PayPal', icon: '💵', color: '#3b82f6', bgColor: '#dbeafe' },
        'PayPal': { label: 'PayPal', icon: '💵', color: '#3b82f6', bgColor: '#dbeafe' },
        'IBAN': { label: 'Bonifico Bancario', icon: '🏦', color: '#f59e0b', bgColor: '#fef3c7' },
        'Apple Pay': { label: 'Apple Pay', icon: '🍎', color: '#000000', bgColor: '#e5e7eb' },
        'Google Pay': { label: 'Google Pay', icon: '🔵', color: '#4285f4', bgColor: '#e8f0fe' }
    };
    
    const methodInfo = methodMap[paymentMethod] || { label: paymentMethod || 'N/A', icon: '❓', color: '#6b7280', bgColor: '#f3f4f6' };
    return `<span style="display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px; border-radius: 12px; background: ${methodInfo.bgColor}; color: ${methodInfo.color}; font-weight: 700; font-size: 1.05em; border: 2px solid ${methodInfo.color}60; box-shadow: 0 1px 4px ${methodInfo.color}20;"><span style="font-size: 1.2em;">${methodInfo.icon}</span> <span>${methodInfo.label}</span></span>`;
}

function showDeleteModal() {
    const modal = document.getElementById('delete-modal');
    const modalDetails = document.getElementById('modal-order-details');
    
    if (currentOrderData && currentOrderId) {
        const customerName = escapeHtml(currentOrderData.customerInfo ? currentOrderData.customerInfo.name : 'N/A');
        const total = currentOrderData.total ? `€${escapeHtml(currentOrderData.total.toFixed(2))}` : 'N/A';
        const date = escapeHtml(currentOrderData.timestamp ? new Date(currentOrderData.timestamp.seconds * 1000).toLocaleString() : 'N/A');
        
        modalDetails.innerHTML = `
            <div class="modal-detail"><span class="modal-detail-label">ID Ordine:</span> ${escapeHtml(currentOrderId)}</div>
            <div class="modal-detail"><span class="modal-detail-label">Cliente:</span> ${customerName}</div>
            <div class="modal-detail"><span class="modal-detail-label">Totale:</span> ${total}</div>
            <div class="modal-detail"><span class="modal-detail-label">Data:</span> ${date}</div>
        `;
    }
    
    modal.style.display = 'block';
}

function hideDeleteModal() {
    const modal = document.getElementById('delete-modal');
    modal.style.display = 'none';
}

function showStatusModal(currentStatus) {
    const modal = document.getElementById('status-modal');
    const statusSelect = document.getElementById('status-modal-select');
    
    if (currentStatus && statusSelect) {
        statusSelect.value = currentStatus;
    }
    
    modal.style.display = 'block';
}

function hideStatusModal() {
    const modal = document.getElementById('status-modal');
    modal.style.display = 'none';
}

async function updateOrderStatus(newStatus) {
    if (!(await hasPermission(PERMISSIONS.EDIT_ORDERS))) {
        hideStatusModal();
        alert('Non hai i permessi per modificare lo stato degli ordini.');
        return;
    }
    
    if (!currentOrderId) {
        alert('Nessun ordine selezionato per l\'aggiornamento.');
        return;
    }
    
    if (!newStatus) {
        alert('Seleziona uno stato valido.');
        return;
    }
    
    const oldStatus = currentOrderData.status;
    
    try {
        await withFirebaseRetry(async () => {
            const orderRef = doc(db, 'orders', currentOrderId);
            await updateDoc(orderRef, {
                status: newStatus,
                lastUpdated: new Date()
            });
        }, 'update order status');
        
        currentOrderData.status = newStatus;
        
        await logOrderStatusChange(currentOrderId, oldStatus, newStatus);
        
        updateStatusBadgeDisplay(newStatus);
        
        hideStatusModal();
        alert('Stato dell\'ordine aggiornato con successo!');
    } catch (error) {
        console.error('Error updating order status:', error);
        hideStatusModal();
        
        let errorMessage = 'Errore durante l\'aggiornamento dello stato dell\'ordine.';
        if (error.code === 'permission-denied') {
            errorMessage = 'Non hai i permessi per aggiornare questo ordine.';
        } else if (error.code === 'not-found') {
            errorMessage = 'Ordine non trovato nel database.';
        } else if (error.code === 'unavailable') {
            errorMessage = 'Servizio temporaneamente non disponibile. Riprova tra qualche istante.';
        } else if (error.message.includes('network')) {
            errorMessage = 'Errore di connessione. Controlla la tua connessione internet.';
        }
        
        alert(errorMessage);
    }
}

function updateStatusBadgeDisplay(newStatus) {
    const statusBadgeElement = document.querySelector('.status-badge-container');
    if (statusBadgeElement) {
        statusBadgeElement.innerHTML = getStatusBadge(newStatus);
    }
}

async function deleteOrder() {
    if (!(await hasPermission(PERMISSIONS.DELETE_ORDERS))) {
        hideDeleteModal();
        alert('Non hai i permessi per eliminare ordini.');
        return;
    }
    
    if (!currentOrderId) {
        alert('Nessun ordine selezionato per l\'eliminazione.');
        return;
    }
    
    try {
        const customerName = currentOrderData?.customerInfo?.name || 'N/A';
        const total = currentOrderData?.total || 0;
        
        await withFirebaseRetry(async () => {
            await deleteDoc(doc(db, 'orders', currentOrderId));
        }, 'delete order');
        
        await logOrderDeletion(currentOrderId, customerName, total);
        
        hideDeleteModal();
        alert('Ordine eliminato con successo!');
        window.location.href = 'dashboard_orders.html';
    } catch (error) {
        console.error('Error deleting order:', error);
        hideDeleteModal();
        alert('Errore durante l\'eliminazione dell\'ordine. Riprova.');
    }
}

async function markOrderAsPaid() {
    if (!(await hasPermission(PERMISSIONS.EDIT_ORDERS))) {
        alert('Non hai i permessi per modificare lo stato di pagamento.');
        return;
    }
    
    if (!currentOrderId) {
        alert('Nessun ordine selezionato.');
        return;
    }
    
    const oldPaymentStatus = currentOrderData?.paymentStatus || 'pending';
    
    try {
        await withFirebaseRetry(async () => {
            const orderRef = doc(db, 'orders', currentOrderId);
            await updateDoc(orderRef, {
                paymentStatus: 'paid',
                lastUpdated: new Date()
            });
        }, 'mark order as paid');
        
        currentOrderData.paymentStatus = 'paid';
        
        await logOrderPaymentUpdate(currentOrderId, oldPaymentStatus, 'paid');
        
        const paymentBadgeContainer = document.querySelector('.status-badge-container').previousElementSibling;
        if (paymentBadgeContainer) {
            paymentBadgeContainer.innerHTML = getPaymentStatusBadge('paid');
        }
        
        const markPaidBtn = document.getElementById('mark-paid-btn');
        if (markPaidBtn) {
            markPaidBtn.style.display = 'none';
        }
        
        alert('Ordine segnato come pagato con successo!');
        location.reload();
    } catch (error) {
        console.error('Error marking order as paid:', error);
        
        let errorMessage = 'Errore durante l\'aggiornamento dello stato di pagamento.';
        if (error.code === 'permission-denied') {
            errorMessage = 'Non hai i permessi per aggiornare questo ordine.';
        } else if (error.code === 'not-found') {
            errorMessage = 'Ordine non trovato nel database.';
        }
        
        alert(errorMessage);
    }
}

window.resendEmail = async function(orderId) {
    if (!orderId) return;
    
    if (!(await hasPermission(PERMISSIONS.SEND_EMAILS))) {
        alert('Non hai i permessi per inviare email.');
        return;
    }
    
    if (!confirm('Sei sicuro di voler inviare/reinviare l\'email di conferma ordine?')) {
        return;
    }
    
    try {
        const result = await resendOrderConfirmation(orderId);
        if (result.success) {
            const order = currentOrderData;
            const recipientEmail = order?.customerInfo?.email || 'N/A';
            await logEmailSent('order_confirmation', recipientEmail, orderId);
            
            alert('Email inviata con successo! Il cliente riceverà l\'email a breve.');
            location.reload();
        } else {
            alert('Errore nell\'invio dell\'email: ' + (result.error || 'Errore sconosciuto'));
        }
    } catch (error) {
        console.error('Error resending email:', error);
        alert('Errore nell\'invio dell\'email. Riprova.');
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const deleteBtn = document.getElementById('delete-order-btn');
    const cancelBtn = document.getElementById('cancel-delete-btn');
    const confirmBtn = document.getElementById('confirm-delete-btn');
    const deleteModal = document.getElementById('delete-modal');
    
    const changeStatusBtn = document.getElementById('change-status-btn');
    const cancelStatusBtn = document.getElementById('cancel-status-btn');
    const confirmStatusBtn = document.getElementById('confirm-status-btn');
    const statusModal = document.getElementById('status-modal');
    
    const markPaidBtn = document.getElementById('mark-paid-btn');
    
    deleteBtn.addEventListener('click', showDeleteModal);
    cancelBtn.addEventListener('click', hideDeleteModal);
    confirmBtn.addEventListener('click', deleteOrder);
    
    if (markPaidBtn) {
        markPaidBtn.addEventListener('click', markOrderAsPaid);
    }
    
    if (changeStatusBtn) {
        changeStatusBtn.addEventListener('click', () => {
            const currentStatus = currentOrderData ? currentOrderData.status : 'pending';
            showStatusModal(currentStatus);
        });
    }
    
    if (cancelStatusBtn) {
        cancelStatusBtn.addEventListener('click', hideStatusModal);
    }
    
    if (confirmStatusBtn) {
        confirmStatusBtn.addEventListener('click', () => {
            const statusSelect = document.getElementById('status-modal-select');
            const newStatus = statusSelect.value;
            updateOrderStatus(newStatus);
        });
    }
    
    window.addEventListener('click', (event) => {
        if (event.target === deleteModal) {
            hideDeleteModal();
        }
        if (event.target === statusModal) {
            hideStatusModal();
        }
    });
    
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            if (!(await requirePermission(PERMISSIONS.VIEW_ORDERS))) {
                return;
            }
            
            const urlParams = new URLSearchParams(window.location.search);
            const rawOrderId = urlParams.get('id');
            const orderContainer = document.getElementById('order-detail');
            
            if (!rawOrderId) {
                orderContainer.textContent = 'Nessun ID ordine fornito.';
                return;
            }
            
            // Sanitize and validate document ID
            const orderId = sanitizeDocumentId(rawOrderId);
            if (!orderId || !validateOrderId(orderId)) {
                orderContainer.textContent = 'ID ordine non valido.';
                return;
            }
            
            currentOrderId = orderId;
            
            await disableElementsWithoutPermission('#delete-order-btn', PERMISSIONS.DELETE_ORDERS);
            await disableElementsWithoutPermission('#change-status-btn', PERMISSIONS.EDIT_ORDERS);
            await disableElementsWithoutPermission('#mark-paid-btn', PERMISSIONS.EDIT_ORDERS);
            
            if (orderContainer) {
                withFirebaseRetry(async () => {
                    const orderDoc = await getDoc(doc(db, 'orders', orderId));
                    
                    if (orderDoc.exists()) {
                        const order = orderDoc.data();
                        currentOrderData = order;
                        
                        // Helper function to safely get customer info
                        const getCustomerInfo = (field, fallback = 'N/A') => {
                            if (!order.customerInfo) return fallback;
                            const value = order.customerInfo[field];
                            if (value === null || value === undefined || value === 'null' || value === '') return fallback;
                            return escapeHtml(String(value));
                        };
                        
                        // Build customer name from name, firstName, or lastName
                        let customerName = getCustomerInfo('name');
                        if (!customerName || customerName === 'N/A' || customerName === 'null null') {
                            const firstName = order.customerInfo?.firstName ? escapeHtml(String(order.customerInfo.firstName)) : '';
                            const lastName = order.customerInfo?.lastName ? escapeHtml(String(order.customerInfo.lastName)) : '';
                            if (firstName || lastName) {
                                customerName = `${firstName} ${lastName}`.trim() || 'N/A';
                            }
                            // Remove "null" strings
                            if (customerName && customerName.includes('null')) {
                                customerName = customerName.replace(/null/gi, '').trim() || 'N/A';
                            }
                        }
                        
                        const date = order.timestamp ? new Date(order.timestamp.seconds * 1000).toLocaleString('it-IT', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                        }) : 'N/A';
                        
                        const customerEmail = getCustomerInfo('email', 'Non specificata');
                        const customerPhone = getCustomerInfo('phone', 'Non specificato');
                        const customerAddress = getCustomerInfo('address', '');
                        const customerHouseNumber = getCustomerInfo('houseNumber', '');
                        const customerCity = getCustomerInfo('city', '');
                        const customerPostalCode = getCustomerInfo('postalCode', '');
                        const customerProvince = getCustomerInfo('province', '');
                        const customerCountry = getCustomerInfo('country', '');
                        const customerCustomCountry = getCustomerInfo('customCountry', '');
                        const customerCompany = getCustomerInfo('company', '');
                        const customerNotes = getCustomerInfo('notes', '');
                        const total = order.total ? `€${escapeHtml(order.total.toFixed(2))}` : 'N/A';
                        const statusBadge = getStatusBadge(order.status);
                        const paymentBadge = getPaymentMethodBadge(order.paymentMethod);
                        const paymentStatusBadge = getPaymentStatusBadge(order.paymentStatus);
                        
                        const isPaid = order.paymentStatus === 'paid';
                        const isFailed = order.paymentStatus === 'failed';
                        const isAwaiting = order.paymentStatus === 'awaiting_payment' || 
                                         order.paymentStatus === 'awaiting payment' || 
                                         order.paymentStatus === 'pending' || 
                                         order.paymentStatus === 'processing';
                        
                        let headerBgColor = '#f9fafb';
                        if (isPaid) headerBgColor = '#f0fdf4';
                        else if (isFailed) headerBgColor = '#fef2f2';
                        else if (isAwaiting) headerBgColor = '#fffbeb';
                        
                        let html = '<div class="detail-container">';
                        
                        html += `<div style="display: flex; gap: 24px; align-items: stretch; padding: 28px; background: ${headerBgColor}; border-radius: 16px; margin-bottom: 28px; flex-wrap: wrap; border: 3px solid ${isPaid ? '#10b981' : isFailed ? '#ef4444' : isAwaiting ? '#f59e0b' : '#e5e7eb'}; box-shadow: 0 4px 12px ${isPaid ? '#10b98120' : isFailed ? '#ef444420' : isAwaiting ? '#f59e0b20' : '#e5e7eb20'};">`;
                        html += '<div style="flex: 1; min-width: 280px; display: flex; flex-direction: column;">';
                        html += '<div style="font-size: 0.8em; color: #6b7280; margin-bottom: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">Stato Pagamento</div>';
                        html += `<div style="margin-top: auto;">${paymentStatusBadge}</div>`;
                        html += '</div>';
                        html += '<div style="flex: 1; min-width: 220px; display: flex; flex-direction: column;">';
                        html += '<div style="font-size: 0.8em; color: #6b7280; margin-bottom: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">Stato Ordine</div>';
                        html += `<div class="status-badge-container" style="margin-top: auto;">${statusBadge}</div>`;
                        html += '</div>';
                        html += '<div style="flex: 1; min-width: 220px; display: flex; flex-direction: column;">';
                        html += '<div style="font-size: 0.8em; color: #6b7280; margin-bottom: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">Metodo di Pagamento</div>';
                        html += `<div style="margin-top: auto;">${paymentBadge}</div>`;
                        html += '</div>';
                        html += '</div>';
                        
                        // Order ID
                        html += '<div class="detail-row">';
                        html += '<div class="detail-label">ID Ordine</div>';
                        html += `<div class="detail-value" style="font-family: monospace; font-weight: 600; color: #6366f1;">${escapeHtml(orderDoc.id)}</div>`;
                        html += '</div>';
                        
                        // Customer Information Section - Grouped together
                        html += '<div style="margin: 28px 0; padding: 24px; background: linear-gradient(135deg, #ffffff 0%, #f9fafb 100%); border-radius: 12px; border: 2px solid #e5e7eb; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);">';
                        html += '<div style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 2px solid #e5e7eb;">';
                        html += '<span style="font-size: 1.5em;">👤</span>';
                        html += '<h3 style="margin: 0; font-size: 1.2em; color: #1f2937; font-weight: 700;">Informazioni Cliente</h3>';
                        html += '</div>';
                        
                        // Name
                        html += '<div style="margin-bottom: 16px; padding: 12px; background: white; border-radius: 8px; border-left: 4px solid #6366f1;">';
                        html += '<div style="font-size: 0.85em; color: #6b7280; margin-bottom: 4px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Nome Cliente</div>';
                        html += `<div style="font-size: 1.1em; color: #1f2937; font-weight: 600;">${customerName}</div>`;
                        html += '</div>';
                        
                        // Contact Information in a grid
                        html += '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 16px; margin-bottom: 16px;">';
                        
                        // Email
                        html += '<div style="padding: 12px; background: white; border-radius: 8px; border-left: 4px solid #10b981;">';
                        html += '<div style="font-size: 0.85em; color: #6b7280; margin-bottom: 4px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Email</div>';
                        html += `<div style="color: #1f2937; font-weight: 500; word-break: break-word;">${customerEmail === 'Non specificata' ? '<span style="color: #9ca3af;">' + customerEmail + '</span>' : `<a href="mailto:${customerEmail}" style="color: #10b981; text-decoration: none;">${customerEmail}</a>`}</div>`;
                        html += '</div>';
                        
                        // Phone
                        html += '<div style="padding: 12px; background: white; border-radius: 8px; border-left: 4px solid #3b82f6;">';
                        html += '<div style="font-size: 0.85em; color: #6b7280; margin-bottom: 4px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Telefono</div>';
                        html += `<div style="color: #1f2937; font-weight: 500; word-break: break-word;">${customerPhone === 'Non specificato' ? '<span style="color: #9ca3af;">' + customerPhone + '</span>' : `<a href="tel:${customerPhone}" style="color: #3b82f6; text-decoration: none;">${customerPhone}</a>`}</div>`;
                        html += '</div>';
                        
                        html += '</div>'; // Close grid
                        
                        // Company (if available)
                        if (customerCompany && customerCompany !== 'N/A' && customerCompany !== '') {
                            html += '<div style="margin-bottom: 16px; padding: 12px; background: white; border-radius: 8px; border-left: 4px solid #f59e0b;">';
                            html += '<div style="font-size: 0.85em; color: #6b7280; margin-bottom: 4px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Azienda</div>';
                            html += `<div style="color: #1f2937; font-weight: 600;">${customerCompany}</div>`;
                            html += '</div>';
                        }
                        
                        // Shipping Address
                        html += '<div style="margin-top: 20px; padding-top: 20px; border-top: 2px solid #e5e7eb;">';
                        html += '<div style="font-size: 0.85em; color: #6b7280; margin-bottom: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Indirizzo di Spedizione</div>';
                        html += '<div style="padding: 16px; background: white; border-radius: 8px; border: 1px solid #e5e7eb; line-height: 1.8;">';
                        
                        const addressParts = [];
                        if (customerAddress && customerAddress !== 'N/A' && customerAddress !== '') {
                            const streetLine = customerHouseNumber && customerHouseNumber !== 'N/A' && customerHouseNumber !== '' ? 
                                `${customerAddress}, ${customerHouseNumber}` : 
                                customerAddress;
                            addressParts.push(`<div style="font-weight: 600; color: #1f2937; font-size: 1.05em;">${streetLine}</div>`);
                        }
                        if (customerPostalCode && customerPostalCode !== 'N/A' || customerCity && customerCity !== 'N/A') {
                            const cityParts = [];
                            if (customerPostalCode && customerPostalCode !== 'N/A' && customerPostalCode !== '') {
                                cityParts.push(`<span style="font-weight: 600;">${customerPostalCode}</span>`);
                            }
                            if (customerCity && customerCity !== 'N/A' && customerCity !== '') {
                                cityParts.push(customerCity);
                            }
                            const postalCityLine = cityParts.join(' ');
                            if (postalCityLine) {
                                addressParts.push(`<div>${postalCityLine}</div>`);
                            }
                        }
                        if (customerProvince && customerProvince !== 'N/A' && customerProvince !== '') {
                            addressParts.push(`<div>${customerProvince}</div>`);
                        }
                        const finalCountry = (customerCountry && customerCountry !== 'N/A' && customerCountry !== '') 
                            ? customerCountry 
                            : (customerCustomCountry && customerCustomCountry !== 'N/A' && customerCustomCountry !== '') 
                                ? customerCustomCountry 
                                : '';
                        if (finalCountry) {
                            addressParts.push(`<div style="font-weight: 600; color: #374151; margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb;">${finalCountry}</div>`);
                        }
                        
                        if (addressParts.length > 0) {
                            html += addressParts.join('');
                        } else {
                            html += '<div style="color: #9ca3af; font-style: italic;">Indirizzo non disponibile</div>';
                        }
                        
                        html += '</div>'; // Close address box
                        html += '</div>'; // Close address section
                        html += '</div>'; // Close customer information section
                        
                        // Display Stripe payment information if available
                        if (order.stripePaymentIntentId || order.stripeCheckoutSessionId || order.stripeCustomerId || order.stripePaymentMethodId) {
                            html += '<div style="margin: 28px 0; padding: 24px; background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%); border-radius: 12px; border: 2px solid #6366f1; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.1);">';
                            html += '<div style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px;">';
                            html += '<span style="font-size: 1.5em;">💳</span>';
                            html += '<h3 style="margin: 0; font-size: 1.2em; color: #1f2937; font-weight: 700;">Verifica Pagamento Stripe</h3>';
                            html += '<span style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; background: #10b981; color: white; border-radius: 20px; font-size: 0.85em; font-weight: 600; margin-left: auto;"><span>✓</span> Verificato</span>';
                            html += '</div>';
                            
                            if (order.stripeCheckoutSessionId) {
                                html += '<div class="detail-row" style="background: white; margin-bottom: 12px; padding: 14px; border-radius: 8px; border-left: 4px solid #6366f1;">';
                                html += '<div class="detail-label" style="font-weight: 600; color: #4b5563;">Checkout Session ID</div>';
                                html += `<div class="detail-value" style="font-family: monospace; font-size: 0.9em; color: #6366f1; word-break: break-all; margin-top: 6px;">${escapeHtml(order.stripeCheckoutSessionId)}</div>`;
                                html += '<div style="font-size: 0.8em; color: #6b7280; margin-top: 4px;">ID sessione Stripe Checkout</div>';
                                html += '</div>';
                            }
                            
                            if (order.stripePaymentIntentId) {
                                html += '<div class="detail-row" style="background: white; margin-bottom: 12px; padding: 14px; border-radius: 8px; border-left: 4px solid #8b5cf6;">';
                                html += '<div class="detail-label" style="font-weight: 600; color: #4b5563;">Payment Intent ID</div>';
                                html += `<div class="detail-value" style="font-family: monospace; font-size: 0.9em; color: #8b5cf6; word-break: break-all; margin-top: 6px;">${escapeHtml(order.stripePaymentIntentId)}</div>`;
                                html += '<div style="font-size: 0.8em; color: #6b7280; margin-top: 4px;">ID transazione di pagamento Stripe</div>';
                                html += '</div>';
                            }
                            
                            if (order.stripeCustomerId) {
                                html += '<div class="detail-row" style="background: white; margin-bottom: 12px; padding: 14px; border-radius: 8px; border-left: 4px solid #10b981;">';
                                html += '<div class="detail-label" style="font-weight: 600; color: #4b5563;">Customer ID</div>';
                                html += `<div class="detail-value" style="font-family: monospace; font-size: 0.9em; color: #10b981; word-break: break-all; margin-top: 6px;">${escapeHtml(order.stripeCustomerId)}</div>`;
                                html += '<div style="font-size: 0.8em; color: #6b7280; margin-top: 4px;">ID cliente Stripe</div>';
                                html += '</div>';
                            }
                            
                            if (order.stripePaymentMethodId) {
                                html += '<div class="detail-row" style="background: white; margin-bottom: 12px; padding: 14px; border-radius: 8px; border-left: 4px solid #f59e0b;">';
                                html += '<div class="detail-label" style="font-weight: 600; color: #4b5563;">Payment Method ID</div>';
                                html += `<div class="detail-value" style="font-family: monospace; font-size: 0.9em; color: #f59e0b; word-break: break-all; margin-top: 6px;">${escapeHtml(order.stripePaymentMethodId)}</div>`;
                                html += '<div style="font-size: 0.8em; color: #6b7280; margin-top: 4px;">ID metodo di pagamento utilizzato</div>';
                                html += '</div>';
                            }
                            
                            if (order.stripePaymentIntentStatus) {
                                html += '<div class="detail-row" style="background: white; margin-bottom: 12px; padding: 14px; border-radius: 8px; border-left: 4px solid #3b82f6;">';
                                html += '<div class="detail-label" style="font-weight: 600; color: #4b5563;">Stato Payment Intent</div>';
                                html += `<div class="detail-value" style="font-weight: 600; color: #3b82f6; margin-top: 6px;">${escapeHtml(order.stripePaymentIntentStatus)}</div>`;
                                html += '</div>';
                            }
                            
                            if (order.paymentMetadata && Object.keys(order.paymentMetadata).length > 0) {
                                html += '<div class="detail-row" style="background: white; padding: 12px; border-radius: 8px;">';
                                html += '<div class="detail-label">Payment Metadata</div>';
                                html += '<div class="detail-value" style="font-size: 0.9em;">';
                                html += '<div style="background: #f3f4f6; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 0.85em; max-height: 200px; overflow-y: auto;">';
                                html += JSON.stringify(order.paymentMetadata, null, 2).replace(/\n/g, '<br>').replace(/ /g, '&nbsp;');
                                html += '</div>';
                                html += '</div>';
                                html += '</div>';
                            }
                            
                            html += '</div>';
                        }
                        
                        // Customer Notes (if available)
                        if (customerNotes && customerNotes !== 'N/A' && customerNotes !== '') {
                            html += '<div class="detail-row">';
                            html += '<div class="detail-label">Note Cliente</div>';
                            html += `<div class="detail-value" style="background: #f9fafb; padding: 12px; border-radius: 8px; border-left: 4px solid #eab308;">${customerNotes}</div>`;
                            html += '</div>';
                        }
                        html += '<div class="detail-row">';
                        html += '<div class="detail-label">Data Ordine</div>';
                        html += `<div class="detail-value">${date}</div>`;
                        html += '</div>';
                        
                        const emailStatus = {
                            emailSent: order.emailSent || false,
                            emailSentAt: order.emailSentAt || null,
                            emailType: order.emailType || null,
                            emailError: order.emailError || null
                        };
                        const emailStatusBadge = getEmailStatusBadge(emailStatus);
                        
                        html += '<div class="detail-row">';
                        html += '<div class="detail-label">Stato Email</div>';
                        html += `<div class="detail-value">${emailStatusBadge}`;
                        if (!order.emailSent || order.emailError) {
                            html += ` <button onclick="resendEmail('${orderId}')" style="margin-left: 10px; padding: 4px 12px; background: #eab308; color: #000; border: none; border-radius: 4px; cursor: pointer; font-weight: 600;">Invia Email</button>`;
                        }
                        html += '</div>';
                        html += '</div>';
                        html += '<div class="detail-row">';
                        html += '<div class="detail-label">Articoli</div>';
                        html += '<div class="detail-value">';
                        
                        if (order.items && order.items.length > 0) {
                            html += '<ul class="items-list">';
                            order.items.forEach((item) => {
                                html += '<li class="item-entry">';
                                const itemName = escapeHtml(item.name || 'N/A');
                                const itemSize = item.size ? ` (${escapeHtml(item.size)})` : '';
                                html += `<div class="item-name">${itemName}${itemSize}</div>`;
                                const quantity = escapeHtml((item.quantity || 0).toString());
                                const price = escapeHtml((item.price || 0).toFixed(2));
                                const subtotal = escapeHtml(((item.quantity || 0) * (item.price || 0)).toFixed(2));
                                html += `<div class="item-details">Quantità: ${quantity} | Prezzo: €${price} | Subtotale: €${subtotal}</div>`;
                                html += '</li>';
                            });
                            html += '</ul>';
                        } else {
                            html += 'Nessun articolo';
                        }
                        
                        html += '</div>';
                        html += '</div>';
                        html += '<div class="detail-row">';
                        html += '<div class="detail-label">Totale</div>';
                        html += `<div class="detail-value total-highlight">${total}</div>`;
                        html += '</div>';
                        html += '</div>';
                        
                        orderContainer.innerHTML = html;
                        
                        const changeStatusBtn = document.getElementById('change-status-btn');
                        if (changeStatusBtn) {
                            changeStatusBtn.style.display = 'inline-block';
                        }
                        
                        const markPaidBtn = document.getElementById('mark-paid-btn');
                        if (markPaidBtn && isAwaiting && !isPaid) {
                            markPaidBtn.style.display = 'inline-block';
                        }
                    } else {
                        orderContainer.textContent = 'Ordine non trovato.';
                    }
                }, 'fetch order details')
                .catch((error) => {
                    console.error("Error fetching order: ", error);
                    orderContainer.textContent = 'Errore nel caricamento dell\'ordine. Riprova più tardi.';
                });
            }
        }
    });
});
