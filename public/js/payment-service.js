/**
 * Payment Service - Abstraction layer for payment processing
 * 
 * This module provides a unified interface for payment operations with support
 * for multiple payment providers through a plugin architecture.
 * 
 * SUPPORTED PAYMENT METHODS:
 * - Credit/Debit Cards (via Stripe)
 * - SEPA Direct Debit (via Stripe)
 * - Bank Transfer (manual with instructions)
 * - PayPal (preparation for future)
 * - Apple Pay (preparation for future)
 * - Google Pay (preparation for future)
 * 
 * ARCHITECTURE:
 * - PaymentProvider: Abstract base class
 * - Provider implementations: StripeProvider, SEPAProvider, BankTransferProvider, etc.
 * - PaymentService: Main service managing provider lifecycle
 * 
 * USAGE:
 * ```javascript
 * import paymentService from './payment-service.js';
 * 
 * // Initialize with specific method
 * await paymentService.initializeProvider('card'); // or 'sepa_debit', 'bank_transfer', etc.
 * 
 * // Create payment intent
 * const intent = await paymentService.createPaymentIntent(5000, 'eur', { orderId: 'ODV-123' });
 * 
 * // Confirm payment
 * const result = await paymentService.confirmPayment({ amount: 5000, billingDetails: {...} });
 * ```
 */

import { getPaymentConfig } from './payment-config.js';
import {
    StripeProvider,
    SEPAProvider,
    BankTransferProvider,
    PayPalProvider,
    ApplePayProvider,
    GooglePayProvider,
    SimulationProvider
} from './payment-providers.js';

let PAYMENT_CONFIG;

function loadPaymentConfig() {
    try {
        const config = getPaymentConfig();
        return {
            useStripe: config.flags.useStripe,
            useSimulation: config.flags.useSimulation,
            stripePublishableKey: config.stripe.publishableKey,
            simulationDelay: config.simulation.delay,
            simulationFailureRate: config.simulation.failureRate,
            bankDetails: config.bankTransfer || {}
        };
    } catch (error) {
        console.warn('[PaymentService] Could not load config, using fallback');
        return {
            useStripe: window.PAYMENT_FEATURE_FLAGS?.useStripe ?? false,
            useSimulation: window.PAYMENT_FEATURE_FLAGS?.useSimulation ?? true,
            stripePublishableKey: window.STRIPE_PUBLISHABLE_KEY || '',
            simulationDelay: 1500,
            simulationFailureRate: 0.1,
            bankDetails: {}
        };
    }
}

PAYMENT_CONFIG = loadPaymentConfig();

/**
 * Payment Service - Main interface for payment operations
 */
class PaymentService {
    constructor() {
        this.providers = new Map();
        this.currentProvider = null;
        this.currentPaymentIntent = null;
        this.initialized = false;
        this.selectedMethod = null;
    }
    
    /**
     * Initialize the payment service
     * Sets up available payment providers
     */
    async initializeStripe(publishableKey = null) {
        const key = publishableKey || PAYMENT_CONFIG.stripePublishableKey;
        
        try {
            // Initialize based on configuration
            if (PAYMENT_CONFIG.useStripe && key) {
                console.log('[PaymentService] Initializing Stripe-based providers');
                
                // Card payments via Stripe
                const stripeProvider = new StripeProvider(key);
                await stripeProvider.initialize();
                this.providers.set('card', stripeProvider);
                this.providers.set('debit', stripeProvider);
                
                // SEPA Direct Debit via Stripe
                const sepaProvider = new SEPAProvider(key);
                await sepaProvider.initialize();
                this.providers.set('sepa_debit', sepaProvider);
                
                // Placeholder providers for future integration
                const applePayProvider = new ApplePayProvider(key);
                await applePayProvider.initialize();
                this.providers.set('apple_pay', applePayProvider);
                
                const googlePayProvider = new GooglePayProvider(key);
                await googlePayProvider.initialize();
                this.providers.set('google_pay', googlePayProvider);
                
            } else if (PAYMENT_CONFIG.useSimulation) {
                console.log('[PaymentService] Initializing simulation providers');
                
                const simulationProvider = new SimulationProvider({
                    delay: PAYMENT_CONFIG.simulationDelay,
                    failureRate: PAYMENT_CONFIG.simulationFailureRate
                });
                await simulationProvider.initialize();
                
                // Use simulation for all card-based methods
                this.providers.set('card', simulationProvider);
                this.providers.set('debit', simulationProvider);
                this.providers.set('sepa_debit', simulationProvider);
                this.providers.set('apple_pay', simulationProvider);
                this.providers.set('google_pay', simulationProvider);
            } else {
                throw new Error('No payment provider configured');
            }
            
            // Bank transfer is always available
            const bankTransferProvider = new BankTransferProvider({
                bankDetails: PAYMENT_CONFIG.bankDetails
            });
            await bankTransferProvider.initialize();
            this.providers.set('bank_transfer', bankTransferProvider);
            this.providers.set('bank', bankTransferProvider);
            
            // PayPal placeholder
            const paypalProvider = new PayPalProvider();
            await paypalProvider.initialize();
            this.providers.set('paypal', paypalProvider);
            
            this.initialized = true;
            console.log('[PaymentService] Initialized with providers:', Array.from(this.providers.keys()));
            
            // Set default provider
            this.currentProvider = this.providers.get('card');
            
            return { success: true, providers: Array.from(this.providers.keys()) };
            
        } catch (error) {
            console.error('[PaymentService] Initialization failed:', error);
            throw error;
        }
    }
    
