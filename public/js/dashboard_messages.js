import { collection, getDocs, query, orderBy, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getFirebaseFirestore, getFirebaseAuth, withFirebaseRetry } from './firebase-config.js';
import { PERMISSIONS, requirePermission, hasPermission, hideElementsWithoutPermission } from './rbac.js';
import { logMessageDeletion } from './audit-logger.js';
import { escapeHtml, sanitizeDocumentId, decodeHtml } from './security-utils.js';

const db = getFirebaseFirestore();
const auth = getFirebaseAuth();

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;

function showNotification(message, isError = false) {
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        background-color: ${isError ? '#dc2626' : '#16a34a'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        z-index: 10000;
        font-size: 14px;
        animation: slideIn 0.3s ease-out;
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function showConfirmModal(message, onConfirm) {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999;
    `;
    
    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
        background: white;
        padding: 30px;
        border-radius: 12px;
        max-width: 400px;
        width: 90%;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
    `;
    
    modalContent.innerHTML = `
        <h3 style="margin: 0 0 15px 0; color: #1f2937; font-size: 18px;">Conferma eliminazione</h3>
        <p style="margin: 0 0 20px 0; color: #6b7280; font-size: 14px;">${message}</p>
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
            <button id="modal-cancel" style="padding: 10px 20px; border: 1px solid #d1d5db; background: white; color: #374151; border-radius: 6px; cursor: pointer; font-size: 14px;">Annulla</button>
            <button id="modal-confirm" style="padding: 10px 20px; border: none; background: #dc2626; color: white; border-radius: 6px; cursor: pointer; font-size: 14px;">Elimina</button>
        </div>
    `;
    
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
    
    document.getElementById('modal-cancel').onclick = () => modal.remove();
    document.getElementById('modal-confirm').onclick = () => {
        modal.remove();
        onConfirm();
    };
    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };
}

function showLoadingState(container) {
    container.innerHTML = `
        <div style="text-align: center; padding: 60px 20px; color: #6b7280;">
            <div style="display: inline-block; width: 40px; height: 40px; border: 4px solid #f3f4f6; border-top-color: #eab308; border-radius: 50%; animation: spin 1s linear infinite;"></div>
            <p style="margin-top: 20px; font-size: 16px; font-weight: 500;">Caricamento messaggi...</p>
        </div>
    `;
}

function showEmptyState(container) {
    container.innerHTML = `
        <div style="text-align: center; padding: 60px 20px; color: #6b7280;">
            <svg style="width: 64px; height: 64px; margin: 0 auto 20px; fill: #d1d5db;" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
            </svg>
            <h3 style="margin: 0 0 10px 0; font-size: 18px; color: #374151; font-weight: 600;">Nessun messaggio</h3>
            <p style="margin: 0; font-size: 14px;">Non ci sono messaggi di contatto da visualizzare.</p>
        </div>
    `;
}

function showErrorState(container, errorMessage, onRetry) {
    container.innerHTML = `
        <div style="text-align: center; padding: 60px 20px; color: #6b7280;">
            <svg style="width: 64px; height: 64px; margin: 0 auto 20px; fill: #ef4444;" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
            </svg>
            <h3 style="margin: 0 0 10px 0; font-size: 18px; color: #374151; font-weight: 600;">Errore nel caricamento</h3>
            <p style="margin: 0 0 20px 0; font-size: 14px; color: #6b7280;">${escapeHtml(errorMessage)}</p>
            <button id="retry-btn" style="padding: 10px 24px; border: none; background: #eab308; color: #1f2937; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500; transition: background-color 0.2s;">
                Riprova
            </button>
        </div>
    `;
    
    const retryBtn = document.getElementById('retry-btn');
    if (retryBtn) {
        retryBtn.addEventListener('click', onRetry);
        retryBtn.addEventListener('mouseenter', () => {
            retryBtn.style.backgroundColor = '#ca8a04';
        });
        retryBtn.addEventListener('mouseleave', () => {
            retryBtn.style.backgroundColor = '#eab308';
        });
    }
}

async function handleDeleteMessage(messageId, senderEmail) {
    if (!(await hasPermission(PERMISSIONS.DELETE_MESSAGES))) {
        showNotification('Non hai i permessi per eliminare messaggi', true);
        return;
    }
    
    showConfirmModal('Sei sicuro di voler eliminare questo messaggio?', async () => {
        try {
            await withFirebaseRetry(async () => {
                await deleteDoc(doc(db, 'contactMessages', messageId));
            }, 'delete message');
            
            await logMessageDeletion(messageId, senderEmail);
            
            showNotification('Messaggio eliminato con successo');
            loadMessages();
        } catch (error) {
            console.error('Error deleting message:', error);
            showNotification('Errore durante l\'eliminazione del messaggio', true);
        }
    });
}

async function fetchMessagesWithRetry(retryCount = 0) {
    try {
        const messagesQuery = query(collection(db, 'contactMessages'), orderBy('timestamp', 'desc'));
        const querySnapshot = await getDocs(messagesQuery);
        return querySnapshot;
    } catch (error) {
        if (retryCount < MAX_RETRY_ATTEMPTS) {
            console.warn(`Firestore query failed, retrying (${retryCount + 1}/${MAX_RETRY_ATTEMPTS})...`, error);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
            return fetchMessagesWithRetry(retryCount + 1);
        } else {
            throw error;
        }
    }
}

function truncateText(text, maxLength = 50) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

function renderMessagesTable(querySnapshot) {
    let html = '<table>';
    html += '<thead><tr><th>ID</th><th>Nome</th><th>Email</th><th>Messaggio</th><th>Data</th><th>Azioni</th></tr></thead>';
    html += '<tbody>';
    
    querySnapshot.forEach((doc) => {
        const message = doc.data();
        const date = message.timestamp ? new Date(message.timestamp.seconds * 1000).toLocaleString() : 'N/A';
        const sanitizedDocId = sanitizeDocumentId(doc.id);
        
        // Truncate the message content for the table view
        const displayMessage = truncateText(decodeHtml(message.message || 'N/A'), 50);
        
        html += `<tr>
            <td data-label="ID"><a href="dashboard_message_detail.html?id=${encodeURIComponent(sanitizedDocId)}" class="id-link">${escapeHtml(doc.id)}</a></td>
            <td data-label="Nome">${escapeHtml(decodeHtml(message.name || 'N/A'))}</td>
            <td data-label="Email">${escapeHtml(decodeHtml(message.email || 'N/A'))}</td>
            <td data-label="Messaggio">${escapeHtml(displayMessage)}</td>
            <td data-label="Data">${escapeHtml(date)}</td>
            <td data-label="Azioni">
                <a href="dashboard_message_detail.html?id=${encodeURIComponent(sanitizedDocId)}" style="color: #eab308; text-decoration: none; font-weight: 500; margin-right: 10px;">Visualizza Dettagli</a>
                <button class="delete-btn" data-id="${escapeHtml(sanitizedDocId)}" style="padding: 5px 10px; border: none; background: #dc2626; color: white; border-radius: 4px; cursor: pointer; font-size: 12px;">Elimina</button>
            </td>
        </tr>`;
    });
    
    html += '</tbody></table>';
    return html;
}

function attachDeleteEventListeners() {
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const messageId = btn.getAttribute('data-id');
            const row = btn.closest('tr');
            const email = row.querySelector('[data-label="Email"]')?.textContent || 'N/A';
            handleDeleteMessage(messageId, email);
        });
    });
}

