import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";
import { getAnalytics, logEvent, setAnalyticsCollectionEnabled, setUserId, setUserProperties } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-analytics.js";

const firebaseConfig = {
    apiKey: "AIzaSyAg7Jal9PIext4OSxhH4q0Twoybos3_mvE",
    authDomain: "l-olio-di-valeria.firebaseapp.com",
    projectId: "l-olio-di-valeria",
    storageBucket: "l-olio-di-valeria.appspot.com",
    messagingSenderId: "438585656275",
    appId: "1:438585656275:web:0ec70ddabc7de64b806526",
    measurementId: "G-QW0YWNWKZ8"
};

class FirebaseManager {
    constructor() {
        if (FirebaseManager.instance) {
            return FirebaseManager.instance;
        }

        this.app = null;
        this.auth = null;
        this.db = null;
        this.analytics = null;
        this.analyticsEnabled = true;
        this.connectionState = 'disconnected';
        this.retryAttempts = 0;
        this.maxRetries = 3;
        this.retryDelay = 1000;
        this.connectionListeners = [];
        this.healthCheckInterval = null;

        FirebaseManager.instance = this;
        this.initialize();
    }

    initialize() {
        try {
            this.app = initializeApp(firebaseConfig);
            this.auth = getAuth(this.app);
            this.db = getFirestore(this.app);
            
            this.initializeAnalytics();
            
            this.connectionState = 'connected';
            this.retryAttempts = 0;
            this.notifyConnectionListeners('connected');
            this.startHealthCheck();
            console.log('[Firebase] Successfully initialized');
        } catch (error) {
            console.error('[Firebase] Initialization error:', error);
            this.connectionState = 'error';
            this.notifyConnectionListeners('error', error);
            this.scheduleRetry();
        }
    }

    initializeAnalytics() {
        try {
            this.analytics = getAnalytics(this.app);
            
            const userConsent = this.getAnalyticsConsent();
            this.analyticsEnabled = userConsent;
            setAnalyticsCollectionEnabled(this.analytics, this.analyticsEnabled);
            
            console.log(`[Firebase Analytics] Initialized (collection ${this.analyticsEnabled ? 'enabled' : 'disabled'})`);
        } catch (error) {
            console.warn('[Firebase Analytics] Failed to initialize:', error);
            this.analytics = null;
        }
    }

    getAnalyticsConsent() {
        try {
            const consent = localStorage.getItem('analytics_consent');
            if (consent === null) {
                return true;
            }
            return consent === 'true';
        } catch (error) {
            console.warn('[Firebase Analytics] Failed to read consent:', error);
            return true;
        }
    }

    setAnalyticsConsent(enabled) {
        try {
            this.analyticsEnabled = enabled;
            localStorage.setItem('analytics_consent', enabled.toString());
            
            if (this.analytics) {
                setAnalyticsCollectionEnabled(this.analytics, enabled);
                console.log(`[Firebase Analytics] Collection ${enabled ? 'enabled' : 'disabled'}`);
            }
        } catch (error) {
            console.error('[Firebase Analytics] Failed to set consent:', error);
        }
    }

    logAnalyticsEvent(eventName, eventParams = {}) {
        if (!this.analytics || !this.analyticsEnabled) {
            return;
        }

        try {
            logEvent(this.analytics, eventName, eventParams);
            console.log(`[Firebase Analytics] Event logged: ${eventName}`, eventParams);
        } catch (error) {
            console.error('[Firebase Analytics] Failed to log event:', error);
        }
    }

    setAnalyticsUserId(userId) {
        if (!this.analytics || !this.analyticsEnabled) {
            return;
        }

        try {
            setUserId(this.analytics, userId);
            console.log(`[Firebase Analytics] User ID set: ${userId}`);
        } catch (error) {
            console.error('[Firebase Analytics] Failed to set user ID:', error);
        }
    }

    setAnalyticsUserProperties(properties) {
        if (!this.analytics || !this.analyticsEnabled) {
            return;
        }

        try {
            setUserProperties(this.analytics, properties);
            console.log('[Firebase Analytics] User properties set:', properties);
        } catch (error) {
            console.error('[Firebase Analytics] Failed to set user properties:', error);
        }
    }

    logPageView(pageName, pageParams = {}) {
        this.logAnalyticsEvent('page_view', {
            page_title: pageName,
            page_location: window.location.href,
            page_path: window.location.pathname,
            ...pageParams
        });
    }

    logPurchase(transactionId, value, currency = 'EUR', items = []) {
        this.logAnalyticsEvent('purchase', {
            transaction_id: transactionId,
            value: value,
            currency: currency,
            items: items
        });
    }

    logAddToCart(item) {
        this.logAnalyticsEvent('add_to_cart', {
            currency: 'EUR',
            value: item.price || 0,
            items: [item]
        });
    }

    logBeginCheckout(items, value) {
        this.logAnalyticsEvent('begin_checkout', {
            currency: 'EUR',
            value: value,
            items: items
        });
    }

    logSearch(searchTerm) {
        this.logAnalyticsEvent('search', {
            search_term: searchTerm
        });
    }

    logShare(contentType, itemId) {
        this.logAnalyticsEvent('share', {
            content_type: contentType,
            item_id: itemId
        });
    }

    logSignUp(method) {
        this.logAnalyticsEvent('sign_up', {
            method: method
        });
    }

    logLogin(method) {
        this.logAnalyticsEvent('login', {
            method: method
        });
    }

