import { getFirebaseFirestore, isFirebaseConnected, withFirebaseRetry } from './firebase-config.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";
import { secureStorage, migrateToEncryptedStorage } from './encryption-utils.js';
import { 
    sanitizeInput, 
    sanitizeEmail, 
    sanitizePhone, 
    sanitizeOrderData,
    getCSRFToken,
    validateCSRFToken,
    addCSRFTokenToForm
} from './security-utils.js';

// Cloud Function endpoints
const CLOUD_FUNCTION_BASE_URL = 'https://us-central1-lolio-di-valeria.cloudfunctions.net';
const USE_RATE_LIMITED_ENDPOINT = true; // Set to true to use rate-limited Cloud Functions

// Network retry configuration
const RETRY_CONFIG = {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 5000
};

// Calculate exponential backoff delay
function getRetryDelay(attempt) {
    return Math.min(RETRY_CONFIG.baseDelay * Math.pow(2, attempt - 1), RETRY_CONFIG.maxDelay);
}

// Show retry indicator
function showRetryIndicator(attempt, maxAttempts) {
    const retryIndicator = document.getElementById('retryIndicator');
    const retryMessage = document.getElementById('retryMessage');
    const retryCountdown = document.getElementById('retryCountdown');
    
    if (retryIndicator && retryMessage) {
        retryMessage.textContent = `Tentativo ${attempt} di ${maxAttempts}...`;
        if (retryCountdown) {
            retryCountdown.textContent = 'Nuovo tentativo in corso';
        }
        retryIndicator.classList.add('show');
    }
}

// Hide retry indicator
function hideRetryIndicator() {
    const retryIndicator = document.getElementById('retryIndicator');
    if (retryIndicator) {
        retryIndicator.classList.remove('show');
    }
}

// Network error detection
function isNetworkError(error) {
    if (!isFirebaseConnected()) {
        return true;
    }
    
    if (error.code === 'unavailable' || error.code === 'deadline-exceeded') {
        return true;
    }
    
    const networkErrorPatterns = [
        'network',
        'offline',
        'fetch',
        'connection',
        'timeout'
    ];
    
    const errorString = (error.message || error.toString()).toLowerCase();
    return networkErrorPatterns.some(pattern => errorString.includes(pattern));
}

// Country-based shipping calculation
function calculateShipping(subtotal, country) {
    // European Union countries
    const euCountries = [
        'FR', 'DE', 'ES', 'AT', 'BE', 'NL', 'PT', 'GR', 'PL', 
        'SE', 'DK', 'FI', 'IE', 'CZ', 'HU', 'RO', 'BG', 'HR', 
        'SK', 'SI', 'LT', 'LV', 'EE', 'LU', 'MT', 'CY',
        'CH', 'NO', 'GB'
    ];
    
    // High shipping cost countries
    const highShippingCountries = ['US', 'CA', 'AU', 'ZA'];

    if (country === 'IT') {
        // Italy: €9.90 flat rate
        return 9.90;
    } else if (euCountries.includes(country)) {
        // European countries (including CH, NO, GB): €24.90 flat rate
        return 24.90;
    } else if (highShippingCountries.includes(country) || country === 'OTHER') {
        // USA, Canada, Australia, South Africa, and other non-EU countries: €47.90
        return 47.90;
    } else {
        // Default for any other country: €47.90
        return 47.90;
    }
}

export function isCheckoutReady() {
    console.log('[Checkout Module] isCheckoutReady called, Firebase connected:', isFirebaseConnected());
    return isFirebaseConnected();
}

export async function saveOrder(orderData) {
    console.log('[Checkout Module] saveOrder called with orderData:', {
        orderId: orderData.orderId,
        customerEmail: orderData.customerInfo?.email,
        total: orderData.total,
        itemCount: orderData.items?.length,
        hasStripeData: !!(orderData.stripePaymentIntentId || orderData.stripeCustomerId)
    });
    
    const db = getFirebaseFirestore();
    console.log('[Checkout Module] Firestore instance obtained:', !!db);
    
    // Prepare order data with Stripe fields
    const finalOrderData = {
        ...orderData,
        stripePaymentIntentId: orderData.stripePaymentIntentId || null,
        stripeCustomerId: orderData.stripeCustomerId || null,
        stripePaymentMethodId: orderData.stripePaymentMethodId || null,
        paymentMetadata: orderData.paymentMetadata || {},
    };
    
    const collectionRef = collection(db, "orders");
    console.log('[Checkout Module] Collection reference created for "orders"');
    
    const docRef = await addDoc(collectionRef, finalOrderData);
    console.log('[Checkout Module] ✅ Document created successfully:', {
        id: docRef.id,
        path: docRef.path,
        stripePaymentIntentId: finalOrderData.stripePaymentIntentId
    });
    
    return docRef;
}

