/**
 * Payment Configuration and Feature Flags
 * 
 * This module controls payment processing behavior through feature flags
 * and provider-specific configuration.
 * 
 * QUICK START:
 * 1. For testing: Leave defaults (simulation mode)
 * 2. For Stripe: Set useStripe=true and add publishableKey
 * 3. For production: Set useStripe=true, debugMode=false, add live keys
 * 
 * IMPORTANT:
 * - This file is tracked in git for team collaboration
 * - Never commit real Stripe keys to this file
 * - Use environment variables for production keys
 * - Test keys (pk_test_) are safe to commit
 * 
 * @module payment-config
 */

/**
 * Payment Feature Flags
 * Control which payment provider to use
 * 
 * MODES:
 * - Simulation Mode: useSimulation=true, useStripe=false (default)
 *   - No real payments, instant processing, configurable failures
 *   - Perfect for development and testing
 * 
 * - Stripe Mode: useStripe=true, useSimulation=false
 *   - Real Stripe payment processing
 *   - Requires Stripe account and API keys
 *   - Use test keys for testing, live keys for production
 */
export const PAYMENT_FEATURE_FLAGS = {
    // Set to true to use Stripe for real payments
    // Set to false to use simulation mode
    useStripe: true,
    
    // Set to true to use simulation provider (for testing)
    // Automatically enabled if useStripe is false
    useSimulation: false,
    
    // Enable debug logging for payment operations
    debugMode: true
};

/**
 * Stripe Configuration
 * Add your Stripe publishable key here
 * 
 * For testing: use test mode keys (starts with pk_test_)
 * For production: use live mode keys (starts with pk_live_)
 */
export const STRIPE_CONFIG = {
    // Production mode publishable key (safe to commit - publishable keys are meant to be public)
    publishableKey: 'pk_live_51SpQvKPzGZwb99t7FmAXtd7LiB73B6oFdxhqPnVfYrWSUO98MRmnJwEqGHQ2ueRU0wmbxI3MOYPipYDH2VfjZk6R00NBn5dzQV',
    
    // Currency for payments
    currency: 'eur',
    
    // Locale for Stripe Elements
    locale: 'it',
    
    // Payment methods to enable
    paymentMethods: ['card', 'bank_transfer']
};

/**
 * Simulation Configuration
 * Settings for the simulation payment provider
 */
export const SIMULATION_CONFIG = {
    // Delay in milliseconds for simulated operations
    delay: 1500,
    
    // Failure rate for testing (0.0 = never fail, 1.0 = always fail)
    // Set to 0.1 for 10% failure rate
    failureRate: 0.1,
    
    // Enable random payment failures for testing
    enableRandomFailures: true
};

/**
 * Bank Transfer Configuration
 * Bank account details for manual bank transfers
 */
export const BANK_TRANSFER_CONFIG = {
    beneficiary: "L'Olio di Valeria di Licata Valeria",
    iban: "IT77 T360 8105 1382 7272 0072 768",
    bic: "BPPIITRRXXX",
    bank: "Poste Italiane S.p.A",
    processingTime: "1-3 giorni lavorativi"
};

/**
 * Environment Detection
 * Automatically adjust settings based on environment
 */
export function getEnvironment() {
    const hostname = window.location.hostname;
    
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'development';
    } else if (hostname.includes('staging') || hostname.includes('test')) {
        return 'staging';
    } else {
        return 'production';
    }
}

/**
 * Get configuration for current environment
 */
export function getPaymentConfig() {
    const env = getEnvironment();
    
    const config = {
        environment: env,
        flags: { ...PAYMENT_FEATURE_FLAGS },
        stripe: { ...STRIPE_CONFIG },
        simulation: { ...SIMULATION_CONFIG },
        bankTransfer: { ...BANK_TRANSFER_CONFIG }
    };
    
    // Adjust settings based on environment
    if (env === 'production') {
        // In production, disable simulation by default
        config.flags.useSimulation = false;
        config.flags.debugMode = false;
        config.simulation.enableRandomFailures = false;
    } else if (env === 'development') {
        // In development, use simulation by default
        config.flags.useSimulation = true;
        config.flags.debugMode = true;
    }
    
    // Override with feature flags if Stripe key is provided
    if (config.stripe.publishableKey && config.stripe.publishableKey.startsWith('pk_')) {
        config.flags.useStripe = true;
        config.flags.useSimulation = false;
    }
    
    return config;
}

/**
 * Initialize global payment configuration
 * Call this before initializing payment service
 */
export function initializePaymentConfig() {
    const config = getPaymentConfig();
    
    // Set global configuration for payment service to access
    window.PAYMENT_FEATURE_FLAGS = config.flags;
    window.STRIPE_PUBLISHABLE_KEY = config.stripe.publishableKey;
    window.PAYMENT_ENVIRONMENT = config.environment;
    
    if (config.flags.debugMode) {
        console.log('[PaymentConfig] Initialized with configuration:', {
            environment: config.environment,
            useStripe: config.flags.useStripe,
            useSimulation: config.flags.useSimulation,
            hasStripeKey: !!config.stripe.publishableKey
        });
    }
    
    return config;
}

// Auto-initialize on module load
initializePaymentConfig();

export default {
    PAYMENT_FEATURE_FLAGS,
    STRIPE_CONFIG,
    SIMULATION_CONFIG,
    BANK_TRANSFER_CONFIG,
    getEnvironment,
    getPaymentConfig,
    initializePaymentConfig
};
