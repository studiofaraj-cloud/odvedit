/**
 * Security Utilities Module
 * Provides XSS prevention, input sanitization, and CSRF protection
 */

// HTML entity encoding map
const HTML_ENTITIES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;'
};

// Regular expression to match HTML entities
const HTML_ENTITY_REGEX = /[&<>"'\/]/g;

/**
 * Escapes HTML special characters to prevent XSS attacks
 * @param {string} str - The string to escape
 * @returns {string} The escaped string
 */
export function escapeHtml(str) {
    if (typeof str !== 'string') {
        return '';
    }
    return str.replace(HTML_ENTITY_REGEX, char => HTML_ENTITIES[char]);
}

/**
 * Decodes HTML entities back to their original characters.
 * Useful for handling legacy data that was double-escaped.
 * @param {string} str - The string to decode
 * @returns {string} The decoded string
 */
export function decodeHtml(str) {
    if (typeof str !== 'string' || !str) return '';
    const txt = document.createElement('textarea');
    txt.innerHTML = str;
    return txt.value;
}

/**
 * Sanitizes user input by trimming whitespace.
 * Note: We store raw text in the database and use escapeHtml() only when rendering 
 * to HTML to prevent double-escaping of characters like ' and ".
 * @param {string} input - The input string to sanitize
 * @returns {string} The sanitized string
 */
export function sanitizeInput(input) {
    if (typeof input !== 'string') {
        return '';
    }
    return input.trim();
}

/**
 * Sanitizes an email address
 * @param {string} email - The email to sanitize
 * @returns {string} The sanitized email
 */
export function sanitizeEmail(email) {
    if (typeof email !== 'string') {
        return '';
    }
    // Trim and lowercase for consistency
    const cleaned = email.trim().toLowerCase();
    // Basic email validation pattern
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailPattern.test(cleaned) ? cleaned : '';
}

/**
 * Sanitizes a phone number
 * @param {string} phone - The phone number to sanitize
 * @returns {string} The sanitized phone number
 */
export function sanitizePhone(phone) {
    if (typeof phone !== 'string') {
        return '';
    }
    // Allow only numbers, spaces, dashes, parentheses, and plus sign
    return phone.replace(/[^0-9\s\-()+ ]/g, '').trim();
}

/**
 * Sanitizes a URL to prevent javascript: and data: URL attacks
 * @param {string} url - The URL to sanitize
 * @returns {string} The sanitized URL or empty string if dangerous
 */
export function sanitizeUrl(url) {
    if (typeof url !== 'string') {
        return '';
    }
    
    const trimmed = url.trim().toLowerCase();
    
    // Block dangerous protocols
    const dangerousProtocols = ['javascript:', 'data:', 'vbscript:', 'file:', 'about:'];
    for (const protocol of dangerousProtocols) {
        if (trimmed.startsWith(protocol)) {
            return '';
        }
    }
    
    return url.trim();
}

/**
 * Safely sets text content of an element (no HTML parsing)
 * @param {HTMLElement} element - The element to update
 * @param {string} text - The text content to set
 */
export function setTextContent(element, text) {
    if (!element || !(element instanceof HTMLElement)) {
        console.warn('[Security] Invalid element provided to setTextContent');
        return;
    }
    element.textContent = text || '';
}

/**
 * Safely sets innerHTML with sanitized content
 * Use this when you need to set HTML but want basic XSS protection
 * @param {HTMLElement} element - The element to update
 * @param {string} html - The HTML content to set (will be sanitized)
 */
export function setSafeInnerHTML(element, html) {
    if (!element || !(element instanceof HTMLElement)) {
        console.warn('[Security] Invalid element provided to setSafeInnerHTML');
        return;
    }
    element.innerHTML = escapeHtml(html || '');
}

/**
 * Creates a text node safely
 * @param {string} text - The text content
 * @returns {Text} A text node
 */
export function createTextNode(text) {
    return document.createTextNode(text || '');
}

/**
 * Sanitizes an object's string properties
 * @param {Object} obj - The object to sanitize
 * @param {Array<string>} fields - Array of field names to sanitize
 * @returns {Object} The sanitized object
 */
export function sanitizeObject(obj, fields) {
    if (!obj || typeof obj !== 'object') {
        return {};
    }
    
    const sanitized = { ...obj };
    
    for (const field of fields) {
        if (sanitized[field] && typeof sanitized[field] === 'string') {
            sanitized[field] = sanitizeInput(sanitized[field]);
        }
    }
    
    return sanitized;
}

/**
 * Sanitizes order data
 * @param {Object} orderData - The order data to sanitize
 * @returns {Object} The sanitized order data
 */
export function sanitizeOrderData(orderData) {
    if (!orderData || typeof orderData !== 'object') {
        return null;
    }
    
    const sanitized = {
        ...orderData,
        customerInfo: orderData.customerInfo ? {
            name: sanitizeInput(orderData.customerInfo.name || ''),
            email: sanitizeEmail(orderData.customerInfo.email || ''),
            phone: sanitizePhone(orderData.customerInfo.phone || ''),
            company: sanitizeInput(orderData.customerInfo.company || ''),
            address: sanitizeInput(orderData.customerInfo.address || ''),
            houseNumber: sanitizeInput(orderData.customerInfo.houseNumber || ''),
            city: sanitizeInput(orderData.customerInfo.city || ''),
            province: sanitizeInput(orderData.customerInfo.province || ''),
            postalCode: sanitizeInput(orderData.customerInfo.postalCode || ''),
            country: sanitizeInput(orderData.customerInfo.country || ''),
            customCountry: sanitizeInput(orderData.customerInfo.customCountry || ''),
            notes: sanitizeInput(orderData.customerInfo.notes || '')
        } : {}
    };
    
    // Sanitize items
    if (Array.isArray(orderData.items)) {
        sanitized.items = orderData.items.map(item => ({
            ...item,
            name: sanitizeInput(item.name || ''),
            size: sanitizeInput(item.size || ''),
            volume: sanitizeInput(item.volume || '')
        }));
    }
    
    return sanitized;
}

/**
 * Sanitizes contact message data
 * @param {Object} messageData - The message data to sanitize
 * @returns {Object} The sanitized message data
 */
export function sanitizeContactMessage(messageData) {
    if (!messageData || typeof messageData !== 'object') {
        return null;
    }
    
    return {
        name: sanitizeInput(messageData.name || ''),
        email: sanitizeEmail(messageData.email || ''),
        phone: sanitizePhone(messageData.phone || ''),
        inquiry: sanitizeInput(messageData.inquiry || ''),
        message: sanitizeInput(messageData.message || '')
    };
}

// ==================== CSRF Protection ====================

const CSRF_TOKEN_KEY = 'csrf_token';
const CSRF_TOKEN_TIMESTAMP_KEY = 'csrf_token_timestamp';
const CSRF_TOKEN_EXPIRY = 3600000; // 1 hour in milliseconds

/**
 * Generates a random CSRF token
 * @returns {string} A random token
 */
function generateRandomToken() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Generates a new CSRF token and stores it
 * @returns {string} The generated token
 */
export function generateCSRFToken() {
    const token = generateRandomToken();
    const timestamp = Date.now();
    
    try {
        sessionStorage.setItem(CSRF_TOKEN_KEY, token);
        sessionStorage.setItem(CSRF_TOKEN_TIMESTAMP_KEY, timestamp.toString());
    } catch (e) {
        console.error('[Security] Failed to store CSRF token:', e);
    }
    
    return token;
}

/**
 * Gets the current CSRF token, generating a new one if needed
 * @returns {string} The current CSRF token
 */
export function getCSRFToken() {
    try {
        const token = sessionStorage.getItem(CSRF_TOKEN_KEY);
        const timestamp = sessionStorage.getItem(CSRF_TOKEN_TIMESTAMP_KEY);
        
        // Check if token exists and hasn't expired
        if (token && timestamp) {
            const age = Date.now() - parseInt(timestamp, 10);
            if (age < CSRF_TOKEN_EXPIRY) {
                return token;
            }
        }
    } catch (e) {
        console.error('[Security] Failed to retrieve CSRF token:', e);
    }
    
    // Generate new token if none exists or expired
    return generateCSRFToken();
}

/**
 * Validates a CSRF token
 * @param {string} token - The token to validate
 * @returns {boolean} True if valid, false otherwise
 */
export function validateCSRFToken(token) {
    if (!token || typeof token !== 'string') {
        return false;
    }
    
    try {
        const storedToken = sessionStorage.getItem(CSRF_TOKEN_KEY);
        const timestamp = sessionStorage.getItem(CSRF_TOKEN_TIMESTAMP_KEY);
        
        if (!storedToken || !timestamp) {
            return false;
        }
        
        // Check if token has expired
        const age = Date.now() - parseInt(timestamp, 10);
        if (age >= CSRF_TOKEN_EXPIRY) {
            return false;
        }
        
        // Constant-time comparison to prevent timing attacks
        return timingSafeEqual(token, storedToken);
    } catch (e) {
        console.error('[Security] Error validating CSRF token:', e);
        return false;
    }
}

/**
 * Timing-safe string comparison to prevent timing attacks
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {boolean} True if strings are equal
 */
function timingSafeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') {
        return false;
    }
    
    if (a.length !== b.length) {
        return false;
    }
    
    let result = 0;
    for (let i = 0; i < a.length; i++) {
        result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    
    return result === 0;
}

