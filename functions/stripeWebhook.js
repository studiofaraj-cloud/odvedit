const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const stripe = require('stripe');
const brevo = require('@getbrevo/brevo');

const db = admin.firestore();

const {
    generateOrderConfirmationEmail,
    generatePaymentReceiptEmail,
    generateAdminOrderNotificationEmail
} = require('./templates/emailTemplates');

let brevoApiInstance = null;

const initializeBrevo = (apiKey) => {
    if (!brevoApiInstance && apiKey) {
        brevoApiInstance = new brevo.TransactionalEmailsApi();
        brevoApiInstance.setApiKey(
            brevo.TransactionalEmailsApiApiKeys.apiKey,
            apiKey
        );
    }
    return brevoApiInstance;
};

const sendBrevoEmail = async (to, from, subject, htmlContent) => {
    if (!brevoApiInstance) {
        throw new Error('Brevo client not initialized');
    }
    
    const sendSmtpEmail = new brevo.SendSmtpEmail();
    sendSmtpEmail.sender = { name: "L'Olio di Valeria", email: from };
    sendSmtpEmail.to = [{ email: to }];
    sendSmtpEmail.subject = subject;
    sendSmtpEmail.htmlContent = htmlContent;
    
    await brevoApiInstance.sendTransacEmail(sendSmtpEmail);
};

const formatAddress = (customerInfo) => {
    const parts = [];
    if (customerInfo.address) parts.push(customerInfo.address);
    if (customerInfo.houseNumber) parts.push(customerInfo.houseNumber);
    if (customerInfo.city) parts.push(customerInfo.city);
    if (customerInfo.province) parts.push(`(${customerInfo.province})`);
    if (customerInfo.postalCode) parts.push(customerInfo.postalCode);
    if (customerInfo.country && customerInfo.country !== 'IT') {
        parts.push(customerInfo.country);
    }
    return parts.filter(p => p).join(', ') || 'N/A';
};

