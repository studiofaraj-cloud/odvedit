import { isFirebaseConnected, getFirebaseAuth, getFirebaseFirestore } from './firebase-config.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";
import { 
    sanitizeInput, 
    sanitizeEmail, 
    sanitizePhone,
    addCSRFTokenToForm
} from './security-utils.js';

// Cloud Function endpoint
const CLOUD_FUNCTION_BASE_URL = 'https://us-central1-l-olio-di-valeria.cloudfunctions.net';

// Network retry configuration
const RETRY_CONFIG = {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 5000
};

// Generate unique submission ID for tracking
function generateSubmissionId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Log with structured format
function logEvent(level, category, message, details = {}) {
    const timestamp = new Date().toISOString();
    const logData = {
        timestamp,
        level,
        category,
        message,
        ...details
    };
    
    const logPrefix = `[${category}]`;
    
    switch (level) {
        case 'info':
            console.log(logPrefix, message, logData);
            break;
        case 'warn':
            console.warn(logPrefix, message, logData);
            break;
        case 'error':
            console.error(logPrefix, message, logData);
            break;
        default:
            console.log(logPrefix, message, logData);
    }
}

// Capture and log full error details including stack trace
function logErrorWithStack(category, message, error, additionalContext = {}) {
    const timestamp = new Date().toISOString();
    const errorDetails = {
        timestamp,
        message: error.message || 'Unknown error',
        stack: error.stack || 'No stack trace available',
        name: error.name || 'Error',
        ...additionalContext
    };
    
    console.error(`[${category}] ${message}`, errorDetails);
    
    // Log stack trace separately for better visibility
    if (error.stack) {
        console.error(`[${category}] Stack trace:`, error.stack);
    }
    
    return errorDetails;
}

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
    
    const networkErrorPatterns = [
        'network',
        'offline',
        'fetch',
        'connection',
        'timeout',
        'failed to fetch'
    ];
    
    const errorString = (error.message || error.toString()).toLowerCase();
    return networkErrorPatterns.some(pattern => errorString.includes(pattern));
}

// Firestore fallback for contact form
async function saveContactToFirestore(contactData) {
    try {
        console.log('[Contact] Using Firestore fallback...');
        const db = getFirebaseFirestore();
        const contactMessagesRef = collection(db, 'contactMessages');
        
        const docData = {
            ...contactData,
            timestamp: serverTimestamp(),
            status: 'pending',
            source: 'client_fallback',
            emailSent: false
        };
        
        const docRef = await addDoc(contactMessagesRef, docData);
        console.log('[Contact] ✅ Message saved to Firestore via fallback:', docRef.id);
        
        return { success: true, id: docRef.id, fallback: true };
    } catch (error) {
        console.error('[Contact] Firestore fallback failed:', error);
        throw new Error(`Firestore fallback failed: ${error.message}`);
    }
}

// Firestore fallback for newsletter form
async function saveNewsletterToFirestore(newsletterData) {
    try {
        console.log('[Newsletter] Using Firestore fallback...');
        const db = getFirebaseFirestore();
        const newsletterSubscriptionsRef = collection(db, 'newsletterSubscriptions');
        
        const docData = {
            ...newsletterData,
            timestamp: serverTimestamp(),
            status: 'pending',
            source: 'client_fallback',
            emailSent: false,
            subscribed: true
        };
        
        const docRef = await addDoc(newsletterSubscriptionsRef, docData);
        console.log('[Newsletter] ✅ Subscription saved to Firestore via fallback:', docRef.id);
        
        return { success: true, id: docRef.id, fallback: true };
    } catch (error) {
        console.error('[Newsletter] Firestore fallback failed:', error);
        throw new Error(`Firestore fallback failed: ${error.message}`);
    }
}