    /**
     * Initialize provider for specific payment method
     */
    async initializeProvider(method) {
        this._ensureInitialized();
        
        const provider = this.providers.get(method);
        if (!provider) {
            throw new Error(`Payment method '${method}' not supported`);
        }
        
        this.currentProvider = provider;
        this.selectedMethod = method;
        
        console.log(`[PaymentService] Switched to provider: ${provider.getName()}`);
        return { success: true, provider: provider.getName(), method };
    }
    
    /**
     * Get available payment methods
     */
    getAvailableMethods() {
        return Array.from(this.providers.keys());
    }
    
    /**
     * Check if a payment method is available
     */
    isMethodAvailable(method) {
        return this.providers.has(method);
    }
    
    /**
     * Create a payment intent
     */
    async createPaymentIntent(amount, currency = 'eur', metadata = {}) {
        this._ensureInitialized();
        
        if (!this.currentProvider) {
            throw new Error('No payment provider selected');
        }
        
        try {
            this.currentPaymentIntent = await this.currentProvider.createPaymentIntent(
                amount, 
                currency, 
                { ...metadata, method: this.selectedMethod }
            );
            
            console.log('[PaymentService] Payment intent created:', {
                provider: this.currentProvider.getName(),
                method: this.selectedMethod,
                intentId: this.currentPaymentIntent.paymentIntentId
            });
            
            return this.currentPaymentIntent;
        } catch (error) {
            console.error('[PaymentService] Failed to create payment intent:', error);
            throw error;
        }
    }
    
    /**
     * Confirm payment
     */
    async confirmPayment(paymentDetails = {}) {
        this._ensureInitialized();
        
        if (!this.currentProvider) {
            throw new Error('No payment provider selected');
        }
        
        if (!this.currentPaymentIntent) {
            throw new Error('No payment intent created');
        }
        
        try {
            const result = await this.currentProvider.confirmPayment(
                this.currentPaymentIntent.clientSecret,
                paymentDetails
            );
            
            console.log('[PaymentService] Payment confirmation result:', result);
            return result;
        } catch (error) {
            console.error('[PaymentService] Failed to confirm payment:', error);
            throw error;
        }
    }
    
    /**
     * Handle payment method selection
     */
    async handlePaymentMethodSelection(method) {
        this._ensureInitialized();
        
        try {
            // Switch to appropriate provider
            await this.initializeProvider(method);
            
            // Let provider handle method-specific setup
            const result = await this.currentProvider.handlePaymentMethodSelection(method);
            
            console.log('[PaymentService] Payment method selection handled:', result);
            return result;
        } catch (error) {
            console.error('[PaymentService] Failed to handle payment method selection:', error);
            throw error;
        }
    }
    
    /**
     * Get bank details for bank transfer
     */
    getBankTransferDetails() {
        const bankProvider = this.providers.get('bank_transfer');
        if (bankProvider && typeof bankProvider.getBankDetails === 'function') {
            return bankProvider.getBankDetails();
        }
        return null;
    }
    
    /**
     * Get current provider name
     */
    getProviderName() {
        return this.currentProvider ? this.currentProvider.getName() : 'None';
    }
    
    /**
     * Get current payment method
     */
    getCurrentMethod() {
        return this.selectedMethod;
    }
    
    /**
     * Check if service is initialized
     */
    isInitialized() {
        return this.initialized;
    }
    
    /**
     * Check if current method requires user input
     */
    requiresUserInput() {
        if (!this.currentProvider) {
            return true;
        }
        return this.currentProvider.requiresUserInput ? this.currentProvider.requiresUserInput() : true;
    }
    
    /**
     * Reset payment service state
     */
    reset() {
        this.currentPaymentIntent = null;
        this.selectedMethod = null;
        console.log('[PaymentService] State reset');
    }
    
    _ensureInitialized() {
        if (!this.initialized) {
            throw new Error('Payment service not initialized. Call initializeStripe() first.');
        }
    }
}

// Create and export singleton instance
const paymentService = new PaymentService();

export default paymentService;
export { PaymentService, PAYMENT_CONFIG };