const sendStripeOrderEmails = async (orderId, documentId, orderData, items, subtotal, shippingCost, total, customerInfo, brevoApiKey, fromEmail, adminEmail) => {
    console.log(`[Webhook] sendStripeOrderEmails called for order: ${orderId}, documentId: ${documentId}`);
    try {
        // Use provided credentials (passed from the main webhook handler)
        if (!brevoApiKey) {
            console.warn('[Webhook] BREVO_API_KEY not provided, skipping email sending');
            return;
        }
        
        if (!fromEmail) {
            fromEmail = 'info@oliodivaleria.it';
        }
        
        if (!adminEmail) {
            adminEmail = 'oliodivaleria@gmail.com';
        }
        
        initializeBrevo(brevoApiKey);
        
        const customerEmail = customerInfo.email;
        const customerName = customerInfo.name || 'Cliente';
        
        // Ensure items is an array and normalize item prices
        const safeItems = Array.isArray(items) ? items.map(item => {
            // Normalize item to ensure it has required fields for email templates
            const normalized = {
                name: item.name || 'Prodotto',
                quantity: item.quantity || 1,
                price: item.price || item.unitPrice || item.pricePerUnit || 0
            };
            
            // If price is still 0, try to calculate from total
            if (normalized.price === 0 && item.total && normalized.quantity > 0) {
                normalized.price = item.total / normalized.quantity;
            }
            
            // Preserve other fields
            if (item.size) normalized.size = item.size;
            if (item.volume) normalized.volume = item.volume;
            if (item.id) normalized.id = item.id;
            
            return normalized;
        }) : [];
        
        console.log(`[Webhook] Sending emails for paid order: ${orderId}`);
        console.log(`[Webhook] Email details - Customer: ${customerEmail}, Items: ${safeItems.length}`);
        
        let orderConfirmationSent = false;
        let paymentReceiptSent = false;
        let adminNotificationSent = false;
        
        // 1. Send Order Confirmation to Customer
        try {
            const confirmationHtml = generateOrderConfirmationEmail({
                orderId: orderId,
                customerName,
                order: orderData,
                orderDetails: {
                    items: safeItems,
                    subtotal: subtotal,
                    shipping: shippingCost,
                    total: total,
                    paymentMethod: 'card',
                    paymentStatus: 'paid',
                    shippingAddress: formatAddress(customerInfo)
                }
            });
            
            await sendBrevoEmail(
                customerEmail,
                fromEmail,
                `Conferma Ordine #${orderId} - l'Olio di Valeria`,
                confirmationHtml
            );
            
            orderConfirmationSent = true;
            console.log(`[Webhook] ✅ Order confirmation email sent to: ${customerEmail}`);
        } catch (error) {
            console.error(`[Webhook] ❌ Failed to send order confirmation email:`, error);
            console.error(`[Webhook] Order confirmation error details:`, error.message);
        }
        
        // 2. Send Payment Receipt to Customer
        try {
            // Create a proper Firestore Timestamp for payment date
            const paymentTimestamp = admin.firestore.Timestamp.now();
            const paymentDate = new Date().toLocaleDateString('it-IT');
            
            console.log(`[Webhook] Generating payment receipt email for order: ${orderId}`);
            console.log(`[Webhook] Items count: ${safeItems.length}, Items sample:`, safeItems.length > 0 ? JSON.stringify(safeItems[0]) : 'none');
            console.log(`[Webhook] Financials - Subtotal: ${subtotal}, Shipping: ${shippingCost}, Total: ${total}`);
            
            let receiptHtml;
            try {
                receiptHtml = generatePaymentReceiptEmail({
                    orderId: orderId,
                    customerName,
                    order: orderData,
                    orderDetails: {
                        items: safeItems,
                        subtotal: subtotal,
                        shipping: shippingCost,
                        total: total,
                        paymentMethod: 'card',
                        paymentTimestamp: paymentTimestamp
                    }
                });
                console.log(`[Webhook] Payment receipt HTML generated successfully (${receiptHtml ? receiptHtml.length : 0} chars)`);
            } catch (templateError) {
                console.error(`[Webhook] ❌ Failed to generate payment receipt email template:`, templateError);
                console.error(`[Webhook] Template error details:`, templateError.message);
                console.error(`[Webhook] Template error stack:`, templateError.stack);
                
                // Fallback: Create a simple receipt email if template fails
                console.log(`[Webhook] Creating fallback payment receipt email...`);
                receiptHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Ricevuta Pagamento</title>
</head>
<body style="font-family: Arial, sans-serif; padding: 20px;">
    <h2>Ricevuta Pagamento</h2>
    <p>Ciao ${customerName},</p>
    <p>Abbiamo ricevuto il tuo pagamento con successo!</p>
    <p><strong>Numero Ordine:</strong> ${orderId}</p>
    <p><strong>Data Pagamento:</strong> ${paymentDate}</p>
    <p><strong>Importo Pagato:</strong> €${total.toFixed(2)}</p>
    <p><strong>Metodo di Pagamento:</strong> Carta di Credito</p>
    <p>Grazie per il tuo acquisto!</p>
    <p>L'Olio di Valeria</p>
</body>
</html>
                `;
                console.log(`[Webhook] Fallback payment receipt HTML created`);
            }
            
            if (!receiptHtml || receiptHtml.trim().length === 0) {
                throw new Error('Payment receipt HTML is empty');
            }
            
            console.log(`[Webhook] Attempting to send payment receipt email to: ${customerEmail}`);
            await sendBrevoEmail(
                customerEmail,
                fromEmail,
                `Ricevuta Pagamento #${orderId} - l'Olio di Valeria`,
                receiptHtml
            );
            
            paymentReceiptSent = true;
            console.log(`[Webhook] ✅ Payment receipt email sent successfully to: ${customerEmail}`);
        } catch (error) {
            console.error(`[Webhook] ❌ Failed to send payment receipt email:`, error);
            console.error(`[Webhook] Payment receipt error details:`, error.message);
            console.error(`[Webhook] Payment receipt error stack:`, error.stack);
            if (error.response) {
                console.error(`[Webhook] Payment receipt Brevo API error:`, JSON.stringify(error.response.body, null, 2));
            }
            // Don't throw - allow other emails to continue
        }
        
        // 3. Send Admin Notification
        try {
            const adminHtml = generateAdminOrderNotificationEmail({
                orderId: orderId,
                documentId: documentId,
                orderDetails: {
                    items: safeItems,
                    subtotal: subtotal,
                    shipping: shippingCost,
                    total: total,
                    paymentMethod: 'card',
                    paymentStatus: 'paid',
                    customerInfo: customerInfo
                }
            });
            
            await sendBrevoEmail(
                adminEmail,
                fromEmail,
                `Nuovo Ordine Ricevuto #${orderId} - l'Olio di Valeria`,
                adminHtml
            );
            
            adminNotificationSent = true;
            console.log(`[Webhook] ✅ Admin notification email sent to: ${adminEmail}`);
        } catch (error) {
            console.error(`[Webhook] ❌ Failed to send admin notification email:`, error);
            console.error(`[Webhook] Admin notification error details:`, error.message);
        }
        
        // Mark emails as sent in Firestore
        const docRef = db.collection('orders').doc(documentId);
        const emailUpdateData = {};
        
        if (orderConfirmationSent) {
            emailUpdateData.emailSent = true;
            emailUpdateData.emailSentAt = admin.firestore.FieldValue.serverTimestamp();
        }
        
        if (paymentReceiptSent) {
            emailUpdateData.paymentReceiptSent = true;
            emailUpdateData.paymentReceiptSentAt = admin.firestore.FieldValue.serverTimestamp();
        }
        
        if (adminNotificationSent) {
            emailUpdateData.adminNotificationSent = true;
            emailUpdateData.adminNotificationSentAt = admin.firestore.FieldValue.serverTimestamp();
        }
        
        if (Object.keys(emailUpdateData).length > 0) {
            await docRef.update(emailUpdateData);
        }
        
        const successCount = [orderConfirmationSent, paymentReceiptSent, adminNotificationSent].filter(Boolean).length;
        console.log(`[Webhook] Email sending complete: ${successCount}/3 emails sent successfully for order: ${orderId}`);
        
    } catch (emailError) {
        console.error('[Webhook] Error sending emails:', emailError);
        console.error('[Webhook] Email error stack:', emailError.stack);
        // Don't fail the webhook - order is created, emails can be retried
        try {
            const docRef = db.collection('orders').doc(documentId);
            await docRef.update({
                emailError: emailError.message,
                emailErrorAt: admin.firestore.FieldValue.serverTimestamp()
            });
        } catch (updateError) {
            console.error('[Webhook] Failed to update order with email error:', updateError);
        }
        // Don't throw - allow webhook to succeed even if emails fail
    }
};

