// Checkout UI Manager - Handles cart display, payment UI, and form interactions
// Separated from checkout.html for better code organization

import { isCheckoutReady } from './checkout.js';
import { secureStorage } from './encryption-utils.js';
import { escapeHtml, sanitizeInput, addCSRFTokenToForm } from './security-utils.js';
import paymentService from './payment-service.js';
import { getConnectionState, checkFirebaseHealth } from './firebase-config.js';

export class CheckoutUI {
    constructor() {
        this.cart = this.loadCart();
        this.selectedCountry = 'IT';
        this.paymentServiceInitialized = false;
        this.stripeElements = null;
        this.cardElement = null;
        this.currentPaymentIntentId = null;
        this.currentClientSecret = null;
        this.init();
    }

    async init() {
        this.loadOrderSummary();
        this.bindEvents();
        this.setupFormValidation();
        this.toggleCustomCountryInput(this.selectedCountry);
        
        // Listen for language changes to update dynamic strings
        window.addEventListener('languageChanged', () => {
            console.log('[CheckoutUI] Language changed, refreshing summary');
            this.loadOrderSummary();
            this.updateTotals();
        });
        
        // Remove required attributes from card fields on initialization
        // (Stripe Checkout doesn't need them - card details entered on Stripe page)
        this.removeCardFieldRequirements();
        
        await this.initializePaymentService();
        
        // Initialize card field visibility based on default payment method
        const defaultPaymentMethod = this.getSelectedPaymentMethod();
        if (defaultPaymentMethod) {
            this.toggleCardFieldsForPaymentMethod(defaultPaymentMethod);
        }
    }
    
