/**
 * createCheckoutSession — HTTPS endpoint that creates a Stripe Checkout session
 * for the frontend's checkout flow.
 *
 * REPLACES the legacy createCheckoutSession deployed from Firebase Studio that
 * we don't have source for. The original was serializing the entire cart into
 * Stripe metadata, which broke for big carts (Stripe limits each metadata
 * value to 500 chars — gift-box orders with multiple bottles hit ~700-1000).
 *
 * This version puts ONLY {orderId, orderDocumentId, paymentMethod} in metadata
 * (each ≤ ~60 chars). The webhook (stripeWebhook.js) already uses orderDocumentId
 * to look up the full order from Firestore when it needs to send confirmation
 * receipts, so nothing downstream is lost.
 */

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const stripe = require('stripe');

const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');

const SUCCESS_URL = 'https://oliodivaleria.it/checkout-success.html?session_id={CHECKOUT_SESSION_ID}';
const CANCEL_URL  = 'https://oliodivaleria.it/checkout-cancel.html';

exports.createCheckoutSession = onRequest(
    {
        region: 'us-central1',
        secrets: [stripeSecretKey],
        invoker: 'public',
        memory: '256MiB',
        cors: [
            'https://oliodivaleria.it',
            'https://www.oliodivaleria.it',
            'https://l-olio-di-valeria.web.app',
            'https://l-olio-di-valeria.firebaseapp.com',
            // Localhost for emulator/dev testing
            /^https?:\/\/localhost(:\d+)?$/,
            /^https?:\/\/127\.0\.0\.1(:\d+)?$/
        ]
    },
    async (req, res) => {
        if (req.method !== 'POST') {
            res.status(405).json({ success: false, error: 'Method not allowed' });
            return;
        }

        try {
            const body = req.body || {};
            const items = Array.isArray(body.items) ? body.items : [];
            const customerInfo = body.customerInfo || {};
            const shippingCost = Number(body.shippingCost || body.shipping) || 0;
            const orderId = body.orderId || '';
            const orderDocumentId = body.orderDocumentId || '';

            if (items.length === 0) {
                console.warn('[Checkout Session] Empty cart for order:', orderId);
                res.status(400).json({ success: false, error: 'Cart is empty' });
                return;
            }

            const stripeClient = stripe(stripeSecretKey.value());

            // Build Stripe line items from the cart. Each gets the product name +
            // size as the display name shown on the Stripe-hosted payment page.
            const lineItems = items.map((it) => {
                const baseName = (it.name || 'Prodotto').toString().slice(0, 180);
                const sizeStr = (it.size || '').toString().slice(0, 100);
                const productName = sizeStr ? `${baseName} - ${sizeStr}` : baseName;
                const unitAmount = Math.max(0, Math.round((Number(it.price) || 0) * 100));
                const quantity = Math.max(1, Math.round(Number(it.quantity) || 1));
                return {
                    price_data: {
                        currency: 'eur',
                        product_data: { name: productName.slice(0, 200) },
                        unit_amount: unitAmount
                    },
                    quantity
                };
            });

            // Shipping as a separate line item (free shipping = no line item added).
            if (shippingCost > 0) {
                lineItems.push({
                    price_data: {
                        currency: 'eur',
                        product_data: { name: 'Spedizione' },
                        unit_amount: Math.round(shippingCost * 100)
                    },
                    quantity: 1
                });
            }

            // Metadata: ONLY small reference fields. The webhook resolves the full
            // order from Firestore using orderDocumentId.
            const metadata = {
                orderId: String(orderId).slice(0, 500),
                orderDocumentId: String(orderDocumentId).slice(0, 500),
                paymentMethod: 'card'
            };

            const sessionParams = {
                mode: 'payment',
                payment_method_types: ['card'],
                line_items: lineItems,
                success_url: SUCCESS_URL,
                cancel_url: CANCEL_URL,
                metadata,
                payment_intent_data: { metadata },
                locale: 'it'
            };

            // Prefill email when the customer provided one — Stripe Checkout shows it.
            if (customerInfo.email && typeof customerInfo.email === 'string') {
                sessionParams.customer_email = customerInfo.email.trim();
            }

            const session = await stripeClient.checkout.sessions.create(sessionParams);

            console.log(`[Checkout Session] Created session: ${session.id} for order: ${orderId}`);

            res.status(200).json({
                success: true,
                sessionId: session.id,
                url: session.url,
                orderId
            });
        } catch (err) {
            console.error('[Checkout Session] Error:', err);
            res.status(500).json({
                success: false,
                error: err.message || 'Failed to create checkout session',
                message: err.message,
                type: err.type
            });
        }
    }
);
