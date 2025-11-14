
import { db } from './firebase.js';
import { collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";

const auth = getAuth();

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            const newsletterContainer = document.getElementById('newsletter-subscriptions');

            if (newsletterContainer) {
                const newsletterQuery = query(collection(db, 'newsletter'), orderBy('timestamp', 'desc'));

                getDocs(newsletterQuery)
                    .then((querySnapshot) => {
                        let html = '<table>';
                        html += '<thead><tr><th>Email</th><th>Subscription Date</th></tr></thead>';
                        html += '<tbody>';
                        querySnapshot.forEach((doc) => {
                            const subscription = doc.data();
                            html += `<tr>
                                <td data-label="Email">${subscription.email}</td>
                                <td data-label="Date">${new Date(subscription.timestamp.seconds * 1000).toLocaleString()}</td>
                            </tr>`;
                        });
                        html += '</tbody></table>';
                        newsletterContainer.innerHTML = html;
                    })
                    .catch((error) => {
                        console.error("Error fetching newsletter subscriptions: ", error);
                        newsletterContainer.innerHTML = '<p>Error loading subscriptions. Please try again later.</p>';
                    });
            }
        }
    });
});
