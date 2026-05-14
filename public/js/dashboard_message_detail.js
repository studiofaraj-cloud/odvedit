import { doc, getDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getFirebaseFirestore, getFirebaseAuth, withFirebaseRetry } from './firebase-config.js';
import { escapeHtml, sanitizeDocumentId, validateOrderId, decodeHtml } from './security-utils.js';

const db = getFirebaseFirestore();
const auth = getFirebaseAuth();

let currentMessageId = null;

function showError(message) {
    const errorElement = document.getElementById('error-message');
    errorElement.textContent = message;
    errorElement.classList.add('active');
    setTimeout(() => {
        errorElement.classList.remove('active');
    }, 5000);
}

async function deleteMessage(messageId) {
    const deleteBtn = document.getElementById('delete-btn');
    const confirmBtn = document.getElementById('confirm-delete');
    
    try {
        deleteBtn.disabled = true;
        confirmBtn.disabled = true;
        
        await withFirebaseRetry(async () => {
            await deleteDoc(doc(db, 'contactMessages', messageId));
        }, 'delete message');
        
        window.location.href = 'dashboard_messages.html';
    } catch (error) {
        console.error("Error deleting message: ", error);
        showError('Errore durante l\'eliminazione del messaggio. Riprova.');
        deleteBtn.disabled = false;
        confirmBtn.disabled = false;
        closeModal();
    }
}

function openModal() {
    const modal = document.getElementById('delete-modal');
    modal.classList.add('active');
}

function closeModal() {
    const modal = document.getElementById('delete-modal');
    modal.classList.remove('active');
}

document.addEventListener('DOMContentLoaded', () => {
    const deleteBtn = document.getElementById('delete-btn');
    const cancelBtn = document.getElementById('cancel-delete');
    const confirmBtn = document.getElementById('confirm-delete');
    const modal = document.getElementById('delete-modal');
    
    deleteBtn.addEventListener('click', openModal);
    cancelBtn.addEventListener('click', closeModal);
    confirmBtn.addEventListener('click', () => {
        if (currentMessageId) {
            deleteMessage(currentMessageId);
        }
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
    
    onAuthStateChanged(auth, (user) => {
        if (user) {
            const urlParams = new URLSearchParams(window.location.search);
            const rawMessageId = urlParams.get('id');
            const messageContainer = document.getElementById('message-detail');
            
            if (!rawMessageId) {
                messageContainer.textContent = 'Nessun ID messaggio fornito.';
                return;
            }
            
            // Sanitize and validate document ID
            const messageId = sanitizeDocumentId(rawMessageId);
            if (!messageId || !validateOrderId(messageId)) {
                messageContainer.textContent = 'ID messaggio non valido.';
                return;
            }
            
            currentMessageId = messageId;
            
            if (messageContainer) {
                withFirebaseRetry(async () => {
                    const messageDoc = await getDoc(doc(db, 'contactMessages', messageId));
                    
                    if (messageDoc.exists()) {
                        const message = messageDoc.data();
                        const date = message.timestamp ? new Date(message.timestamp.seconds * 1000).toLocaleString() : 'N/A';
                        
                        let html = '<div class="detail-container">';
                        html += '<div class="detail-row">';
                        html += '<div class="detail-label">ID Messaggio</div>';
                        html += `<div class="detail-value">${escapeHtml(messageDoc.id)}</div>`;
                        html += '</div>';
                        html += '<div class="detail-row">';
                        html += '<div class="detail-label">Nome</div>';
                        html += `<div class="detail-value">${escapeHtml(decodeHtml(message.name || 'N/A'))}</div>`;
                        html += '</div>';
                        html += '<div class="detail-row">';
                        html += '<div class="detail-label">Email</div>';
                        html += `<div class="detail-value">${escapeHtml(decodeHtml(message.email || 'N/A'))}</div>`;
                        html += '</div>';
                        html += '<div class="detail-row">';
                        html += '<div class="detail-label">Messaggio</div>';
                        html += `<div class="detail-value">${escapeHtml(decodeHtml(message.message || 'N/A'))}</div>`;
                        html += '</div>';
                        html += '<div class="detail-row">';
                        html += '<div class="detail-label">Data</div>';
                        html += `<div class="detail-value">${escapeHtml(date)}</div>`;
                        html += '</div>';
                        html += '</div>';
                        
                        messageContainer.innerHTML = html;
                        deleteBtn.style.display = 'inline-block';
                    } else {
                        messageContainer.textContent = 'Messaggio non trovato.';
                    }
                }, 'fetch message details')
                .catch((error) => {
                    console.error("Error fetching message: ", error);
                    messageContainer.textContent = 'Errore nel caricamento del messaggio. Riprova più tardi.';
                });
            }
        }
    });
});