export async function handleContactFormSubmit(e) {
    e.preventDefault();
    e.stopPropagation();
    
    const submissionId = generateSubmissionId();
    const startTime = Date.now();
    
    logEvent('info', 'Contact', 'Form submission initiated', {
        submissionId,
        startTime: new Date(startTime).toISOString()
    });
    
    const form = e.target;
    const submitBtn = form.querySelector('.form-submit');
    const originalBtnText = submitBtn.innerHTML;
    
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Invio in corso...';
    
    try {
        // Sanitize all user inputs to prevent XSS attacks
        const rawName = form.querySelector('[name="name"]')?.value || '';
        const rawEmail = form.querySelector('[name="email"]')?.value || '';
        const rawPhone = form.querySelector('[name="phone"]')?.value || '';
        const rawInquiry = form.querySelector('[name="inquiry"]')?.value || '';
        const rawMessage = form.querySelector('[name="message"]')?.value || '';
        
        logEvent('info', 'Contact', 'Raw form data captured', {
            submissionId,
            hasName: !!rawName,
            hasEmail: !!rawEmail,
            hasPhone: !!rawPhone,
            hasInquiry: !!rawInquiry,
            hasMessage: !!rawMessage,
            nameLength: rawName.length,
            emailLength: rawEmail.length,
            phoneLength: rawPhone.length,
            messageLength: rawMessage.length
        });
        
        const name = sanitizeInput(rawName);
        const email = sanitizeEmail(rawEmail);
        const phone = sanitizePhone(rawPhone);
        const inquiry = sanitizeInput(rawInquiry);
        const message = sanitizeInput(rawMessage);
        
        logEvent('info', 'Contact', 'Input sanitization completed', {
            submissionId,
            sanitizedName: name,
            sanitizedEmail: email,
            sanitizedPhone: phone,
            sanitizedInquiry: inquiry,
            sanitizedMessageLength: message.length
        });
        
        // Validate required fields
        if (!name || !email || !message) {
            const missingFields = [];
            if (!name) missingFields.push('name');
            if (!email) missingFields.push('email');
            if (!message) missingFields.push('message');
            
            logEvent('error', 'Contact', 'Validation failed: missing required fields', {
                submissionId,
                missingFields,
                name: !!name,
                email: !!email,
                message: !!message
            });
            
            throw new Error('Campi obbligatori mancanti');
        }
        
        logEvent('info', 'Contact', 'Validation passed', {
            submissionId
        });
        
        // Prepare document data
        const documentData = {
            name,
            email,
            phone: phone || '',
            inquiry,
            message
        };
        
        logEvent('info', 'Contact', 'Document data prepared', {
            submissionId,
            documentData: {
                name: documentData.name,
                email: documentData.email,
                hasPhone: !!documentData.phone,
                inquiry: documentData.inquiry,
                messageLength: documentData.message.length
            }
        });
        
        let result;
        let usedFallback = false;
        
        // Try Cloud Function first, with client-side Firestore fallback
        try {
            result = await submitContactViaCloudFunction(documentData, submissionId);
        } catch (cloudFunctionError) {
            console.warn('[Contact] Cloud Function failed, attempting client-side Firestore fallback:', cloudFunctionError.message);
            
            // Fallback to direct Firestore write
            try {
                result = await submitContactViaFirestore(documentData);
                usedFallback = true;
            } catch (fallbackError) {
                console.error('[Contact] Both Cloud Function and Firestore fallback failed');
                throw cloudFunctionError;
            }
        }
        
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        logEvent('info', 'Contact', 'Form submission completed successfully', {
            submissionId,
            duration: `${duration}ms`,
            result,
            usedFallback,
            endTime: new Date(endTime).toISOString()
        });
        
        // Show success message
        const successMessage = usedFallback 
            ? "Grazie! Il tuo messaggio è stato salvato con successo."
            : "Grazie! Il tuo messaggio è stato inviato con successo.";
            
        if (typeof window.showMessage === 'function') {
            window.showMessage('success', successMessage);
        } else {
            alert(successMessage);
        }
        
        // Reset form
        form.reset();
        
        logEvent('info', 'Contact', 'Form reset after successful submission', {
            submissionId
        });
        
    } catch (error) {
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        logErrorWithStack('Contact', 'Form submission failed', error, {
            submissionId,
            duration: `${duration}ms`,
            endTime: new Date(endTime).toISOString(),
            errorType: error.name,
            errorMessage: error.message
        });
        
        hideRetryIndicator();
        
        // Show error message
        let errorMessage = "Si è verificato un errore. Riprova più tardi.";
        
        if (error.message && error.message.includes('429')) {
            errorMessage = "Troppe richieste. Riprova tra qualche minuto.";
            logEvent('warn', 'Contact', 'Rate limit error shown to user', {
                submissionId,
                errorMessage
            });
        } else if (error.message && error.message.includes('rate limit')) {
            errorMessage = "Hai raggiunto il limite di invii. Riprova tra qualche minuto.";
            logEvent('warn', 'Contact', 'Rate limit error shown to user', {
                submissionId,
                errorMessage
            });
        } else if (isNetworkError(error)) {
            errorMessage = "Errore di connessione. Controlla la tua connessione Internet e riprova.";
            logEvent('error', 'Contact', 'Network error detected and shown to user', {
                submissionId,
                errorMessage,
                isFirebaseConnected: isFirebaseConnected()
            });
        }
        
        if (typeof window.showMessage === 'function') {
            window.showMessage('error', errorMessage);
        } else {
            alert(errorMessage);
        }
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
        
        logEvent('info', 'Contact', 'Form button state restored', {
            submissionId
        });
    }
}

