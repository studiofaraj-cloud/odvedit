// Gen 2 Firebase Functions (firebase-functions v6+)
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");

admin.initializeApp();

const { handleStripeWebhook } = require("./stripeWebhook");

// Secrets — values managed via Google Secret Manager
const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
const webhookSecret   = defineSecret("STRIPE_WEBHOOK_SECRET");
const brevoApiKey     = defineSecret("BREVO_API_KEY");

// Email config (non-secret)
const fromEmail  = "info@oliodivaleria.it";
const adminEmail = "oliodivaleria@gmail.com";

exports.stripeWebhook = onRequest(
  {
    region: "us-central1",
    secrets: [stripeSecretKey, webhookSecret, brevoApiKey],
    // Stripe webhooks must verify the *raw* request body, not parsed JSON
    invoker: "public"
  },
  async (req, res) => {
    await handleStripeWebhook(
      req,
      res,
      stripeSecretKey.value(),
      webhookSecret.value(),
      brevoApiKey.value(),
      fromEmail,
      adminEmail
    );
  }
);

// Firestore-triggered order email functions (replaces the legacy deployments
// whose source we no longer have access to). Defined in ./orderEmails.js so
// index.js stays focused on wiring/exports.
Object.assign(exports, require('./orderEmails'));

// Replacement createCheckoutSession (legacy version dumped the entire cart
// into Stripe metadata which broke for big carts due to the 500-char limit).
Object.assign(exports, require('./checkoutSession'));
