import { getFirebaseAuth } from './firebase-config.js';

const auth = getFirebaseAuth();

export const ROLES = {
    ADMIN: 'admin',
    EDITOR: 'editor',
    VIEWER: 'viewer'
};

export const PERMISSIONS = {
    VIEW_DASHBOARD: 'view_dashboard',
    VIEW_ORDERS: 'view_orders',
    EDIT_ORDERS: 'edit_orders',
    DELETE_ORDERS: 'delete_orders',
    VIEW_MESSAGES: 'view_messages',
    DELETE_MESSAGES: 'delete_messages',
    VIEW_NEWSLETTER: 'view_newsletter',
    EXPORT_DATA: 'export_data',
    MANAGE_USERS: 'manage_users',
    VIEW_ANALYTICS: 'view_analytics',
    SEND_EMAILS: 'send_emails'
};

const ROLE_PERMISSIONS = {
    [ROLES.ADMIN]: [
        PERMISSIONS.VIEW_DASHBOARD,
        PERMISSIONS.VIEW_ORDERS,
        PERMISSIONS.EDIT_ORDERS,
        PERMISSIONS.DELETE_ORDERS,
        PERMISSIONS.VIEW_MESSAGES,
        PERMISSIONS.DELETE_MESSAGES,
        PERMISSIONS.VIEW_NEWSLETTER,
        PERMISSIONS.EXPORT_DATA,
        PERMISSIONS.MANAGE_USERS,
        PERMISSIONS.VIEW_ANALYTICS,
        PERMISSIONS.SEND_EMAILS
    ],
    [ROLES.EDITOR]: [
        PERMISSIONS.VIEW_DASHBOARD,
        PERMISSIONS.VIEW_ORDERS,
        PERMISSIONS.EDIT_ORDERS,
        PERMISSIONS.VIEW_MESSAGES,
        PERMISSIONS.VIEW_NEWSLETTER,
        PERMISSIONS.VIEW_ANALYTICS,
        PERMISSIONS.SEND_EMAILS
    ],
    [ROLES.VIEWER]: [
        PERMISSIONS.VIEW_DASHBOARD,
        PERMISSIONS.VIEW_ORDERS,
        PERMISSIONS.VIEW_MESSAGES,
        PERMISSIONS.VIEW_NEWSLETTER,
        PERMISSIONS.VIEW_ANALYTICS
    ]
};

let currentUserRole = null;
let currentUserClaims = null;

export async function getCurrentUserRole() {
    const user = auth.currentUser;
    if (!user) {
        return null;
    }

    if (currentUserRole) {
        return currentUserRole;
    }

    try {
        const idTokenResult = await user.getIdTokenResult(true);
        currentUserClaims = idTokenResult.claims;
        currentUserRole = idTokenResult.claims.role || ROLES.VIEWER;
        return currentUserRole;
    } catch (error) {
        console.error('[RBAC] Error getting user role:', error);
        return ROLES.VIEWER;
    }
}

export async function getUserClaims() {
    const user = auth.currentUser;
    if (!user) {
        return null;
    }

    if (currentUserClaims) {
        return currentUserClaims;
    }

    try {
        const idTokenResult = await user.getIdTokenResult(true);
        currentUserClaims = idTokenResult.claims;
        return currentUserClaims;
    } catch (error) {
        console.error('[RBAC] Error getting user claims:', error);
        return {};
    }
}

export async function hasPermission(permission) {
    const role = await getCurrentUserRole();
    if (!role) {
        return false;
    }

    const permissions = ROLE_PERMISSIONS[role] || [];
    return permissions.includes(permission);
}

export async function hasAnyPermission(permissions) {
    for (const permission of permissions) {
        if (await hasPermission(permission)) {
            return true;
        }
    }
    return false;
}

export async function hasAllPermissions(permissions) {
    for (const permission of permissions) {
        if (!(await hasPermission(permission))) {
            return false;
        }
    }
    return true;
}

export async function requirePermission(permission, redirectUrl = 'dashboard.html') {
    if (!(await hasPermission(permission))) {
        console.warn(`[RBAC] Access denied: Missing permission '${permission}'`);
        showAccessDeniedMessage();
        setTimeout(() => {
            window.location.href = redirectUrl;
        }, 2000);
        return false;
    }
    return true;
}

export async function requireRole(role, redirectUrl = 'dashboard.html') {
    const userRole = await getCurrentUserRole();
    if (userRole !== role) {
        console.warn(`[RBAC] Access denied: Required role '${role}', user has '${userRole}'`);
        showAccessDeniedMessage();
        setTimeout(() => {
            window.location.href = redirectUrl;
        }, 2000);
        return false;
    }
    return true;
}

export function showAccessDeniedMessage() {
    const message = document.createElement('div');
    message.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        padding: 32px 48px;
        background: white;
        color: #ef4444;
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
        z-index: 10000;
        font-weight: 600;
        font-size: 1.2em;
        text-align: center;
        border: 3px solid #ef4444;
    `;
    message.innerHTML = `
        <div style="font-size: 3em; margin-bottom: 16px;">🚫</div>
        <div>Accesso Negato</div>
        <div style="font-size: 0.85em; margin-top: 12px; color: #6b7280; font-weight: 400;">
            Non hai i permessi necessari per accedere a questa pagina
        </div>
    `;
    document.body.appendChild(message);
    
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        z-index: 9999;
    `;
    document.body.appendChild(overlay);
}

export async function hideElementsWithoutPermission(selector, permission) {
    const hasAccess = await hasPermission(permission);
    if (!hasAccess) {
        document.querySelectorAll(selector).forEach(element => {
            element.style.display = 'none';
        });
    }
}

export async function disableElementsWithoutPermission(selector, permission) {
    const hasAccess = await hasPermission(permission);
    if (!hasAccess) {
        document.querySelectorAll(selector).forEach(element => {
            element.disabled = true;
            element.style.opacity = '0.5';
            element.style.cursor = 'not-allowed';
            element.title = 'Non hai i permessi per questa azione';
        });
    }
}

export function clearRoleCache() {
    currentUserRole = null;
    currentUserClaims = null;
}

export function getRoleDisplayName(role) {
    const roleNames = {
        [ROLES.ADMIN]: 'Amministratore',
        [ROLES.EDITOR]: 'Editor',
        [ROLES.VIEWER]: 'Visualizzatore'
    };
    return roleNames[role] || role;
}

export function getRoleBadgeColor(role) {
    const colors = {
        [ROLES.ADMIN]: { bg: '#fee2e2', text: '#dc2626', border: '#dc2626' },
        [ROLES.EDITOR]: { bg: '#dbeafe', text: '#2563eb', border: '#2563eb' },
        [ROLES.VIEWER]: { bg: '#e5e7eb', text: '#6b7280', border: '#6b7280' }
    };
    return colors[role] || colors[ROLES.VIEWER];
}