async function submitContactViaCloudFunction(contactData, submissionId) {
    const endpoint = `${CLOUD_FUNCTION_BASE_URL}/submitContactForm`;
    
    logEvent('info', 'Contact', 'Starting Cloud Function submission', {
        submissionId,
        endpoint,
        maxAttempts: RETRY_CONFIG.maxAttempts
    });
    
    for (let attempt = 1; attempt <= RETRY_CONFIG.maxAttempts; attempt++) {
        const attemptStartTime = Date.now();
        
        try {
            if (attempt > 1) {
                const delay = getRetryDelay(attempt - 1);
                
                logEvent('info', 'Contact', `Retry attempt ${attempt} starting`, {
                    submissionId,
                    attempt,
                    maxAttempts: RETRY_CONFIG.maxAttempts,
                    delayMs: delay
                });
                
                showRetryIndicator(attempt, RETRY_CONFIG.maxAttempts);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
            
            logEvent('info', 'Contact', 'Sending request to Cloud Function', {
                submissionId,
                attempt,
                endpoint,
                method: 'POST',
                hasContactData: !!contactData
            });
            
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(contactData)
            });
            
            const attemptDuration = Date.now() - attemptStartTime;
            
            logEvent('info', 'Contact', 'Cloud Function response received', {
                submissionId,
                attempt,
                status: response.status,
                statusText: response.statusText,
                ok: response.ok,
                headers: Object.fromEntries(response.headers.entries()),
                duration: `${attemptDuration}ms`
            });
            
            if (response.status === 429) {
                let data;
                try {
                    data = await response.json();
                } catch (parseError) {
                    logErrorWithStack('Contact', 'Failed to parse 429 response JSON', parseError, {
                        submissionId,
                        attempt
                    });
                    data = { error: 'Too many requests' };
                }
                
                logEvent('error', 'Contact', 'Rate limit exceeded (429)', {
                    submissionId,
                    attempt,
                    responseData: data,
                    duration: `${attemptDuration}ms`
                });
                
                const error = new Error(`Rate limit exceeded (429): ${data.error || 'Too many requests'}`);
                throw error;
            }
            
            if (!response.ok) {
                let errorData;
                try {
                    errorData = await response.json();
                } catch (parseError) {
                    logErrorWithStack('Contact', 'Failed to parse error response JSON', parseError, {
                        submissionId,
                        attempt,
                        status: response.status
                    });
                    errorData = { error: `Server error: ${response.statusText}` };
                }
                
                logEvent('error', 'Contact', 'Server error response', {
                    submissionId,
                    attempt,
                    status: response.status,
                    statusText: response.statusText,
                    errorData,
                    duration: `${attemptDuration}ms`
                });
                
                const error = new Error(errorData.error || 'Server error');
                throw error;
            }
            
            let result;
            try {
                result = await response.json();
            } catch (parseError) {
                logErrorWithStack('Contact', 'Failed to parse success response JSON', parseError, {
                    submissionId,
                    attempt
                });
                result = { success: true };
            }
            
            logEvent('info', 'Contact', 'Cloud Function submission successful', {
                submissionId,
                attempt,
                result,
                duration: `${attemptDuration}ms`,
                firestoreWriteSuccess: result.firestoreWriteSuccess !== false,
                emailSent: result.emailSent,
                documentId: result.documentId
            });
            
            // Log Firestore write results if available
            if (result.firestoreWriteSuccess !== undefined) {
                logEvent('info', 'Contact', 'Firestore write result', {
                    submissionId,
                    writeSuccess: result.firestoreWriteSuccess,
                    documentId: result.documentId,
                    writeTime: result.writeTime
                });
            }
            
            // Log email send results if available
            if (result.emailSent !== undefined) {
                logEvent('info', 'Contact', 'Email send result', {
                    submissionId,
                    emailSent: result.emailSent,
                    emailError: result.emailError
                });
            }
            
            hideRetryIndicator();
            return result;
            
        } catch (error) {
            const attemptDuration = Date.now() - attemptStartTime;
            
            logErrorWithStack('Contact', `Submission attempt ${attempt} failed`, error, {
                submissionId,
                attempt,
                maxAttempts: RETRY_CONFIG.maxAttempts,
                duration: `${attemptDuration}ms`,
                errorType: error.name,
                errorMessage: error.message,
                isNetworkError: isNetworkError(error),
                isRateLimitError: error.message.includes('429') || error.message.includes('rate limit')
            });
            
            if (attempt >= RETRY_CONFIG.maxAttempts) {
                logEvent('error', 'Contact', 'All retry attempts exhausted', {
                    submissionId,
                    finalAttempt: attempt,
                    totalAttempts: RETRY_CONFIG.maxAttempts,
                    errorMessage: error.message,
                    errorType: error.name
                });
                throw error;
            }
            
            if (error.message.includes('429') || error.message.includes('rate limit')) {
                logEvent('error', 'Contact', 'Rate limit error - not retrying', {
                    submissionId,
                    attempt,
                    errorMessage: error.message
                });
                throw error;
            }
            
            if (isNetworkError(error)) {
                logEvent('warn', 'Contact', 'Network error detected - will retry', {
                    submissionId,
                    attempt,
                    nextAttempt: attempt + 1,
                    isFirebaseConnected: isFirebaseConnected()
                });
                continue;
            }
            
            logEvent('error', 'Contact', 'Non-retryable error encountered', {
                submissionId,
                attempt,
                errorMessage: error.message,
                errorType: error.name
            });
            throw error;
        }
    }
}

