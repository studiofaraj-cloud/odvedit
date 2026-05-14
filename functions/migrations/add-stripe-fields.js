/**
 * Migration script to add Stripe fields to existing orders
 * 
 * This script adds the following fields to all existing orders in Firestore:
 * - stripePaymentIntentId: null
 * - stripeCustomerId: null
 * - stripePaymentMethodId: null
 * - paymentMetadata: {}
 * 
 * Usage:
 * 1. Set Firebase credentials in environment
 * 2. Run: node functions/migrations/add-stripe-fields.js
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
    // Use default credentials from environment
    admin.initializeApp({
        credential: admin.credential.applicationDefault()
    });
}

const db = admin.firestore();

async function migrateOrders() {
    console.log('Starting migration: Adding Stripe fields to existing orders...');
    console.log('Timestamp:', new Date().toISOString());
    console.log('---');
    
    try {
        // Get all orders from the collection
        const ordersSnapshot = await db.collection('orders').get();
        
        if (ordersSnapshot.empty) {
            console.log('No orders found in the database. Migration complete.');
            return;
        }
        
        console.log(`Found ${ordersSnapshot.size} order(s) to migrate.`);
        console.log('---');
        
        let successCount = 0;
        let skipCount = 0;
        let errorCount = 0;
        
        // Process each order
        for (const orderDoc of ordersSnapshot.docs) {
            const orderId = orderDoc.id;
            const orderData = orderDoc.data();
            
            console.log(`\nProcessing order: ${orderId}`);
            console.log(`  Customer: ${orderData.customerInfo?.name || 'N/A'}`);
            console.log(`  Total: €${orderData.total || 'N/A'}`);
            
            // Check if Stripe fields already exist
            const hasStripeFields = (
                orderData.hasOwnProperty('stripePaymentIntentId') ||
                orderData.hasOwnProperty('stripeCustomerId') ||
                orderData.hasOwnProperty('stripePaymentMethodId') ||
                orderData.hasOwnProperty('paymentMetadata')
            );
            
            if (hasStripeFields) {
                console.log(`  ⏭️  Skipped (already has Stripe fields)`);
                skipCount++;
                continue;
            }
            
            try {
                // Add Stripe fields with default values
                await orderDoc.ref.update({
                    stripePaymentIntentId: null,
                    stripeCustomerId: null,
                    stripePaymentMethodId: null,
                    paymentMetadata: {},
                    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                });
                
                console.log(`  ✅ Successfully added Stripe fields`);
                successCount++;
            } catch (error) {
                console.error(`  ❌ Error updating order: ${error.message}`);
                errorCount++;
            }
        }
        
        console.log('\n---');
        console.log('Migration Summary:');
        console.log(`  Total orders: ${ordersSnapshot.size}`);
        console.log(`  ✅ Successfully migrated: ${successCount}`);
        console.log(`  ⏭️  Skipped (already migrated): ${skipCount}`);
        console.log(`  ❌ Errors: ${errorCount}`);
        console.log('---');
        console.log('Migration complete!');
        
    } catch (error) {
        console.error('Fatal error during migration:', error);
        process.exit(1);
    }
}

// Run the migration
migrateOrders()
    .then(() => {
        console.log('\nExiting...');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Unexpected error:', error);
        process.exit(1);
    });
