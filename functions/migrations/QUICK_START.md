# Quick Start: Stripe Integration

This guide helps you quickly set up and use the Stripe integration for order payments.

## For Developers

### 1. Initial Setup (One-time)

```bash
# Deploy Firestore security rules
firebase deploy --only firestore:rules

# Run migration to add Stripe fields to existing orders
cd functions
node migrations/add-stripe-fields.js
```

### 2. Creating Orders with Stripe

When creating an order with Stripe payment, include these fields:

```javascript
import { saveOrder } from './checkout.js';

const orderData = {
    // Standard order fields
    orderId: "ORD-123-ABC",
    customerInfo: { /* ... */ },
    items: [ /* ... */ ],
    total: 60.00,
    
    // Stripe fields (add these after Stripe payment succeeds)
    stripePaymentIntentId: "pi_xxx",        // From Stripe Payment Intent
    stripeCustomerId: "cus_xxx",            // From Stripe Customer
    stripePaymentMethodId: "pm_xxx",        // From Stripe Payment Method
    paymentMetadata: {
        paymentIntentStatus: "succeeded",
        chargeId: "ch_xxx",
        receiptUrl: "https://...",
        last4: "4242",
        brand: "visa"
    }
};

await saveOrder(orderData);
```

### 3. Handling Stripe Webhooks

Update orders when receiving Stripe webhook events:

```javascript
// In your Cloud Function webhook handler
exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
    const event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);
    
    if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object;
        const orderId = paymentIntent.metadata.orderId;
        
        await admin.firestore().collection('orders').doc(orderId).update({
            stripePaymentIntentId: paymentIntent.id,
            paymentStatus: 'paid',
            paymentMetadata: {
                paymentIntentStatus: paymentIntent.status,
                // Add more metadata as needed
            },
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        });
    }
    
    res.json({ received: true });
});
```

## For Dashboard Users

### Viewing Stripe Payment Info

1. Go to **Dashboard > Orders**
2. Look for orders with the **💳 Stripe** badge
3. Click on an order to view details
4. Scroll to **"Informazioni Pagamento Stripe"** section
5. View Payment Intent ID, Customer ID, and metadata

### Payment Information Available

- **Payment Intent ID**: Link to Stripe transaction
- **Customer ID**: Link to customer in Stripe Dashboard
- **Payment Method ID**: Card/wallet used for payment
- **Metadata**: Additional payment details (card brand, last 4 digits, receipt URL)

## Common Scenarios

### Scenario 1: New Order with Stripe Payment

```javascript
// After successful Stripe payment
const orderData = {
    // ... standard fields
    stripePaymentIntentId: stripeResponse.paymentIntent.id,
    stripeCustomerId: stripeResponse.customer,
    stripePaymentMethodId: stripeResponse.paymentMethod.id,
    paymentMetadata: {
        last4: stripeResponse.paymentMethod.card.last4,
        brand: stripeResponse.paymentMethod.card.brand
    }
};
```

### Scenario 2: Traditional Payment (No Stripe)

```javascript
// Bank transfer or other payment
const orderData = {
    // ... standard fields
    stripePaymentIntentId: null,
    stripeCustomerId: null,
    stripePaymentMethodId: null,
    paymentMetadata: {}
};
```

### Scenario 3: Updating Payment Status via Webhook

```javascript
// Webhook receives payment success
await orderRef.update({
    paymentStatus: 'paid',
    paymentMetadata: {
        paymentIntentStatus: 'succeeded',
        receiptUrl: charge.receipt_url
    }
});
```

## Troubleshooting

### Migration Issues

**Problem**: Migration script fails with permission error

**Solution**:
```bash
# Ensure you're logged in
firebase login

# Check your project
firebase use --add

# Run migration again
node migrations/add-stripe-fields.js
```

### Dashboard Not Showing Stripe Info

**Problem**: Stripe section not visible in order details

**Check**:
1. Order has `stripePaymentIntentId` or `stripeCustomerId` field
2. Browser cache cleared
3. JavaScript console for errors

### Webhook Updates Failing

**Problem**: Firestore permission denied on webhook update

**Solution**:
1. Verify `firestore.rules` deployed:
   ```bash
   firebase deploy --only firestore:rules
   ```
2. Check webhook is only updating allowed fields:
   - `stripePaymentIntentId`
   - `stripeCustomerId`
   - `stripePaymentMethodId`
   - `paymentMetadata`
   - `paymentStatus`
   - `lastUpdated`

## Best Practices

1. **Always include metadata**: Store charge ID, receipt URL, and card details
2. **Handle errors gracefully**: Stripe failures should not break checkout
3. **Log webhook events**: Keep track of payment updates
4. **Test with Stripe test mode**: Use test cards before production
5. **Monitor webhook deliveries**: Check Stripe Dashboard for failed webhooks

## Resources

- [Stripe Documentation](https://stripe.com/docs)
- [Firebase Security Rules](https://firebase.google.com/docs/firestore/security/rules-structure)
- `ORDER_SCHEMA.md` - Complete order document structure
- `README.md` - Detailed migration documentation
- `STRIPE_INTEGRATION_IMPLEMENTATION.md` - Full implementation details

## Quick Commands

```bash
# Deploy security rules
firebase deploy --only firestore:rules

# Run migration
cd functions && node migrations/add-stripe-fields.js

# View logs
firebase functions:log

# Test webhook locally
firebase emulators:start --only functions

# Deploy all
firebase deploy
```

## Support

For questions or issues:
1. Check the error message and logs
2. Review the relevant documentation file
3. Test in Firebase Emulator before production
4. Check Stripe Dashboard for payment status