const logWebhookEvent = async (event, status, error = null, metadata = {}) => {
    try {
        await db.collection('webhookEvents').add({
            eventId: event.id,
            eventType: event.type,
            status,
            error: error ? error.message : null,
            metadata,
            rawEvent: {
                id: event.id,
                type: event.type,
                created: event.created,
                livemode: event.livemode
            },
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            createdAt: admin.firestore.Timestamp.fromMillis(event.created * 1000)
        });
        console.log(`[Webhook] Event logged: ${event.id} (${event.type}) - Status: ${status}`);
    } catch (logError) {
        console.error('[Webhook] Failed to log event:', logError);
    }
};

const updateOrderStatus = async (paymentIntentId, updates, eventType, checkoutSessionId = null) => {
    try {
        const ordersRef = db.collection('orders');
        let querySnapshot;

        console.log(`[Webhook] updateOrderStatus called with:`, {
            paymentIntentId,
            checkoutSessionId,
            eventType,
            updateKeys: Object.keys(updates || {})
        });

        // Try to match by paymentIntentId first (most common)
        if (paymentIntentId) {
            try {
                querySnapshot = await ordersRef
                    .where('stripePaymentIntentId', '==', paymentIntentId)
                    .limit(1)
                    .get();
                console.log(`[Webhook] Query by stripePaymentIntentId: ${querySnapshot.size} results`);
            } catch (queryError) {
                console.error(`[Webhook] Error querying by stripePaymentIntentId:`, queryError);
                throw queryError;
            }
        }

        // If not found and checkoutSessionId provided, try matching by checkoutSessionId
        if ((!querySnapshot || querySnapshot.empty) && checkoutSessionId) {
            try {
                querySnapshot = await ordersRef
                    .where('stripeCheckoutSessionId', '==', checkoutSessionId)
                    .limit(1)
                    .get();
                console.log(`[Webhook] Query by stripeCheckoutSessionId: ${querySnapshot.size} results`);
            } catch (queryError) {
                console.error(`[Webhook] Error querying by stripeCheckoutSessionId:`, queryError);
                throw queryError;
            }
        }

        // Fallback: try matching by paymentIntentId field (legacy support)
        if ((!querySnapshot || querySnapshot.empty) && paymentIntentId) {
            try {
                querySnapshot = await ordersRef
                    .where('paymentIntentId', '==', paymentIntentId)
                    .limit(1)
                    .get();
                console.log(`[Webhook] Query by paymentIntentId (legacy): ${querySnapshot.size} results`);
            } catch (queryError) {
                console.error(`[Webhook] Error querying by paymentIntentId (legacy):`, queryError);
                throw queryError;
            }
        }

        if (!querySnapshot || querySnapshot.empty) {
            const identifier = checkoutSessionId || paymentIntentId;
            console.warn(`[Webhook] No order found for ${checkoutSessionId ? 'checkoutSession' : 'paymentIntent'}: ${identifier}`);
            return { found: false };
        }

        const orderDoc = querySnapshot.docs[0];
        const orderId = orderDoc.id;
        const currentData = orderDoc.data();

        console.log(`[Webhook] Found order ${orderId}, updating with:`, Object.keys(updates || {}));

        const updateData = {
            ...updates,
            lastWebhookEvent: eventType,
            lastWebhookTimestamp: admin.firestore.FieldValue.serverTimestamp()
        };

        await orderDoc.ref.update(updateData);

        console.log(`[Webhook] Order ${orderId} updated successfully`);

        return {
            found: true,
            orderId,
            previousStatus: currentData.paymentStatus,
            newStatus: updates.paymentStatus
        };
    } catch (error) {
        console.error('[Webhook] Error updating order:', error);
        console.error('[Webhook] Error details:', {
            message: error.message,
            stack: error.stack,
            paymentIntentId,
            checkoutSessionId,
            eventType
        });
        throw error;
    }
};

