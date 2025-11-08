const functions = require("firebase-functions");
const admin = require("firebase-admin");
const cors = require("cors")({origin: true});

admin.initializeApp();

exports.api = functions.https.onRequest((req, res) => {
  const stripe = require("stripe")(functions.config().stripe.secret);
  cors(req, res, async () => {
    if (req.method === "POST") {
      try {
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: req.body.items.map(item => ({
            price_data: {
              currency: "usd",
              product_data: {
                name: item.name,
              },
              unit_amount: item.price,
            },
            quantity: item.quantity,
          })),
          mode: "payment",
          success_url: `${req.headers.origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${req.headers.origin}/cancel.html`,
        });

        res.status(200).json({ id: session.id });
      } catch (error) {
        console.error("Error creating checkout session:", error);
        res.status(500).send("Internal Server Error");
      }
    } else {
      res.setHeader("Allow", "POST");
      res.status(405).send("Method Not Allowed");
    }
  });
});