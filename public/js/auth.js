import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";
import { getFirebaseAuth, getFirebaseFirestore, isFirebaseConnected } from './firebase-config.js';
import { sessionManager, setupActivityMonitor, setupExpiryMonitor } from './encryption-utils.js';
import { logLogin, logLogout } from './audit-logger.js';
import { clearRoleCache } from './rbac.js';

const auth = getFirebaseAuth();
const db = getFirebaseFirestore();

function validateLoginField(field) {
    const value = field.value.trim();
    const fieldType = field.type;
    let isValid = true;
    let errorMessage = '';

    if (!value) {
        isValid = false;
        errorMessage = fieldType === 'email' ? 'L\'email è obbligatoria' : 'La password è obbligatoria';
    } else if (fieldType === 'email') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
            isValid = false;
            errorMessage = 'Inserisci un indirizzo email valido';
        }
    } else if (fieldType === 'password') {
        if (value.length < 6) {
            isValid = false;
            errorMessage = 'La password deve contenere almeno 6 caratteri';
        }
    }

    if (!isValid) {
        field.classList.add('error');
        const loginError = document.getElementById('login-error');
        if (loginError) {
            loginError.textContent = errorMessage;
            loginError.classList.add('show');
        }
    }

    return isValid;
}

function clearFieldError(field) {
    field.classList.remove('error');
    const loginError = document.getElementById('login-error');
    if (loginError) {
        loginError.classList.remove('show');
    }
}