async function submitContactViaFirestore(contactData) {
    console.log('[Contact] Attempting direct Firestore write as fallback...');
    
    try {
        const auth = getFirebaseAuth();
        const db = getFirebaseFirestore();
        
        // Ensure user is authenticated (required by security rules)
        // If not authenticated, sign in anonymously
        let user = auth.currentUser;
        if (!user) {
            console.log('[Contact] User not authenticated, signing in anonymously for Firestore write...');
            const { signInAnonymously } = await import("https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js");
            const userCredential = await signInAnonymously(auth);
            user = userCredential.user;
            console.log('[Contact] Anonymous authentication successful:', user.uid);
        }
        
        // Prepare document with server timestamp
        const messageDocument = {
            name: contactData.name,
            email: contactData.email,
            phone: contactData.phone || '',
            inquiry: contactData.inquiry || '',
            message: contactData.message,
            timestamp: serverTimestamp(),
            createdVia: 'client-fallback',
            userId: user.uid
        };
        
        // Add document to contactMessages collection
        const docRef = await addDoc(collection(db, 'contactMessages'), messageDocument);
        
        console.log('[Contact] ✅ Message saved to Firestore:', {
            documentId: docRef.id,
            timestamp: new Date().toISOString()
        });
        
        return { success: true, documentId: docRef.id };
        
    } catch (error) {
        console.error('[Contact] Firestore fallback failed:', {
            errorMessage: error.message,
            errorCode: error.code,
            timestamp: new Date().toISOString()
        });
        throw error;
    }
}

