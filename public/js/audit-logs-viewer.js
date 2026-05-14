import { collection, query, orderBy, limit, getDocs, where } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getFirebaseFirestore, getFirebaseAuth, withFirebaseRetry } from './firebase-config.js';
import { PERMISSIONS, requirePermission } from './rbac.js';
import { formatAuditLogForDisplay } from './audit-logger.js';

const db = getFirebaseFirestore();
const auth = getFirebaseAuth();

let currentFilters = {
    action: '',
    userEmail: '',
    limit: 50
};

async function loadAuditLogs() {
    if (!(await requirePermission(PERMISSIONS.MANAGE_USERS))) {
        return;
    }

    const logsContainer = document.getElementById('audit-logs');
    if (!logsContainer) {
        console.error('[Audit Logs Viewer] Container not found');
        return;
    }

    logsContainer.innerHTML = '<p style="text-align: center; color: #9ca3af;">Caricamento log...</p>';

    try {
        let logsQuery = query(
            collection(db, 'auditLogs'),
            orderBy('timestamp', 'desc'),
            limit(currentFilters.limit)
        );

        if (currentFilters.action) {
            logsQuery = query(
                collection(db, 'auditLogs'),
                where('action', '==', currentFilters.action),
                orderBy('timestamp', 'desc'),
                limit(currentFilters.limit)
            );
        }

        const querySnapshot = await withFirebaseRetry(async () => {
            return await getDocs(logsQuery);
        }, 'get audit logs');

        if (querySnapshot.empty) {
            logsContainer.innerHTML = '<p style="text-align: center; color: #9ca3af;">Nessun log trovato.</p>';
            return;
        }

        let logs = [];
        querySnapshot.forEach(doc => {
            logs.push({
                id: doc.id,
                ...doc.data()
            });
        });

        if (currentFilters.userEmail) {
            logs = logs.filter(log => 
                log.userEmail && log.userEmail.toLowerCase().includes(currentFilters.userEmail.toLowerCase())
            );
        }

        if (logs.length === 0) {
            logsContainer.innerHTML = '<p style="text-align: center; color: #9ca3af;">Nessun log trovato con i filtri applicati.</p>';
            return;
        }

        let html = '<table>';
        html += '<thead><tr>';
        html += '<th>Data/Ora</th>';
        html += '<th>Utente</th>';
        html += '<th>Ruolo</th>';
        html += '<th>Azione</th>';
        html += '<th>Dettagli</th>';
        html += '</tr></thead>';
        html += '<tbody>';

        logs.forEach(log => {
            const formattedLog = formatAuditLogForDisplay(log);
            const actionColor = getActionColor(formattedLog.actionRaw);
            
            const detailsHtml = formatDetails(formattedLog.details);

            html += `<tr>
                <td data-label="Data/Ora">${formattedLog.timestamp}</td>
                <td data-label="Utente">${formattedLog.user || 'N/A'}</td>
                <td data-label="Ruolo">
                    <span style="display: inline-block; padding: 4px 10px; border-radius: 6px; background: #e5e7eb; color: #374151; font-size: 0.85em; font-weight: 600;">
                        ${formattedLog.role || 'unknown'}
                    </span>
                </td>
                <td data-label="Azione">
                    <span class="action-badge" style="background: ${actionColor.bg}; color: ${actionColor.text};">
                        ${formattedLog.action}
                    </span>
                </td>
                <td data-label="Dettagli" class="details-cell">${detailsHtml}</td>
            </tr>`;
        });

        html += '</tbody></table>';
        logsContainer.innerHTML = html;

    } catch (error) {
        console.error('[Audit Logs Viewer] Error loading logs:', error);
        logsContainer.innerHTML = `
            <div style="padding: 20px; text-align: center;">
                <p style="color: #ef4444; font-weight: 500;">Errore nel caricamento dei log</p>
                <button onclick="location.reload()" style="margin-top: 15px; padding: 8px 16px; background: #eab308; color: #1a1a1a; border: none; border-radius: 4px; cursor: pointer; font-weight: 500;">
                    Riprova
                </button>
            </div>
        `;
    }
}

