// Rate limiting configuration for client-side
// This file contains configuration for using rate-limited Cloud Functions

export const RATE_LIMIT_CONFIG = {
    // Enable or disable rate-limited endpoints
    // Set to true to use Cloud Functions with rate limiting
    // Set to false to use direct Firestore writes (no rate limiting)
    enabled: true,
    
    // Cloud Function base URL
    // Update this with your actual Firebase project ID
    baseUrl: 'https://us-central1-lolio-di-valeria.cloudfunctions.net',
    
    // Endpoints
    endpoints: {
        submitContactForm: '/submitContactForm',
        submitCheckoutOrder: '/submitCheckoutOrder',
        rateLimitStatus: '/rateLimitStatus'
    },
    
    // Client-side display of rate limit info
    displayLimits: {
        contact: {
            maxAttempts: 5,
            windowMinutes: 15,
            message: 'Puoi inviare massimo 5 messaggi ogni 15 minuti.'
        },
        checkout: {
            maxAttempts: 5,
            windowMinutes: 15,
            message: 'Puoi effettuare massimo 5 ordini ogni 15 minuti.'
        }
    }
};

// Get full endpoint URL
export function getEndpointUrl(endpointName) {
    if (!RATE_LIMIT_CONFIG.enabled) {
        return null;
    }
    
    const endpoint = RATE_LIMIT_CONFIG.endpoints[endpointName];
    if (!endpoint) {
        console.error(`[Rate Limit Config] Unknown endpoint: ${endpointName}`);
        return null;
    }
    
    return `${RATE_LIMIT_CONFIG.baseUrl}${endpoint}`;
}

// Check if rate limiting is enabled
export function isRateLimitingEnabled() {
    return RATE_LIMIT_CONFIG.enabled;
}

// Get rate limit display message
export function getRateLimitMessage(formType) {
    const limits = RATE_LIMIT_CONFIG.displayLimits[formType];
    return limits ? limits.message : 'Limite di invii raggiunto.';
}

// Update the base URL (useful for different environments)
export function setBaseUrl(url) {
    RATE_LIMIT_CONFIG.baseUrl = url;
}

// Enable or disable rate limiting
export function setRateLimitingEnabled(enabled) {
    RATE_LIMIT_CONFIG.enabled = enabled;
}
