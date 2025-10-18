// Cookie Management Template for HTML Files
// This provides the HTML template and JavaScript for cookie preferences

const COOKIE_MANAGEMENT_HTML = `
    <!-- Cookie Settings Button -->
    <button id="cookieSettingsBtn" class="cookie-settings-btn">
        <i class="fas fa-cookie-bite"></i> Impostazioni Cookie
    </button>

    <!-- Cookie Consent Banner -->
    <div id="cookieConsentBanner" class="cookie-consent-banner">
        <div class="cookie-consent-content">
            <div class="cookie-consent-text">
                <h3>Utilizziamo i Cookie</h3>
                <p>Utilizziamo i cookie per migliorare la tua esperienza sul nostro sito web. Puoi personalizzare le tue preferenze o accettare tutti i cookie.</p>
            </div>
            <div class="cookie-consent-actions">
                <button id="acceptAllBtn" class="cookie-btn cookie-btn-primary">Accetta Tutti</button>
                <button id="customizeBtn" class="cookie-btn cookie-btn-secondary">Personalizza</button>
            </div>
        </div>
    </div>

    <!-- Cookie Preferences Modal -->
    <div id="cookiePreferencesModal" class="cookie-preferences-modal">
        <div class="cookie-preferences-content">
            <div class="cookie-preferences-header">
                <h2>Preferenze Cookie</h2>
                <button id="closePreferencesBtn" class="cookie-preferences-close">
                    <i class="fas fa-times"></i>
                </button>
            </div>

            <div class="cookie-preference-item">
                <div class="cookie-preference-header">
                    <div class="cookie-preference-title">Cookie Essenziali</div>
                    <div class="cookie-toggle disabled">
                        <input type="checkbox" id="essentialCookies" checked disabled>
                        <div class="cookie-toggle-slider"></div>
                    </div>
                </div>
                <div class="cookie-preference-description">
                    Questi cookie sono necessari per il funzionamento base del sito web e non possono essere disabilitati.
                </div>
            </div>

            <div class="cookie-preference-item">
                <div class="cookie-preference-header">
                    <div class="cookie-preference-title">Cookie Funzionali</div>
                    <div class="cookie-toggle">
                        <input type="checkbox" id="functionalCookies">
                        <div class="cookie-toggle-slider"></div>
                    </div>
                </div>
                <div class="cookie-preference-description">
                    Questi cookie memorizzano le tue preferenze e personalizzazioni per migliorare l'esperienza utente.
                </div>
            </div>

            <div class="cookie-preference-item">
                <div class="cookie-preference-header">
                    <div class="cookie-preference-title">Cookie Analitici</div>
                    <div class="cookie-toggle">
                        <input type="checkbox" id="analyticsCookies">
                        <div class="cookie-toggle-slider"></div>
                    </div>
                </div>
                <div class="cookie-preference-description">
                    Questi cookie ci aiutano a comprendere come i visitatori interagiscono con il nostro sito web raccogliendo informazioni anonime.
                </div>
            </div>

            <div class="cookie-preferences-actions">
                <button id="savePreferencesBtn" class="cookie-btn cookie-btn-primary">Salva Preferenze</button>
                <button id="cancelPreferencesBtn" class="cookie-btn cookie-btn-secondary">Annulla</button>
            </div>
        </div>
    </div>`;

