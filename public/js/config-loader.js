/**
 * Client-side Configuration Loader
 * Manages environment-specific configuration for the frontend application
 */

class ConfigLoader {
    constructor() {
        if (ConfigLoader.instance) {
            return ConfigLoader.instance;
        }

        this.config = {};
        this.environment = this.detectEnvironment();
        this.loaded = false;

        ConfigLoader.instance = this;
    }

    detectEnvironment() {
        const hostname = window.location.hostname;
        
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            return 'development';
        } else if (hostname.includes('staging') || hostname.includes('test')) {
            return 'staging';
        } else {
            return 'production';
        }
    }

    getEnvironment() {
        return this.environment;
    }

    isDevelopment() {
        return this.environment === 'development';
    }

    isStaging() {
        return this.environment === 'staging';
    }

    isProduction() {
        return this.environment === 'production';
    }

    async loadConfig() {
        if (this.loaded) {
            return this.config;
        }

        try {
            const configData = this.getDefaultConfig();
            
            if (this.isDevelopment()) {
                console.log('[Config] Running in development mode');
                configData.debug = true;
            } else if (this.isProduction()) {
                console.log('[Config] Running in production mode');
                configData.debug = false;
            }

            this.config = configData;
            this.loaded = true;

            return this.config;
        } catch (error) {
            console.error('[Config] Error loading configuration:', error);
            this.config = this.getDefaultConfig();
            this.loaded = true;
            return this.config;
        }
    }

    getDefaultConfig() {
        return {
            environment: this.environment,
            debug: this.isDevelopment(),
            
            api: {
                baseUrl: this.getApiBaseUrl(),
                timeout: 30000
            },

            stripe: {
                publishableKey: this.getStripePublishableKey(),
                currency: 'eur',
                locale: 'it'
            },

            firebase: {
                emulators: this.isDevelopment() ? {
                    auth: { host: 'localhost', port: 9099 },
                    firestore: { host: 'localhost', port: 8080 },
                    functions: { host: 'localhost', port: 5001 }
                } : null
            },

            features: {
                enableAnalytics: this.isProduction(),
                enableErrorReporting: this.isProduction(),
                enableDebugLogs: this.isDevelopment()
            },

            limits: {
                maxFileSize: 5 * 1024 * 1024,
                maxImageWidth: 2000,
                maxImageHeight: 2000
            }
        };
    }

    getApiBaseUrl() {
        if (this.isDevelopment()) {
            return 'http://localhost:5001/l-olio-di-valeria/us-central1';
        } else if (this.isStaging()) {
            return 'https://us-central1-l-olio-di-valeria-staging.cloudfunctions.net';
        } else {
            return 'https://us-central1-l-olio-di-valeria.cloudfunctions.net';
        }
    }

    getStripePublishableKey() {
        if (this.isDevelopment()) {
            return window.STRIPE_PUBLISHABLE_KEY_DEV || 'pk_test_...';
        } else if (this.isStaging()) {
            return window.STRIPE_PUBLISHABLE_KEY_STAGING || 'pk_test_...';
        } else {
            return window.STRIPE_PUBLISHABLE_KEY_PROD || 'pk_live_...';
        }
    }

    get(key, defaultValue = null) {
        if (!this.loaded) {
            console.warn('[Config] Config not loaded yet. Call loadConfig() first.');
            return defaultValue;
        }

        const keys = key.split('.');
        let value = this.config;

        for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
                value = value[k];
            } else {
                return defaultValue;
            }
        }

        return value;
    }

    set(key, value) {
        const keys = key.split('.');
        let target = this.config;

        for (let i = 0; i < keys.length - 1; i++) {
            const k = keys[i];
            if (!(k in target) || typeof target[k] !== 'object') {
                target[k] = {};
            }
            target = target[k];
        }

        target[keys[keys.length - 1]] = value;
    }

    getAll() {
        return { ...this.config };
    }

    isFeatureEnabled(featureName) {
        return this.get(`features.${featureName}`, false);
    }

    getStripeConfig() {
        return {
            publishableKey: this.get('stripe.publishableKey'),
            currency: this.get('stripe.currency', 'eur'),
            locale: this.get('stripe.locale', 'it')
        };
    }

    getApiConfig() {
        return {
            baseUrl: this.get('api.baseUrl'),
            timeout: this.get('api.timeout', 30000)
        };
    }

    shouldUseEmulators() {
        return this.isDevelopment() && this.get('firebase.emulators') !== null;
    }

    getEmulatorConfig() {
        return this.get('firebase.emulators', null);
    }
}

const configLoader = new ConfigLoader();

export default configLoader;

export const loadConfig = () => configLoader.loadConfig();
export const getConfig = (key, defaultValue) => configLoader.get(key, defaultValue);
export const setConfig = (key, value) => configLoader.set(key, value);
export const getAllConfig = () => configLoader.getAll();
export const getEnvironment = () => configLoader.getEnvironment();
export const isDevelopment = () => configLoader.isDevelopment();
export const isProduction = () => configLoader.isProduction();
export const isFeatureEnabled = (featureName) => configLoader.isFeatureEnabled(featureName);
export const getStripeConfig = () => configLoader.getStripeConfig();
export const getApiConfig = () => configLoader.getApiConfig();
export const shouldUseEmulators = () => configLoader.shouldUseEmulators();
export const getEmulatorConfig = () => configLoader.getEmulatorConfig();
