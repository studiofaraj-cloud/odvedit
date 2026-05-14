import { checkAuth } from './auth.js';
import { getFirebaseFirestore } from './firebase-config.js';
import { collection, query, orderBy, limit, getDocs, where } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

let allLogs = [];
let filteredLogs = [];

async function loadAbuseLogs() {
    checkAuth();
    
    const db = getFirebaseFirestore();
    const logsContainer = document.getElementById('abuse-logs');
    
    try {
        logsContainer.innerHTML = '<div style="text-align: center; padding: 40px;">Caricamento logs...</div>';
        
        // Query abuse logs (last 100 entries)
        const logsQuery = query(
            collection(db, 'abuseLogs'),
            orderBy('timestamp', 'desc'),
            limit(100)
        );
        
        const querySnapshot = await getDocs(logsQuery);
        
        allLogs = [];
        querySnapshot.forEach((doc) => {
            allLogs.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        console.log(`Loaded ${allLogs.length} abuse logs`);
        
        // Update statistics
        updateStatistics();
        
        // Apply filters and render
        applyFilters();
        
    } catch (error) {
        console.error('Error loading abuse logs:', error);
        logsContainer.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #dc2626;">
                <p><strong>Errore nel caricamento dei logs</strong></p>
                <p style="font-size: 14px; color: #6b7280;">${error.message}</p>
            </div>
        `;
    }
}

function updateStatistics() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const stats = {
        total: allLogs.length,
        abuse: allLogs.filter(log => log.severity === 'abuse').length,
        suspicious: allLogs.filter(log => log.severity === 'suspicious').length,
        today: allLogs.filter(log => {
            const logDate = log.timestamp?.toDate ? log.timestamp.toDate() : new Date(log.timestamp);
            return logDate >= todayStart;
        }).length
    };
    
    document.getElementById('stat-total').textContent = stats.total;
    document.getElementById('stat-abuse').textContent = stats.abuse;
    document.getElementById('stat-suspicious').textContent = stats.suspicious;
    document.getElementById('stat-today').textContent = stats.today;
}

function applyFilters() {
    const severityFilter = document.getElementById('filter-severity').value;
    const typeFilter = document.getElementById('filter-type').value;
    const identifierFilter = document.getElementById('filter-identifier').value.toLowerCase();
    
    filteredLogs = allLogs.filter(log => {
        // Severity filter
        if (severityFilter !== 'all' && log.severity !== severityFilter) {
            return false;
        }
        
        // Type filter
        if (typeFilter !== 'all' && log.type !== typeFilter) {
            return false;
        }
        
        // Identifier filter
        if (identifierFilter && !log.identifier.toLowerCase().includes(identifierFilter)) {
            return false;
        }
        
        return true;
    });
    
    renderLogs();
}

function renderLogs() {
    const logsContainer = document.getElementById('abuse-logs');
    
    if (filteredLogs.length === 0) {
        logsContainer.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #6b7280;">
                <p><strong>Nessun log trovato</strong></p>
                <p style="font-size: 14px;">Prova a modificare i filtri o aggiornare la pagina.</p>
            </div>
        `;
        return;
    }
    
    logsContainer.innerHTML = filteredLogs.map(log => renderLogEntry(log)).join('');
}

function renderLogEntry(log) {
    const timestamp = log.timestamp?.toDate ? log.timestamp.toDate() : new Date(log.timestamp);
    const formattedDate = formatDate(timestamp);
    const formattedTime = formatTime(timestamp);
    
    const severityClass = `severity-${log.severity}`;
    const severityLabel = log.severity.toUpperCase();
    
    return `
        <div class="log-entry">
            <div class="log-header">
                <div>
                    <span class="severity-badge ${severityClass}">${severityLabel}</span>
                    <span class="type-badge">${log.type}</span>
                </div>
                <div class="log-timestamp">${formattedDate} ${formattedTime}</div>
            </div>
            
            <div class="log-identifier">
                <strong>Identifier:</strong> ${escapeHtml(log.identifier)}
            </div>
            
            ${log.resourceId ? `
                <div style="font-size: 14px; color: #6b7280; margin-top: 4px;">
                    <strong>Resource ID:</strong> ${escapeHtml(log.resourceId)}
                </div>
            ` : ''}
            
            <div class="log-reason">
                <strong>Motivo:</strong> ${escapeHtml(log.reason)}
            </div>
        </div>
    `;
}

function formatDate(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

function formatTime(date) {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    loadAbuseLogs();
    
    // Filter event listeners
    document.getElementById('filter-severity').addEventListener('change', applyFilters);
    document.getElementById('filter-type').addEventListener('change', applyFilters);
    document.getElementById('filter-identifier').addEventListener('input', applyFilters);
    document.getElementById('refresh-btn').addEventListener('click', loadAbuseLogs);
});