function getActionColor(action) {
    const colors = {
        'order_created': { bg: '#d1fae5', text: '#065f46' },
        'order_updated': { bg: '#dbeafe', text: '#1e40af' },
        'order_status_changed': { bg: '#e0e7ff', text: '#3730a3' },
        'order_deleted': { bg: '#fee2e2', text: '#991b1b' },
        'order_payment_updated': { bg: '#fef3c7', text: '#92400e' },
        'data_exported': { bg: '#fce7f3', text: '#831843' },
        'email_sent': { bg: '#d1fae5', text: '#065f46' },
        'message_deleted': { bg: '#fee2e2', text: '#991b1b' },
        'newsletter_exported': { bg: '#fce7f3', text: '#831843' },
        'user_role_changed': { bg: '#fef3c7', text: '#92400e' },
        'user_created': { bg: '#d1fae5', text: '#065f46' },
        'user_deleted': { bg: '#fee2e2', text: '#991b1b' },
        'login': { bg: '#d1fae5', text: '#065f46' },
        'logout': { bg: '#e5e7eb', text: '#374151' },
        'access_denied': { bg: '#fee2e2', text: '#991b1b' }
    };
    return colors[action] || { bg: '#e5e7eb', text: '#374151' };
}

function formatDetails(details) {
    if (!details || Object.keys(details).length === 0) {
        return '<span style="color: #9ca3af;">Nessun dettaglio</span>';
    }

    const items = [];
    
    if (details.orderId) {
        items.push(`<strong>Ordine:</strong> ${details.orderId}`);
    }
    
    if (details.oldStatus && details.newStatus) {
        items.push(`<strong>Da:</strong> ${details.oldStatus} → <strong>A:</strong> ${details.newStatus}`);
    }
    
    if (details.oldPaymentStatus && details.newPaymentStatus) {
        items.push(`<strong>Pagamento:</strong> ${details.oldPaymentStatus} → ${details.newPaymentStatus}`);
    }
    
    if (details.customerName) {
        items.push(`<strong>Cliente:</strong> ${details.customerName}`);
    }
    
    if (details.total) {
        items.push(`<strong>Totale:</strong> €${details.total}`);
    }
    
    if (details.dataType) {
        items.push(`<strong>Tipo:</strong> ${details.dataType}`);
    }
    
    if (details.recordCount) {
        items.push(`<strong>Records:</strong> ${details.recordCount}`);
    }
    
    if (details.emailType) {
        items.push(`<strong>Tipo Email:</strong> ${details.emailType}`);
    }
    
    if (details.recipientEmail) {
        items.push(`<strong>Destinatario:</strong> ${details.recipientEmail}`);
    }
    
    if (details.targetUserEmail) {
        items.push(`<strong>Utente Target:</strong> ${details.targetUserEmail}`);
    }
    
    if (details.oldRole && details.newRole) {
        items.push(`<strong>Ruolo:</strong> ${details.oldRole} → ${details.newRole}`);
    }
    
    if (details.messageId) {
        items.push(`<strong>Messaggio ID:</strong> ${details.messageId}`);
    }
    
    if (details.senderEmail) {
        items.push(`<strong>Mittente:</strong> ${details.senderEmail}`);
    }
    
    if (details.subscriberCount) {
        items.push(`<strong>Iscritti:</strong> ${details.subscriberCount}`);
    }
    
    if (details.attemptedAction) {
        items.push(`<strong>Azione Tentata:</strong> ${details.attemptedAction}`);
    }
    
    if (details.requiredPermission) {
        items.push(`<strong>Permesso Richiesto:</strong> ${details.requiredPermission}`);
    }

    if (items.length === 0) {
        return `<code style="font-size: 0.85em; color: #6b7280;">${JSON.stringify(details)}</code>`;
    }

    return items.join(' | ');
}

document.addEventListener('DOMContentLoaded', () => {
    const applyFilterBtn = document.getElementById('apply-filter');
    
    if (applyFilterBtn) {
        applyFilterBtn.addEventListener('click', () => {
            currentFilters.action = document.getElementById('action-filter').value;
            currentFilters.userEmail = document.getElementById('user-filter').value;
            currentFilters.limit = parseInt(document.getElementById('limit-filter').value);
            
            loadAuditLogs();
        });
    }
    
    onAuthStateChanged(auth, (user) => {
        if (user) {
            loadAuditLogs();
        }
    });
});

export { loadAuditLogs };
