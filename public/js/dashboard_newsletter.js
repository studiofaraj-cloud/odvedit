import { collection, getDocs, query, orderBy, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getFirebaseFirestore, getFirebaseAuth, withFirebaseRetry } from './firebase-config.js';
import { PERMISSIONS, requirePermission, hasPermission } from './rbac.js';
import { logNewsletterExport } from './audit-logger.js';
import { escapeHtml, sanitizeDocumentId, decodeHtml } from './security-utils.js';

const db = getFirebaseFirestore();
const auth = getFirebaseAuth();

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        background: ${type === 'success' ? '#4CAF50' : '#f44336'};
        color: white;
        border-radius: 4px;
        z-index: 10000;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

async function handleDeleteSubscription(subscriptionId, email) {
    if (!confirm(`Sei sicuro di voler eliminare l'iscrizione di ${email}?`)) {
        return;
    }

    try {
        await withFirebaseRetry(async () => {
            await deleteDoc(doc(db, 'newsletterSubscriptions', subscriptionId));
        }, 'delete newsletter subscription');
        
        showNotification('Iscrizione eliminata con successo', 'success');
        loadNewsletterSubscriptions();
    } catch (error) {
        console.error("Error deleting subscription: ", error);
        showNotification('Errore durante l\'eliminazione dell\'iscrizione. Riprova.', 'error');
    }
}

async function loadNewsletterSubscriptions() {
    if (!(await requirePermission(PERMISSIONS.VIEW_NEWSLETTER))) {
        return;
    }
    
    const newsletterContainer = document.getElementById('newsletter-subscriptions');
    if (!newsletterContainer) return;

    try {
        await withFirebaseRetry(async () => {
            const newsletterQuery = query(collection(db, 'newsletterSubscriptions'), orderBy('timestamp', 'desc'));
            const querySnapshot = await getDocs(newsletterQuery);
            
            let html = '<table>';
            html += '<thead><tr><th>Email</th><th>Data Iscrizione</th><th>Azioni</th></tr></thead>';
            html += '<tbody>';
            querySnapshot.forEach((docSnapshot) => {
                const subscription = docSnapshot.data();
                const date = subscription.timestamp ? new Date(subscription.timestamp.seconds * 1000).toLocaleString() : 'N/A';
                const email = escapeHtml(decodeHtml(subscription.email || 'N/A'));
                const sanitizedDocId = sanitizeDocumentId(docSnapshot.id);
                
                html += `<tr>
                    <td data-label="Email">${email}</td>
                    <td data-label="Data">${escapeHtml(date)}</td>
                    <td data-label="Azioni">
                        <button class="delete-btn" data-id="${escapeHtml(sanitizedDocId)}" data-email="${email}">Elimina</button>
                    </td>
                </tr>`;
            });
            html += '</tbody></table>';
            newsletterContainer.innerHTML = html;

            document.querySelectorAll('.delete-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const id = e.target.dataset.id;
                    const email = e.target.dataset.email;
                    handleDeleteSubscription(id, email);
                });
            });
        }, 'fetch newsletter subscriptions');
    } catch (error) {
        console.error("Error fetching newsletter subscriptions: ", error);
        newsletterContainer.innerHTML = '<p>Errore nel caricamento delle iscrizioni. Riprova più tardi.</p>';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            loadNewsletterSubscriptions();
        }
    });
});