const COOKIE_MANAGEMENT_CSS = `
        /* Cookie Settings Button */
        .cookie-settings-btn {
            position: fixed;
            bottom: 20px;
            left: 20px;
            background: #eab308;
            color: #fff;
            border: none;
            border-radius: 50px;
            padding: 12px 20px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 4px 20px rgba(234, 179, 8, 0.3);
            transition: all 0.3s ease;
            z-index: 1000;
        }

        .cookie-settings-btn:hover {
            background: #d97706;
            transform: translateY(-2px);
            box-shadow: 0 6px 25px rgba(234, 179, 8, 0.4);
        }

        /* Cookie Preferences Modal */
        .cookie-preferences-modal {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            z-index: 2000;
            opacity: 0;
            visibility: hidden;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .cookie-preferences-modal.active {
            opacity: 1;
            visibility: visible;
        }

        .cookie-preferences-content {
            background: #fff;
            border-radius: 20px;
            padding: 2rem;
            width: 90%;
            max-width: 600px;
            max-height: 90vh;
            overflow-y: auto;
            transform: translateY(20px);
            transition: transform 0.3s ease;
        }

        .cookie-preferences-modal.active .cookie-preferences-content {
            transform: translateY(0);
        }

        .cookie-preferences-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1.5rem;
            border-bottom: 2px solid #f3f4f6;
            padding-bottom: 1rem;
        }

        .cookie-preferences-header h2 {
            color: #333;
            font-size: 1.8rem;
            font-weight: 700;
        }

        .cookie-preferences-close {
            background: none;
            border: none;
            font-size: 24px;
            color: #6b7280;
            cursor: pointer;
            padding: 8px;
            border-radius: 50%;
            transition: all 0.3s ease;
        }

        .cookie-preferences-close:hover {
            background: #f3f4f6;
            color: #000;
        }

        .cookie-preference-item {
            margin-bottom: 1.5rem;
            padding: 1rem;
            border: 2px solid #f3f4f6;
            border-radius: 12px;
            transition: border-color 0.3s ease;
        }

        .cookie-preference-item:hover {
            border-color: #eab308;
        }

        .cookie-preference-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 0.5rem;
        }

        .cookie-preference-title {
            font-size: 1.2rem;
            font-weight: 600;
            color: #333;
        }

        .cookie-preference-description {
            color: #666;
            font-size: 0.95rem;
            line-height: 1.5;
        }

        .cookie-toggle {
            position: relative;
            width: 50px;
            height: 24px;
            background: #d1d5db;
            border-radius: 12px;
            cursor: pointer;
            transition: background-color 0.3s ease;
        }

        .cookie-toggle input {
            opacity: 0;
            width: 0;
            height: 0;
        }

        .cookie-toggle-slider {
            position: absolute;
            top: 2px;
            left: 2px;
            width: 20px;
            height: 20px;
            background: #fff;
            border-radius: 50%;
            transition: transform 0.3s ease;
        }

        .cookie-toggle input:checked + .cookie-toggle-slider {
            transform: translateX(26px);
        }

        .cookie-toggle input:checked ~ .cookie-toggle {
            background: #eab308;
        }

        .cookie-toggle.disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .cookie-preferences-actions {
            margin-top: 2rem;
            display: flex;
            gap: 1rem;
            justify-content: flex-end;
            border-top: 2px solid #f3f4f6;
            padding-top: 1.5rem;
        }

        .cookie-btn {
            padding: 12px 24px;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .cookie-btn-primary {
            background: #eab308;
            color: #fff;
        }

        .cookie-btn-primary:hover {
            background: #d97706;
            transform: translateY(-1px);
        }

        .cookie-btn-secondary {
            background: #f3f4f6;
            color: #374151;
        }

        .cookie-btn-secondary:hover {
            background: #e5e7eb;
        }

        .cookie-consent-banner {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            background: #fff;
            border-top: 3px solid #eab308;
            padding: 1.5rem;
            box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.1);
            z-index: 1500;
            transform: translateY(100%);
            transition: transform 0.3s ease;
        }

        .cookie-consent-banner.visible {
            transform: translateY(0);
        }

        .cookie-consent-content {
            max-width: 1200px;
            margin: 0 auto;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 2rem;
        }

        .cookie-consent-text {
            flex: 1;
        }

        .cookie-consent-text h3 {
            color: #333;
            font-size: 1.2rem;
            font-weight: 600;
            margin-bottom: 0.5rem;
        }

        .cookie-consent-text p {
            color: #666;
            font-size: 0.95rem;
        }

        .cookie-consent-actions {
            display: flex;
            gap: 1rem;
        }

        @media (max-width: 768px) {
            .cookie-consent-content {
                flex-direction: column;
                text-align: center;
            }

            .cookie-preferences-content {
                padding: 1.5rem;
            }

            .cookie-preferences-actions {
                flex-direction: column;
            }

            .cookie-settings-btn {
                bottom: 15px;
                left: 15px;
                padding: 10px 16px;
                font-size: 12px;
            }
        }`;

