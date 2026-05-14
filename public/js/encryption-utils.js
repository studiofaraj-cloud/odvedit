/**
 * Encryption and Security Utilities for l'Olio di Valeria
 * Provides data encryption for localStorage, secure token management, and session handling
 */

// Generate a unique encryption key for this browser session
// In production, this could be derived from user authentication or stored securely
const ENCRYPTION_KEY = generateOrRetrieveKey();

function generateOrRetrieveKey() {
    const stored = sessionStorage.getItem('_app_enc_key');
    if (stored) {
        return stored;
    }
    
    // Generate a random key for this session
    const key = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    
    sessionStorage.setItem('_app_enc_key', key);
    return key;
}

/**
 * Simple XOR-based encryption for localStorage data
 * For production, consider using Web Crypto API for stronger encryption
 */
function xorEncrypt(text, key) {
    let result = '';
    for (let i = 0; i < text.length; i++) {
        result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return btoa(result); // Base64 encode
}

function xorDecrypt(encrypted, key) {
    try {
        const decoded = atob(encrypted); // Base64 decode
        let result = '';
        for (let i = 0; i < decoded.length; i++) {
            result += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        }
        return result;
    } catch (e) {
        console.error('Decryption failed:', e);
        return null;
    }
}

/**
 * Secure localStorage wrapper with encryption
 */
export const secureStorage = {
    setItem(key, value) {
        try {
            const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
            const encrypted = xorEncrypt(stringValue, ENCRYPTION_KEY);
            localStorage.setItem(`_enc_${key}`, encrypted);
            return true;
        } catch (error) {
            console.error('Failed to encrypt and store data:', error);
            return false;
        }
    },

    getItem(key) {
        try {
            const encrypted = localStorage.getItem(`_enc_${key}`);
            if (!encrypted) return null;
            
            const decrypted = xorDecrypt(encrypted, ENCRYPTION_KEY);
            if (!decrypted) return null;
            
            // Try to parse as JSON, if fails return as string
            try {
                return JSON.parse(decrypted);
            } catch {
                return decrypted;
            }
        } catch (error) {
            console.error('Failed to retrieve and decrypt data:', error);
            return null;
        }
    },

    removeItem(key) {
        localStorage.removeItem(`_enc_${key}`);
    },

    clear() {
        // Clear only encrypted items
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
            if (key.startsWith('_enc_')) {
                localStorage.removeItem(key);
            }
        });
    }
};

/**
 * Session Token Management for Admin Dashboard
 */
const TOKEN_KEY = '_admin_session_token';
const TOKEN_EXPIRY_KEY = '_admin_session_expiry';
const TOKEN_LIFETIME = 3600000; // 1 hour in milliseconds

export const sessionManager = {
    /**
     * Create a new session token
     */
    createSession(userData = {}) {
        const token = this.generateToken();
        const expiry = Date.now() + TOKEN_LIFETIME;
        
        const sessionData = {
            token,
            expiry,
            userData,
            createdAt: Date.now()
        };
        
        secureStorage.setItem(TOKEN_KEY, sessionData);
        return token;
    },

    /**
     * Validate current session
     */
    validateSession() {
        const sessionData = secureStorage.getItem(TOKEN_KEY);
        
        if (!sessionData) {
            return { valid: false, reason: 'no_session' };
        }
        
        if (Date.now() > sessionData.expiry) {
            this.destroySession();
            return { valid: false, reason: 'expired' };
        }
        
        return { valid: true, data: sessionData };
    },

    /**
     * Extend session expiry (call on user activity)
     */
    extendSession() {
        const sessionData = secureStorage.getItem(TOKEN_KEY);
        
        if (sessionData && Date.now() <= sessionData.expiry) {
            sessionData.expiry = Date.now() + TOKEN_LIFETIME;
            secureStorage.setItem(TOKEN_KEY, sessionData);
            return true;
        }
        
        return false;
    },

    /**
     * Get current session data
     */
    getSession() {
        const validation = this.validateSession();
        return validation.valid ? validation.data : null;
    },

    /**
     * Destroy current session
     */
    destroySession() {
        secureStorage.removeItem(TOKEN_KEY);
        // Also clear Firebase persistence if needed
        sessionStorage.clear();
    },

    /**
     * Generate a cryptographically secure token
     */
    generateToken() {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    },

    /**
     * Get time until session expires (in milliseconds)
     */
    getTimeUntilExpiry() {
        const sessionData = secureStorage.getItem(TOKEN_KEY);
        if (!sessionData) return 0;
        
        const remaining = sessionData.expiry - Date.now();
        return Math.max(0, remaining);
    }
};

/**
 * Auto-extend session on user activity
 */
let activityTimer;
export function setupActivityMonitor() {
    const activities = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    
    const handleActivity = () => {
        clearTimeout(activityTimer);
        activityTimer = setTimeout(() => {
            sessionManager.extendSession();
        }, 5000); // Extend after 5 seconds of activity
    };
    
    activities.forEach(event => {
        document.addEventListener(event, handleActivity, { passive: true });
    });
}

/**
 * Setup automatic session expiry check
 */
export function setupExpiryMonitor(onExpiry) {
    setInterval(() => {
        const validation = sessionManager.validateSession();
        if (!validation.valid && onExpiry) {
            onExpiry(validation.reason);
        }
    }, 60000); // Check every minute
}

/**
 * Migrate existing unencrypted localStorage data
 */
export function migrateToEncryptedStorage(keys) {
    keys.forEach(key => {
        const existingData = localStorage.getItem(key);
        if (existingData && !localStorage.getItem(`_enc_${key}`)) {
            try {
                secureStorage.setItem(key, existingData);
                localStorage.removeItem(key); // Remove unencrypted version
                console.log(`Migrated ${key} to encrypted storage`);
            } catch (error) {
                console.error(`Failed to migrate ${key}:`, error);
            }
        }
    });
}

/**
 * Sanitize data before storage (remove sensitive fields)
 */
export function sanitizeData(data, sensitiveFields = []) {
    const sanitized = { ...data };
    sensitiveFields.forEach(field => {
        if (sanitized[field]) {
            delete sanitized[field];
        }
    });
    return sanitized;
}