    removeCardFieldRequirements() {
        // Remove required attributes from card fields since we use Stripe Checkout
        // Card details are entered on Stripe's secure page, not our form
        const cardFields = ['cardNumber', 'expiryDate', 'cvv', 'cardName', 'cardNameManual'];
        cardFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.removeAttribute('required');
                // Also set aria-required to false for accessibility
                field.setAttribute('aria-required', 'false');
            }
        });
        console.log('[CheckoutUI] Removed required attributes from card fields (using Stripe Checkout)');
    }
    
    async initializePaymentService() {
        try {
            await paymentService.initializeStripe();
            this.paymentServiceInitialized = true;
            console.log('[CheckoutUI] Payment service initialized:', paymentService.getProviderName());
            
            if (paymentService.getProviderName() === 'Stripe') {
                await this.initializeStripeElements();
            }
        } catch (error) {
            console.error('[CheckoutUI] Failed to initialize payment service:', error);
            this.paymentServiceInitialized = false;
        }
    }

    async initializeStripeElements() {
        try {
            if (!window.Stripe) {
                throw new Error('Stripe.js not loaded');
            }

            const stripePublishableKey = window.STRIPE_PUBLISHABLE_KEY;
            if (!stripePublishableKey || !stripePublishableKey.startsWith('pk_')) {
                console.warn('[CheckoutUI] No valid Stripe key found, Stripe Elements not initialized');
                return;
            }

            this.stripe = window.Stripe(stripePublishableKey);
            
            const elementStyles = {
                base: {
                    fontSize: '16px',
                    color: '#1f2937',
                    fontFamily: 'Arial, sans-serif',
                    '::placeholder': {
                        color: '#9ca3af'
                    },
                    iconColor: '#6b7280',
                    lineHeight: '48px'
                },
                invalid: {
                    color: '#ef4444',
                    iconColor: '#ef4444'
                }
            };

            this.stripeElements = this.stripe.elements({
                locale: 'it'
            });

            this.cardElement = this.stripeElements.create('card', {
                style: elementStyles,
                hidePostalCode: true
            });

            const cardElementContainer = document.getElementById('card-element');
            if (cardElementContainer) {
                this.cardElement.mount('#card-element');
                console.log('[CheckoutUI] Stripe Card Element mounted');

                this.cardElement.on('change', (event) => {
                    this.handleCardElementChange(event);
                });

                this.hideManualCardInputs();
            }
        } catch (error) {
            console.error('[CheckoutUI] Failed to initialize Stripe Elements:', error);
            this.showFallbackCardInputs();
        }
    }

    hideManualCardInputs() {
        const manualInputs = document.getElementById('manual-card-inputs');
        if (manualInputs) {
            manualInputs.style.display = 'none';
        }

        const cardElementWrapper = document.getElementById('card-element-wrapper');
        if (cardElementWrapper) {
            cardElementWrapper.style.display = 'block';
        }
    }

    showFallbackCardInputs() {
        const manualInputs = document.getElementById('manual-card-inputs');
        if (manualInputs) {
            manualInputs.style.display = 'block';
            this.setupCardFormatting();
        }

        const cardElementWrapper = document.getElementById('card-element-wrapper');
        if (cardElementWrapper) {
            cardElementWrapper.style.display = 'none';
        }
    }

    handleCardElementChange(event) {
        const cardErrors = document.getElementById('card-errors');
        if (cardErrors) {
            if (event.error) {
                cardErrors.textContent = event.error.message;
                cardErrors.classList.add('show');
            } else {
                cardErrors.textContent = '';
                cardErrors.classList.remove('show');
            }
        }

        const cardTypeIcon = document.getElementById('cardTypeIcon');
        if (cardTypeIcon && event.brand) {
            this.updateCardBrandIcon(event.brand, cardTypeIcon);
        }
    }

    updateCardBrandIcon(brand, iconElement) {
        const brandMap = {
            'visa': 'fab fa-cc-visa visa',
            'mastercard': 'fab fa-cc-mastercard mastercard',
            'amex': 'fab fa-cc-amex amex',
            'discover': 'fab fa-cc-discover',
            'diners': 'fab fa-cc-diners-club',
            'jcb': 'fab fa-cc-jcb',
            'unknown': 'fas fa-credit-card'
        };

        iconElement.className = `card-type-icon ${brandMap[brand] || brandMap['unknown']}`;
    }

    loadCart() {
        const saved = secureStorage.getItem('oliodiValeriaCart');
        return saved || [];
    }

    calculateShipping(subtotal, country) {
        const euCountries = [
            'FR', 'DE', 'ES', 'AT', 'BE', 'NL', 'PT', 'GR', 'PL', 
            'SE', 'DK', 'FI', 'IE', 'CZ', 'HU', 'RO', 'BG', 'HR', 
            'SK', 'SI', 'LT', 'LV', 'EE', 'LU', 'MT', 'CY',
            'CH', 'NO', 'GB'
        ];
        
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

    loadOrderSummary() {
        const orderItemsContainer = document.getElementById('orderItems');
        
        const t = (key, fallback) => (typeof window.translate === 'function') ? window.translate(key, fallback) : fallback;

        if (this.cart.length === 0) {
            orderItemsContainer.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #6b7280;">
                    <i class="fas fa-shopping-cart" style="font-size: 3rem; margin-bottom: 16px;"></i>
                    <p>${t('chk_cart_empty', 'Il carrello è vuoto')}</p>
                    <a href="shop.html" style="color: #eab308; text-decoration: none;">${t('chk_go_shop', 'Vai al Shop')}</a>
                </div>
            `;
            return;
        }

        orderItemsContainer.innerHTML = this.cart.map(item => `
            <div class="order-item">
                <div class="item-image">
                    <img src="${escapeHtml(item.image || '/api/placeholder/60/80')}" 
                         alt="${escapeHtml(item.name)}" 
                         style="width: 40px; height: 60px; object-fit: cover; border-radius: 4px;"
                         onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-block';">
                    <i class="fas fa-wine-bottle" style="color: #eab308; font-size: 24px; display: none;"></i>
                </div>
                <div class="item-details">
                    <div class="item-name">${escapeHtml(item.name)}</div>
                    <div class="item-size">${escapeHtml(item.size)}</div>
                    <div class="item-quantity">${t('chk_qty', 'Quantità')}: ${escapeHtml(item.quantity.toString())}</div>
                </div>
                <div class="item-price">€${escapeHtml((item.price * item.quantity).toFixed(2))}</div>
            </div>
        `).join('');

        this.updateTotals();
    }

    updateTotals() {
        const subtotal = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const shipping = this.calculateShipping(subtotal, this.selectedCountry);
        const total = subtotal + shipping;

        const t = (key, fallback) => (typeof window.translate === 'function') ? window.translate(key, fallback) : fallback;
        document.getElementById('subtotal').textContent = `€${subtotal.toFixed(2)}`;
        document.getElementById('shipping').textContent = shipping === 0 ? t('chk_shipping_free', 'Gratuita') : `€${shipping.toFixed(2)}`;
        document.getElementById('tax').textContent = t('chk_tax_included', 'Inclusa');
        document.getElementById('finalTotal').textContent = `€${total.toFixed(2)}`;
    }

    bindEvents() {
        const countrySelect = document.getElementById('country');
        if (countrySelect) {
            countrySelect.addEventListener('change', (e) => {
                this.selectedCountry = e.target.value;
                this.toggleCustomCountryInput(e.target.value);
                this.updateTotals();
            });
        }

        document.querySelectorAll('.payment-method').forEach(method => {
            method.addEventListener('click', this.handlePaymentMethodChange.bind(this));
        });

        const checkoutForm = document.getElementById('checkout-form');
        
        if (checkoutForm) {
            addCSRFTokenToForm(checkoutForm);
        }

        const firstNameInput = document.getElementById('firstName');
        const lastNameInput = document.getElementById('lastName');
        const cardNameInputs = document.querySelectorAll('input[name="cardName"]');

        if (firstNameInput && lastNameInput && cardNameInputs.length > 0) {
            [firstNameInput, lastNameInput].forEach(input => {
                input.addEventListener('input', () => {
                    const firstName = firstNameInput.value.trim();
                    const lastName = lastNameInput.value.trim();
                    if (firstName && lastName) {
                        const cardNameValue = `${firstName} ${lastName}`.toUpperCase();
                        cardNameInputs.forEach(cardInput => {
                            cardInput.value = cardNameValue;
                        });
                    }
                });
            });
        }
    }

    async handlePaymentMethodChange(e) {
        document.querySelectorAll('.payment-method').forEach(method => {
            method.classList.remove('selected');
        });

        e.currentTarget.classList.add('selected');

        const cardForm = document.getElementById('cardPaymentForm');
        const bankTransferInfo = document.getElementById('bankTransferInfo');
        const sepaForm = document.getElementById('sepaPaymentForm');
        const method = e.currentTarget.dataset.method;
        
        const cardFields = ['cardNumber', 'expiryDate', 'cvv', 'cardName', 'cardNameManual'];
        const sepaFields = ['sepaIban', 'sepaAccountHolder'];
        
        // Update required attributes for card fields (not required for Stripe Checkout)
        cardFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                // Remove required attribute for Stripe Checkout (card details entered on Stripe page)
                field.removeAttribute('required');
            }
        });
        
        // Update required attributes for SEPA fields
        sepaFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                if (method === 'sepa') {
                    field.setAttribute('required', 'required');
                } else {
                    field.removeAttribute('required');
                }
            }
        });
        
        // Show/hide appropriate payment form sections
        if (method === 'card') {
            cardForm.style.display = 'block';
            bankTransferInfo.style.display = 'none';
            if (sepaForm) sepaForm.style.display = 'none';
            // Hide card input fields for Stripe Checkout
            this.toggleCardFieldsForPaymentMethod(method);
        } else if (method === 'bank') {
            cardForm.style.display = 'none';
            bankTransferInfo.style.display = 'block';
            if (sepaForm) sepaForm.style.display = 'none';
        } else if (method === 'sepa') {
            cardForm.style.display = 'none';
            bankTransferInfo.style.display = 'none';
            if (sepaForm) sepaForm.style.display = 'block';
        } else {
            // For PayPal, Apple Pay, Google Pay - hide all form sections
            cardForm.style.display = 'none';
            bankTransferInfo.style.display = 'none';
            if (sepaForm) sepaForm.style.display = 'none';
            
            // Show placeholder message for unimplemented methods
            if (method === 'paypal' || method === 'apple' || method === 'google') {
                this.showPaymentMethodPlaceholder(method);
            }
        }
        
        if (this.paymentServiceInitialized) {
            try {
                const result = await paymentService.handlePaymentMethodSelection(method);
                
                // If method is not yet implemented, show message
                if (result && result.implemented === false) {
                    this.showPaymentMethodMessage(result.message || `${method} coming soon`);
                }
            } catch (error) {
                console.error('[CheckoutUI] Error handling payment method selection:', error);
            }
        }
    }
    
    toggleCardFieldsForPaymentMethod(paymentMethod) {
        const cardElementWrapper = document.getElementById('card-element-wrapper');
        const manualCardInputs = document.getElementById('manual-card-inputs');
        const cardInfoMessage = document.getElementById('stripe-checkout-info');
        
        if (paymentMethod === 'card' || paymentMethod === 'debit') {
            // Hide card inputs, show Stripe Checkout info
            if (cardElementWrapper) cardElementWrapper.style.display = 'none';
            if (manualCardInputs) manualCardInputs.style.display = 'none';
            if (cardInfoMessage) cardInfoMessage.style.display = 'block';
        } else {
            // Show card inputs for other methods (if needed)
            if (cardElementWrapper) cardElementWrapper.style.display = 'block';
            if (manualCardInputs) manualCardInputs.style.display = 'block';
            if (cardInfoMessage) cardInfoMessage.style.display = 'none';
        }
    }

    showPaymentMethodPlaceholder(method) {
        const methodNames = {
            'paypal': 'PayPal',
            'apple': 'Apple Pay',
            'google': 'Google Pay'
        };
        
        const existingPlaceholder = document.getElementById('paymentMethodPlaceholder');
        if (existingPlaceholder) {
            existingPlaceholder.remove();
        }
        
        const t = (key, fallback) => (typeof window.translate === 'function') ? window.translate(key, fallback) : fallback;
        const placeholder = document.createElement('div');
        placeholder.id = 'paymentMethodPlaceholder';
        placeholder.innerHTML = `
            <div style="background: linear-gradient(135deg, #fef3c7, #fde68a); border: 2px solid #fbbf24; border-radius: 12px; padding: 20px; margin-top: 20px; text-align: center;">
                <i class="fas fa-info-circle" style="font-size: 24px; color: #f59e0b; margin-bottom: 12px;"></i>
                <h3 style="color: #92400e; font-size: 18px; font-weight: 700; margin-bottom: 8px;">
                    ${methodNames[method] || method} - ${t('chk_coming_soon', 'Prossimamente Disponibile')}
                </h3>
                <p style="color: #92400e; font-size: 14px; margin: 0;">
                    ${t('chk_method_msg', 'Stiamo lavorando per integrare questo metodo di pagamento. Per ora, utilizza carta di credito o bonifico bancario.')}
                </p>
            </div>
        `;
        
        const paymentSection = document.querySelector('.form-section:has(.payment-methods)');
        if (paymentSection) {
            paymentSection.appendChild(placeholder);
        }
    }
    
    showPaymentMethodMessage(message) {
        if (typeof window.showMessage === 'function') {
            window.showMessage('info', message);
        } else {
            console.info('[CheckoutUI]', message);
        }
    }

    toggleCustomCountryInput(countryValue) {
        const customCountryGroup = document.getElementById('customCountryGroup');
        const customCountryInput = document.getElementById('customCountry');
        
        if (countryValue === 'OTHER') {
            customCountryGroup.style.display = 'block';
            customCountryInput.setAttribute('required', 'required');
        } else {
            customCountryGroup.style.display = 'none';
            customCountryInput.removeAttribute('required');
            customCountryInput.value = '';
        }
    }

    setupFormValidation() {
        const form = document.getElementById('checkout-form');
        if (!form) {
            console.error('[CheckoutUI] Cannot setup validation: form #checkout-form not found');
            return;
        }
        
        const inputs = form.querySelectorAll('.form-input[required]');

        inputs.forEach(input => {
            input.addEventListener('blur', () => this.validateField(input));
            input.addEventListener('input', () => this.clearFieldError(input));
        });
    }

    validateField(field) {
        const value = field.value.trim();
        let isValid = true;
        let errorMessage = '';

        const selectedPaymentMethod = this.getSelectedPaymentMethod();
        const cardFieldIds = ['cardNumber', 'expiryDate', 'cvv', 'cardName', 'cardNameManual'];
        const sepaFieldIds = ['sepaIban', 'sepaAccountHolder'];
        
        // Skip validation for card fields if not using card payment
        if ((selectedPaymentMethod === 'bank' || selectedPaymentMethod === 'sepa') && cardFieldIds.includes(field.id)) {
            return true;
        }
        
        // Skip validation for SEPA fields if not using SEPA payment
        if (selectedPaymentMethod !== 'sepa' && sepaFieldIds.includes(field.id)) {
            return true;
        }

        const t = (key, fallback) => (typeof window.translate === 'function') ? window.translate(key, fallback) : fallback;

        if (field.hasAttribute('required') && !value) {
            isValid = false;
            errorMessage = t('chk_field_required', 'Questo campo è obbligatorio');
        }

        switch (field.type) {
            case 'email':
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (value && !emailRegex.test(value)) {
                    isValid = false;
                    errorMessage = t('chk_invalid_email', "Inserisci un'email valida");
                }
                break;
            case 'tel':
                const phoneRegex = /^[\+]?[0-9\s\-()]{8,}$/;
                if (value && !phoneRegex.test(value)) {
                    isValid = false;
                    errorMessage = t('chk_invalid_phone', 'Inserisci un numero di telefono valido');
                }
                break;
        }

        if (field.id === 'cardNumber' && !this.cardElement) {
            const cardRegex = /^[0-9\s]{13,19}$/;
            if (value && !cardRegex.test(value.replace(/\s/g, ''))) {
                isValid = false;
                errorMessage = t('chk_invalid_card', 'Inserisci un numero di carta valido');
            }
        }

        if (field.id === 'expiryDate' && !this.cardElement) {
            const expiryRegex = /^(0[1-9]|1[0-2])\/([0-9]{2})$/;
            if (value && !expiryRegex.test(value)) {
                isValid = false;
                errorMessage = t('chk_invalid_expiry', 'Formato: MM/AA');
            } else if (value) {
                const [month, year] = value.split('/');
                const expiry = new Date(2000 + parseInt(year), parseInt(month) - 1);
                const now = new Date();
                if (expiry < now) {
                    isValid = false;
                    errorMessage = t('chk_card_expired', 'La carta è scaduta');
                }
            }
        }

        if (field.id === 'cvv' && !this.cardElement) {
            const cvvRegex = /^[0-9]{3,4}$/;
            if (value && !cvvRegex.test(value)) {
                isValid = false;
                errorMessage = t('chk_invalid_cvv', 'CVV non valido');
            }
        }
        
        if (field.id === 'sepaIban') {
            // Basic IBAN validation (can be enhanced)
            const ibanRegex = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{1,30}$/;
            const cleanIban = value.replace(/\s/g, '').toUpperCase();
            if (value && !ibanRegex.test(cleanIban)) {
                isValid = false;
                errorMessage = t('chk_invalid_iban', 'Inserisci un IBAN valido');
            }
        }
        
        if (field.id === 'sepaAccountHolder') {
            if (value && value.length < 2) {
                isValid = false;
                errorMessage = t('chk_invalid_holder', 'Il nome del titolare deve contenere almeno 2 caratteri');
            }
        }
        
        if (field.id === 'customCountry' && field.required && !value) {
            isValid = false;
            errorMessage = t('chk_invalid_country', 'Inserisci il nome del paese');
        }

        this.showFieldError(field, isValid, errorMessage);
        return isValid;
    }

    showFieldError(field, isValid, message) {
        const errorElement = field.parentNode.querySelector('.error-message');
        
        if (isValid) {
            field.classList.remove('error');
            errorElement.classList.remove('show');
        } else {
            field.classList.add('error');
            errorElement.textContent = message;
            errorElement.classList.add('show');
        }
    }

    clearFieldError(field) {
        field.classList.remove('error');
        const errorElement = field.parentNode.querySelector('.error-message');
        errorElement.classList.remove('show');
    }

    setupCardFormatting() {
        const cardNumberInput = document.getElementById('cardNumber');
        const expiryInput = document.getElementById('expiryDate');
        const cvvInput = document.getElementById('cvv');
        const cardTypeIcon = document.getElementById('cardTypeIcon');

        if (!cardNumberInput || !expiryInput || !cvvInput) {
            return;
        }

        cardNumberInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\s/g, '');
            let formattedValue = value.replace(/(.{4})/g, '$1 ').trim();
            
            if (formattedValue.length > 19) {
                formattedValue = formattedValue.substring(0, 19);
            }
            
            e.target.value = formattedValue;
            this.detectCardType(value, cardTypeIcon);
        });

        expiryInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, '');
            if (value.length >= 2) {
                value = value.substring(0, 2) + '/' + value.substring(2, 4);
            }
            e.target.value = value;
        });

        cvvInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/\D/g, '');
        });
    }

    detectCardType(cardNumber, iconElement) {
        const firstDigit = cardNumber.charAt(0);
        const firstTwoDigits = cardNumber.substring(0, 2);

        if (firstDigit === '4') {
            iconElement.className = 'card-type-icon fab fa-cc-visa visa';
        } else if (['51', '52', '53', '54', '55'].includes(firstTwoDigits) || 
                  (parseInt(firstTwoDigits) >= 22 && parseInt(firstTwoDigits) <= 27)) {
            iconElement.className = 'card-type-icon fab fa-cc-mastercard mastercard';
        } else if (['34', '37'].includes(firstTwoDigits)) {
            iconElement.className = 'card-type-icon fab fa-cc-amex amex';
        } else {
            iconElement.className = 'card-type-icon fas fa-credit-card';
        }
    }

    async validateFirebaseConnection() {
        const connectionState = getConnectionState();
        console.log('[CheckoutUI] Validating Firebase connection, current state:', connectionState);
        
        if (connectionState !== 'connected') {
            console.warn('[CheckoutUI] Firebase not in connected state:', connectionState);
            return {
                connected: false,
                state: connectionState,
                reason: 'Firebase connection state is not "connected"'
            };
        }
        
        try {
            const healthCheck = await checkFirebaseHealth();
            console.log('[CheckoutUI] Firebase health check result:', healthCheck);
            
            if (healthCheck.status !== 'healthy') {
                console.warn('[CheckoutUI] Firebase health check failed:', healthCheck);
                return {
                    connected: false,
                    state: healthCheck.status,
                    reason: 'Firebase health check failed',
                    error: healthCheck.error
                };
            }
            
            if (!healthCheck.services?.firestore) {
                console.warn('[CheckoutUI] Firestore service not available');
                return {
                    connected: false,
                    state: 'service_unavailable',
                    reason: 'Firestore service not initialized'
                };
            }
            
            console.log('[CheckoutUI] ✅ Firebase connection validated successfully');
            return {
                connected: true,
                state: 'connected',
                reason: 'All checks passed'
            };
        } catch (error) {
            console.error('[CheckoutUI] Firebase health check threw error:', error);
            return {
                connected: false,
                state: 'error',
                reason: 'Health check threw exception',
                error: error.message
            };
        }
    }

    async handleFormSubmit(e) {
        console.log('[CheckoutUI] handleFormSubmit called');
        e.preventDefault();
        e.stopPropagation();
        
        // Ensure card fields don't have required attributes (for Stripe Checkout)
        // This prevents browser native validation errors on hidden fields
        this.removeCardFieldRequirements();
        
        const selectedPaymentMethod = this.getSelectedPaymentMethod();
        console.log('[CheckoutUI] Selected payment method:', selectedPaymentMethod);
        
        const tSubmit = (key, fallback) => (typeof window.translate === 'function') ? window.translate(key, fallback) : fallback;
        // Block unimplemented payment methods from submitting
        if (['paypal', 'apple', 'google'].includes(selectedPaymentMethod)) {
            this.showPaymentMethodPlaceholder(selectedPaymentMethod);
            await this.showOrderError(new Error(tSubmit('chk_not_available', 'Metodo di pagamento non ancora disponibile. Seleziona carta o bonifico.')));
            return;
        }
        
        const form = e.target;
        let fieldsToValidate;
        
        const cardFieldIds = ['cardNumber', 'expiryDate', 'cvv', 'cardName', 'cardNameManual'];
        const sepaFieldIds = ['sepaIban', 'sepaAccountHolder'];
        
        // Determine which fields to validate based on payment method
        if (selectedPaymentMethod === 'bank') {
            // Bank transfer: exclude card and SEPA fields
            fieldsToValidate = Array.from(form.querySelectorAll('.form-input[required]')).filter(field => {
                return !cardFieldIds.includes(field.id) && !sepaFieldIds.includes(field.id);
            });
        } else if (selectedPaymentMethod === 'sepa') {
            // SEPA: exclude card fields but include SEPA fields
            fieldsToValidate = Array.from(form.querySelectorAll('.form-input[required]')).filter(field => {
                return !cardFieldIds.includes(field.id);
            });
            // Add SEPA fields explicitly
            const sepaIbanField = form.querySelector('#sepaIban');
            const sepaHolderField = form.querySelector('#sepaAccountHolder');
            if (sepaIbanField) fieldsToValidate.push(sepaIbanField);
            if (sepaHolderField) fieldsToValidate.push(sepaHolderField);
        } else if (selectedPaymentMethod === 'card' || selectedPaymentMethod === 'debit') {
            // Card payment: exclude SEPA fields
            fieldsToValidate = Array.from(form.querySelectorAll('.form-input[required]')).filter(field => {
                return !sepaFieldIds.includes(field.id);
            });
        } else {
            // Other methods: validate all except card and SEPA
            fieldsToValidate = Array.from(form.querySelectorAll('.form-input[required]')).filter(field => {
                return !cardFieldIds.includes(field.id) && !sepaFieldIds.includes(field.id);
            });
        }
        
        console.log('[CheckoutUI] Validating', fieldsToValidate.length, 'fields');
        
        let isFormValid = true;
        const invalidFields = [];
        fieldsToValidate.forEach(field => {
            if (!this.validateField(field)) {
                isFormValid = false;
                invalidFields.push(field.id || field.name || field.type);
            }
        });

        if (!isFormValid) {
            console.error('[CheckoutUI] Form validation failed:', invalidFields);
            const firstError = form.querySelector('.form-input.error');
            if (firstError) {
                firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
                firstError.focus();
            }
            return;
        }
        
        console.log('[CheckoutUI] ✅ Form validation passed');
        
        const basicCheckoutReady = isCheckoutReady();
        console.log('[CheckoutUI] Basic Firebase ready check:', basicCheckoutReady);
        
        const connectionValidation = await this.validateFirebaseConnection();
        console.log('[CheckoutUI] Detailed connection validation:', connectionValidation);
        
        if (!connectionValidation.connected) {
            console.error('[CheckoutUI] Firebase connection validation failed:', {
                basicCheckReady: basicCheckoutReady,
                validationState: connectionValidation.state,
                validationReason: connectionValidation.reason,
                validationError: connectionValidation.error
            });
            
            if (basicCheckoutReady && !connectionValidation.connected) {
                console.warn('[CheckoutUI] ⚠️ FALSE POSITIVE DETECTED: Basic check passed but detailed validation failed');
                console.warn('[CheckoutUI] This indicates a potential race condition or incomplete initialization');
            }
            
            const tConn = (key, fallback) => (typeof window.translate === 'function') ? window.translate(key, fallback) : fallback;
            this.showOrderError(new Error(tConn('chk_pay_unavailable', 'Sistema di pagamento non disponibile. Ricarica la pagina e riprova.')));
            return;
        }
        
        console.log('[CheckoutUI] ✅ Firebase connection validated, processing payment');
        
        // Build FormData before disabling inputs (disabled fields are excluded)
        const formData = new FormData(form);
        this.showLoadingState();
        let isRedirecting = false;

        try {
            console.log('[CheckoutUI] Calling processPayment...');
            const result = await this.processPayment(formData);
            
            if (result && result.redirected) {
                isRedirecting = true;
                console.log('[CheckoutUI] Redirecting to Stripe Checkout:', result.url);
                this.scheduleRedirectFallback(result.url);
                return;
            }
            
            console.log('[CheckoutUI] ✅ Payment processed successfully:', result);
            secureStorage.removeItem('oliodiValeriaCart');
            this.showSuccessModal(result);
        } catch (error) {
            console.error('[CheckoutUI] ❌ Payment processing failed:', {
                errorMessage: error.message,
                errorCode: error.code,
                errorStack: error.stack,
                errorType: error.constructor.name,
                timestamp: new Date().toISOString()
            });
            
            const postErrorConnectionState = await this.validateFirebaseConnection();
            console.log('[CheckoutUI] Connection state after error:', postErrorConnectionState);
            
            await this.showOrderError(error);
        } finally {
            if (!isRedirecting) {
                this.hideLoadingState();
            }
        }
    }

    scheduleRedirectFallback(redirectUrl) {
        const tR = (key, fallback) => (typeof window.translate === 'function') ? window.translate(key, fallback) : fallback;
        setTimeout(() => {
            const stillOnCheckout = window.location.pathname.includes('checkout');
            if (!stillOnCheckout) {
                return;
            }
            
            console.warn('[CheckoutUI] Stripe Checkout redirect did not occur');
            this.hideLoadingState();
            this.showOrderError(new Error(tR('chk_no_redirect', 'Impossibile aprire la pagina di pagamento. Riprova.')));
        }, 2000);
    }

    showLoadingState() {
        const submitBtn = document.getElementById('submitBtn');
        const spinner = submitBtn.querySelector('.loading-spinner');
        const btnText = submitBtn.querySelector('.btn-text');
        
        const t = (key, fallback) => (typeof window.translate === 'function') ? window.translate(key, fallback) : fallback;
        submitBtn.disabled = true;
        submitBtn.classList.add('btn-loading');
        spinner.style.display = 'inline-block';
        btnText.textContent = t('chk_processing', 'Elaborazione ordine...');

        const form = document.getElementById('checkout-form');
        const loadingOverlay = document.createElement('div');
        loadingOverlay.id = 'checkoutLoadingOverlay';
        loadingOverlay.innerHTML = `
            <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(255, 255, 255, 0.9); display: flex; align-items: center; justify-content: center; z-index: 100; border-radius: 20px; backdrop-filter: blur(2px);">
                <div style="text-align: center;">
                    <div class="loading-spinner" style="width: 40px; height: 40px; border: 4px solid #e5e7eb; border-top: 4px solid #eab308; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 16px;"></div>
                    <div style="color: #6b7280; font-weight: 600;">${t('chk_loading_msg', 'Elaborazione ordine in corso...')}</div>
                    <div style="color: #9ca3af; font-size: 14px; margin-top: 8px;">${t('chk_no_refresh', 'Non aggiornare la pagina')}</div>
                </div>
            </div>
        `;
        form.style.position = 'relative';
        form.appendChild(loadingOverlay);

        const inputs = form.querySelectorAll('input, select, textarea, button');
        inputs.forEach(input => input.disabled = true);
    }

    hideLoadingState() {
        const submitBtn = document.getElementById('submitBtn');
        const spinner = submitBtn.querySelector('.loading-spinner');
        const btnText = submitBtn.querySelector('.btn-text');
        
        submitBtn.disabled = false;
        submitBtn.classList.remove('btn-loading');
        spinner.style.display = 'none';
        const t2 = (key, fallback) => (typeof window.translate === 'function') ? window.translate(key, fallback) : fallback;
        btnText.textContent = t2('chk_complete_order', 'Completa Ordine Sicuro');

        const loadingOverlay = document.getElementById('checkoutLoadingOverlay');
        if (loadingOverlay) {
            loadingOverlay.remove();
        }

        const form = document.getElementById('checkout-form');
        const inputs = form.querySelectorAll('input, select, textarea, button');
        inputs.forEach(input => input.disabled = false);
    }

    async showOrderError(error) {
        const t = (key, fallback) => (typeof window.translate === 'function') ? window.translate(key, fallback) : fallback;
        let errorTitle = t('chk_err_title', 'Errore Elaborazione Ordine');
        let errorMessage = error.message || 'Si è verificato un errore imprevisto. Riprova.';
        let errorIcon = 'fas fa-exclamation-triangle';
        let errorColor = '#ef4444';
        let errorDetails = '';
        let showRetry = false;
        let contactSupport = true;
        const debugEnabled = new URLSearchParams(window.location.search).has('debug');
        const debugInfo = debugEnabled ? {
            message: error?.message || String(error),
            code: error?.code || 'n/a',
            name: error?.name || 'Error',
            stack: error?.stack || 'n/a'
        } : null;

        const isNetworkRelated = error.message.includes('network') || 
                                 error.message.includes('fetch') || 
                                 error.message.includes('connessione');
        
        if (isNetworkRelated) {
            const connectionValidation = await this.validateFirebaseConnection();
            console.log('[CheckoutUI] Connection error reported, validating connection state:', connectionValidation);
            
            if (connectionValidation.connected) {
                console.warn('[CheckoutUI] ⚠️ FALSE POSITIVE: Network error reported but Firebase connection is healthy');
                console.warn('[CheckoutUI] Error may be from payment service or other non-Firebase source');
                
                errorTitle = t('chk_err_proc_title', 'Errore di Elaborazione');
                errorMessage = t('chk_err_proc_msg', "Si è verificato un problema durante l'elaborazione del pagamento.");
                errorIcon = 'fas fa-exclamation-circle';
                errorDetails = t('chk_err_proc_details', "Il sistema è connesso ma si è verificato un errore. Riprova o contatta l'assistenza se il problema persiste.");
                showRetry = true;
            } else {
                console.log('[CheckoutUI] ✅ Confirmed connection issue, showing connection error');
                errorTitle = t('chk_err_conn_title', 'Errore di Connessione');
                errorMessage = t('chk_err_conn_msg', "Impossibile completare l'ordine. Controlla la tua connessione internet e riprova.");
                errorIcon = 'fas fa-wifi';
                errorDetails = t('chk_err_conn_details', 'Verifica che il tuo dispositivo sia connesso a internet e che non ci siano problemi con il firewall o VPN.');
                showRetry = true;
            }
        } else if (error.code === 'permission-denied' || error.message.includes('permission-denied')) {
            errorTitle = t('chk_err_sys_title', 'Problema Temporaneo del Sistema');
            errorMessage = t('chk_err_sys_msg', "Al momento non è possibile completare l'ordine a causa di un problema tecnico temporaneo.");
            errorIcon = 'fas fa-lock';
            errorDetails = t('chk_err_sys_details', 'Stiamo lavorando per risolvere il problema. Ti preghiamo di riprovare tra qualche minuto o di contattarci per assistenza diretta.');
            showRetry = true;
        }

        const errorDiv = document.createElement('div');
        errorDiv.className = 'order-error';
        errorDiv.innerHTML = `
            <div style="background: linear-gradient(135deg, #fef2f2, #fee2e2); border: 2px solid #fecaca; border-left: 6px solid ${errorColor}; border-radius: 12px; padding: 20px; margin: 20px 0; color: #991b1b; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.15); animation: slideInFromLeft 0.5s ease-out;">
                <div style="display: flex; align-items: flex-start; gap: 16px;">
                    <i class="${errorIcon}" style="font-size: 24px; color: ${errorColor}; margin-top: 4px; flex-shrink: 0;"></i>
                    <div style="flex: 1;">
                        <div style="font-weight: 700; font-size: 16px; margin-bottom: 8px; color: #7c2d12;">${errorTitle}</div>
                        <p style="margin: 0 0 8px 0; line-height: 1.5; color: #7c2d12; font-weight: 600;">${errorMessage}</p>
                        ${errorDetails ? `<p style="margin: 0 0 12px 0; line-height: 1.5; color: #92400e; font-size: 14px;">${errorDetails}</p>` : ''}
                        ${showRetry ? `<button id="retryOrderBtn" style="background: #eab308; color: #000; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer; margin-top: 8px; font-size: 14px; transition: all 0.3s ease;"><i class="fas fa-redo"></i> ${t('chk_retry_btn', 'Riprova Ora')}</button>` : ''}
                        ${debugInfo ? `<details style="margin-top: 12px; background: #fff7ed; border: 1px dashed #f59e0b; padding: 10px; border-radius: 8px; color: #92400e;">
                            <summary style="cursor: pointer; font-weight: 600;">Debug info</summary>
                            <div style="margin-top: 8px; font-size: 12px; line-height: 1.4;">
                                <div><strong>name:</strong> ${debugInfo.name}</div>
                                <div><strong>code:</strong> ${debugInfo.code}</div>
                                <div><strong>message:</strong> ${debugInfo.message}</div>
                                <div><strong>stack:</strong> <pre style="white-space: pre-wrap; margin: 6px 0 0;">${debugInfo.stack}</pre></div>
                            </div>
                        </details>` : ''}
                        ${contactSupport ? `<div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid #fecaca; font-size: 14px; color: #92400e;"><p style="margin: 0 0 8px 0; font-weight: 600;"><i class="fas fa-life-ring"></i> ${t('chk_support_title', 'Hai bisogno di assistenza?')}</p><p style="margin: 0;">📧 Email: <a href="mailto:info@oliodivaleria.it" style="color: #b45309; text-decoration: underline; font-weight: 600;">info@oliodivaleria.it</a></p></div>` : ''}
                    </div>
                </div>
            </div>
        `;
        
        const existingError = document.querySelector('.order-error');
        if (existingError) {
            existingError.remove();
        }
        
        const form = document.getElementById('checkout-form') || document.getElementById('checkoutForm');
        if (form && form.parentNode) {
            form.parentNode.insertBefore(errorDiv, form);
        } else {
            console.warn('[CheckoutUI] Could not find checkout form to attach error message');
            const container = document.querySelector('.checkout-form') || document.querySelector('main') || document.body;
            container.appendChild(errorDiv);
        }
        
        if (showRetry) {
            const retryBtn = document.getElementById('retryOrderBtn');
            if (retryBtn) {
                retryBtn.addEventListener('click', () => {
                    errorDiv.remove();
                    const submitBtn = document.getElementById('submitBtn');
                    submitBtn.click();
                });
            }
        }
        
        errorDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        setTimeout(() => {
            errorDiv.style.animation = 'fadeOut 0.5s ease-out';
            setTimeout(() => errorDiv.remove(), 500);
        }, 20000);
    }

    getCloudFunctionBaseUrl() {
        let baseUrl = 'https://us-central1-l-olio-di-valeria.cloudfunctions.net';
        if (window.ConfigLoader) {
            if (typeof window.ConfigLoader.getCloudFunctionBaseUrl === 'function') {
                baseUrl = window.ConfigLoader.getCloudFunctionBaseUrl();
            } else if (typeof window.ConfigLoader.getApiBaseUrl === 'function') {
                baseUrl = window.ConfigLoader.getApiBaseUrl();
            }
        }
        return baseUrl;
    }

    async createStripeCheckoutSession(orderPayload, orderDocumentId) {
        try {
            const { items, customerInfo, subtotal, shipping, shippingCost, total, orderId } = orderPayload;
            const normalizedShipping = typeof shippingCost === 'number' ? shippingCost : (shipping || 0);

            // Call Cloud Function to create checkout session
            const CLOUD_FUNCTION_BASE_URL = this.getCloudFunctionBaseUrl();
            console.log('[CheckoutUI] Calling createCheckoutSession:', CLOUD_FUNCTION_BASE_URL);
            const response = await fetch(`${CLOUD_FUNCTION_BASE_URL}/createCheckoutSession`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    items: items,
                    customerInfo: customerInfo,
                    subtotal: subtotal,
                    shippingCost: normalizedShipping,
                    total: total,
                    orderId: orderId,
                    orderDocumentId: orderDocumentId
                })
            });

            console.log('[CheckoutUI] createCheckoutSession response:', response.status);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                const debugEnabled = new URLSearchParams(window.location.search).has('debug');
                const errorText = debugEnabled
                    ? (errorData.message || errorData.error || 'Errore durante la creazione della sessione')
                    : (errorData.error || errorData.message || 'Errore durante la creazione della sessione');
                throw new Error(`${errorText} (status ${response.status})`);
            }

            const data = await response.json();
            console.log('[CheckoutUI] createCheckoutSession response data:', {
                success: data.success,
                hasUrl: !!data.url,
                hasSessionId: !!data.sessionId,
                hasOrderId: !!data.orderId,
                error: data.error,
                fullData: data
            });
            
            if (data.success && (data.url || data.sessionId)) {
                console.log('[CheckoutUI] ✅ Stripe Checkout session created successfully:', {
                    sessionId: data.sessionId,
                    orderId: data.orderId,
                    url: data.url
                });
                return {
                    success: true,
                    url: data.url,
                    sessionId: data.sessionId,
                    orderId: data.orderId
                };
            } else {
                console.error('[CheckoutUI] ❌ Invalid response from createCheckoutSession:', data);
                const debugEnabled = new URLSearchParams(window.location.search).has('debug');
                const errorText = debugEnabled
                    ? (data.message || data.error || 'Failed to create checkout session - missing URL or success flag')
                    : (data.error || data.message || 'Failed to create checkout session - missing URL or success flag');
                throw new Error(errorText);
            }

        } catch (error) {
            console.error('[CheckoutUI] Error creating Stripe Checkout session:', error);
            return {
                success: false,
                error: error.message || 'Errore durante la creazione della sessione di pagamento'
            };
        }
    }

    async submitCheckoutOrder(orderPayload) {
        const CLOUD_FUNCTION_BASE_URL = this.getCloudFunctionBaseUrl();
        try {
            const response = await fetch(`${CLOUD_FUNCTION_BASE_URL}/submitCheckoutOrder`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(orderPayload)
            });

            if (response.status === 429) {
                const data = await response.json().catch(() => ({ error: 'Too many requests' }));
                const error = new Error(`Rate limit exceeded (429): ${data.error || 'Too many requests'}`);
                error.isRateLimit = true;
                throw error;
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('[CheckoutUI] submitCheckoutOrder response:', data);

            if (!data.success || !data.documentId) {
                throw new Error(data.error || 'Order creation failed - missing documentId');
            }

            return data;
        } catch (error) {
            console.error('[CheckoutUI] Error submitting order via Cloud Function:', error);
            throw error;
        }
    }

    async processPayment(formData) {
        const paymentMethod = this.getSelectedPaymentMethod();
        console.log('[CheckoutUI] processPayment called with payment method:', paymentMethod);
        const cart = this.cart;
        
        if (cart.length === 0) {
            throw new Error('Il carrello è vuoto');
        }

        const subtotal = cart.reduce((total, item) => total + (parseFloat(item.price) * item.quantity), 0);
        const country = formData.get('country') || 'IT';
        const shipping = this.calculateShipping(subtotal, country);
        const totalAmount = subtotal + shipping;
        
        const actualCountry = country === 'OTHER' ? (formData.get('customCountry') || '') : country;
        const orderId = `ODV-${Date.now()}`;
        
        let paymentResult;
        let paymentMethodType = paymentMethod;
        let stripePaymentIntentId = null;
        let stripeCustomerId = null;
        let stripePaymentMethodId = null;
        
        // Map UI method names to payment provider method types
        const methodMapping = {
            'card': 'card',
            'bank': 'bank_transfer',
            'sepa': 'sepa_debit',
            'paypal': 'paypal',
            'apple': 'apple_pay',
            'google': 'google_pay'
        };
        
        const providerMethod = methodMapping[paymentMethod] || paymentMethod;
        
        // Build customer info once to avoid losing data after disabling inputs
        const acceptMarketing = document.getElementById('acceptMarketing');
        const marketingConsent = acceptMarketing && acceptMarketing.checked;
        const acceptTerms = document.getElementById('acceptTerms');
        const termsAccepted = acceptTerms ? acceptTerms.checked : false;

        const firstName = (formData.get('firstName') || '').trim();
        const lastName = (formData.get('lastName') || '').trim();

        const customerInfo = {
            name: `${firstName} ${lastName}`.trim(),
            firstName: firstName,
            lastName: lastName,
            email: formData.get('email'),
            phone: formData.get('phone'),
            company: formData.get('company') || '',
            address: formData.get('address'),
            houseNumber: formData.get('houseNumber'),
            city: formData.get('city'),
            province: formData.get('province') || '',
            postalCode: formData.get('postalCode'),
            country: actualCountry,
            customCountry: formData.get('customCountry') || '',
            notes: formData.get('notes') || '',
            marketingConsent: !!marketingConsent,
            termsAccepted: !!termsAccepted
        };

        const items = cart.map(item => ({
            productId: item.name?.toLowerCase().replace(/\s+/g, '-') || 'product',
            name: item.name || 'Prodotto',
            size: item.size || '',
            quantity: item.quantity || 1,
            price: parseFloat(item.price) || 0,
            totalPrice: (parseFloat(item.price) || 0) * (item.quantity || 1),
            image: item.image || ''
        }));

        // Handle bank transfer separately (no payment processing needed)
        if (paymentMethod === 'bank') {
            const bankDetails = paymentService.getBankTransferDetails();
            paymentResult = {
                success: true,
                status: 'awaiting_payment',
                transactionId: `BT-${Date.now()}-${Math.random().toString(36).substring(7)}`,
                bankDetails: bankDetails
            };
            paymentMethodType = 'bank_transfer';
        } 
        // Handle card payments via Stripe Checkout
        else if (paymentMethod === 'card') {
            // For Stripe Checkout, create a pending order before redirect
            paymentResult = {
                success: true,
                status: 'pending',
                transactionId: null
            };
            paymentMethodType = 'card';
        }
        // Handle other payment methods through payment service
        else {
            if (!this.paymentServiceInitialized) {
                throw new Error('Payment service not initialized');
            }
            
            // Check if method is available
            if (!paymentService.isMethodAvailable(providerMethod)) {
                throw new Error(`Payment method ${paymentMethod} is not available`);
            }
            
            try {
                // Initialize provider for the selected method
                await paymentService.initializeProvider(providerMethod);
                
                const amountInCents = Math.round(totalAmount * 100);
                
                // Create payment intent
                const paymentIntent = await paymentService.createPaymentIntent(
                    amountInCents,
                    'eur',
                    {
                        orderId: orderId,
                        customerEmail: formData.get('email'),
                        customerName: `${formData.get('firstName')} ${formData.get('lastName')}`,
                        paymentMethod: providerMethod
                    }
                );
                
                stripePaymentIntentId = paymentIntent.paymentIntentId;
                this.currentClientSecret = paymentIntent.clientSecret;
                
                const cardNameValues = formData.getAll('cardName').map(value => (value || '').trim());
                const cardNameValue = cardNameValues.find(value => value.length > 0);
                const billingDetails = {
                    name: cardNameValue || `${formData.get('firstName')} ${formData.get('lastName')}`,
                    email: formData.get('email'),
                    phone: formData.get('phone'),
                    address: {
                        line1: formData.get('address'),
                        line2: formData.get('houseNumber'),
                        city: formData.get('city'),
                        state: formData.get('province'),
                        postal_code: formData.get('postalCode'),
                        country: country
                    }
                };
                
                let confirmResult;
                
                // If using Stripe Elements for card payment, handle directly
                if (paymentMethod === 'card' && this.cardElement && this.stripe) {
                    console.log('[CheckoutUI] Confirming payment with Stripe Elements');
                    
                    const { error, paymentIntent: confirmedIntent } = await this.stripe.confirmCardPayment(
                        this.currentClientSecret,
                        {
                            payment_method: {
                                card: this.cardElement,
                                billing_details: billingDetails
                            }
                        }
                    );
                    
                    if (error) {
                        console.error('[CheckoutUI] Stripe payment confirmation error:', error);
                        throw new Error(error.message);
                    }
                    
                    if (confirmedIntent.status === 'requires_action') {
                        console.log('[CheckoutUI] Payment requires additional authentication (3D Secure)');
                        const { error: authError } = await this.stripe.handleCardAction(this.currentClientSecret);
                        
                        if (authError) {
                            throw new Error(authError.message);
                        }
                    }
                    
                    confirmResult = {
                        success: confirmedIntent.status === 'succeeded',
                        status: confirmedIntent.status,
                        transactionId: confirmedIntent.id,
                        paymentMethodId: confirmedIntent.payment_method
                    };
                    
                    stripePaymentMethodId = confirmedIntent.payment_method;
                } else {
                    // Use payment service for other methods
                    console.log('[CheckoutUI] Using payment service for confirmation');
                    
                    // Prepare payment details based on method
                    const paymentDetails = {
                        amount: amountInCents,
                        billingDetails: billingDetails
                    };
                    
                    // Add SEPA-specific details if applicable
                    if (paymentMethod === 'sepa') {
                        paymentDetails.sepaIban = formData.get('sepaIban');
                        paymentDetails.sepaAccountHolder = formData.get('sepaAccountHolder');
                    }
                    
                    confirmResult = await paymentService.confirmPayment(paymentDetails);
                }
                
                if (confirmResult.success) {
                    paymentResult = {
                        success: true,
                        status: confirmResult.paymentIntent?.status === 'processing' ? 'processing' : 'paid',
                        transactionId: confirmResult.transactionId,
                        note: confirmResult.note
                    };
                } else {
                    paymentResult = {
                        success: false,
                        status: 'failed',
                        transactionId: confirmResult.transactionId || `FAILED-${Date.now()}`,
                        error: confirmResult.error
                    };
                }
                
                paymentService.reset();
                
            } catch (error) {
                console.error('[CheckoutUI] Payment processing error:', error);
                paymentResult = {
                    success: false,
                    status: 'failed',
                    transactionId: `ERROR-${Date.now()}`,
                    error: error.message
                };
            }
        }
        
        if (!paymentResult.success) {
            throw new Error(paymentResult.error || 'Payment processing failed');
        }

        const paymentProvider = paymentMethod === 'bank' ? 'Bank Transfer' : (paymentMethod === 'card' ? 'Stripe' : paymentService.getProviderName());
        const orderData = {
            orderId: orderId,
            transactionId: paymentResult.transactionId || null,
            stripePaymentIntentId: stripePaymentIntentId,
            stripeCustomerId: stripeCustomerId,
            stripePaymentMethodId: stripePaymentMethodId,
            customerInfo: customerInfo,
            items: items,
            subtotal: subtotal,
            shipping: shipping,
            shippingCost: shipping,
            total: totalAmount,
            paymentMethod: paymentMethodType,
            paymentStatus: paymentResult.status,
            status: this.determineOrderStatus(paymentMethodType, paymentResult.status),
            paymentProvider: paymentProvider,
            paymentNote: paymentResult.note || null,
            bankDetails: paymentResult.bankDetails || null,
            paymentMetadata: {
                requiresAction: paymentResult.status === 'requires_action',
                authenticationComplete: paymentResult.status === 'succeeded'
            },
            paymentAttempts: [{
                method: paymentMethodType,
                status: paymentResult.status,
                timestamp: new Date().toISOString()
            }],
            source: 'checkout_ui'
        };

        // Create order via Cloud Function (canonical write)
        const submitResult = await this.submitCheckoutOrder(orderData);

        // If card payment, create Stripe Checkout session after order creation
        if (paymentMethod === 'card') {
            console.log('[CheckoutUI] Creating Stripe Checkout session...');
            const checkoutResult = await this.createStripeCheckoutSession(orderData, submitResult.documentId);
            console.log('[CheckoutUI] Checkout session result:', {
                success: checkoutResult.success,
                hasUrl: !!checkoutResult.url,
                hasError: !!checkoutResult.error,
                result: checkoutResult
            });

            if (checkoutResult.success && checkoutResult.url) {
                console.log('[CheckoutUI] ✅ Redirecting to Stripe Checkout:', checkoutResult.url);
                window.location.href = checkoutResult.url;
                return {
                    redirected: true,
                    url: checkoutResult.url,
                    sessionId: checkoutResult.sessionId,
                    orderId: orderId,
                    firestoreDocId: submitResult.documentId
                };
            }

            if (checkoutResult.success && checkoutResult.sessionId) {
                const stripeInstance = this.stripe || (window.Stripe && window.STRIPE_PUBLISHABLE_KEY
                    ? window.Stripe(window.STRIPE_PUBLISHABLE_KEY)
                    : null);
                if (stripeInstance) {
                    console.log('[CheckoutUI] ✅ Redirecting to Stripe Checkout via sessionId:', checkoutResult.sessionId);
                    await stripeInstance.redirectToCheckout({ sessionId: checkoutResult.sessionId });
                    return {
                        redirected: true,
                        sessionId: checkoutResult.sessionId,
                        orderId: orderId,
                        firestoreDocId: submitResult.documentId
                    };
                }
            }

            const errorMsg = checkoutResult.error || 'Failed to create checkout session - no URL or sessionId returned';
            console.error('[CheckoutUI] ❌ Cannot redirect to Stripe:', errorMsg);
            throw new Error(errorMsg);
        }

        return {
            success: paymentResult.success,
            orderId: orderId,
            transactionId: orderData.transactionId,
            firestoreDocId: submitResult.documentId,
            paymentStatus: paymentResult.status,
            orderStatus: orderData.status,
            paymentMethod: paymentMethod
        };
    }

    showSuccessModal(orderResult) {
        const modal = document.getElementById('successModal');
        
        const orderIdSpan = modal.querySelector('.order-id');
        const transactionIdSpan = modal.querySelector('.transaction-id');
        
        if (orderIdSpan) {
            orderIdSpan.textContent = orderResult.orderId;
        }
        if (transactionIdSpan) {
            transactionIdSpan.textContent = orderResult.transactionId;
        }
        
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';

        setTimeout(() => {
            window.location.href = 'index.html';
        }, 8000);
    }

    getSelectedPaymentMethod() {
        const selectedMethod = document.querySelector('.payment-method.selected');
        return selectedMethod ? selectedMethod.dataset.method : 'card';
    }
    
    determineOrderStatus(paymentMethod, paymentStatus) {
        // Bank transfer orders are awaiting payment
        if (paymentMethod === 'bank_transfer') {
            return 'awaiting_payment';
        }
        
        // SEPA payments are processing
        if (paymentMethod === 'sepa_debit' && paymentStatus === 'processing') {
            return 'processing';
        }
        
        // Paid payments are confirmed
        if (paymentStatus === 'paid' || paymentStatus === 'succeeded') {
            return 'paid';
        }
        
        // Processing payments
        if (paymentStatus === 'processing') {
            return 'processing';
        }
        
        // Default to pending
        return 'pending';
    }
}
