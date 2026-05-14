import { collection, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";
import { getFirebaseFirestore, withFirebaseRetry, onFirebaseConnectionChange } from './firebase-config.js';
import { PERMISSIONS, requirePermission } from './rbac.js';
import { escapeHtml, setTextContent, decodeHtml } from './security-utils.js';

const db = getFirebaseFirestore();

onFirebaseConnectionChange((state, data) => {
    console.log('[Dashboard] Firebase connection state:', state);
    if (state === 'error' || state === 'unhealthy') {
        console.error('[Dashboard] Connection issue:', data);
    }
});

document.addEventListener("DOMContentLoaded", async () => {
    if (!(await requirePermission(PERMISSIONS.VIEW_DASHBOARD))) {
        return;
    }
    
    // Fetch and display contact messages
    const contactMessagesContainer = document.getElementById("contact-messages");
    if (contactMessagesContainer) {
        const messagesQuery = query(collection(db, "contactMessages"), orderBy("timestamp", "desc"));
        onSnapshot(messagesQuery, (snapshot) => {
            contactMessagesContainer.innerHTML = ''; // Clear previous data
            snapshot.forEach(doc => {
                const message = doc.data();
                const messageElement = document.createElement("div");
                messageElement.classList.add("data-item");
                
                // Safely create elements with escaped content
                const namePara = document.createElement("p");
                namePara.innerHTML = `<strong>Name:</strong> ${escapeHtml(decodeHtml(message.name))}`;
                
                const emailPara = document.createElement("p");
                emailPara.innerHTML = `<strong>Email:</strong> ${escapeHtml(decodeHtml(message.email))}`;
                
                const messagePara = document.createElement("p");
                messagePara.innerHTML = `<strong>Message:</strong> ${escapeHtml(decodeHtml(message.message))}`;
                
                const datePara = document.createElement("p");
                datePara.innerHTML = `<strong>Date:</strong> ${escapeHtml(message.timestamp.toDate().toLocaleString())}`;
                
                messageElement.appendChild(namePara);
                messageElement.appendChild(emailPara);
                messageElement.appendChild(messagePara);
                messageElement.appendChild(datePara);
                
                contactMessagesContainer.appendChild(messageElement);
            });
        });
    }

    // Fetch and display newsletter subscriptions
    const newsletterContainer = document.getElementById("newsletter-subscriptions");
    if (newsletterContainer) {
        const newsletterQuery = query(collection(db, "newsletterSubscriptions"), orderBy("timestamp", "desc"));
        onSnapshot(newsletterQuery, (snapshot) => {
            newsletterContainer.innerHTML = ''; // Clear previous data
            snapshot.forEach(doc => {
                const subscription = doc.data();
                const subscriptionElement = document.createElement("div");
                subscriptionElement.classList.add("data-item");
                
                const emailPara = document.createElement("p");
                emailPara.innerHTML = `<strong>Email:</strong> ${escapeHtml(subscription.email)}`;
                
                const datePara = document.createElement("p");
                datePara.innerHTML = `<strong>Date:</strong> ${escapeHtml(subscription.timestamp.toDate().toLocaleString())}`;
                
                subscriptionElement.appendChild(emailPara);
                subscriptionElement.appendChild(datePara);
                
                newsletterContainer.appendChild(subscriptionElement);
            });
        });
    }

    // Fetch and display orders
    const ordersContainer = document.getElementById("orders");
    if (ordersContainer) {
        const ordersQuery = query(collection(db, "orders"), orderBy("timestamp", "desc"));
        onSnapshot(ordersQuery, (snapshot) => {
            ordersContainer.innerHTML = ''; // Clear previous data
            snapshot.forEach(doc => {
                const order = doc.data();
                const orderElement = document.createElement("div");
                orderElement.classList.add("data-item");
                
                const customerPara = document.createElement("p");
                customerPara.innerHTML = `<strong>Customer:</strong> ${escapeHtml(decodeHtml(order.customerInfo.name))}`;
                
                const totalPara = document.createElement("p");
                totalPara.innerHTML = `<strong>Total:</strong> $${escapeHtml((order.total / 100).toFixed(2))}`;
                
                const datePara = document.createElement("p");
                datePara.innerHTML = `<strong>Date:</strong> ${escapeHtml(order.timestamp.toDate().toLocaleString())}`;
                
                const itemsDiv = document.createElement("div");
                const itemsLabel = document.createElement("strong");
                itemsLabel.textContent = "Items:";
                itemsDiv.appendChild(itemsLabel);
                
                const itemsList = document.createElement("ul");
                order.items.forEach(item => {
                    const li = document.createElement("li");
                    li.textContent = `${item.name} (x${item.quantity})`;
                    itemsList.appendChild(li);
                });
                itemsDiv.appendChild(itemsList);
                
                orderElement.appendChild(customerPara);
                orderElement.appendChild(totalPara);
                orderElement.appendChild(datePara);
                orderElement.appendChild(itemsDiv);
                
                ordersContainer.appendChild(orderElement);
            });
        });
    }
});
