# Database Migrations

This directory contains database migration scripts for updating the Firestore schema.

## add-stripe-fields.js

Adds Stripe payment integration fields to existing orders in the Firestore database.

### Fields Added

- `stripePaymentIntentId`: Stripe Payment Intent ID (default: `null`)
- `stripeCustomerId`: Stripe Customer ID (default: `null`)
- `stripePaymentMethodId`: Stripe Payment Method ID (default: `null`)
- `paymentMetadata`: Additional payment metadata object (default: `{}`)
- `lastUpdated`: Timestamp of the migration (auto-generated)

### Prerequisites

1. Firebase Admin SDK credentials configured
2. Node.js installed
3. Proper permissions to update Firestore documents

### Usage

#### Option 1: Using Firebase Application Default Credentials

```bash
# Set up Application Default Credentials
firebase login

# Run the migration
cd functions
node migrations/add-stripe-fields.js
```

#### Option 2: Using Service Account Key

```bash
# Set environment variable with service account key path
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account-key.json"

# Run the migration
cd functions
node migrations/add-stripe-fields.js
```

#### Option 3: Using Firebase Emulator (Development)

```bash
# Start Firebase emulators
firebase emulators:start

# In another terminal, run migration
export FIRESTORE_EMULATOR_HOST="localhost:8080"
cd functions
node migrations/add-stripe-fields.js
```

### Safety Features

- **Idempotent**: Can be run multiple times safely
- **Non-destructive**: Only adds fields, never removes or modifies existing data
- **Skip detection**: Automatically skips orders that already have Stripe fields
- **Detailed logging**: Provides comprehensive feedback on migration progress

### Output Example

```
Starting migration: Adding Stripe fields to existing orders...
Timestamp: 2024-01-15T10:30:00.000Z
---
Found 25 order(s) to migrate.
---

Processing order: abc123xyz
  Customer: Mario Rossi
  Total: €89.50
  ✅ Successfully added Stripe fields

Processing order: def456uvw
  Customer: Laura Bianchi
  Total: €125.00
  ⏭️  Skipped (already has Stripe fields)

...

---
Migration Summary:
  Total orders: 25
  ✅ Successfully migrated: 20
  ⏭️  Skipped (already migrated): 5
  ❌ Errors: 0
---
Migration complete!
```

### Rollback

If you need to remove the added fields, you can create a rollback script or manually update documents. The added fields are nullable and won't affect existing functionality if not used.

### Testing

Before running in production:

1. Test with Firebase Emulator
2. Back up your Firestore database
3. Run migration on a test/staging environment first
4. Verify results in Firebase Console

### Notes

- The script processes orders sequentially to avoid rate limiting
- Large databases may take several minutes to process
- Progress is logged for each order
- Script exits with code 0 on success, 1 on fatal error
