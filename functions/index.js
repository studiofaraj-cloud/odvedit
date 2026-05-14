const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { defineSecret } = require("firebase-functions/params");

// Initialize Firebase Admin SDK before requiring any module that touches Firestore.
admin.initializeApp();

const { handleStripeWebhook } = require("./stripeWebhook");

// Secrets — set with: firebase functions:secrets:set STRIPE_SECRET_KEY (etc.)
const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
const webhookSecret   = defineSecret("STRIPE_WEBHOOK_SECRET");
const brevoApiKey     = defineSecret("BREVO_API_KEY");

// Email config
const fromEmail  = "info@oliodivaleria.it";
const adminEmail = "oliodivaleria@gmail.com";

exports.stripeWebhook = functions
  .runWith({ secrets: [stripeSecretKey, webhookSecret, brevoApiKey] })
  .https.onRequest(async (req, res) => {
    await handleStripeWebhook(
      req,
      res,
      stripeSecretKey.value(),
      webhookSecret.value(),
      brevoApiKey.value(),
      fromEmail,
      adminEmail
    );
  });