const COOKIE_MANAGEMENT_JS = `
    <!-- Cookie Management JavaScript -->
    <script src="../cookie-utils.js"></script>
    <script>
        // Cookie Preferences Manager
        class CookiePreferencesManager {
            constructor() {
                this.userPreferences = new UserPreferences();
                this.cookiePreferences = {
                    essential: true,
                    functional: false,
                    analytics: false
                };
                
                this.init();
            }

            init() {
                this.loadSavedPreferences();
                this.setupEventListeners();
                this.showConsentBannerIfNeeded();
                this.updateConsentState();
            }

            loadSavedPreferences() {
                const saved = this.userPreferences.get('cookiePreferences');
                if (saved) {
                    this.cookiePreferences = { ...this.cookiePreferences, ...saved };
                }
            }

            setupEventListeners() {
                // Cookie settings button
                document.getElementById('cookieSettingsBtn').addEventListener('click', () => {
                    this.showPreferencesModal();
                });

                // Consent banner buttons
                document.getElementById('acceptAllBtn').addEventListener('click', () => {
                    this.acceptAllCookies();
                });

                document.getElementById('customizeBtn').addEventListener('click', () => {
                    this.showPreferencesModal();
                });

                // Modal buttons
                document.getElementById('closePreferencesBtn').addEventListener('click', () => {
                    this.hidePreferencesModal();
                });

                document.getElementById('savePreferencesBtn').addEventListener('click', () => {
                    this.savePreferences();
                });

                document.getElementById('cancelPreferencesBtn').addEventListener('click', () => {
                    this.hidePreferencesModal();
                });

                // Toggle switches
                document.getElementById('functionalCookies').addEventListener('change', (e) => {
                    this.cookiePreferences.functional = e.target.checked;
                });

                document.getElementById('analyticsCookies').addEventListener('change', (e) => {
                    this.cookiePreferences.analytics = e.target.checked;
                });

                // Modal overlay click to close
                document.getElementById('cookiePreferencesModal').addEventListener('click', (e) => {
                    if (e.target.id === 'cookiePreferencesModal') {
                        this.hidePreferencesModal();
                    }
                });
            }

            showConsentBannerIfNeeded() {
                const hasConsent = this.userPreferences.get('cookieConsent');
                if (!hasConsent) {
                    setTimeout(() => {
                        document.getElementById('cookieConsentBanner').classList.add('visible');
                    }, 1000);
                }
            }

            acceptAllCookies() {
                this.cookiePreferences = {
                    essential: true,
                    functional: true,
                    analytics: true
                };
                
                this.saveConsentData();
                this.hideConsentBanner();
                this.updateConsentState();
            }

            showPreferencesModal() {
                this.updateModalControls();
                document.getElementById('cookiePreferencesModal').classList.add('active');
                document.body.style.overflow = 'hidden';
            }

            hidePreferencesModal() {
                document.getElementById('cookiePreferencesModal').classList.remove('active');
                document.body.style.overflow = '';
            }

            updateModalControls() {
                document.getElementById('functionalCookies').checked = this.cookiePreferences.functional;
                document.getElementById('analyticsCookies').checked = this.cookiePreferences.analytics;
            }

            savePreferences() {
                this.saveConsentData();
                this.hidePreferencesModal();
                this.hideConsentBanner();
                this.updateConsentState();
                
                // Show feedback
                this.showFeedback('Le tue preferenze sui cookie sono state salvate!', 'success');
            }

            saveConsentData() {
                this.userPreferences.set('cookieConsent', true);
                this.userPreferences.set('cookiePreferences', this.cookiePreferences);
                this.userPreferences.set('cookieConsentTimestamp', Date.now());
            }

            hideConsentBanner() {
                document.getElementById('cookieConsentBanner').classList.remove('visible');
            }

            updateConsentState() {
                // Dispatch custom event for other scripts to react to consent changes
                window.dispatchEvent(new CustomEvent('cookieConsentUpdated', {
                    detail: {
                        preferences: this.cookiePreferences,
                        hasConsent: this.userPreferences.get('cookieConsent', false)
                    }
                }));

                // Enable/disable tracking based on preferences
                if (this.cookiePreferences.analytics) {
                    this.enableAnalytics();
                } else {
                    this.disableAnalytics();
                }

                if (this.cookiePreferences.functional) {
                    this.enableFunctionalCookies();
                } else {
                    this.disableFunctionalCookies();
                }
            }

            enableAnalytics() {
                console.log('Analytics cookies enabled');
                
                // Example: Initialize Google Analytics
                if (typeof gtag !== 'undefined') {
                    gtag('consent', 'update', {
                        'analytics_storage': 'granted'
                    });
                }
            }

            disableAnalytics() {
                console.log('Analytics cookies disabled');
                
                // Remove analytics cookies
                this.deleteCookie('_ga');
                this.deleteCookie('_gid');
                this.deleteCookie('_gat');
                
                if (typeof gtag !== 'undefined') {
                    gtag('consent', 'update', {
                        'analytics_storage': 'denied'
                    });
                }
            }

            enableFunctionalCookies() {
                console.log('Functional cookies enabled');
                // Enable functional features that rely on cookies
            }

            disableFunctionalCookies() {
                console.log('Functional cookies disabled');
                // Disable functional features and clear related cookies
            }

            deleteCookie(name) {
                document.cookie = \\`\\${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;\\`;
                document.cookie = \\`\\${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.\\${window.location.hostname};\\`;
            }

            showFeedback(message, type = 'info') {
                // Create feedback element
                const feedback = document.createElement('div');
                feedback.style.cssText = \\`
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: \\${type === 'success' ? '#10b981' : '#3b82f6'};
                    color: white;
                    padding: 12px 20px;
                    border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    z-index: 3000;
                    font-weight: 600;
                    transform: translateX(400px);
                    transition: transform 0.3s ease;
                \\`;
                feedback.textContent = message;
                document.body.appendChild(feedback);

                // Animate in
                setTimeout(() => {
                    feedback.style.transform = 'translateX(0)';
                }, 100);

                // Remove after 3 seconds
                setTimeout(() => {
                    feedback.style.transform = 'translateX(400px)';
                    setTimeout(() => feedback.remove(), 300);
                }, 3000);
            }

            // Public methods for external access
            hasConsent(type = 'analytics') {
                const hasGeneral = this.userPreferences.get('cookieConsent', false);
                return hasGeneral && this.cookiePreferences[type];
            }

            getCurrentPreferences() {
                return { ...this.cookiePreferences };
            }

            withdrawConsent() {
                this.cookiePreferences = {
                    essential: true,
                    functional: false,
                    analytics: false
                };
                
                this.userPreferences.set('cookieConsent', false);
                this.userPreferences.set('cookiePreferences', this.cookiePreferences);
                
                this.disableAnalytics();
                this.disableFunctionalCookies();
                this.showConsentBannerIfNeeded();
                
                this.showFeedback('Consenso sui cookie ritirato', 'info');
            }
        }

        // Initialize cookie preferences manager
        document.addEventListener('DOMContentLoaded', function() {
            window.cookieManager = new CookiePreferencesManager();
        });
    </script>`;

// Export the template parts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { COOKIE_MANAGEMENT_HTML, COOKIE_MANAGEMENT_CSS, COOKIE_MANAGEMENT_JS };
}