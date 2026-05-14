/**
 * Firestore-triggered order email functions.
 *
 * REPLACES the legacy `sendOrderConfirmationEmail` and `sendOrderStatusUpdateEmail`
 * Cloud Functions that were originally deployed without our locally-applied
 * gift-box-rendering fix. This module deploys from local; its source is the
 * single source of truth going forward.
 *
 * Trigger types match the original deployed metadata:
 *   - sendOrderConfirmationEmail: onDocumentCreated('orders/{orderId}')
 *   - sendOrderStatusUpdateEmail: onDocumentUpdated('orders/{orderId}')
 *
 * Both use the rotated BREVO_API_KEY secret already in Secret Manager.
 */

const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const brevo = require('@getbrevo/brevo');

const {
    generateOrderConfirmationEmail,
    generateOrderStatusUpdateEmail,
    generateAdminOrderNotificationEmail
} = require('./templates/emailTemplates');

const brevoApiKey = defineSecret('BREVO_API_KEY');

const FROM_EMAIL = 'info@oliodivaleria.it';
const ADMIN_EMAIL = 'oliodivaleria@gmail.com';

let brevoApiInstance = null;
function initializeBrevo(apiKey) {
    if (!brevoApiInstance && apiKey) {
        brevoApiInstance = new brevo.TransactionalEmailsApi();
        brevoApiInstance.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, apiKey);
    }
    return brevoApiInstance;
}

async function sendBrevoEmail(to, subject, htmlContent) {
    if (!brevoApiInstance) throw new Error('Brevo client not initialized');
    const sendSmtpEmail = new brevo.SendSmtpEmail();
    sendSmtpEmail.sender = { name: "L'Olio di Valeria", email: FROM_EMAIL };
    sendSmtpEmail.to = [{ email: to }];
    sendSmtpEmail.subject = subject;
    sendSmtpEmail.htmlContent = htmlContent;
    await brevoApiInstance.sendTransacEmail(sendSmtpEmail);
}

function formatAddress(customerInfo) {
    if (!customerInfo) return '';
    const parts = [];
    if (customerInfo.address) parts.push(customerInfo.address);
    if (customerInfo.houseNumber) parts.push(customerInfo.houseNumber);
    if (customerInfo.city) parts.push(customerInfo.city);
    if (customerInfo.province) parts.push(`(${customerInfo.province})`);
    if (customerInfo.postalCode) parts.push(customerInfo.postalCode);
    if (customerInfo.country && customerInfo.country !== 'IT') parts.push(customerInfo.country);
    return parts.filter(Boolean).join(', ');
}

function buildOrderDetails(order) {
    const customerInfo = order.customerInfo || {};
    return {
        items: Array.isArray(order.items) ? order.items : [],
        subtotal: order.subtotal || 0,
        shipping: (order.shipping != null ? order.shipping : order.shippingCost) || 0,
        total: order.total || 0,
        paymentMethod: order.paymentMethod || 'card',
        paymentStatus: order.paymentStatus || 'pending',
        shippingAddress: formatAddress(customerInfo)
    };
}

/**
 * onCreate orders/{orderId} — send order confirmation to customer + admin notification.
 * Idempotent via the `emailSent` flag on the order document.
 */
exports.sendOrderConfirmationEmail = onDocumentCreated(
    {
        document: 'orders/{orderId}',
        region: 'us-central1',
        secrets: [brevoApiKey],
        memory: '256MiB'
    },
    async (event) => {
        const snap = event.data;
        if (!snap) {
            console.warn('[Email] No snapshot in onCreate event, skipping');
            return;
        }
        const order = snap.data();
        const orderDocumentId = event.params.orderId;
        const humanOrderId = order.orderId || orderDocumentId;

        console.log(`[Email] Processing new order: ${humanOrderId}`);

        if (order.emailSent) {
            console.log(`[Email] Already sent for order: ${humanOrderId}, skipping`);
            return;
        }

        const customerInfo = order.customerInfo || {};
        const customerEmail = customerInfo.email;
        if (!customerEmail) {
            console.warn(`[Email] No customer email for order: ${humanOrderId}, skipping`);
            return;
        }
        const customerName = customerInfo.name || 'Cliente';

        initializeBrevo(brevoApiKey.value());

        const orderDetails = buildOrderDetails(order);

        try {
            // 1. Customer confirmation
            const confirmationHtml = generateOrderConfirmationEmail({
                orderId: humanOrderId,
                customerName,
                orderDetails
            });
            await sendBrevoEmail(
                customerEmail,
                `Conferma Ordine #${humanOrderId} - l'Olio di Valeria`,
                confirmationHtml
            );
            console.log(`[Email] Order confirmation sent to: ${customerEmail}`);

            // 2. Admin notification
            const adminHtml = generateAdminOrderNotificationEmail({
                orderId: humanOrderId,
                documentId: orderDocumentId,
                orderDetails: { ...orderDetails, customerInfo, order }
            });
            await sendBrevoEmail(
                ADMIN_EMAIL,
                `Nuovo Ordine #${humanOrderId}`,
                adminHtml
            );
            console.log(`[Email] Admin notification sent for order: ${humanOrderId}`);

            // 3. Mark as sent (idempotency)
            await snap.ref.update({
                emailSent: true,
                emailSentAt: admin.firestore.FieldValue.serverTimestamp()
            });
        } catch (err) {
            console.error(`[Email] Failed to send for order ${humanOrderId}:`, err);
            throw err; // Let Cloud Functions retry per the configured retry policy
        }
    }
);

/**
 * onUpdate orders/{orderId} — send a status-update email when `status` changes.
 * Skips on any other field change (e.g., emailSent: true write).
 */
exports.sendOrderStatusUpdateEmail = onDocumentUpdated(
    {
        document: 'orders/{orderId}',
        region: 'us-central1',
        secrets: [brevoApiKey],
        memory: '256MiB'
    },
    async (event) => {
        const before = event.data && event.data.before ? event.data.before.data() : {};
        const after  = event.data && event.data.after  ? event.data.after.data()  : {};
        const orderDocumentId = event.params.orderId;
        const humanOrderId = after.orderId || orderDocumentId;

        if (before.status === after.status) {
            console.log(`[Email] No status change for order: ${humanOrderId}, skipping email`);
            return;
        }

        console.log(`[Email] Status changed for order: ${humanOrderId}: ${before.status} -> ${after.status}`);

        const customerInfo = after.customerInfo || {};
        const customerEmail = customerInfo.email;
        if (!customerEmail) {
            console.warn(`[Email] No customer email for order: ${humanOrderId}, skipping status update`);
            return;
        }
        const customerName = customerInfo.name || 'Cliente';

        initializeBrevo(brevoApiKey.value());

        const orderDetails = buildOrderDetails(after);

        try {
            const statusHtml = generateOrderStatusUpdateEmail({
                orderId: humanOrderId,
                customerName,
                oldStatus: before.status,
                newStatus: after.status,
                orderDetails
            });
            await sendBrevoEmail(
                customerEmail,
                `Aggiornamento Ordine #${humanOrderId} - l'Olio di Valeria`,
                statusHtml
            );
            console.log(`[Email] Status update sent to: ${customerEmail}`);
        } catch (err) {
            console.error(`[Email] Failed to send status update for order ${humanOrderId}:`, err);
            throw err;
        }
    }
);