const handlePaymentIntentSucceeded = async (paymentIntent) => {
    console.log(`[Webhook] Processing payment_intent.succeeded: ${paymentIntent.id}`);

    const updates = {
        paymentStatus: 'paid',
        status: 'processing',
        paymentTimestamp: admin.firestore.FieldValue.serverTimestamp(),
        stripePaymentIntentStatus: paymentIntent.status,
        stripeAmount: paymentIntent.amount,
        stripeCurrency: paymentIntent.currency,
        stripePaymentMethod: paymentIntent.payment_method
    };

    const result = await updateOrderStatus(paymentIntent.id, updates, 'payment_intent.succeeded');

    if (!result.found) {
        // For Stripe Checkout, orders are created by checkout.session.completed
        // This event might arrive before the order exists, or the order might not have paymentIntentId stored
        // Log a warning but don't throw - this is expected for Checkout flow
        console.warn(`[Webhook] Order not found for payment intent: ${paymentIntent.id}. This is normal for Stripe Checkout - order will be created by checkout.session.completed event.`);
        return { found: false, skipped: true, reason: 'order_not_found_checkout_flow' };
    }

    return result;
};

const handlePaymentIntentPaymentFailed = async (paymentIntent) => {
    console.log(`[Webhook] Processing payment_intent.payment_failed: ${paymentIntent.id}`);

    const updates = {
        paymentStatus: 'failed',
        status: 'payment_failed',
        paymentFailedTimestamp: admin.firestore.FieldValue.serverTimestamp(),
        stripePaymentIntentStatus: paymentIntent.status,
        stripeLastPaymentError: paymentIntent.last_payment_error?.message || 'Payment failed'
    };

    const result = await updateOrderStatus(paymentIntent.id, updates, 'payment_intent.payment_failed');

    if (!result.found) {
        console.warn(`[Webhook] Order not found for payment intent: ${paymentIntent.id}. This might be a duplicate event or an order handled by checkout.session.completed.`);
        return { found: false, message: `Order not found for payment intent: ${paymentIntent.id}` };
    }

    return result;
};

const handleChargeRefunded = async (charge) => {
    console.log(`[Webhook] Processing charge.refunded: ${charge.id}`);

    const paymentIntentId = charge.payment_intent;

    if (!paymentIntentId) {
        console.warn('[Webhook] No payment_intent associated with refunded charge');
        return { found: false };
    }

    const updates = {
        paymentStatus: 'refunded',
        status: 'refunded',
        refundedTimestamp: admin.firestore.FieldValue.serverTimestamp(),
        stripeChargeId: charge.id,
        stripeRefundAmount: charge.amount_refunded,
        stripeRefunded: charge.refunded
    };

    const result = await updateOrderStatus(paymentIntentId, updates, 'charge.refunded');

    if (!result.found) {
        // Order might not exist if it was created via Checkout (uses checkout session, not payment intent)
        console.warn(`[Webhook] Order not found for charge: ${charge.id}. This is normal for Stripe Checkout orders - refunds are tracked via checkout session.`);
        return { found: false, skipped: true, reason: 'order_not_found_checkout_flow' };
    }

    return result;
};

