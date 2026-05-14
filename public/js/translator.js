(function() {
    const defaultLang = 'it';
    let currentLang = localStorage.getItem('site_lang') || defaultLang;

    // Helper to get dictionary
    const getDict = (lang) => (window.siteTranslations && window.siteTranslations[lang]) ? window.siteTranslations[lang] : null;

    // Global translate function - available IMMEDIATELY
    window.translate = (key, fallback) => {
        const dict = getDict(currentLang);
        if (dict) {
            return dict[key] || fallback || key;
        }
        return fallback || key;
    };

    const translateElement = (el, lang) => {
        const dict = getDict(lang);
        if (!dict) return;

        if (el.hasAttribute('data-i18n')) {
            const key = el.getAttribute('data-i18n');
            if (dict[key]) el.innerHTML = dict[key];
        }

        if (el.hasAttribute('data-i18n-placeholder')) {
            const key = el.getAttribute('data-i18n-placeholder');
            if (dict[key]) el.placeholder = dict[key];
        }
    };

    const applyTranslations = (lang) => {
        const elements = document.querySelectorAll('[data-i18n], [data-i18n-placeholder]');
        elements.forEach(el => translateElement(el, lang));
        document.documentElement.lang = lang;
        updateLanguageUI(lang);
        
        // Dispatch event so other components (like CheckoutUI) can update
        window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang } }));
    };

    const updateLanguageUI = (lang) => {
        const currentTexts = document.querySelectorAll('.language-switcher .current-lang .flag-text');
        currentTexts.forEach(el => { el.innerText = lang.toUpperCase(); });

        const switchers = document.querySelectorAll('.language-switcher');
        switchers.forEach(switcher => {
            const currentBtn = switcher.querySelector('.current-lang');
            const targetBtn = switcher.querySelector(`.lang-btn[data-lang="${lang}"]`);
            if (currentBtn && targetBtn) {
                const targetSvg = targetBtn.querySelector('.flag-svg');
                const currentSvg = currentBtn.querySelector('.flag-svg');
                if (targetSvg && currentSvg) currentSvg.outerHTML = targetSvg.outerHTML;
            }
        });
        
        document.querySelectorAll('.lang-dropdown').forEach(dropdown => {
            dropdown.querySelectorAll('.lang-btn').forEach(btn => {
                if(btn.dataset.lang === lang) btn.classList.add('active');
                else btn.classList.remove('active');
            });
        });
    };

    const setupSwitchers = () => {
        document.querySelectorAll('.language-switcher').forEach(switcher => {
            const currentBtn = switcher.querySelector('.current-lang');
            const dropdown = switcher.querySelector('.lang-dropdown');
            
            if(currentBtn) {
                currentBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    document.querySelectorAll('.lang-dropdown').forEach(d => { if(d !== dropdown) d.classList.remove('show'); });
                    dropdown.classList.toggle('show');
                    currentBtn.classList.toggle('active');
                });
            }

            switcher.querySelectorAll('.lang-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const newLang = btn.getAttribute('data-lang');
                    currentLang = newLang;
                    localStorage.setItem('site_lang', newLang);
                    applyTranslations(newLang);
                    dropdown.classList.remove('show');
                    if(currentBtn) currentBtn.classList.remove('active');
                });
            });
        });

        document.addEventListener('click', () => {
            document.querySelectorAll('.lang-dropdown').forEach(d => d.classList.remove('show'));
            document.querySelectorAll('.language-switcher .current-lang').forEach(b => b.classList.remove('active'));
        });
    };

    // Initialize as soon as possible
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            if (window.siteTranslations) applyTranslations(currentLang);
            setupSwitchers();
        });
    } else {
        if (window.siteTranslations) applyTranslations(currentLang);
        setupSwitchers();
    }
})();
