/**
 * Local Test Script for Stripe Webhook
 * 
 * This script helps test the webhook handler locally without deploying to Firebase.
 * 
 * Usage:
 *   node webhooks/test-webhook.js [event-type]
 * 
 * Examples:
 *   node webhooks/test-webhook.js payment_intent.succeeded
 *   node webhooks/test-webhook.js payment_intent.payment_failed
 *   node webhooks/test-webhook.js charge.refunded
 *   node webhooks/test-webhook.js charge.disputed
 */

const {
    processWebhookEvent,
    handlePaymentIntentSucceeded,
    handlePaymentIntentPaymentFailed,
    handleChargeRefunded,
    handleChargeDisputed
} = require('./stripeWebhook');

// Mock Firestore data
const mockPaymentIntent = {
    id: 'pi_test_123456789',
    object: 'payment_intent',
    amount: 5000,
    amount_capturable: 0,
    amount_received: 5000,
    capture_method: 'automatic',
    client_secret: 'pi_test_secret',
    confirmation_method: 'automatic',
    created: Math.floor(Date.now() / 1000),
    currency: 'eur',
    customer: 'cus_test_customer',
    description: 'Order payment for l\'Olio di Valeria',
    last_payment_error: null,
    livemode: false,
    metadata: {
        orderId: 'ORD-TEST-001'
    },
    payment_method: 'pm_test_card',
    payment_method_types: ['card'],
    receipt_email: 'customer@odvsicilia.it',
    status: 'succeeded'
};

const mockPaymentIntentFailed = {
    ...mockPaymentIntent,
    id: 'pi_test_failed_123',
    status: 'failed',
    last_payment_error: {
        message: 'Your card was declined'
    }
};

const mockCharge = {
    id: 'ch_test_123456789',
    object: 'charge',
    amount: 5000,
    amount_captured: 5000,
    amount_refunded: 5000,
    created: Math.floor(Date.now() / 1000),
    currency: 'eur',
    customer: 'cus_test_customer',
    description: 'Order payment for l\'Olio di Valeria',
    payment_intent: 'pi_test_123456789',
    refunded: true,
    status: 'succeeded'
};

const mockChargeDisputed = {
    ...mockCharge,
    id: 'ch_test_disputed_123',
    dispute: {
        id: 'dp_test_123',
        reason: 'fraudulent',
        status: 'needs_response'
    }
};

// Mock webhook events
const mockEvents = {
    'payment_intent.succeeded': {
        id: 'evt_test_payment_succeeded',
        object: 'event',
        api_version: '2023-10-16',
        created: Math.floor(Date.now() / 1000),
        data: {
            object: mockPaymentIntent
        },
        livemode: false,
        pending_webhooks: 1,
        type: 'payment_intent.succeeded'
    },
    
    'payment_intent.payment_failed': {
        id: 'evt_test_payment_failed',
        object: 'event',
        api_version: '2023-10-16',
        created: Math.floor(Date.now() / 1000),
        data: {
            object: mockPaymentIntentFailed
        },
        livemode: false,
        pending_webhooks: 1,
        type: 'payment_intent.payment_failed'
    },
    
    'charge.refunded': {
        id: 'evt_test_charge_refunded',
        object: 'event',
        api_version: '2023-10-16',
        created: Math.floor(Date.now() / 1000),
        data: {
            object: mockCharge
        },
        livemode: false,
        pending_webhooks: 1,
        type: 'charge.refunded'
    },
    
    'charge.disputed': {
        id: 'evt_test_charge_disputed',
        object: 'event',
        api_version: '2023-10-16',
        created: Math.floor(Date.now() / 1000),
        data: {
            object: mockChargeDisputed
        },
        livemode: false,
        pending_webhooks: 1,
        type: 'charge.disputed'
    }
};

