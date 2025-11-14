
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";

const auth = getAuth();

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');

    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            signInWithEmailAndPassword(auth, email, password)
                .then((userCredential) => {
                    // Signed in
                    window.location.href = 'dashboard.html';
                })
                .catch((error) => {
                    loginError.textContent = error.message;
                });
        });
    }

    onAuthStateChanged(auth, (user) => {
        const currentPage = window.location.pathname.split('/').pop();

        if (user) {
            // User is signed in.
            if (currentPage === 'login.html') {
                window.location.href = 'dashboard.html';
            }
        } else {
            // User is signed out.
            if (currentPage.startsWith('dashboard')) {
                window.location.href = 'login.html';
            }
        }
    });
});
