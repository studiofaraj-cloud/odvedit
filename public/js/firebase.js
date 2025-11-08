
// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAg7Jal9PIext4OSxhH4q0Twoybos3_mvE",
  authDomain: "l-olio-di-valeria.firebaseapp.com",
  projectId: "l-olio-di-valeria",
  storageBucket: "l-olio-di-valeria.appspot.com",
  messagingSenderId: "438585656275",
  appId: "1:438585656275:web:0ec70ddabc7de64b806526",
  measurementId: "G-QW0YWNWKZ8"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// --- Firestore Write Operations ---

// Contact Form Submission
async function addContactMessage(name, email, phone, inquiry, message) {
  await db.collection("contactMessages").add({
    name: name,
    email: email,
    phone: phone,
    inquiry: inquiry,
    message: message,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
}

// Newsletter Signup
async function addNewsletterEmail(email) {
  await db.collection("newsletter").add({
    email: email,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
}

// E-commerce Order
async function addOrder(customerInfo, items, total) {
  await db.collection("orders").add({
    customerInfo: customerInfo,
    items: items,
    total: total,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
}
