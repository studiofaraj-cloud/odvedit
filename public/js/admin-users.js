import { collection, getDocs, query, orderBy, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getFirebaseFirestore, getFirebaseAuth, withFirebaseRetry } from './firebase-config.js';
import { ROLES, PERMISSIONS, requirePermission, getCurrentUserRole, getRoleDisplayName, getRoleBadgeColor } from './rbac.js';
import { logUserRoleChange } from './audit-logger.js';

const db = getFirebaseFirestore();
const auth = getFirebaseAuth();

async function loadAdminUsers() {
    if (!(await requirePermission(PERMISSIONS.MANAGE_USERS))) {
        return;
    }

    const usersContainer = document.getElementById('admin-users');
    if (!usersContainer) {
        console.error('[Admin Users] Container not found');
        return;
    }

    usersContainer.innerHTML = '<p style="text-align: center; color: #9ca3af;">Caricamento utenti...</p>';

    try {
        const usersQuery = query(collection(db, 'adminUsers'), orderBy('email', 'asc'));
        const querySnapshot = await withFirebaseRetry(async () => {
            return await getDocs(usersQuery);
        }, 'get admin users');

        if (querySnapshot.empty) {
            usersContainer.innerHTML = '<p style="text-align: center; color: #9ca3af;">Nessun utente amministratore trovato.</p>';
            return;
        }

        const currentUser = auth.currentUser;
        const currentUserRole = await getCurrentUserRole();

        let html = '<table>';
        html += '<thead><tr>';
        html += '<th>Email</th>';
        html += '<th>Nome</th>';
        html += '<th>Ruolo</th>';
        html += '<th>Creato</th>';
        html += '<th>Ultimo Accesso</th>';
        html += '<th>Azioni</th>';
        html += '</tr></thead>';
        html += '<tbody>';

        querySnapshot.forEach(doc => {
            const user = doc.data();
            const userId = doc.id;
            const isCurrentUser = userId === currentUser.uid;
            const userRole = user.role || ROLES.VIEWER;
            const roleColors = getRoleBadgeColor(userRole);
            
            const createdAt = user.createdAt 
                ? new Date(user.createdAt.seconds * 1000).toLocaleString('it-IT')
                : 'N/A';
            
            const lastLogin = user.lastLogin 
                ? new Date(user.lastLogin.seconds * 1000).toLocaleString('it-IT')
                : 'Mai';

            html += `<tr style="${isCurrentUser ? 'background: #fffbeb;' : ''}">
                <td data-label="Email">${user.email}${isCurrentUser ? ' <span style="color: #eab308; font-weight: 600;">(Tu)</span>' : ''}</td>
                <td data-label="Nome">${user.displayName || 'N/A'}</td>
                <td data-label="Ruolo">
                    <span style="display: inline-block; padding: 6px 14px; border-radius: 8px; background: ${roleColors.bg}; color: ${roleColors.text}; border: 1px solid ${roleColors.border}; font-weight: 600; font-size: 0.85em;">
                        ${getRoleDisplayName(userRole)}
                    </span>
                </td>
                <td data-label="Creato">${createdAt}</td>
                <td data-label="Ultimo Accesso">${lastLogin}</td>
                <td data-label="Azioni">
                    ${!isCurrentUser && currentUserRole === ROLES.ADMIN ? `
                        <select class="role-select" data-user-id="${userId}" data-current-role="${userRole}" style="padding: 6px 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 0.9em; margin-right: 8px;">
                            <option value="">Cambia Ruolo...</option>
                            <option value="${ROLES.ADMIN}">Amministratore</option>
                            <option value="${ROLES.EDITOR}">Editor</option>
                            <option value="${ROLES.VIEWER}">Visualizzatore</option>
                        </select>
                        <button class="delete-user-btn" data-user-id="${userId}" data-user-email="${user.email}" style="background: #ef4444; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-weight: 500; font-size: 0.85em;">
                            Elimina
                        </button>
                    ` : '<span style="color: #9ca3af;">N/A</span>'}
                </td>
            </tr>`;
        });

        html += '</tbody></table>';
        usersContainer.innerHTML = html;

        document.querySelectorAll('.role-select').forEach(select => {
            select.addEventListener('change', async (e) => {
                const userId = e.target.dataset.userId;
                const oldRole = e.target.dataset.currentRole;
                const newRole = e.target.value;
                
                if (newRole && newRole !== oldRole) {
                    await changeUserRole(userId, oldRole, newRole);
                    e.target.value = '';
                }
            });
        });

        document.querySelectorAll('.delete-user-btn').forEach(button => {
            button.addEventListener('click', async (e) => {
                const userId = e.target.dataset.userId;
                const userEmail = e.target.dataset.userEmail;
                await deleteUser(userId, userEmail);
            });
        });

    } catch (error) {
        console.error('[Admin Users] Error loading users:', error);
        usersContainer.innerHTML = `
            <div style="padding: 20px; text-align: center;">
                <p style="color: #ef4444; font-weight: 500;">Errore nel caricamento degli utenti</p>
                <button onclick="location.reload()" style="margin-top: 15px; padding: 8px 16px; background: #eab308; color: #1a1a1a; border: none; border-radius: 4px; cursor: pointer; font-weight: 500;">
                    Riprova
                </button>
            </div>
        `;
    }
}

async function changeUserRole(userId, oldRole, newRole) {
    if (!confirm(`Sei sicuro di voler cambiare il ruolo di questo utente da "${getRoleDisplayName(oldRole)}" a "${getRoleDisplayName(newRole)}"?`)) {
        return;
    }

    try {
        const userRef = doc(db, 'adminUsers', userId);
        await withFirebaseRetry(async () => {
            await updateDoc(userRef, {
                role: newRole,
                updatedAt: new Date()
            });
        }, 'update user role');

        const userDoc = await withFirebaseRetry(async () => {
            const docSnapshot = await getDocs(query(collection(db, 'adminUsers')));
            let targetDoc = null;
            docSnapshot.forEach(d => {
                if (d.id === userId) {
                    targetDoc = d.data();
                }
            });
            return targetDoc;
        }, 'get user for audit');

        if (userDoc) {
            await logUserRoleChange(userId, userDoc.email, oldRole, newRole);
        }

        showNotification('Ruolo utente aggiornato con successo', 'success');
        loadAdminUsers();
    } catch (error) {
        console.error('[Admin Users] Error changing user role:', error);
        showNotification('Errore durante l\'aggiornamento del ruolo', 'error');
    }
}

async function deleteUser(userId, userEmail) {
    if (!confirm(`Sei sicuro di voler eliminare l'utente ${userEmail}? Questa azione non può essere annullata.`)) {
        return;
    }

    try {
        await withFirebaseRetry(async () => {
            await deleteDoc(doc(db, 'adminUsers', userId));
        }, 'delete user');

        showNotification('Utente eliminato con successo', 'success');
        loadAdminUsers();
    } catch (error) {
        console.error('[Admin Users] Error deleting user:', error);
        showNotification('Errore durante l\'eliminazione dell\'utente', 'error');
    }
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

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            loadAdminUsers();
        }
    });
});

export { loadAdminUsers };
