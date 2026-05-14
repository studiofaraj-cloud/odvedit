import { getFirebaseFirestore, withFirebaseRetry } from './firebase-config.js';
import { doc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

const db = getFirebaseFirestore();

export async function manualTriggerOrderEmail(orderId, emailType = 'confirmation') {
    if (!orderId) {
        console.error('[Email Service] No order ID provided');
        return { success: false, error: 'No order ID provided' };
    }

    console.log(`[Email Service] Manually triggering ${emailType} email for order: ${orderId}`);

    try {
        await withFirebaseRetry(async () => {
            const orderRef = doc(db, 'orders', orderId);
            
            await updateDoc(orderRef, {
                emailTrigger: emailType,
                emailTriggerTimestamp: new Date(),
                manualEmailRequest: true
            });
        }, 'trigger order email');

        console.log(`[Email Service] Email trigger updated in Firestore for order: ${orderId}`);
        return { success: true, orderId, emailType };
    } catch (error) {
        console.error('[Email Service] Error triggering email:', error);
        return { success: false, error: error.message };
    }
}

export async function resendOrderConfirmation(orderId) {
    return await manualTriggerOrderEmail(orderId, 'confirmation_resend');
}

export async function getEmailStatus(orderId) {
    if (!orderId) {
        console.error('[Email Service] No order ID provided');
        return null;
    }

    try {
        const orderDoc = await withFirebaseRetry(async () => {
            const orderRef = doc(db, 'orders', orderId);
            const docSnap = await getDoc(orderRef);
            return docSnap;
        }, 'get email status');

        if (orderDoc.exists()) {
            const data = orderDoc.data();
            return {
                emailSent: data.emailSent || false,
                emailSentAt: data.emailSentAt || null,
                emailType: data.emailType || null,
                emailError: data.emailError || null,
                lastEmailSent: data.lastEmailSent || null,
                lastEmailType: data.lastEmailType || null
            };
        }

        return null;
    } catch (error) {
        console.error('[Email Service] Error getting email status:', error);
        return null;
    }
}

export const EMAIL_TYPES = {
    ORDER_CONFIRMATION: 'order_confirmation',
    STATUS_UPDATE: 'status_update',
    PAYMENT_RECEIPT: 'payment_receipt',
    ADMIN_NOTIFICATION: 'admin_notification'
};

export function getEmailStatusBadge(emailStatus) {
    if (!emailStatus || !emailStatus.emailSent) {
        return '<span style="color: #f59e0b;">⏳ Email in attesa</span>';
    }

    const sentDate = emailStatus.emailSentAt 
        ? new Date(emailStatus.emailSentAt.seconds * 1000).toLocaleString('it-IT')
        : 'Data sconosciuta';

    if (emailStatus.emailError) {
        return `<span style="color: #ef4444;">❌ Errore: ${emailStatus.emailError}</span>`;
    }

    return `<span style="color: #10b981;">✓ Inviata il ${sentDate}</span>`;
}

export default {
    manualTriggerOrderEmail,
    resendOrderConfirmation,
    getEmailStatus,
    getEmailStatusBadge,
    EMAIL_TYPES
};