export async function logout() {
    try {
        // Destroy session token
        sessionManager.destroySession();
        
        // Log the logout action
        await logLogout();
        clearRoleCache();
        
        await signOut(auth);
        window.location.href = 'login.html';
    } catch (error) {
        console.error("Logout Error:", error);
        alert('Error logging out. Please try again.');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (!isFirebaseConnected()) {
        console.warn('[Auth] Firebase not connected yet, waiting...');
    }

    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');
    const emailField = document.getElementById('email');
    const passwordField = document.getElementById('password');

    if (emailField) {
        emailField.addEventListener('blur', () => validateLoginField(emailField));
        emailField.addEventListener('input', () => clearFieldError(emailField));
    }

    if (passwordField) {
        passwordField.addEventListener('blur', () => validateLoginField(passwordField));
        passwordField.addEventListener('input', () => clearFieldError(passwordField));
    }

    if (loginForm) {
        const submitButton = loginForm.querySelector('button[type="submit"]');
        
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();

            if (!isFirebaseConnected()) {
                if (loginError) {
                    loginError.textContent = 'Impossibile connettersi al servizio di autenticazione. Riprova più tardi.';
                    loginError.classList.add('show');
                }
                return;
            }

            const emailValid = validateLoginField(emailField);
            const passwordValid = validateLoginField(passwordField);

            if (!emailValid || !passwordValid) {
                return;
            }

            const email = emailField.value.trim();
            const password = passwordField.value;

            // Clear previous errors
            if (loginError) {
                loginError.classList.remove('show');
                loginError.textContent = '';
                loginError.removeAttribute('data-error-type');
            }
            emailField.classList.remove('error');
            passwordField.classList.remove('error');

            // Disable submit button and show loading state
            if (submitButton) {
                const originalButtonText = submitButton.textContent;
                submitButton.disabled = true;
                submitButton.textContent = 'Accesso in corso...';
                submitButton.style.opacity = '0.7';
                submitButton.style.cursor = 'not-allowed';

                signInWithEmailAndPassword(auth, email, password)
                    .then(async (userCredential) => {
                        const user = userCredential.user;
                        
                        // Create secure session token
                        const userData = {
                            email: user.email,
                            uid: user.uid
                        };
                        sessionManager.createSession(userData);
                        
                        try {
                            const userDocRef = doc(db, 'adminUsers', user.uid);
                            const userDoc = await getDoc(userDocRef);
                            
                            if (!userDoc.exists()) {
                                await setDoc(userDocRef, {
                                    email: user.email,
                                    displayName: user.displayName || email.split('@')[0],
                                    role: 'viewer',
                                    createdAt: serverTimestamp(),
                                    lastLogin: serverTimestamp()
                                });
                            } else {
                                await setDoc(userDocRef, {
                                    lastLogin: serverTimestamp()
                                }, { merge: true });
                            }
                            
                            await logLogin();
                        } catch (error) {
                            console.error("Error updating user document:", error);
                        }
                        
                        window.location.href = 'dashboard.html';
                    })
                    .catch((error) => {
                        // Re-enable submit button
                        submitButton.disabled = false;
                        submitButton.textContent = originalButtonText;
                        submitButton.style.opacity = '1';
                        submitButton.style.cursor = 'pointer';
                        
                        console.error("Login Error:", error);
                    
                    let errorMessage = '';
                    let errorType = 'general';
                    
                    // Handle specific Firebase Auth errors
                    switch (error.code) {
                        case 'auth/user-not-found':
                            errorMessage = 'Email non trovata. Verifica che l\'indirizzo email sia corretto.';
                            errorType = 'email';
                            emailField.classList.add('error');
                            break;
                        case 'auth/wrong-password':
                            errorMessage = 'Password errata. Controlla la password e riprova.';
                            errorType = 'password';
                            passwordField.classList.add('error');
                            break;
                        case 'auth/invalid-email':
                            errorMessage = 'Indirizzo email non valido. Inserisci un\'email valida.';
                            errorType = 'email';
                            emailField.classList.add('error');
                            break;
                        case 'auth/invalid-credential':
                            errorMessage = 'Credenziali non valide. Verifica email e password.';
                            errorType = 'general';
                            emailField.classList.add('error');
                            passwordField.classList.add('error');
                            break;
                        case 'auth/user-disabled':
                            errorMessage = 'Questo account è stato disabilitato. Contatta l\'amministratore.';
                            errorType = 'general';
                            break;
                        case 'auth/too-many-requests':
                            errorMessage = 'Troppi tentativi di accesso. Riprova più tardi.';
                            errorType = 'general';
                            break;
                        case 'auth/network-request-failed':
                            errorMessage = 'Errore di connessione. Verifica la tua connessione internet.';
                            errorType = 'general';
                            break;
                        default:
                            errorMessage = 'Errore durante l\'accesso. Riprova più tardi.';
                            errorType = 'general';
                    }
                    
                    if (loginError) {
                        loginError.textContent = errorMessage;
                        loginError.classList.add('show');
                        loginError.setAttribute('data-error-type', errorType);
                    }
                    
                    // Clear errors when user starts typing
                    emailField.addEventListener('input', () => {
                        if (errorType === 'email' || errorType === 'general') {
                            emailField.classList.remove('error');
                        }
                        if (errorType === 'password' || errorType === 'general') {
                            passwordField.classList.remove('error');
                        }
                    }, { once: true });
                    
                    passwordField.addEventListener('input', () => {
                        if (errorType === 'password' || errorType === 'general') {
                            passwordField.classList.remove('error');
                            if (loginError) {
                                loginError.classList.remove('show');
                            }
                        }
                    }, { once: true });
                    });
            } else {
                // Fallback if submit button not found
                signInWithEmailAndPassword(auth, email, password)
                    .then(async (userCredential) => {
                        const user = userCredential.user;
                        const userData = {
                            email: user.email,
                            uid: user.uid
                        };
                        sessionManager.createSession(userData);
                        
                        try {
                            const userDocRef = doc(db, 'adminUsers', user.uid);
                            const userDoc = await getDoc(userDocRef);
                            
                            if (!userDoc.exists()) {
                                await setDoc(userDocRef, {
                                    email: user.email,
                                    displayName: user.displayName || email.split('@')[0],
                                    role: 'viewer',
                                    createdAt: serverTimestamp(),
                                    lastLogin: serverTimestamp()
                                });
                            } else {
                                await setDoc(userDocRef, {
                                    lastLogin: serverTimestamp()
                                }, { merge: true });
                            }
                            
                            await logLogin();
                        } catch (error) {
                            console.error("Error updating user document:", error);
                        }
                        
                        window.location.href = 'dashboard.html';
                    })
                    .catch((error) => {
                        console.error("Login Error:", error);
                        
                        let errorMessage = '';
                        let errorType = 'general';
                        
                        switch (error.code) {
                            case 'auth/user-not-found':
                                errorMessage = 'Email non trovata. Verifica che l\'indirizzo email sia corretto.';
                                errorType = 'email';
                                emailField.classList.add('error');
                                break;
                            case 'auth/wrong-password':
                                errorMessage = 'Password errata. Controlla la password e riprova.';
                                errorType = 'password';
                                passwordField.classList.add('error');
                                break;
                            case 'auth/invalid-email':
                                errorMessage = 'Indirizzo email non valido. Inserisci un\'email valida.';
                                errorType = 'email';
                                emailField.classList.add('error');
                                break;
                            case 'auth/invalid-credential':
                                errorMessage = 'Credenziali non valide. Verifica email e password.';
                                errorType = 'general';
                                emailField.classList.add('error');
                                passwordField.classList.add('error');
                                break;
                            default:
                                errorMessage = 'Errore durante l\'accesso. Riprova più tardi.';
                                errorType = 'general';
                        }
                        
                        if (loginError) {
                            loginError.textContent = errorMessage;
                            loginError.classList.add('show');
                            loginError.setAttribute('data-error-type', errorType);
                        }
                    });
            }
        });
    }

    onAuthStateChanged(auth, (user) => {
        const currentPage = window.location.pathname.split('/').pop();
        const isDashboardPage = currentPage.startsWith('dashboard');

        if (user) {
            // User is signed in with Firebase
            // Validate session token as well
            const sessionValidation = sessionManager.validateSession();
            
            if (isDashboardPage) {
                if (!sessionValidation.valid) {
                    // Session expired or invalid, require re-login
                    console.log('Session invalid:', sessionValidation.reason);
                    sessionManager.destroySession();
                    signOut(auth);
                    window.location.href = 'login.html';
                    return;
                }
                
                // Setup activity monitoring to extend session
                setupActivityMonitor();
                
                // Setup expiry monitoring
                setupExpiryMonitor((reason) => {
                    console.log('Session expired:', reason);
                    alert('Your session has expired. Please log in again.');
                    logout();
                });
            }
            
            if (currentPage === 'login.html') {
                window.location.href = 'dashboard.html';
            }
        } else {
            // User is signed out.
            sessionManager.destroySession();
            
            if (isDashboardPage) {
                window.location.href = 'login.html';
            }
        }
    });
});
