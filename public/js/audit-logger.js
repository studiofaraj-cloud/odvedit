import { collection, addDoc, serverTimestamp, query, orderBy, limit, getDocs, where } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";
import { getFirebaseFirestore, getFirebaseAuth, withFirebaseRetry } from './firebase-config.js';
import { getCurrentUserRole } from './rbac.js';

const db = getFirebaseFirestore();
const auth = getFirebaseAuth();

export const AUDIT_ACTIONS = {
    ORDER_CREATED: 'order_created',
    ORDER_UPDATED: 'order_updated',
    ORDER_STATUS_CHANGED: 'order_status_changed',
    ORDER_DELETED: 'order_deleted',
    ORDER_PAYMENT_UPDATED: 'order_payment_updated',
    DATA_EXPORTED: 'data_exported',
    EMAIL_SENT: 'email_sent',
    MESSAGE_DELETED: 'message_deleted',
    NEWSLETTER_EXPORTED: 'newsletter_exported',
    USER_ROLE_CHANGED: 'user_role_changed',
    USER_CREATED: 'user_created',
    USER_DELETED: 'user_deleted',
    LOGIN: 'login',
    LOGOUT: 'logout',
    ACCESS_DENIED: 'access_denied'
};

export async function logAuditEvent(action, details = {}) {
    const user = auth.currentUser;
    
    if (!user) {
        console.warn('[Audit] Cannot log audit event: No authenticated user');
        return null;
    }

    try {
        const userRole = await getCurrentUserRole();
        
        const auditLog = {
            action,
            userId: user.uid,
            userEmail: user.email,
            userRole: userRole || 'unknown',
            timestamp: serverTimestamp(),
            details,
            ipAddress: null,
            userAgent: navigator.userAgent,
            url: window.location.href
        };

        const docRef = await withFirebaseRetry(async () => {
            return await addDoc(collection(db, 'auditLogs'), auditLog);
        }, 'log audit event');

        console.log(`[Audit] Logged event: ${action}`, details);
        return docRef.id;
    } catch (error) {
        console.error('[Audit] Error logging audit event:', error);
        return null;
    }
}

export async function logOrderUpdate(orderId, changes, oldStatus, newStatus) {
    return await logAuditEvent(AUDIT_ACTIONS.ORDER_UPDATED, {
        orderId,
        changes,
        oldStatus,
        newStatus
    });
}

export async function logOrderStatusChange(orderId, oldStatus, newStatus) {
    return await logAuditEvent(AUDIT_ACTIONS.ORDER_STATUS_CHANGED, {
        orderId,
        oldStatus,
        newStatus
    });
}

export async function logOrderDeletion(orderId, customerName, total) {
    return await logAuditEvent(AUDIT_ACTIONS.ORDER_DELETED, {
        orderId,
        customerName,
        total
    });
}

export async function logOrderPaymentUpdate(orderId, oldPaymentStatus, newPaymentStatus) {
    return await logAuditEvent(AUDIT_ACTIONS.ORDER_PAYMENT_UPDATED, {
        orderId,
        oldPaymentStatus,
        newPaymentStatus
    });
}

export async function logDataExport(dataType, recordCount) {
    return await logAuditEvent(AUDIT_ACTIONS.DATA_EXPORTED, {
        dataType,
        recordCount
    });
}

export async function logEmailSent(emailType, recipientEmail, orderId = null) {
    return await logAuditEvent(AUDIT_ACTIONS.EMAIL_SENT, {
        emailType,
        recipientEmail,
        orderId
    });
}

export async function logMessageDeletion(messageId, senderEmail) {
    return await logAuditEvent(AUDIT_ACTIONS.MESSAGE_DELETED, {
        messageId,
        senderEmail
    });
}

export async function logNewsletterExport(subscriberCount) {
    return await logAuditEvent(AUDIT_ACTIONS.NEWSLETTER_EXPORTED, {
        subscriberCount
    });
}

export async function logUserRoleChange(targetUserId, targetUserEmail, oldRole, newRole) {
    return await logAuditEvent(AUDIT_ACTIONS.USER_ROLE_CHANGED, {
        targetUserId,
        targetUserEmail,
        oldRole,
        newRole
    });
}

export async function logUserCreation(targetUserId, targetUserEmail, role) {
    return await logAuditEvent(AUDIT_ACTIONS.USER_CREATED, {
        targetUserId,
        targetUserEmail,
        role
    });
}