const handleChargeDisputed = async (charge) => {
    console.log(`[Webhook] Processing charge.disputed: ${charge.id}`);

    const paymentIntentId = charge.payment_intent;

    if (!paymentIntentId) {
        console.warn('[Webhook] No payment_intent associated with disputed charge');
        return { found: false };
    }

    const updates = {
        paymentStatus: 'disputed',
        status: 'disputed',
        disputedTimestamp: admin.firestore.FieldValue.serverTimestamp(),
        stripeChargeId: charge.id,
        stripeDisputed: true,
        disputeReason: charge.dispute?.reason || 'unknown'
    };

    const result = await updateOrderStatus(paymentIntentId, updates, 'charge.disputed');

    if (!result.found) {
        console.warn(`[Webhook] Order not found for disputed charge: ${charge.id}. This might be a duplicate event or an order handled by checkout.session.completed.`);
        return { found: false, message: `Order not found for disputed charge: ${charge.id}` };
    }

    return result;
};

const handleCheckoutSessionCompleted = async (session, brevoApiKey, fromEmail, adminEmail) => {
    console.log(`[Webhook] Processing checkout.session.completed: ${session.id}`);
    console.log(`[Webhook] Session metadata:`, JSON.stringify(session.metadata || {}, null, 2));
    console.log(`[Webhook] Session livemode:`, session.livemode);

    try {
        // Extract order data from session metadata
        const metadata = session.metadata || {};
        
        if (!metadata.orderId) {
            // Check if this is a test event from Stripe CLI (no metadata at all)
            const hasAnyMetadata = Object.keys(metadata).length > 0;
            if (!hasAnyMetadata && !session.livemode) {
                console.warn(`[Webhook] Test event from Stripe CLI detected (no metadata). Skipping order creation. This is expected for CLI test events.`);
                return {
                    created: false,
                    skipped: true,
                    reason: 'test_event_no_metadata',
                    message: 'Test event from Stripe CLI - metadata not available'
                };
            }
            
            // For real payments, metadata should always be present
            console.error(`[Webhook] Order ID missing from checkout session metadata for session: ${session.id}`);
            console.error(`[Webhook] Available metadata keys:`, Object.keys(metadata));
            throw new Error('Order ID missing from checkout session metadata. This indicates the checkout session was not created with proper metadata.');
        }

        // Parse customer info from metadata
        let customerInfo;
        try {
            customerInfo = JSON.parse(metadata.customerInfo || '{}');
            if (!customerInfo.email) {
                throw new Error('Customer email is required');
            }
        } catch (e) {
            console.error('[Webhook] Failed to parse customerInfo from metadata:', e);
            console.error('[Webhook] Raw customerInfo:', metadata.customerInfo);
            return {
                created: false,
                skipped: true,
                reason: 'invalid_customer_info',
                message: `Invalid customer info in metadata: ${e.message}`
            };
        }

        // Parse items from metadata
        let items;
        try {
            items = JSON.parse(metadata.items || '[]');
            if (!Array.isArray(items) || items.length === 0) {
                throw new Error('Items array is empty or invalid');
            }
        } catch (e) {
            console.error('[Webhook] Failed to parse items from metadata:', e);
            console.error('[Webhook] Raw items:', metadata.items);
            return {
                created: false,
                skipped: true,
                reason: 'invalid_items',
                message: `Invalid items in metadata: ${e.message}`
            };
        }

        // Parse pricing
        const subtotal = parseFloat(metadata.subtotal || '0');
        const shippingCost = parseFloat(metadata.shippingCost || '0');
        const total = parseFloat(metadata.total || '0');

        // Determine payment status from session
        const paymentStatus = session.payment_status === 'paid' ? 'paid' : 
                            session.payment_status === 'unpaid' ? 'pending' : 
                            'pending';

        console.log(`[Webhook] Payment status determined: ${paymentStatus} (from session.payment_status: ${session.payment_status})`);

        // Determine order status
        const status = paymentStatus === 'paid' ? 'processing' : 'pending';
        console.log(`[Webhook] Order status determined: ${status}`);

        // Prepare order document matching existing schema
        const orderData = {
            orderId: metadata.orderId,
            transactionId: session.id,
            stripeCheckoutSessionId: session.id,
            stripePaymentIntentId: session.payment_intent || null,
            customerInfo: {
                name: customerInfo.name || '',
                email: customerInfo.email || session.customer_details?.email || '',
                phone: customerInfo.phone || session.customer_details?.phone || '',
                company: customerInfo.company || '',
                address: customerInfo.address || session.shipping_details?.address?.line1 || '',
                houseNumber: customerInfo.houseNumber || session.shipping_details?.address?.line2 || '',
                city: customerInfo.city || session.shipping_details?.address?.city || '',
                province: customerInfo.province || session.shipping_details?.address?.state || '',
                postalCode: customerInfo.postalCode || session.shipping_details?.address?.postal_code || '',
                country: customerInfo.country || session.shipping_details?.address?.country || 'IT',
                customCountry: customerInfo.customCountry || '',
                notes: customerInfo.notes || '',
                marketingConsent: customerInfo.marketingConsent || false,
                termsAccepted: customerInfo.termsAccepted || false
            },
            items: items,
            subtotal: subtotal,
            shippingCost: shippingCost,
            shipping: shippingCost,
            total: total,
            paymentMethod: metadata.paymentMethod || 'card',
            paymentStatus: paymentStatus,
            status: status,
            paymentProvider: 'Stripe',
            paymentMetadata: {
                checkoutSessionId: session.id,
                paymentIntentId: session.payment_intent,
                paymentStatus: session.payment_status
            },
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            createdAt: admin.firestore.Timestamp.now()
        };
        const updateData = { ...orderData };
        delete updateData.timestamp;
        delete updateData.createdAt;

        const ordersRef = db.collection('orders');

        // Prefer updating an existing order created before redirect
        const orderDocumentId = metadata.orderDocumentId || '';
        if (orderDocumentId) {
            const existingDoc = await ordersRef.doc(orderDocumentId).get();
            if (existingDoc.exists) {
                const existingData = existingDoc.data();
                const emailsAlreadySent = existingData.emailSent && existingData.paymentReceiptSent;
                
                console.log(`[Webhook] Existing order email status - emailSent: ${existingData.emailSent}, paymentReceiptSent: ${existingData.paymentReceiptSent}, emailsAlreadySent: ${emailsAlreadySent}`);
                
                await existingDoc.ref.update({
                    ...updateData,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                console.log(`[Webhook] Updated existing order by documentId: ${orderDocumentId}`);
                
                // Send emails if not already sent and payment is successful
                console.log(`[Webhook] Checking email send conditions - emailsAlreadySent: ${emailsAlreadySent}, paymentStatus: ${paymentStatus}`);
                if (!emailsAlreadySent && paymentStatus === 'paid') {
                    console.log(`[Webhook] ✅ Calling sendStripeOrderEmails for existing order (documentId path)`);
                    console.log(`[Webhook] Email function parameters - orderId: ${metadata.orderId}, documentId: ${orderDocumentId}, items: ${items.length}, total: ${total}`);
                    try {
                        await sendStripeOrderEmails(metadata.orderId, orderDocumentId, orderData, items, subtotal, shippingCost, total, customerInfo, brevoApiKey, fromEmail, adminEmail);
                        console.log(`[Webhook] ✅ sendStripeOrderEmails completed for existing order (documentId): ${metadata.orderId}`);
                    } catch (emailError) {
                        console.error(`[Webhook] ❌ sendStripeOrderEmails threw an error (documentId path):`, emailError);
                        console.error(`[Webhook] Email error stack:`, emailError.stack);
                        // Don't throw - allow webhook to complete
                    }
                } else {
                    console.log(`[Webhook] ⚠️ Skipping email send - emailsAlreadySent: ${emailsAlreadySent}, paymentStatus: ${paymentStatus}`);
                }
                
                return {
                    created: false,
                    orderId: metadata.orderId,
                    documentId: orderDocumentId,
                    updated: true
                };
            }
        }

        // Fallback: find by orderId
        const existingOrderQuery = await ordersRef
            .where('orderId', '==', metadata.orderId)
            .limit(1)
            .get();

        if (!existingOrderQuery.empty) {
            const existingDoc = existingOrderQuery.docs[0];
            const existingData = existingDoc.data();
            const emailsAlreadySent = existingData.emailSent && existingData.paymentReceiptSent;
            
            console.log(`[Webhook] Existing order email status (orderId path) - emailSent: ${existingData.emailSent}, paymentReceiptSent: ${existingData.paymentReceiptSent}, emailsAlreadySent: ${emailsAlreadySent}`);
            
            await existingDoc.ref.update({
                ...updateData,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`[Webhook] Updated existing order by orderId: ${metadata.orderId}`);
            
            // Send emails if not already sent and payment is successful
            console.log(`[Webhook] Checking email send conditions (orderId path) - emailsAlreadySent: ${emailsAlreadySent}, paymentStatus: ${paymentStatus}`);
            if (!emailsAlreadySent && paymentStatus === 'paid') {
                console.log(`[Webhook] ✅ Calling sendStripeOrderEmails for existing order (orderId path)`);
                console.log(`[Webhook] Email function parameters - orderId: ${metadata.orderId}, documentId: ${existingDoc.id}, items: ${items.length}, total: ${total}`);
                try {
                    await sendStripeOrderEmails(metadata.orderId, existingDoc.id, orderData, items, subtotal, shippingCost, total, customerInfo, brevoApiKey, fromEmail, adminEmail);
                    console.log(`[Webhook] ✅ sendStripeOrderEmails completed for existing order (orderId): ${metadata.orderId}`);
                } catch (emailError) {
                    console.error(`[Webhook] ❌ sendStripeOrderEmails threw an error (orderId path):`, emailError);
                    console.error(`[Webhook] Email error stack:`, emailError.stack);
                    // Don't throw - allow webhook to complete
                }
            } else {
                console.log(`[Webhook] ⚠️ Skipping email send (orderId path) - emailsAlreadySent: ${emailsAlreadySent}, paymentStatus: ${paymentStatus}`);
            }
            
            return {
                created: false,
                orderId: metadata.orderId,
                documentId: existingDoc.id,
                updated: true
            };
        }

        // Create order in Firestore
        const docRef = await ordersRef.add(orderData);

        console.log(`[Webhook] Order created from checkout session: ${docRef.id} (orderId: ${metadata.orderId})`);
        console.log(`[Webhook] Checking payment status for email sending: paymentStatus=${paymentStatus}, brevoApiKey=${!!brevoApiKey}, fromEmail=${fromEmail}, adminEmail=${adminEmail}`);

        // Send emails immediately for paid Stripe orders
        if (paymentStatus === 'paid') {
            console.log(`[Webhook] ✅ Payment status is 'paid', calling sendStripeOrderEmails for new order`);
            console.log(`[Webhook] Email function parameters - orderId: ${metadata.orderId}, documentId: ${docRef.id}, items: ${items.length}, total: ${total}`);
            try {
                await sendStripeOrderEmails(metadata.orderId, docRef.id, orderData, items, subtotal, shippingCost, total, customerInfo, brevoApiKey, fromEmail, adminEmail);
                console.log(`[Webhook] ✅ sendStripeOrderEmails completed for order: ${metadata.orderId}`);
            } catch (emailError) {
                console.error(`[Webhook] ❌ sendStripeOrderEmails threw an error:`, emailError);
                console.error(`[Webhook] Email error stack:`, emailError.stack);
                throw emailError;
            }
        } else {
            console.log(`[Webhook] ⚠️ Payment status is '${paymentStatus}', skipping email send`);
        }

        return {
            created: true,
            orderId: metadata.orderId,
            documentId: docRef.id,
            paymentStatus: paymentStatus
        };

    } catch (error) {
        console.error('[Webhook] Error handling checkout session completed:', error);
        throw error;
    }
};

const processWebhookEvent = async (event, brevoApiKey, fromEmail, adminEmail) => {
    const eventType = event.type;

    console.log(`[Webhook] Processing event: ${eventType} (${event.id})`);

    let result;
    let retryCount = 0;
    const maxRetries = 2; // Reduced from 3 to prevent long latencies

    while (retryCount <= maxRetries) {
        try {
            switch (eventType) {
                case 'payment_intent.succeeded':
                    result = await handlePaymentIntentSucceeded(event.data.object);
                    break;

                case 'payment_intent.payment_failed':
                    result = await handlePaymentIntentPaymentFailed(event.data.object);
                    break;

                case 'charge.refunded':
                    result = await handleChargeRefunded(event.data.object);
                    break;

                case 'charge.disputed':
                    result = await handleChargeDisputed(event.data.object);
                    break;

                case 'checkout.session.completed':
                    result = await handleCheckoutSessionCompleted(event.data.object, brevoApiKey, fromEmail, adminEmail);
                    break;

                default:
                    console.log(`[Webhook] Unhandled event type: ${eventType}`);
                    return { handled: false, eventType };
            }

            // Log successful processing (even if result indicates order not found - that's OK for some events)
            await logWebhookEvent(event, 'success', null, result);
            console.log(`[Webhook] Successfully processed event: ${event.id}`, result);
            
            return {
                handled: true,
                eventType,
                result,
                retries: retryCount
            };

        } catch (error) {
            retryCount++;
            console.error(`[Webhook] Error processing event (attempt ${retryCount}/${maxRetries + 1}):`, error);

            if (retryCount > maxRetries) {
                await logWebhookEvent(event, 'failed', error, { retries: retryCount });
                throw error;
            }

            const backoffDelay = Math.min(1000 * Math.pow(2, retryCount), 10000);
            console.log(`[Webhook] Retrying in ${backoffDelay}ms...`);
            await new Promise(resolve => setTimeout(resolve, backoffDelay));
        }
    }
};

const handleStripeWebhook = async (req, res, stripeSecretKey, webhookSecret, brevoApiKey, fromEmail, adminEmail) => {
    const sig = req.headers['stripe-signature'];

    if (!webhookSecret) {
        console.error('[Webhook] Webhook secret not configured');
        res.status(500).json({
            success: false,
            error: 'Webhook secret not configured. Please set STRIPE_WEBHOOK_SECRET secret'
        });
        return;
    }

    if (!sig) {
        console.error('[Webhook] No Stripe signature header found');
        res.status(400).json({
            success: false,
            error: 'No Stripe signature header found'
        });
        return;
    }

    if (!req.rawBody) {
        console.error('[Webhook] No request body found');
        res.status(400).json({
            success: false,
            error: 'No webhook payload was provided.'
        });
        return;
    }

    let event;

    try {
        const stripeInstance = stripe(stripeSecretKey);
        event = stripeInstance.webhooks.constructEvent(
            req.rawBody,
            sig,
            webhookSecret
        );
        
        console.log('[Webhook] Webhook signature verified successfully');
    } catch (err) {
        console.error('[Webhook] Webhook signature verification failed:', err.message);
        console.error('[Webhook] Error details:', {
            hasRawBody: !!req.rawBody,
            hasSignature: !!sig,
            signatureLength: sig?.length
        });
        res.status(400).json({
            success: false,
            error: 'Webhook signature verification failed',
            message: err.message
        });
        return;
    }

    try {
        const processResult = await processWebhookEvent(event, brevoApiKey, fromEmail, adminEmail);

        if (!res.headersSent) {
            res.status(200).json({
                success: true,
                received: true,
                eventId: event.id,
                eventType: event.type,
                ...processResult
            });
        }
    } catch (error) {
        console.error('[Webhook] Fatal error processing webhook:', error);
        console.error('[Webhook] Error stack:', error.stack);
        console.error('[Webhook] Event details:', {
            id: event?.id,
            type: event?.type,
            livemode: event?.livemode
        });
        
        // Log the error to Firestore for debugging (don't let this fail the response)
        try {
            await logWebhookEvent(event, 'error', error, {
                errorMessage: error.message,
                errorStack: error.stack
            });
        } catch (logError) {
            console.error('[Webhook] Failed to log error event:', logError);
        }
        
        // Always return 200 OK to Stripe to acknowledge receipt and prevent retries
        // This prevents Stripe from retrying the same event repeatedly
        // We log the error internally for debugging
        if (!res.headersSent) {
            res.status(200).json({
                success: false,
                received: true,
                error: 'Error processing webhook event (logged internally)',
                eventId: event?.id,
                eventType: event?.type,
                note: 'Event received and logged. Check logs for details.'
            });
        } else {
            // If headers already sent, log a warning
            console.warn('[Webhook] Response already sent, cannot send error response');
        }
    }
};

module.exports = {
    handleStripeWebhook,
    processWebhookEvent,
    handlePaymentIntentSucceeded,
    handlePaymentIntentPaymentFailed,
    handleChargeRefunded,
    handleChargeDisputed,
    handleCheckoutSessionCompleted,
    updateOrderStatus,
    logWebhookEvent
};
