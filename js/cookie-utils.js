/**
 * Cookie utility functions for managing user preferences
 */
class CookieUtils {
    constructor() {
        this.cookiePrefix = 'odv_';
        this.defaultExpiryDays = 365; // 1 year
    }

    /**
     * Set a cookie with specified value and expiration
     * @param {string} name - Cookie name
     * @param {*} value - Cookie value (will be JSON.stringify'd)
     * @param {number} days - Days until expiration (default: 365)
     * @param {Object} options - Additional cookie options
     */
    setCookie(name, value, days = this.defaultExpiryDays, options = {}) {
        try {
            const expires = new Date();
            expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
            
            const cookieValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
            const encodedValue = encodeURIComponent(cookieValue);
            
            let cookieString = `${this.cookiePrefix}${name}=${encodedValue}; expires=${expires.toUTCString()}; path=/`;
            
            // Add SameSite and Secure attributes for security
            if (options.sameSite !== false) {
                cookieString += `; SameSite=${options.sameSite || 'Lax'}`;
            }
            
            if (options.secure !== false && location.protocol === 'https:') {
                cookieString += '; Secure';
            }
            
            document.cookie = cookieString;
            return true;
        } catch (error) {
            console.error('Error setting cookie:', error);
            return false;
        }
    }

    /**
     * Get a cookie value
     * @param {string} name - Cookie name
     * @param {*} defaultValue - Default value if cookie doesn't exist
     * @param {boolean} parseJson - Whether to parse JSON values
     * @returns {*} Cookie value or defaultValue
     */
    getCookie(name, defaultValue = null, parseJson = true) {
        try {
            const nameEQ = `${this.cookiePrefix}${name}=`;
            const cookies = document.cookie.split(';');
            
            for (let cookie of cookies) {
                cookie = cookie.trim();
                if (cookie.indexOf(nameEQ) === 0) {
                    const value = decodeURIComponent(cookie.substring(nameEQ.length));
                    
                    if (parseJson) {
                        try {
                            return JSON.parse(value);
                        } catch (e) {
                            return value; // Return as string if JSON parse fails
                        }
                    }
                    
                    return value;
                }
            }
        } catch (error) {
            console.error('Error getting cookie:', error);
        }
        
        return defaultValue;
    }