export async function logUserDeletion(targetUserId, targetUserEmail, role) {
    return await logAuditEvent(AUDIT_ACTIONS.USER_DELETED, {
        targetUserId,
        targetUserEmail,
        role
    });
}

export async function logLogin() {
    return await logAuditEvent(AUDIT_ACTIONS.LOGIN, {});
}

export async function logLogout() {
    return await logAuditEvent(AUDIT_ACTIONS.LOGOUT, {});
}

export async function logAccessDenied(attemptedAction, requiredPermission) {
    return await logAuditEvent(AUDIT_ACTIONS.ACCESS_DENIED, {
        attemptedAction,
        requiredPermission
    });
}

export async function getRecentAuditLogs(limitCount = 50) {
    try {
        const logsQuery = query(
            collection(db, 'auditLogs'),
            orderBy('timestamp', 'desc'),
            limit(limitCount)
        );

        const querySnapshot = await withFirebaseRetry(async () => {
            return await getDocs(logsQuery);
        }, 'get audit logs');

        const logs = [];
        querySnapshot.forEach(doc => {
            logs.push({
                id: doc.id,
                ...doc.data()
            });
        });

        return logs;
    } catch (error) {
        console.error('[Audit] Error fetching audit logs:', error);
        return [];
    }
}

export async function getAuditLogsByUser(userId, limitCount = 50) {
    try {
        const logsQuery = query(
            collection(db, 'auditLogs'),
            where('userId', '==', userId),
            orderBy('timestamp', 'desc'),
            limit(limitCount)
        );

        const querySnapshot = await withFirebaseRetry(async () => {
            return await getDocs(logsQuery);
        }, 'get user audit logs');

        const logs = [];
        querySnapshot.forEach(doc => {
            logs.push({
                id: doc.id,
                ...doc.data()
            });
        });

        return logs;
    } catch (error) {
        console.error('[Audit] Error fetching user audit logs:', error);
        return [];
    }
}

export async function getAuditLogsByAction(action, limitCount = 50) {
    try {
        const logsQuery = query(
            collection(db, 'auditLogs'),
            where('action', '==', action),
            orderBy('timestamp', 'desc'),
            limit(limitCount)
        );

        const querySnapshot = await withFirebaseRetry(async () => {
            return await getDocs(logsQuery);
        }, 'get action audit logs');

        const logs = [];
        querySnapshot.forEach(doc => {
            logs.push({
                id: doc.id,
                ...doc.data()
            });
        });

        return logs;
    } catch (error) {
        console.error('[Audit] Error fetching action audit logs:', error);
        return [];
    }
}

export function formatAuditLogForDisplay(log) {
    const timestamp = log.timestamp 
        ? new Date(log.timestamp.seconds * 1000).toLocaleString('it-IT')
        : 'N/A';

    const actionLabels = {
        [AUDIT_ACTIONS.ORDER_CREATED]: 'Ordine Creato',
        [AUDIT_ACTIONS.ORDER_UPDATED]: 'Ordine Aggiornato',
        [AUDIT_ACTIONS.ORDER_STATUS_CHANGED]: 'Stato Ordine Modificato',
        [AUDIT_ACTIONS.ORDER_DELETED]: 'Ordine Eliminato',
        [AUDIT_ACTIONS.ORDER_PAYMENT_UPDATED]: 'Pagamento Aggiornato',
        [AUDIT_ACTIONS.DATA_EXPORTED]: 'Dati Esportati',
        [AUDIT_ACTIONS.EMAIL_SENT]: 'Email Inviata',
        [AUDIT_ACTIONS.MESSAGE_DELETED]: 'Messaggio Eliminato',
        [AUDIT_ACTIONS.NEWSLETTER_EXPORTED]: 'Newsletter Esportata',
        [AUDIT_ACTIONS.USER_ROLE_CHANGED]: 'Ruolo Utente Modificato',
        [AUDIT_ACTIONS.USER_CREATED]: 'Utente Creato',
        [AUDIT_ACTIONS.USER_DELETED]: 'Utente Eliminato',
        [AUDIT_ACTIONS.LOGIN]: 'Login',
        [AUDIT_ACTIONS.LOGOUT]: 'Logout',
        [AUDIT_ACTIONS.ACCESS_DENIED]: 'Accesso Negato'
    };

    return {
        id: log.id,
        action: actionLabels[log.action] || log.action,
        actionRaw: log.action,
        user: log.userEmail,
        userId: log.userId,
        role: log.userRole,
        timestamp,
        details: log.details,
        url: log.url
    };
}