export async function handleNewsletterFormSubmit(e) {
    e.preventDefault();
    e.stopPropagation();
    
    const submissionId = generateSubmissionId();
    const startTime = Date.now();
    
    logEvent('info', 'Newsletter', 'Form submission initiated', {
        submissionId,
        startTime: new Date(startTime).toISOString()
    });
    
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn.innerHTML;
    
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    
    try {
        const rawEmail = form.querySelector('input[type="email"]')?.value || '';
        
        logEvent('info', 'Newsletter', 'Raw form data captured', {
            submissionId,
            hasEmail: !!rawEmail,
            emailLength: rawEmail.length
        });
        
        const email = sanitizeEmail(rawEmail);
        
        logEvent('info', 'Newsletter', 'Input sanitization completed', {
            submissionId,
            sanitizedEmail: email
        });
        
        if (!email) {
            logEvent('error', 'Newsletter', 'Validation failed: email missing', {
                submissionId,
                rawEmail: !!rawEmail,
                sanitizedEmail: !!email
            });
            throw new Error('Email obbligatoria');
        }
        
        logEvent('info', 'Newsletter', 'Validation passed', {
            submissionId
        });
        
        const newsletterData = { email };
        
        logEvent('info', 'Newsletter', 'Newsletter data prepared', {
            submissionId,
            email
        });
        
        let result;
        let usedFallback = false;
        
        try {
            // Submit via Cloud Function with retry logic
            result = await submitNewsletterViaCloudFunction(newsletterData, submissionId);
        } catch (cloudFunctionError) {
            console.warn('[Newsletter] Cloud Function submission failed, attempting Firestore fallback:', cloudFunctionError.message);
            
            // Try Firestore fallback
            try {
                result = await saveNewsletterToFirestore(newsletterData);
                usedFallback = true;
            } catch (fallbackError) {
                console.error('[Newsletter] Both Cloud Function and Firestore fallback failed');
                throw cloudFunctionError;
            }
        }
        
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        logEvent('info', 'Newsletter', 'Form submission completed successfully', {
            submissionId,
            duration: `${duration}ms`,
            result,
            usedFallback,
            endTime: new Date(endTime).toISOString()
        });
        
        // Show success message
        const successMessage = usedFallback
            ? "Grazie per l'iscrizione! La tua richiesta è stata salvata."
            : "Grazie per l'iscrizione! Controlla la tua email.";
            
        if (typeof window.showMessage === 'function') {
            window.showMessage('success', successMessage);
        } else {
            alert(successMessage);
        }
        
        // Reset form
        form.reset();
        
        logEvent('info', 'Newsletter', 'Form reset after successful submission', {
            submissionId
        });
        
    } catch (error) {
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        logErrorWithStack('Newsletter', 'Form submission failed', error, {
            submissionId,
            duration: `${duration}ms`,
            endTime: new Date(endTime).toISOString(),
            errorType: error.name,
            errorMessage: error.message
        });
        
        hideRetryIndicator();
        
        let errorMessage = "Si è verificato un errore. Riprova più tardi.";
        
        if (error.message && error.message.includes('429')) {
            errorMessage = "Troppe richieste. Riprova tra qualche minuto.";
            logEvent('warn', 'Newsletter', 'Rate limit error shown to user', {
                submissionId,
                errorMessage
            });
        } else if (error.message && error.message.includes('rate limit')) {
            errorMessage = "Hai raggiunto il limite di invii. Riprova tra qualche minuto.";
            logEvent('warn', 'Newsletter', 'Rate limit error shown to user', {
                submissionId,
                errorMessage
            });
        } else if (isNetworkError(error)) {
            errorMessage = "Errore di connessione. Controlla la tua connessione Internet e riprova.";
            logEvent('error', 'Newsletter', 'Network error detected and shown to user', {
                submissionId,
                errorMessage,
                isFirebaseConnected: isFirebaseConnected()
            });
        }
        
        if (typeof window.showMessage === 'function') {
            window.showMessage('error', errorMessage);
        } else {
            alert(errorMessage);
        }
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
        
        logEvent('info', 'Newsletter', 'Form button state restored', {
            submissionId
        });
    }
}

