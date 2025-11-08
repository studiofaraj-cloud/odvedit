document.addEventListener("DOMContentLoaded", () => {
    // Ensure Firebase is initialized
    if (typeof firebase === 'undefined') {
        console.error("Firebase is not initialized. Make sure firebase.js is loaded correctly.");
        return;
    }

    const db = firebase.firestore();

    // Fetch and display contact messages
    const contactMessagesContainer = document.getElementById("contact-messages");
    db.collection("contactMessages").orderBy("timestamp", "desc").onSnapshot(snapshot => {
        contactMessagesContainer.innerHTML = ''; // Clear previous data
        snapshot.forEach(doc => {
            const message = doc.data();
            const messageElement = document.createElement("div");
            messageElement.classList.add("data-item");
            messageElement.innerHTML = `
                <p><strong>Name:</strong> ${message.name}</p>
                <p><strong>Email:</strong> ${message.email}</p>
                <p><strong>Message:</strong> ${message.message}</p>
                <p><strong>Date:</strong> ${message.timestamp.toDate().toLocaleString()}</p>
            `;
            contactMessagesContainer.appendChild(messageElement);
        });
    });

    // Fetch and display newsletter subscriptions
    const newsletterContainer = document.getElementById("newsletter-subscriptions");
    db.collection("newsletter").orderBy("timestamp", "desc").onSnapshot(snapshot => {
        newsletterContainer.innerHTML = ''; // Clear previous data
        snapshot.forEach(doc => {
            const subscription = doc.data();
            const subscriptionElement = document.createElement("div");
            subscriptionElement.classList.add("data-item");
            subscriptionElement.innerHTML = `
                <p><strong>Email:</strong> ${subscription.email}</p>
                <p><strong>Date:</strong> ${subscription.timestamp.toDate().toLocaleString()}</p>
            `;
            newsletterContainer.appendChild(subscriptionElement);
        });
    });

    // Fetch and display orders
    const ordersContainer = document.getElementById("orders");
    db.collection("orders").orderBy("timestamp", "desc").onSnapshot(snapshot => {
        ordersContainer.innerHTML = ''; // Clear previous data
        snapshot.forEach(doc => {
            const order = doc.data();
            const orderElement = document.createElement("div");
            orderElement.classList.add("data-item");
            orderElement.innerHTML = `
                <p><strong>Customer:</strong> ${order.customerInfo.name}</p>
                <p><strong>Total:</strong> $${order.total / 100}</p>
                <p><strong>Date:</strong> ${order.timestamp.toDate().toLocaleString()}</p>
                <div><strong>Items:</strong></div>
                <ul>
                    ${order.items.map(item => `<li>${item.name} (x${item.quantity})</li>`).join('')}
                </ul>
            `;
            ordersContainer.appendChild(orderElement);
        });
    });
});