/**
 * Adds CSRF token to a form as a hidden input
 * @param {HTMLFormElement} form - The form element
 * @returns {string} The generated token
 */
export function addCSRFTokenToForm(form) {
    if (!form || !(form instanceof HTMLFormElement)) {
        console.warn('[Security] Invalid form provided to addCSRFTokenToForm');
        return '';
    }
    
    // Remove existing CSRF token field if present
    const existingField = form.querySelector('input[name="csrf_token"]');
    if (existingField) {
        existingField.remove();
    }
    
    const token = getCSRFToken();
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'csrf_token';
    input.value = token;
    form.appendChild(input);
    
    return token;
}

/**
 * Validates CSRF token from form data
 * @param {FormData} formData - The form data
 * @returns {boolean} True if valid, false otherwise
 */
export function validateFormCSRFToken(formData) {
    if (!formData || !(formData instanceof FormData)) {
        console.warn('[Security] Invalid FormData provided');
        return false;
    }
    
    const token = formData.get('csrf_token');
    return validateCSRFToken(token);
}

/**
 * Refreshes CSRF token (generates a new one)
 */
export function refreshCSRFToken() {
    try {
        sessionStorage.removeItem(CSRF_TOKEN_KEY);
        sessionStorage.removeItem(CSRF_TOKEN_TIMESTAMP_KEY);
    } catch (e) {
        console.error('[Security] Failed to clear CSRF token:', e);
    }
    
    return generateCSRFToken();
}