async function submitNewsletterViaCloudFunction(newsletterData, submissionId) {
    const endpoint = `${CLOUD_FUNCTION_BASE_URL}/submitNewsletterSubscription`;
    
    logEvent('info', 'Newsletter', 'Starting Cloud Function submission', {
        submissionId,
        endpoint,
        maxAttempts: RETRY_CONFIG.maxAttempts
    });
    
    for (let attempt = 1; attempt <= RETRY_CONFIG.maxAttempts; attempt++) {
        const attemptStartTime = Date.now();
        
        try {
            if (attempt > 1) {
                const delay = getRetryDelay(attempt - 1);
                
                logEvent('info', 'Newsletter', `Retry attempt ${attempt} starting`, {
                    submissionId,
                    attempt,
                    maxAttempts: RETRY_CONFIG.maxAttempts,
                    delayMs: delay
                });
                
                showRetryIndicator(attempt, RETRY_CONFIG.maxAttempts);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
            
            logEvent('info', 'Newsletter', 'Sending request to Cloud Function', {
                submissionId,
                attempt,
                endpoint,
                method: 'POST',
                hasNewsletterData: !!newsletterData
            });
            
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(newsletterData)
            });
            
            const attemptDuration = Date.now() - attemptStartTime;
            
            logEvent('info', 'Newsletter', 'Cloud Function response received', {
                submissionId,
                attempt,
                status: response.status,
                statusText: response.statusText,
                ok: response.ok,
                headers: Object.fromEntries(response.headers.entries()),
                duration: `${attemptDuration}ms`
            });
            
            if (response.status === 429) {
                let data;
                try {
                    data = await response.json();
                } catch (parseError) {
                    logErrorWithStack('Newsletter', 'Failed to parse 429 response JSON', parseError, {
                        submissionId,
                        attempt
                    });
                    data = { error: 'Too many requests' };
                }
                
                logEvent('error', 'Newsletter', 'Rate limit exceeded (429)', {
                    submissionId,
                    attempt,
                    responseData: data,
                    duration: `${attemptDuration}ms`
                });
                
                const error = new Error(`Rate limit exceeded (429): ${data.error || 'Too many requests'}`);
                throw error;
            }
            
            if (!response.ok) {
                let errorData;
                try {
                    errorData = await response.json();
                } catch (parseError) {
                    logErrorWithStack('Newsletter', 'Failed to parse error response JSON', parseError, {
                        submissionId,
                        attempt,
                        status: response.status
                    });
                    errorData = { error: `Server error: ${response.statusText}` };
                }
                
                logEvent('error', 'Newsletter', 'Server error response', {
                    submissionId,
                    attempt,
                    status: response.status,
                    statusText: response.statusText,
                    errorData,
                    duration: `${attemptDuration}ms`
                });
                
                const error = new Error(errorData.error || 'Server error');
                throw error;
            }
            
            let result;
            try {
                result = await response.json();
            } catch (parseError) {
                logErrorWithStack('Newsletter', 'Failed to parse success response JSON', parseError, {
                    submissionId,
                    attempt
                });
                result = { success: true };
            }
            
            logEvent('info', 'Newsletter', 'Cloud Function submission successful', {
                submissionId,
                attempt,
                result,
                duration: `${attemptDuration}ms`,
                firestoreWriteSuccess: result.firestoreWriteSuccess !== false,
                emailSent: result.emailSent,
                documentId: result.documentId
            });
            
            // Log Firestore write results if available
            if (result.firestoreWriteSuccess !== undefined) {
                logEvent('info', 'Newsletter', 'Firestore write result', {
                    submissionId,
                    writeSuccess: result.firestoreWriteSuccess,
                    documentId: result.documentId,
                    writeTime: result.writeTime
                });
            }
            
            // Log email send results if available
            if (result.emailSent !== undefined) {
                logEvent('info', 'Newsletter', 'Email send result', {
                    submissionId,
                    emailSent: result.emailSent,
                    emailError: result.emailError
                });
            }
            
            hideRetryIndicator();
            return result;
            
        } catch (error) {
            const attemptDuration = Date.now() - attemptStartTime;
            
            logErrorWithStack('Newsletter', `Submission attempt ${attempt} failed`, error, {
                submissionId,
                attempt,
                maxAttempts: RETRY_CONFIG.maxAttempts,
                duration: `${attemptDuration}ms`,
                errorType: error.name,
                errorMessage: error.message,
                isNetworkError: isNetworkError(error),
                isRateLimitError: error.message.includes('429') || error.message.includes('rate limit')
            });
            
            if (attempt >= RETRY_CONFIG.maxAttempts) {
                logEvent('error', 'Newsletter', 'All retry attempts exhausted', {
                    submissionId,
                    finalAttempt: attempt,
                    totalAttempts: RETRY_CONFIG.maxAttempts,
                    errorMessage: error.message,
                    errorType: error.name
                });
                throw error;
            }
            
            if (error.message.includes('429') || error.message.includes('rate limit')) {
                logEvent('error', 'Newsletter', 'Rate limit error - not retrying', {
                    submissionId,
                    attempt,
                    errorMessage: error.message
                });
                throw error;
            }
            
            if (isNetworkError(error)) {
                logEvent('warn', 'Newsletter', 'Network error detected - will retry', {
                    submissionId,
                    attempt,
                    nextAttempt: attempt + 1,
                    isFirebaseConnected: isFirebaseConnected()
                });
                continue;
            }
            
            logEvent('error', 'Newsletter', 'Non-retryable error encountered', {
                submissionId,
                attempt,
                errorMessage: error.message,
                errorType: error.name
            });
            throw error;
        }
    }
}