    async retry() {
        if (this.retryAttempts >= this.maxRetries) {
            console.error('[Firebase] Max retry attempts reached');
            this.connectionState = 'failed';
            this.notifyConnectionListeners('failed');
            return;
        }

        this.retryAttempts++;
        this.connectionState = 'retrying';
        this.notifyConnectionListeners('retrying', { attempt: this.retryAttempts });
        
        console.log(`[Firebase] Retry attempt ${this.retryAttempts}/${this.maxRetries}`);
        
        await new Promise(resolve => setTimeout(resolve, this.retryDelay * this.retryAttempts));
        this.initialize();
    }

    scheduleRetry() {
        if (this.connectionState === 'error' && this.retryAttempts < this.maxRetries) {
            setTimeout(() => this.retry(), this.retryDelay);
        }
    }

    startHealthCheck() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        this.healthCheckInterval = setInterval(() => {
            this.checkHealth();
        }, 30000);
    }

    async checkHealth() {
        try {
            if (!this.auth || !this.db) {
                throw new Error('Firebase services not initialized');
            }

            const previousState = this.connectionState;
            this.connectionState = 'connected';

            if (previousState !== 'connected') {
                console.log('[Firebase] Connection restored');
                this.notifyConnectionListeners('connected');
            }

            return {
                status: 'healthy',
                timestamp: new Date().toISOString(),
                services: {
                    auth: !!this.auth,
                    firestore: !!this.db,
                    analytics: !!this.analytics
                }
            };
        } catch (error) {
            console.error('[Firebase] Health check failed:', error);
            this.connectionState = 'unhealthy';
            this.notifyConnectionListeners('unhealthy', error);
            
            return {
                status: 'unhealthy',
                timestamp: new Date().toISOString(),
                error: error.message
            };
        }
    }

    getConnectionState() {
        return this.connectionState;
    }

    isConnected() {
        return this.connectionState === 'connected';
    }

    onConnectionChange(callback) {
        this.connectionListeners.push(callback);
        
        callback(this.connectionState);

        return () => {
            this.connectionListeners = this.connectionListeners.filter(cb => cb !== callback);
        };
    }

    notifyConnectionListeners(state, data = null) {
        this.connectionListeners.forEach(callback => {
            try {
                callback(state, data);
            } catch (error) {
                console.error('[Firebase] Error in connection listener:', error);
            }
        });
    }

    getApp() {
        if (!this.app) {
            throw new Error('[Firebase] App not initialized');
        }
        return this.app;
    }

    getAuth() {
        if (!this.auth) {
            throw new Error('[Firebase] Auth not initialized');
        }
        return this.auth;
    }

    getFirestore() {
        if (!this.db) {
            throw new Error('[Firebase] Firestore not initialized');
        }
        return this.db;
    }

    getAnalytics() {
        return this.analytics;
    }

    isAnalyticsEnabled() {
        return this.analyticsEnabled;
    }

    async withRetry(operation, operationName = 'operation') {
        const maxAttempts = 3;
        let lastError;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                console.warn(`[Firebase] ${operationName} failed (attempt ${attempt}/${maxAttempts}):`, error);

                if (attempt < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                }
            }
        }

        throw new Error(`[Firebase] ${operationName} failed after ${maxAttempts} attempts: ${lastError.message}`);
    }

    destroy() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
        this.connectionListeners = [];
        this.connectionState = 'disconnected';
        console.log('[Firebase] Manager destroyed');
    }
}

const firebaseManager = new FirebaseManager();

export default firebaseManager;

export const getFirebaseApp = () => firebaseManager.getApp();
export const getFirebaseAuth = () => firebaseManager.getAuth();
export const getFirebaseFirestore = () => firebaseManager.getFirestore();
export const getFirebaseAnalytics = () => firebaseManager.getAnalytics();
export const getConnectionState = () => firebaseManager.getConnectionState();
export const isFirebaseConnected = () => firebaseManager.isConnected();
export const onFirebaseConnectionChange = (callback) => firebaseManager.onConnectionChange(callback);
export const checkFirebaseHealth = () => firebaseManager.checkHealth();
export const withFirebaseRetry = (operation, operationName) => firebaseManager.withRetry(operation, operationName);

export const isAnalyticsEnabled = () => firebaseManager.isAnalyticsEnabled();
export const setAnalyticsConsent = (enabled) => firebaseManager.setAnalyticsConsent(enabled);
export const logAnalyticsEvent = (eventName, eventParams) => firebaseManager.logAnalyticsEvent(eventName, eventParams);
export const setAnalyticsUserId = (userId) => firebaseManager.setAnalyticsUserId(userId);
export const setAnalyticsUserProperties = (properties) => firebaseManager.setAnalyticsUserProperties(properties);
export const logPageView = (pageName, pageParams) => firebaseManager.logPageView(pageName, pageParams);
export const logPurchase = (transactionId, value, currency, items) => firebaseManager.logPurchase(transactionId, value, currency, items);
export const logAddToCart = (item) => firebaseManager.logAddToCart(item);
export const logBeginCheckout = (items, value) => firebaseManager.logBeginCheckout(items, value);
export const logSearch = (searchTerm) => firebaseManager.logSearch(searchTerm);
export const logShare = (contentType, itemId) => firebaseManager.logShare(contentType, itemId);
export const logSignUp = (method) => firebaseManager.logSignUp(method);
export const logLogin = (method) => firebaseManager.logLogin(method);