async function testWebhookHandler(eventType) {
    console.log('='.repeat(60));
    console.log(`Testing Webhook: ${eventType}`);
    console.log('='.repeat(60));
    console.log('');
    
    const event = mockEvents[eventType];
    
    if (!event) {
        console.error(`❌ Unknown event type: ${eventType}`);
        console.log('');
        console.log('Available event types:');
        Object.keys(mockEvents).forEach(type => console.log(`  - ${type}`));
        process.exit(1);
    }
    
    console.log('Event Details:');
    console.log('  Event ID:', event.id);
    console.log('  Event Type:', event.type);
    console.log('  Created:', new Date(event.created * 1000).toISOString());
    console.log('  Livemode:', event.livemode);
    console.log('');
    
    console.log('Event Data:');
    console.log(JSON.stringify(event.data.object, null, 2));
    console.log('');
    
    console.log('Processing webhook event...');
    console.log('');
    
    try {
        const result = await processWebhookEvent(event);
        
        console.log('✅ Webhook processed successfully!');
        console.log('');
        console.log('Result:');
        console.log(JSON.stringify(result, null, 2));
        console.log('');
        
        if (result.result) {
            console.log('Order Update Details:');
            console.log('  Order Found:', result.result.found ? '✅' : '❌');
            if (result.result.found) {
                console.log('  Order ID:', result.result.orderId);
                console.log('  Previous Status:', result.result.previousStatus);
                console.log('  New Status:', result.result.newStatus);
            }
            console.log('');
        }
        
    } catch (error) {
        console.error('❌ Error processing webhook:');
        console.error('  Message:', error.message);
        console.error('  Stack:', error.stack);
        console.log('');
        process.exit(1);
    }
    
    console.log('='.repeat(60));
    console.log('Test completed successfully!');
    console.log('='.repeat(60));
}

async function testIndividualHandler(eventType) {
    console.log('='.repeat(60));
    console.log(`Testing Individual Handler: ${eventType}`);
    console.log('='.repeat(60));
    console.log('');
    
    const event = mockEvents[eventType];
    const eventObject = event.data.object;
    
    try {
        let result;
        
        switch (eventType) {
            case 'payment_intent.succeeded':
                result = await handlePaymentIntentSucceeded(eventObject);
                break;
            case 'payment_intent.payment_failed':
                result = await handlePaymentIntentPaymentFailed(eventObject);
                break;
            case 'charge.refunded':
                result = await handleChargeRefunded(eventObject);
                break;
            case 'charge.disputed':
                result = await handleChargeDisputed(eventObject);
                break;
            default:
                throw new Error(`Unknown handler for: ${eventType}`);
        }
        
        console.log('✅ Handler executed successfully!');
        console.log('');
        console.log('Result:');
        console.log(JSON.stringify(result, null, 2));
        console.log('');
        
    } catch (error) {
        console.error('❌ Error executing handler:');
        console.error('  Message:', error.message);
        console.log('');
    }
    
    console.log('='.repeat(60));
}

// Main execution
const eventType = process.argv[2] || 'payment_intent.succeeded';

console.log('');
console.log('🧪 Stripe Webhook Test Script');
console.log('');
console.log('⚠️  Note: This is a local test using mock data.');
console.log('   It will not update real Firestore documents.');
console.log('   To test with real Firebase, use the emulator:');
console.log('   firebase emulators:start --only functions,firestore');
console.log('');

// Run the test
testWebhookHandler(eventType)
    .then(() => {
        console.log('');
        console.log('💡 Next Steps:');
        console.log('   1. Test other event types:');
        console.log('      node webhooks/test-webhook.js payment_intent.payment_failed');
        console.log('      node webhooks/test-webhook.js charge.refunded');
        console.log('      node webhooks/test-webhook.js charge.disputed');
        console.log('');
        console.log('   2. Test with Firebase emulator:');
        console.log('      firebase emulators:start --only functions,firestore');
        console.log('');
        console.log('   3. Test with Stripe CLI:');
        console.log('      stripe listen --forward-to http://localhost:5001/YOUR_PROJECT/us-central1/stripeWebhook');
        console.log('      stripe trigger payment_intent.succeeded');
        console.log('');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
