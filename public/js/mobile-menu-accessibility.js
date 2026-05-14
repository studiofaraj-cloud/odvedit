/**
 * Mobile Menu Accessibility Enhancement
 * Provides keyboard navigation, focus management, and ARIA state management
 * for the mobile navigation menu across all pages.
 * 
 * @version 1.0.0
 * @author l'Olio di Valeria Development Team
 */

(function() {
    'use strict';

    let lastFocusedElement = null;
    const focusableSelectors = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

    function initMobileMenuAccessibility() {
        const mobileMenuBtn = document.getElementById('mobileMenuBtn');
        const mobileCloseBtn = document.getElementById('mobileCloseBtn') || document.getElementById('mobileMenuClose');
        const mobileMenu = document.getElementById('mobileMenu');
        const mobileOverlay = document.getElementById('mobileOverlay') || document.getElementById('mobileMenuOverlay');
        const mobileDropdownToggle = document.getElementById('mobileDropdownToggle');
        const mobileDropdown = document.getElementById('mobileDropdown');

        if (!mobileMenuBtn || !mobileMenu) {
            return;
        }

        function openMobileMenu() {
            lastFocusedElement = document.activeElement;
            
            mobileMenu.classList.add('active', 'open');
            if (mobileOverlay) {
                mobileOverlay.classList.add('active', 'open');
                mobileOverlay.setAttribute('aria-hidden', 'false');
            }
            
            mobileMenu.setAttribute('aria-hidden', 'false');
            mobileMenuBtn.setAttribute('aria-expanded', 'true');
            document.body.style.overflow = 'hidden';
            
            setTimeout(() => {
                if (mobileCloseBtn) mobileCloseBtn.focus();
            }, 100);
        }

        function closeMobileMenu() {
            mobileMenu.classList.remove('active', 'open');
            if (mobileOverlay) {
                mobileOverlay.classList.remove('active', 'open');
                mobileOverlay.setAttribute('aria-hidden', 'true');
            }
            
            mobileMenu.setAttribute('aria-hidden', 'true');
            mobileMenuBtn.setAttribute('aria-expanded', 'false');
            document.body.style.overflow = '';
            
            if (lastFocusedElement) {
                lastFocusedElement.focus();
                lastFocusedElement = null;
            }
        }

        function toggleMobileDropdown(e) {
            if (e) e.preventDefault();
            
            if (!mobileDropdown || !mobileDropdownToggle) return;
            
            const isExpanded = mobileDropdown.classList.contains('active') || mobileDropdown.classList.contains('open');
            
            mobileDropdown.classList.toggle('active');
            mobileDropdown.classList.toggle('open');
            mobileDropdownToggle.setAttribute('aria-expanded', String(!isExpanded));
            
            const arrow = mobileDropdownToggle.querySelector('.dropdown-arrow');
            if (arrow) {
                arrow.style.transform = mobileDropdown.classList.contains('active') || mobileDropdown.classList.contains('open') 
                    ? 'rotate(180deg)' 
                    : 'rotate(0deg)';
            }
        }

        mobileMenuBtn.addEventListener('click', openMobileMenu);
        
        if (mobileCloseBtn) {
            mobileCloseBtn.addEventListener('click', closeMobileMenu);
        }
        
        if (mobileOverlay) {
            mobileOverlay.addEventListener('click', closeMobileMenu);
        }

        if (mobileDropdownToggle) {
            mobileDropdownToggle.addEventListener('click', toggleMobileDropdown);
            
            mobileDropdownToggle.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleMobileDropdown();
                }
            });
        }

        document.addEventListener('keydown', (e) => {
            const isMenuOpen = mobileMenu.classList.contains('active') || mobileMenu.classList.contains('open');
            
            if (isMenuOpen) {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    closeMobileMenu();
                }
                
                if (e.key === 'Tab') {
                    const focusableElements = Array.from(mobileMenu.querySelectorAll(focusableSelectors));
                    
                    if (focusableElements.length === 0) return;
                    
                    const firstElement = focusableElements[0];
                    const lastElement = focusableElements[focusableElements.length - 1];
                    
                    if (e.shiftKey && document.activeElement === firstElement) {
                        e.preventDefault();
                        lastElement.focus();
                    } else if (!e.shiftKey && document.activeElement === lastElement) {
                        e.preventDefault();
                        firstElement.focus();
                    }
                }
            }
        });

        document.querySelectorAll('.mobile-nav-link:not(#mobileDropdownToggle), .mobile-dropdown-item').forEach(link => {
            link.addEventListener('click', (e) => {
                if (!e.target.closest('#mobileDropdownToggle')) {
                    closeMobileMenu();
                }
            });
        });

        console.log('[Mobile Menu A11y] Initialized successfully');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMobileMenuAccessibility);
    } else {
        initMobileMenuAccessibility();
    }
})();