export async function handleCheckoutFormSubmit(e) {
    e.preventDefault();
    e.stopPropagation();
    
    console.log('[Checkout] Form submission initiated - Event listener triggered!');
    
    const form = e.target;
    console.log('[Checkout] Form element found:', !!form);
    
    const submitBtn = form.querySelector('.submit-btn');
    const originalBtnText = submitBtn.innerHTML;
    
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Elaborazione...';
    
    try {
        const db = getFirebaseFirestore();
        
        // Sanitize all user inputs to prevent XSS attacks
        const firstName = sanitizeInput(form.querySelector('[name="firstName"]')?.value || '');
        const lastName = sanitizeInput(form.querySelector('[name="lastName"]')?.value || '');
        const name = `${firstName} ${lastName}`.trim();
        const email = sanitizeEmail(form.querySelector('[name="email"]')?.value || '');
        const phone = sanitizePhone(form.querySelector('[name="phone"]')?.value || '');
        const company = sanitizeInput(form.querySelector('[name="company"]')?.value || '');
        const address = sanitizeInput(form.querySelector('[name="address"]')?.value || '');
        const houseNumber = sanitizeInput(form.querySelector('[name="houseNumber"]')?.value || '');
        const city = sanitizeInput(form.querySelector('[name="city"]')?.value || '');
        const province = sanitizeInput(form.querySelector('[name="province"]')?.value || '');
        const postalCode = sanitizeInput(form.querySelector('[name="postalCode"]')?.value || '');
        const country = sanitizeInput(form.querySelector('[name="country"]')?.value || '');
        const customCountry = sanitizeInput(form.querySelector('[name="customCountry"]')?.value || '');
        const notes = sanitizeInput(form.querySelector('[name="notes"]')?.value || '');
        
        // Capture payment method from hidden field or checked radio button
        let paymentMethod = '';
        const hiddenPaymentField = document.getElementById('paymentMethodField');
        const checkedPaymentRadio = form.querySelector('input[name="paymentMethod"]:checked');
        
        if (hiddenPaymentField && hiddenPaymentField.value) {
            paymentMethod = hiddenPaymentField.value;
        } else if (checkedPaymentRadio && checkedPaymentRadio.value) {
            paymentMethod = checkedPaymentRadio.value;
        }
        
        console.log('[Checkout] Captured field values:', {
            name: name || '(empty)',
            email: email || '(empty)',
            phone: phone || '(empty)',
            company: company || '(empty)',
            address: address || '(empty)',
            houseNumber: houseNumber || '(empty)',
            city: city || '(empty)',
            province: province || '(empty)',
            postalCode: postalCode || '(empty)',
            country: country || '(empty)',
            customCountry: customCountry || '(empty)',
            notes: notes || '(empty)',
            paymentMethod: paymentMethod || '(empty)'
        });
        
        // Validate required fields
        if (!name || !email) {
            console.error('[Checkout] Validation failed: missing required fields', {
                name: !!name,
                email: !!email
            });
            throw new Error('Campi obbligatori mancanti');
        }
        
        console.log('[Checkout] ✅ Validation passed');
        
        // Get cart data from encrypted storage
        let items = [];
        let subtotal = 0;
        let shipping = 0;
        let total = 0;
        
        try {
            const cartData = secureStorage.getItem('oliodiValeriaCart') || [];
            items = cartData;
            
            // Calculate totals
            subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            shipping = calculateShipping(subtotal, country);
            total = subtotal + shipping;
            
            console.log('[Checkout] Cart data loaded:', {
                itemCount: items.length,
                items: items,
                subtotal,
                shipping,
                total,
                country
            });
        } catch (err) {
            console.error('[Checkout] Failed to parse cart data:', err);
        }
        
        // Generate order ID
        const orderId = `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
        console.log('[Checkout] Generated order ID:', orderId);
        
        // Prepare and sanitize order data with Stripe fields
        const orderData = sanitizeOrderData({
            orderId,
            customerInfo: {
                name,
                email,
                phone,
                company,
                address,
                houseNumber,
                city,
                province,
                postalCode,
                country,
                customCountry,
                notes
            },
            items,
            subtotal,
            shipping,
            total,
            paymentMethod,
            paymentStatus: 'pending',
            status: 'pending',
            stripePaymentIntentId: null,
            stripeCustomerId: null,
            stripePaymentMethodId: null,
            paymentMetadata: {},
            timestamp: serverTimestamp()
        });
        
        console.log('[Checkout] Order data structure before submission:', {
            orderId: orderData.orderId,
            customerInfo: orderData.customerInfo,
            items: orderData.items,
            subtotal: orderData.subtotal,
            shipping: orderData.shipping,
            total: orderData.total,
            paymentMethod: orderData.paymentMethod,
            paymentStatus: orderData.paymentStatus,
            status: orderData.status,
            timestamp: '(will be set by server)'
        });
        
        // Use rate-limited Cloud Function endpoint if enabled
        if (USE_RATE_LIMITED_ENDPOINT) {
            console.log('[Checkout] Submitting via rate-limited Cloud Function...');
            await submitOrderViaCloudFunction(orderData);
        } else {
            console.log('[Checkout] Submitting via direct Firestore write...');
            await submitOrderViaFirestore(orderData);
        }
        
        // Show success message
        if (typeof window.showMessage === 'function') {
            window.showMessage('success', "Ordine inviato con successo! Riceverai una conferma via email.");
        } else {
            alert("Ordine inviato con successo! Riceverai una conferma via email.");
        }
        
        // Clear cart from encrypted storage
        secureStorage.removeItem('oliodiValeriaCart');
        
        // Redirect to thank you page or reset form
        form.reset();
        
    } catch (error) {
        console.error('[Checkout] Form submission failed:', error.message);
        
        hideRetryIndicator();
        
        // Show error message
        let errorMessage = "Si é verificato un errore. Riprova piú tardi.";
        
        if (error.message && error.message.includes('429')) {
            errorMessage = "Troppe richieste. Riprova tra qualche minuto.";
        } else if (error.message && error.message.includes('rate limit')) {
            errorMessage = "Hai raggiunto il limite di ordini. Riprova tra qualche minuto.";
        } else if (error.isFirestoreWriteError && isNetworkError(error)) {
            // Only show network error if the Firestore write itself failed
            errorMessage = "Errore di connessione. Controlla la tua connessione Internet e riprova.";
            console.error('[Checkout] Network error detected during Firestore write:', error.message);
        }
        
        if (typeof window.showMessage === 'function') {
            window.showMessage('error', errorMessage);
        } else {
            alert(errorMessage);
        }
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
    }
}

async function submitOrderViaCloudFunction(orderData) {
    const endpoint = `${CLOUD_FUNCTION_BASE_URL}/submitCheckoutOrder`;
    
    for (let attempt = 1; attempt <= RETRY_CONFIG.maxAttempts; attempt++) {
        try {
            if (attempt > 1) {
                console.log(`[Checkout] Retry attempt ${attempt} of ${RETRY_CONFIG.maxAttempts}`);
                showRetryIndicator(attempt, RETRY_CONFIG.maxAttempts);
                const delay = getRetryDelay(attempt - 1);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
            
            console.log('[Checkout] Sending order to Cloud Function...');
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(orderData)
            });
            
            if (response.status === 429) {
                const data = await response.json();
                console.error('[Checkout] Rate limit exceeded (429)');
                const error = new Error(`Rate limit exceeded (429): ${data.error || 'Too many requests'}`);
                error.isFirestoreWriteError = true;
                throw error;
            }
            
            if (!response.ok) {
                const errorData = await response.json();
                console.error('[Checkout] Server error:', {
                    status: response.status,
                    statusText: response.statusText,
                    errorData,
                    timestamp: new Date().toISOString()
                });
                const error = new Error(errorData.error || 'Server error');
                error.isFirestoreWriteError = true;
                throw error;
            }
            
            const result = await response.json();
            
            if (!result.documentId && !result.id) {
                console.error('[Checkout] Response missing document ID:', {
                    result,
                    timestamp: new Date().toISOString()
                });
            } else {
                console.log('[Checkout] ✅ Order created successfully:', {
                    documentId: result.documentId || result.id,
                    orderId: orderData.orderId,
                    timestamp: new Date().toISOString(),
                    fullResponse: result
                });
            }
            
            hideRetryIndicator();
            return result;
            
        } catch (error) {
            console.error('[Checkout] Submission attempt failed:', {
                attempt,
                maxAttempts: RETRY_CONFIG.maxAttempts,
                errorMessage: error.message,
                errorStack: error.stack,
                timestamp: new Date().toISOString(),
                orderId: orderData.orderId
            });
            
            if (!error.isFirestoreWriteError) {
                error.isFirestoreWriteError = true;
            }
            
            if (attempt >= RETRY_CONFIG.maxAttempts) {
                console.error('[Checkout] All retry attempts exhausted:', {
                    finalAttempt: attempt,
                    errorMessage: error.message,
                    timestamp: new Date().toISOString()
                });
                throw error;
            }
            
            if (error.message.includes('429') || error.message.includes('rate limit')) {
                console.error('[Checkout] Rate limit error, not retrying:', {
                    errorMessage: error.message,
                    timestamp: new Date().toISOString()
                });
                throw error;
            }
            
            if (isNetworkError(error)) {
                console.log('[Checkout] Network error detected, will retry...', {
                    nextAttempt: attempt + 1,
                    timestamp: new Date().toISOString()
                });
                continue;
            }
            
            console.error('[Checkout] Non-retryable error:', {
                errorMessage: error.message,
                timestamp: new Date().toISOString()
            });
            throw error;
        }
    }
}

async function submitOrderViaFirestore(orderData) {
    const db = getFirebaseFirestore();
    orderData.timestamp = serverTimestamp();
    
    for (let attempt = 1; attempt <= RETRY_CONFIG.maxAttempts; attempt++) {
        try {
            if (attempt > 1) {
                console.log(`[Checkout] Retry attempt ${attempt} of ${RETRY_CONFIG.maxAttempts}`);
                showRetryIndicator(attempt, RETRY_CONFIG.maxAttempts);
                const delay = getRetryDelay(attempt - 1);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
            
            const collectionRef = collection(db, "orders");
            console.log('[Checkout] Attempting to write to Firestore collection "orders"...');
            const docRef = await addDoc(collectionRef, orderData);
            
            console.log('[Checkout] ✅ Firestore write SUCCESS:', {
                documentId: docRef.id,
                collectionPath: docRef.path,
                orderId: orderData.orderId
            });
            
            // Success means Firestore write succeeded
            // Any post-processing errors (like email failures) happen asynchronously
            // in Firestore triggers and don't affect the order submission success
            hideRetryIndicator();
            return docRef;
            
        } catch (error) {
            console.error('[Checkout] ❌ Firestore write FAILED:', {
                attempt: attempt,
                maxAttempts: RETRY_CONFIG.maxAttempts,
                errorCode: error.code,
                errorMessage: error.message,
                isNetworkError: isNetworkError(error)
            });
            
            // Mark as Firestore write error
            error.isFirestoreWriteError = true;
            
            if (attempt >= RETRY_CONFIG.maxAttempts) {
                console.error('[Checkout] Firebase save failed after max retries:', error.message);
                throw error;
            }
            
            if (isNetworkError(error)) {
                console.log('[Checkout] Network error detected, will retry...');
                continue;
            }
            
            throw error;
        }
    }
}

// Initialize event listeners
document.addEventListener("DOMContentLoaded", () => {
    console.log('[Checkout Module] Page loaded, checkout module ready');
    
    // Migrate existing cart data to encrypted storage
    migrateToEncryptedStorage(['oliodiValeriaCart']);
    
    // Check Firebase connection status
    if (isFirebaseConnected()) {
        console.log('[Checkout Module] ✅ Firebase connected and ready');
    } else {
        console.warn('[Checkout Module] ⚠️ Firebase not yet connected, waiting for initialization...');
    }
    
    const checkoutForm = document.getElementById('checkout-form');
    console.log('[Checkout Module] Looking for #checkout-form element:', !!checkoutForm);
    
    if (checkoutForm) {
        console.log('[Checkout Module] ✅ Found #checkout-form');
        
        // Note: CheckoutUI manages form submission + CSRF for this page.
        // Keeping this module passive avoids duplicate submit handlers.
    } else {
        console.warn('[Checkout Module] ⚠️ #checkout-form not found on page');
    }
});

export { collection, addDoc, serverTimestamp };
