/**
 * Cookie Consent Manager
 * Handles user consent for cookies and privacy compliance
 * Uses secure storage for sensitive preference data
 */

// Import secureStorage if using modules, otherwise use fallback
const getSecureStorage = () => {
    if (typeof secureStorage !== 'undefined') {
        return secureStorage;
    }
    // Fallback to localStorage if secureStorage not available
    return {
        getItem: (key) => {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : null;
        },
        setItem: (key, value) => {
            localStorage.setItem(key, JSON.stringify(value));
        },
        removeItem: (key) => localStorage.removeItem(key)
    };
};

class CookieConsent {
    constructor() {
        this.consentKey = 'cookieConsent';
        this.preferencesKey = 'cookiePreferences';
        this.storage = getSecureStorage();
        this.consentData = this.loadConsent();
        this.init();
    }

    init() {
        this.showConsentBannerIfNeeded();
        this.setupEventListeners();
    }

    loadConsent() {
        try {
            // Try to load from secure storage first
            const consentData = this.storage.getItem(this.consentKey);
            
            if (consentData && typeof consentData === 'object') {
                return {
                    given: consentData.given === true,
                    timestamp: consentData.timestamp || Date.now(),
                    preferences: consentData.preferences || {
                        necessary: true,
                        analytics: false,
                        marketing: false,
                        preferences: false
                    }
                };
            }
            
            // Fallback: try old localStorage format for migration
            const consent = localStorage.getItem(this.consentKey);
            const preferences = localStorage.getItem(this.preferencesKey);
            
            if (consent) {
                const data = {
                    given: consent === 'true',
                    timestamp: parseInt(localStorage.getItem(this.consentKey + '_timestamp')) || Date.now(),
                    preferences: preferences ? JSON.parse(preferences) : {
                        necessary: true,
                        analytics: false,
                        marketing: false,
                        preferences: false
                    }
                };
                
                // Migrate to secure storage
                this.storage.setItem(this.consentKey, data);
                
                // Clean up old storage
                localStorage.removeItem(this.consentKey);
                localStorage.removeItem(this.preferencesKey);
                localStorage.removeItem(this.consentKey + '_timestamp');
                
                return data;
            }
            
            return {
                given: false,
                timestamp: Date.now(),
                preferences: {
                    necessary: true,
                    analytics: false,
                    marketing: false,
                    preferences: false
                }
            };
        } catch (error) {
            console.error('Error loading consent data:', error);
            return {
                given: false,
                timestamp: Date.now(),
                preferences: {
                    necessary: true,
                    analytics: false,
                    marketing: false,
                    preferences: false
                }
            };
        }
    }

    saveConsent(given, preferences = null) {
        try {
            this.consentData.given = given;
            this.consentData.timestamp = Date.now();
            
            if (preferences) {
                this.consentData.preferences = { ...this.consentData.preferences, ...preferences };
            }

            // Save to secure storage
            this.storage.setItem(this.consentKey, this.consentData);
            
            // Trigger consent change event
            window.dispatchEvent(new CustomEvent('consentChanged', {
                detail: { consent: this.consentData }
            }));
            
        } catch (error) {
            console.error('Error saving consent data:', error);
        }
    }

    hasConsent(category = 'analytics') {
        return this.consentData.given && this.consentData.preferences[category];
    }

    showConsentBannerIfNeeded() {
        if (!this.consentData.given || this.isConsentExpired()) {
            this.showConsentBanner();
        }
    }

    isConsentExpired() {
        const oneYear = 365 * 24 * 60 * 60 * 1000;
        return Date.now() - this.consentData.timestamp > oneYear;
    }

