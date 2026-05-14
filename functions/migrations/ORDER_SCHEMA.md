# Order Document Schema

This document defines the complete structure of order documents in the Firestore `orders` collection.

## Document Structure

```javascript
{
  // Order Identification
  orderId: "ORD-1234567890-ABCDEF",  // String, unique order identifier
  
  // Customer Information
  customerInfo: {
    name: "Mario Rossi",              // String, customer full name
    email: "mario.rossi@example.com", // String, customer email
    phone: "+39 123 456 7890",        // String, customer phone number
    company: "Azienda S.r.l.",        // String, optional company name
    address: "Via Roma",              // String, street address
    houseNumber: "123",               // String, house/building number
    city: "Milano",                   // String, city name
    province: "MI",                   // String, province/state code
    postalCode: "20100",              // String, postal/ZIP code
    country: "IT",                    // String, country code (ISO 3166-1 alpha-2)
    customCountry: "",                // String, custom country name if "OTHER"
    notes: "Please ring doorbell"    // String, optional delivery notes
  },
  
  // Order Items
  items: [
    {
      id: "prod_001",                 // String, product identifier
      name: "Olio Extra Vergine",     // String, product name
      volume: "500ml",                // String, product volume/size
      size: "500ml",                  // String, alternative size field
      price: 12.50,                   // Number, unit price in EUR
      quantity: 2,                    // Number, quantity ordered
      image: "/images/product.jpg"    // String, product image URL
    }
  ],
  
  // Pricing
  subtotal: 25.00,                    // Number, sum of items before shipping
  shipping: 10.00,                    // Number, shipping cost in EUR
  total: 35.00,                       // Number, final total (subtotal + shipping)
  
  // Payment Information (Traditional)
  paymentMethod: "bank_transfer",     // String: "bank_transfer", "card", "paypal", etc.
  paymentStatus: "pending",           // String: "pending", "paid", "failed", "processing"
  
  // Stripe Payment Integration Fields
  stripePaymentIntentId: "pi_xxx",    // String|null, Stripe Payment Intent ID
  stripeCustomerId: "cus_xxx",        // String|null, Stripe Customer ID
  stripePaymentMethodId: "pm_xxx",    // String|null, Stripe Payment Method ID
  paymentMetadata: {                  // Object, additional payment metadata
    paymentIntentStatus: "succeeded", // String, Stripe payment status
    chargeId: "ch_xxx",               // String, Stripe charge ID
    receiptUrl: "https://...",        // String, payment receipt URL
    last4: "4242",                    // String, last 4 digits of card
    brand: "visa",                    // String, card brand
    // ... other custom metadata
  },
  
  // Order Status
  status: "pending",                  // String: "pending", "processing", "shipped", "delivered", "cancelled"
  
  // Timestamps
  timestamp: Timestamp,               // Firestore Timestamp, order creation time
  lastUpdated: Timestamp,             // Firestore Timestamp, last modification time
  
  // Email Tracking (if email service is integrated)
  emailSent: true,                    // Boolean, whether confirmation email was sent
  emailSentAt: Timestamp,             // Firestore Timestamp, when email was sent
  emailStatus: "delivered"            // String, email delivery status
}
```

## Field Descriptions

### Stripe Payment Fields (New)

#### stripePaymentIntentId
- **Type**: `String | null`
- **Description**: The Stripe Payment Intent ID (e.g., `pi_3MtwBwLkdIwHu7ix28a3tqPa`)
- **Usage**: Links the order to a Stripe payment, used for tracking and refunds
- **Default**: `null` (for non-Stripe payments or migrated orders)

#### stripeCustomerId
- **Type**: `String | null`
- **Description**: The Stripe Customer ID (e.g., `cus_NffrFeUfNV2Hib`)
- **Usage**: Links to the customer in Stripe for recurring payments and customer history
- **Default**: `null` (for guest checkouts or migrated orders)

#### stripePaymentMethodId
- **Type**: `String | null`
- **Description**: The Stripe Payment Method ID (e.g., `pm_1MtwBwLkdIwHu7ix28a3tqPa`)
- **Usage**: Identifies the payment method used (card, wallet, etc.)
- **Default**: `null` (for non-Stripe payments or migrated orders)

