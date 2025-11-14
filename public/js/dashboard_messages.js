
import { db } from './firebase.js';
import { collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";

const auth = getAuth();

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            const messagesContainer = document.getElementById('contact-messages');

            if (messagesContainer) {
                const messagesQuery = query(collection(db, 'contactMessages'), orderBy('timestamp', 'desc'));

                getDocs(messagesQuery)
                    .then((querySnapshot) => {
                        let html = '<table>';
                        html += '<thead><tr><th>Name</th><th>Email</th><th>Message</th><th>Date</th></tr></thead>';
                        html += '<tbody>';
                        querySnapshot.forEach((doc) => {
                            const message = doc.data();
                            html += `<tr>
                                <td data-label="Name">${message.name}</td>
                                <td data-label="Email">${message.email}</td>
                                <td data-label="Message">${message.message}</td>
                                <td data-label="Date">${new Date(message.timestamp.seconds * 1000).toLocaleString()}</td>
                            </tr>`;
                        });
                        html += '</tbody></table>';
                        messagesContainer.innerHTML = html;
                    })
                    .catch((error) => {
                        console.error("Error fetching messages: ", error);
                        messagesContainer.innerHTML = '<p>Error loading messages. Please try again later.</p>';
                    });
            }
        }
    });
});