    showConsentBanner() {
        if (document.getElementById('cookieConsentBanner')) return;

        const banner = document.createElement('div');
        banner.id = 'cookieConsentBanner';
        banner.innerHTML = `
            <style>
                #cookieConsentBanner {
                    position: fixed;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    z-index: 10000;
                    background: linear-gradient(135deg, #000, #374151);
                    color: #fff;
                    box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.3);
                    backdrop-filter: blur(10px);
                }
                .cookie-banner {
                    max-width: 1200px;
                    margin: 0 auto;
                    padding: 20px;
                }
                .cookie-content {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 20px;
                    flex-wrap: wrap;
                }
                .cookie-text h3 {
                    color: #eab308;
                    font-size: 1.25rem;
                    margin-bottom: 8px;
                    font-weight: bold;
                }
                .cookie-text p {
                    color: #d1d5db;
                    font-size: 0.95rem;
                    line-height: 1.5;
                    max-width: 600px;
                }
                .cookie-actions {
                    display: flex;
                    gap: 12px;
                    flex-wrap: wrap;
                }
                .cookie-btn {
                    padding: 10px 20px;
                    border: none;
                    border-radius: 8px;
                    font-weight: 600;
                    font-size: 0.9rem;
                    cursor: pointer;
                    transition: all 0.3s ease;
                }
                .cookie-accept {
                    background: linear-gradient(135deg, #eab308, #f59e0b);
                    color: #000;
                    box-shadow: 0 4px 15px rgba(234, 179, 8, 0.3);
                }
                .cookie-accept:hover {
                    background: linear-gradient(135deg, #f59e0b, #f97316);
                    transform: translateY(-2px);
                }
                .cookie-customize {
                    background: transparent;
                    color: #eab308;
                    border: 2px solid #eab308;
                }
                .cookie-customize:hover {
                    background: rgba(234, 179, 8, 0.1);
                }
                .cookie-decline {
                    background: transparent;
                    color: #9ca3af;
                    border: 2px solid #4b5563;
                }
                .cookie-decline:hover {
                    background: rgba(75, 85, 99, 0.1);
                    color: #d1d5db;
                }
                .cookie-preferences {
                    margin-top: 20px;
                    padding-top: 20px;
                    border-top: 1px solid #374151;
                }
                .cookie-preferences.hidden {
                    display: none;
                }
                .cookie-preferences h4 {
                    color: #eab308;
                    margin-bottom: 16px;
                    font-size: 1.1rem;
                }
                .preference-item {
                    margin-bottom: 16px;
                    display: flex;
                    align-items: flex-start;
                    gap: 12px;
                }
                .preference-item label {
                    display: flex;
                    align-items: flex-start;
                    gap: 12px;
                    cursor: pointer;
                    width: 100%;
                }
                .preference-item input[type="checkbox"] {
                    margin: 0;
                    width: 18px;
                    height: 18px;
                    margin-top: 2px;
                }
                .preference-info {
                    flex: 1;
                }
                .preference-info strong {
                    color: #fff;
                    display: block;
                    margin-bottom: 4px;
                    font-size: 0.95rem;
                }
                .preference-info p {
                    color: #9ca3af;
                    font-size: 0.85rem;
                    line-height: 1.4;
                    margin: 0;
                }
                .preference-actions {
                    margin-top: 16px;
                    display: flex;
                    gap: 12px;
                    flex-wrap: wrap;
                }
                .cookie-cancel {
                    background: transparent;
                    color: #6b7280;
                    border: 2px solid #4b5563;
                }
                .cookie-cancel:hover {
                    background: rgba(75, 85, 99, 0.1);
                    color: #9ca3af;
                }
                @media (max-width: 768px) {
                    .cookie-content {
                        flex-direction: column;
                        text-align: center;
                    }
                    .cookie-actions {
                        width: 100%;
                        justify-content: center;
                    }
                    .cookie-btn {
                        flex: 1;
                        min-width: 100px;
                    }
                    .preference-actions {
                        justify-content: center;
                    }
                }
            </style>
            <div class="cookie-banner">
                <div class="cookie-content">
                    <div class="cookie-text">
                        <h3>Consenso Cookie</h3>
                        <p>Utilizziamo i cookie per migliorare la tua esperienza e analizzare l'utilizzo del sito. Puoi personalizzare le tue preferenze o accettare tutti i cookie.</p>
                    </div>
                    <div class="cookie-actions">
                        <button id="acceptAllCookies" class="cookie-btn cookie-accept">Accetta Tutti</button>
                        <button id="customizeCookies" class="cookie-btn cookie-customize">Personalizza</button>
                        <button id="declineAllCookies" class="cookie-btn cookie-decline">Rifiuta Tutti</button>
                    </div>
                </div>
                <div id="cookiePreferences" class="cookie-preferences hidden">
                    <h4>Preferenze Cookie</h4>
                    <div class="preference-item">
                        <label>
                            <input type="checkbox" id="necessary" checked disabled>
                            <div class="preference-info">
                                <strong>Cookie Necessari</strong>
                                <p>Necessari per il funzionamento base del sito</p>
                            </div>
                        </label>
                    </div>
                    <div class="preference-item">
                        <label>
                            <input type="checkbox" id="analytics">
                            <div class="preference-info">
                                <strong>Cookie Analitici</strong>
                                <p>Ci aiutano a capire come i visitatori interagiscono con il nostro sito web</p>
                            </div>
                        </label>
                    </div>
                    <div class="preference-item">
                        <label>
                            <input type="checkbox" id="marketing">
                            <div class="preference-info">
                                <strong>Cookie di Marketing</strong>
                                <p>Utilizzati per tracciare i visitatori su vari siti web a scopo pubblicitario</p>
                            </div>
                        </label>
                    </div>
                    <div class="preference-item">
                        <label>
                            <input type="checkbox" id="preferences">
                            <div class="preference-info">
                                <strong>Cookie delle Preferenze</strong>
                                <p>Memorizzano le tue impostazioni e preferenze</p>
                            </div>
                        </label>
                    </div>
                    <div class="preference-actions">
                        <button id="savePreferences" class="cookie-btn cookie-accept">Salva Preferenze</button>
                        <button id="cancelPreferences" class="cookie-btn cookie-cancel">Annulla</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(banner);
        this.loadCurrentPreferences();
    }

    loadCurrentPreferences() {
        const preferences = this.consentData.preferences;
        document.getElementById('analytics').checked = preferences.analytics;
        document.getElementById('marketing').checked = preferences.marketing;
        document.getElementById('preferences').checked = preferences.preferences;
    }

    hideConsentBanner() {
        const banner = document.getElementById('cookieConsentBanner');
        if (banner) {
            banner.remove();
        }
    }

    setupEventListeners() {
        document.addEventListener('click', (e) => {
            switch (e.target.id) {
            case 'acceptAllCookies':
                this.acceptAll();
                break;
            case 'declineAllCookies':
                this.declineAll();
                break;
            case 'customizeCookies':
                this.showCustomization();
                break;
            case 'savePreferences':
                this.saveCustomPreferences();
                break;
            case 'cancelPreferences':
                this.hideCustomization();
                break;
            }
        });
    }

    acceptAll() {
        const preferences = {
            necessary: true,
            analytics: true,
            marketing: true,
            preferences: true
        };
        this.saveConsent(true, preferences);
        this.hideConsentBanner();
    }

    declineAll() {
        const preferences = {
            necessary: true,
            analytics: false,
            marketing: false,
            preferences: false
        };
        this.saveConsent(true, preferences);
        this.hideConsentBanner();
    }

    showCustomization() {
        const preferences = document.getElementById('cookiePreferences');
        if (preferences) {
            preferences.classList.remove('hidden');
        }
    }

    hideCustomization() {
        const preferences = document.getElementById('cookiePreferences');
        if (preferences) {
            preferences.classList.add('hidden');
        }
    }

    saveCustomPreferences() {
        const preferences = {
            necessary: true,
            analytics: document.getElementById('analytics').checked,
            marketing: document.getElementById('marketing').checked,
            preferences: document.getElementById('preferences').checked
        };
        
        this.saveConsent(true, preferences);
        this.hideConsentBanner();
    }

    withdrawConsent() {
        this.saveConsent(false, {
            necessary: true,
            analytics: false,
            marketing: false,
            preferences: false
        });
        
        // Delete existing cookies
        this.deleteAnalyticsCookies();
        
        // Show banner again
        this.showConsentBanner();
    }

    deleteAnalyticsCookies() {
        const cookiesToDelete = [
            '_ga', '_gid', '_gat', '_gat_gtag_UA_*', '_ga_*',
            '_fbp', '_fbc', '__utma', '__utmb', '__utmc', '__utmz'
        ];

        cookiesToDelete.forEach(cookieName => {
            this.deleteCookie(cookieName);
            this.deleteCookie(cookieName, '/');
            this.deleteCookie(cookieName, '/', '.' + window.location.hostname);
        });
    }

    deleteCookie(name, path = '', domain = '') {
        const pathPart = path ? `;path=${path}` : '';
        const domainPart = domain ? `;domain=${domain}` : '';
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT${pathPart}${domainPart}`;
    }

    getConsentStatus() {
        return {
            given: this.consentData.given,
            timestamp: this.consentData.timestamp,
            preferences: this.consentData.preferences,
            expired: this.isConsentExpired()
        };
    }
}

// Initialize cookie consent system
window.cookieConsent = new CookieConsent();