#### paymentMetadata
- **Type**: `Object`
- **Description**: Additional metadata about the payment transaction
- **Common Properties**:
  - `paymentIntentStatus`: Stripe payment status (succeeded, processing, requires_action, etc.)
  - `chargeId`: Stripe charge ID for the transaction
  - `receiptUrl`: URL to the Stripe-hosted receipt
  - `last4`: Last 4 digits of the card used
  - `brand`: Card brand (visa, mastercard, amex, etc.)
  - `country`: Card issuing country
  - `funding`: Card funding type (credit, debit, prepaid)
  - `wallet`: Wallet type if used (apple_pay, google_pay, etc.)
- **Default**: `{}` (empty object)

## Validation Rules

### Firestore Security Rules

```javascript
match /orders/{orderId} {
  allow read: if request.auth != null;
  allow create: if true;
  
  // Allow authenticated updates OR webhook updates to Stripe fields only
  allow update: if request.auth != null || 
    (request.resource.data.diff(resource.data).affectedKeys()
      .hasOnly(['stripePaymentIntentId', 'stripeCustomerId', 
                'stripePaymentMethodId', 'paymentMetadata', 
                'paymentStatus', 'lastUpdated']));
  
  allow delete: if request.auth != null;
}
```

This rule allows:
- Authenticated admins to update any field
- Unauthenticated Stripe webhooks to update only payment-related fields

## Migration Notes

### Existing Orders
All existing orders created before Stripe integration will have:
- `stripePaymentIntentId: null`
- `stripeCustomerId: null`
- `stripePaymentMethodId: null`
- `paymentMetadata: {}`

### New Orders
Orders created after Stripe integration will:
- Include Stripe fields if payment was processed through Stripe
- Have `null` values for Stripe fields if using traditional payment methods (bank transfer)

## Examples

### Bank Transfer Order (Traditional)
```javascript
{
  orderId: "ORD-1234567890-ABCDEF",
  paymentMethod: "bank_transfer",
  paymentStatus: "pending",
  stripePaymentIntentId: null,
  stripeCustomerId: null,
  stripePaymentMethodId: null,
  paymentMetadata: {},
  // ... other fields
}
```

### Stripe Card Payment Order
```javascript
{
  orderId: "ORD-1234567890-GHIJKL",
  paymentMethod: "card",
  paymentStatus: "paid",
  stripePaymentIntentId: "pi_3MtwBwLkdIwHu7ix28a3tqPa",
  stripeCustomerId: "cus_NffrFeUfNV2Hib",
  stripePaymentMethodId: "pm_1MtwBwLkdIwHu7ix28a3tqPa",
  paymentMetadata: {
    paymentIntentStatus: "succeeded",
    chargeId: "ch_3MtwBwLkdIwHu7ix28a3tqPa",
    receiptUrl: "https://pay.stripe.com/receipts/...",
    last4: "4242",
    brand: "visa",
    country: "IT",
    funding: "credit"
  },
  // ... other fields
}
```

### Stripe Wallet Payment Order (Apple Pay)
```javascript
{
  orderId: "ORD-1234567890-MNOPQR",
  paymentMethod: "Apple Pay",
  paymentStatus: "paid",
  stripePaymentIntentId: "pi_3MtwBwLkdIwHu7ix28a3tqPa",
  stripeCustomerId: "cus_NffrFeUfNV2Hib",
  stripePaymentMethodId: "pm_1MtwBwLkdIwHu7ix28a3tqPa",
  paymentMetadata: {
    paymentIntentStatus: "succeeded",
    chargeId: "ch_3MtwBwLkdIwHu7ix28a3tqPa",
    receiptUrl: "https://pay.stripe.com/receipts/...",
    wallet: "apple_pay",
    last4: "4242",
    brand: "visa"
  },
  // ... other fields
}
```

## Best Practices

1. **Always check for null**: Stripe fields may be `null` for non-Stripe payments
2. **Use paymentMetadata**: Store additional payment details here for debugging
3. **Update lastUpdated**: Always update this field when modifying orders
4. **Log webhook updates**: Keep track of Stripe webhook updates to payment fields
5. **Handle migrations**: Use the migration script to add fields to existing orders
