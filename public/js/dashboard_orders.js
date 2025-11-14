
import { db } from './firebase.js';
import { collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";

const auth = getAuth();

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            const ordersContainer = document.getElementById('orders');

            if (ordersContainer) {
                const ordersQuery = query(collection(db, 'orders'), orderBy('timestamp', 'desc'));

                getDocs(ordersQuery)
                    .then((querySnapshot) => {
                        let html = '<table>';
                        html += '<thead><tr><th>Order ID</th><th>Customer</th><th>Total</th><th>Date</th></tr></thead>';
                        html += '<tbody>';
                        querySnapshot.forEach((doc) => {
                            const order = doc.data();
                            html += `<tr>
                                <td data-label="Order ID">${doc.id}</td>
                                <td data-label="Customer">${order.customerInfo.name} (${order.customerInfo.email})</td>
                                <td data-label="Total">€${order.total.toFixed(2)}</td>
                                <td data-label="Date">${new Date(order.timestamp.seconds * 1000).toLocaleString()}</td>
                            </tr>`;
                        });
                        html += '</tbody></table>';
                        ordersContainer.innerHTML = html;
                    })
                    .catch((error) => {
                        console.error("Error fetching orders: ", error);
                        ordersContainer.innerHTML = '<p>Error loading orders. Please try again later.</p>';
                    });
            }
        }
    });
});