async function loadMessages() {
    if (!(await requirePermission(PERMISSIONS.VIEW_MESSAGES))) {
        return;
    }
    
    const messagesContainer = document.getElementById('contact-messages');
    if (!messagesContainer) {
        return;
    }
    
    showLoadingState(messagesContainer);
    
    try {
        const querySnapshot = await withFirebaseRetry(async () => {
            return await fetchMessagesWithRetry();
        }, 'fetch messages');
        
        if (querySnapshot.empty) {
            showEmptyState(messagesContainer);
            return;
        }
        
        const tableHtml = renderMessagesTable(querySnapshot);
        messagesContainer.innerHTML = tableHtml;
        
        attachDeleteEventListeners();
        await hideElementsWithoutPermission('.delete-btn', PERMISSIONS.DELETE_MESSAGES);
        
    } catch (error) {
        console.error('Error fetching messages:', error);
        
        let errorMessage = 'Si è verificato un errore durante il caricamento dei messaggi.';
        
        if (error.code === 'permission-denied') {
            errorMessage = 'Non hai i permessi per visualizzare i messaggi.';
        } else if (error.code === 'unavailable') {
            errorMessage = 'Il servizio non è disponibile. Verifica la connessione e riprova.';
        } else if (error.code === 'resource-exhausted') {
            errorMessage = 'Limite di quota superato. Riprova più tardi.';
        } else if (error.message) {
            errorMessage = `Errore: ${error.message}`;
        }
        
        showErrorState(messagesContainer, errorMessage, () => loadMessages());
    }
}

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            loadMessages();
        }
    });
});