    /**
     * Delete a cookie
     * @param {string} name - Cookie name
     */
    deleteCookie(name) {
        try {
            document.cookie = `${this.cookiePrefix}${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
            return true;
        } catch (error) {
            console.error('Error deleting cookie:', error);
            return false;
        }
    }

    /**
     * Check if cookies are supported
     * @returns {boolean} True if cookies are supported
     */
    areCookiesSupported() {
        try {
            const testCookie = 'test_cookie_support';
            this.setCookie(testCookie, 'test', 1);
            const supported = this.getCookie(testCookie, null, false) === 'test';
            this.deleteCookie(testCookie);
            return supported;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get all cookies with the prefix
     * @returns {Object} Object with cookie names as keys
     */
    getAllCookies() {
        const cookies = {};
        try {
            if (document.cookie) {
                document.cookie.split(';').forEach(cookie => {
                    const [name, value] = cookie.trim().split('=');
                    if (name && name.startsWith(this.cookiePrefix)) {
                        const cleanName = name.substring(this.cookiePrefix.length);
                        try {
                            cookies[cleanName] = JSON.parse(decodeURIComponent(value));
                        } catch (e) {
                            cookies[cleanName] = decodeURIComponent(value);
                        }
                    }
                });
            }
        } catch (error) {
            console.error('Error getting all cookies:', error);
        }
        return cookies;
    }
}

/**
 * User preferences management with cookie storage
 */
class UserPreferences {
    constructor() {
        this.cookieUtils = new CookieUtils();
        this.changeListeners = [];
        
        // Default preferences
        this.preferences = {
            language: 'en',
            theme: 'light',
            productView: 'grid',
            measurementUnit: 'metric',
            currency: 'EUR',
            itemsPerPage: 10,
            sortBy: 'name',
            sortOrder: 'asc',
            showImages: true,
            autoPlayVideos: false,
            notifications: {
                orderUpdates: true,
                promotions: false,
                newsletter: false
            }
        };
        
        // Load saved preferences
        this.loadPreferences();
    }

    /**
     * Load preferences from cookies
     */
    loadPreferences() {
        const saved = this.cookieUtils.getCookie('preferences', {});
        this.preferences = { ...this.preferences, ...saved };
        
        // Validate loaded preferences
        this.validatePreferences();
    }

    /**
     * Save preferences to cookies
     */
    savePreferences() {
        try {
            this.cookieUtils.setCookie('preferences', this.preferences);
            this.notifyListeners();
            return true;
        } catch (error) {
            console.error('Error saving preferences:', error);
            return false;
        }
    }

    /**
     * Get a preference value
     * @param {string} key - Preference key
     * @param {*} defaultValue - Default value if preference doesn't exist
     * @returns {*} Preference value
     */
    get(key, defaultValue = null) {
        const keys = key.split('.');
        let value = this.preferences;
        
        for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
                value = value[k];
            } else {
                return defaultValue;
            }
        }
        
        return value;
    }

    /**
     * Set a preference value
     * @param {string} key - Preference key
     * @param {*} value - Preference value
     */
    set(key, value) {
        const keys = key.split('.');
        let current = this.preferences;
        
        for (let i = 0; i < keys.length - 1; i++) {
            const k = keys[i];
            if (!current[k] || typeof current[k] !== 'object') {
                current[k] = {};
            }
            current = current[k];
        }
        
        current[keys[keys.length - 1]] = value;
        this.validatePreferences();
        this.savePreferences();
    }

    /**
     * Get all preferences
     * @returns {Object} All preferences
     */
    getAll() {
        return { ...this.preferences };
    }

    /**
     * Set multiple preferences
     * @param {Object} prefs - Preferences object
     */
    setMultiple(prefs) {
        this.preferences = { ...this.preferences, ...prefs };
        this.validatePreferences();
        this.savePreferences();
    }

    /**
     * Reset preferences to defaults
     */
    reset() {
        this.preferences = {
            language: 'en',
            theme: 'light',
            productView: 'grid',
            measurementUnit: 'metric',
            currency: 'EUR',
            itemsPerPage: 10,
            sortBy: 'name',
            sortOrder: 'asc',
            showImages: true,
            autoPlayVideos: false,
            notifications: {
                orderUpdates: true,
                promotions: false,
                newsletter: false
            }
        };
        this.savePreferences();
    }

    /**
     * Validate preferences and fix invalid values
     */
    validatePreferences() {
        const validLanguages = ['en', 'it'];
        const validThemes = ['light', 'dark'];
        const validProductViews = ['grid', 'list'];
        const validMeasurementUnits = ['metric', 'imperial'];
        const validCurrencies = ['EUR', 'USD', 'GBP'];
        const validSortBy = ['name', 'price', 'date', 'popularity'];
        const validSortOrders = ['asc', 'desc'];

        if (!validLanguages.includes(this.preferences.language)) {
            this.preferences.language = 'en';
        }

        if (!validThemes.includes(this.preferences.theme)) {
            this.preferences.theme = 'light';
        }

        if (!validProductViews.includes(this.preferences.productView)) {
            this.preferences.productView = 'grid';
        }

        if (!validMeasurementUnits.includes(this.preferences.measurementUnit)) {
            this.preferences.measurementUnit = 'metric';
        }

        if (!validCurrencies.includes(this.preferences.currency)) {
            this.preferences.currency = 'EUR';
        }

        if (!validSortBy.includes(this.preferences.sortBy)) {
            this.preferences.sortBy = 'name';
        }

        if (!validSortOrders.includes(this.preferences.sortOrder)) {
            this.preferences.sortOrder = 'asc';
        }

        if (typeof this.preferences.itemsPerPage !== 'number' || this.preferences.itemsPerPage < 5 || this.preferences.itemsPerPage > 50) {
            this.preferences.itemsPerPage = 10;
        }

        if (typeof this.preferences.showImages !== 'boolean') {
            this.preferences.showImages = true;
        }

        if (typeof this.preferences.autoPlayVideos !== 'boolean') {
            this.preferences.autoPlayVideos = false;
        }

        if (!this.preferences.notifications || typeof this.preferences.notifications !== 'object') {
            this.preferences.notifications = {
                orderUpdates: true,
                promotions: false,
                newsletter: false
            };
        }
    }

    /**
     * Add a change listener
     * @param {Function} callback - Callback function
     */
    addChangeListener(callback) {
        if (typeof callback === 'function') {
            this.changeListeners.push(callback);
        }
    }

    /**
     * Remove a change listener
     * @param {Function} callback - Callback function
     */
    removeChangeListener(callback) {
        const index = this.changeListeners.indexOf(callback);
        if (index > -1) {
            this.changeListeners.splice(index, 1);
        }
    }

    /**
     * Notify all change listeners
     */
    notifyListeners() {
        this.changeListeners.forEach(callback => {
            try {
                callback(this.preferences);
            } catch (error) {
                console.error('Error in preference change listener:', error);
            }
        });
    }

    /**
     * Export preferences as JSON string
     * @returns {string} JSON string of preferences
     */
    exportPreferences() {
        try {
            return JSON.stringify(this.preferences, null, 2);
        } catch (error) {
            console.error('Error exporting preferences:', error);
            return null;
        }
    }

    /**
     * Import preferences from JSON string
     * @param {string} jsonString - JSON string of preferences
     * @returns {boolean} True if import was successful
     */
    importPreferences(jsonString) {
        try {
            const imported = JSON.parse(jsonString);
            if (imported && typeof imported === 'object') {
                this.setMultiple(imported);
                return true;
            }
        } catch (error) {
            console.error('Error importing preferences:', error);
        }
        return false;
    }

    /**
     * Check if cookies are supported
     * @returns {boolean} True if cookies are supported
     */
    isSupported() {
        return this.cookieUtils.areCookiesSupported();
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CookieUtils, UserPreferences };
} else {
    window.CookieUtils = CookieUtils;
    window.UserPreferences = UserPreferences;
}