/**
 * Initializes CSRF protection for all forms on the page
 * This should be called once when the page loads
 */
export function initCSRFProtection() {
    // Add CSRF tokens to all forms with data-csrf="true"
    const forms = document.querySelectorAll('form[data-csrf="true"]');
    forms.forEach(form => {
        // Check if token already exists to avoid duplicates
        if (!form.querySelector('input[name="csrf_token"]')) {
            addCSRFTokenToForm(form);
        }
    });
    
    if (forms.length > 0) {
        console.log(`[Security] CSRF protection initialized for ${forms.length} forms`);
    }
}

// Auto-initialize on DOM load
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initCSRFProtection);
    } else {
        // DOM already loaded
        initCSRFProtection();
    }
}

// ==================== Content Security ====================

/**
 * Checks if a string contains potentially dangerous content
 * @param {string} content - The content to check
 * @returns {boolean} True if dangerous content detected
 */
export function containsDangerousContent(content) {
    if (typeof content !== 'string') {
        return false;
    }
    
    const dangerousPatterns = [
        /<script/i,
        /javascript:/i,
        /on\w+\s*=/i, // Event handlers like onclick=
        /<iframe/i,
        /<object/i,
        /<embed/i,
        /vbscript:/i,
        /data:text\/html/i
    ];
    
    return dangerousPatterns.some(pattern => pattern.test(content));
}

/**
 * Strips all HTML tags from a string
 * @param {string} html - The HTML string
 * @returns {string} The text content without HTML
 */
export function stripHtmlTags(html) {
    if (typeof html !== 'string') {
        return '';
    }
    
    const div = document.createElement('div');
    div.textContent = html;
    return div.textContent || '';
}

/**
 * Validates and sanitizes a numeric input
 * @param {any} value - The value to validate
 * @param {number} min - Minimum allowed value
 * @param {number} max - Maximum allowed value
 * @returns {number|null} The sanitized number or null if invalid
 */
export function sanitizeNumericInput(value, min = -Infinity, max = Infinity) {
    const num = parseFloat(value);
    
    if (isNaN(num)) {
        return null;
    }
    
    if (num < min || num > max) {
        return null;
    }
    
    return num;
}

/**
 * Validates an order ID format
 * @param {string} orderId - The order ID to validate
 * @returns {boolean} True if valid format
 */
export function validateOrderId(orderId) {
    if (typeof orderId !== 'string') {
        return false;
    }
    
    // Order IDs should be alphanumeric with hyphens, not contain HTML
    const validPattern = /^[A-Za-z0-9\-_]+$/;
    return validPattern.test(orderId) && !containsDangerousContent(orderId);
}

/**
 * Sanitizes a document ID (for Firestore)
 * @param {string} docId - The document ID
 * @returns {string} The sanitized document ID
 */
export function sanitizeDocumentId(docId) {
    if (typeof docId !== 'string') {
        return '';
    }
    
    // Allow only alphanumeric, hyphens, and underscores
    return docId.replace(/[^A-Za-z0-9\-_]/g, '');
}

// Log initialization
console.log('[Security Utils] Module loaded - XSS prevention and CSRF protection enabled');