// Initialize event listeners
document.addEventListener("DOMContentLoaded", () => {
    logEvent('info', 'Contact', 'DOMContentLoaded - initializing event listeners', {
        timestamp: new Date().toISOString()
    });
    
    const contactForm = document.getElementById("contactForm");
    
    if (contactForm) {
        logEvent('info', 'Contact', 'Contact form found - adding event listeners', {
            formId: 'contactForm'
        });
        
        // Add CSRF protection
        addCSRFTokenToForm(contactForm);
        contactForm.addEventListener("submit", handleContactFormSubmit, { capture: true });
        
        logEvent('info', 'Contact', 'Contact form initialized successfully', {
            formId: 'contactForm'
        });
    } else {
        logEvent('warn', 'Contact', 'Contact form not found on page', {
            formId: 'contactForm'
        });
    }
    
    const newsletterForm = document.getElementById("newsletterForm");
    
    if (newsletterForm) {
        logEvent('info', 'Newsletter', 'Newsletter form found - adding event listeners', {
            formId: 'newsletterForm'
        });
        
        // Add CSRF protection
        addCSRFTokenToForm(newsletterForm);
        newsletterForm.addEventListener("submit", handleNewsletterFormSubmit);
        
        logEvent('info', 'Newsletter', 'Newsletter form initialized successfully', {
            formId: 'newsletterForm'
        });
    } else {
        logEvent('warn', 'Newsletter', 'Newsletter form not found on page', {
            formId: 'newsletterForm'
        });
    }
    
    logEvent('info', 'Contact', 'Event listener initialization complete', {
        contactFormFound: !!contactForm,
        newsletterFormFound: !!newsletterForm
    });
});
