/**
 * Mobile Navigation Logic
 * Unified script for all website pages
 */

document.addEventListener("DOMContentLoaded", () => {
    // DOM Elements - using both old and new IDs for compatibility
    const mobileMenuBtn = document.getElementById("mobileMenuBtn");
    const mobileCloseBtn = document.getElementById("mobileCloseBtn") || document.getElementById("mobileMenuClose");
    const mobileMenu = document.getElementById("mobileMenu");
    const mobileOverlay = document.getElementById("mobileOverlay") || document.getElementById("mobileMenuOverlay");
    const mobileDropdownToggle = document.getElementById("mobileDropdownToggle");
    const mobileDropdown = document.getElementById("mobileDropdown");

    /**
     * Open Mobile Menu
     */
    function openMobileMenu() {
        if (mobileMenu) mobileMenu.classList.add("active");
        if (mobileOverlay) mobileOverlay.classList.add("active");
        document.body.style.overflow = "hidden";
    }

    /**
     * Close Mobile Menu
     */
    function closeMobileMenu() {
        if (mobileMenu) mobileMenu.classList.remove("active");
        if (mobileOverlay) mobileOverlay.classList.remove("active");
        document.body.style.overflow = "";
    }

    /**
     * Toggle Mobile Dropdown
     */
    function toggleMobileDropdown(e) {
        if (e) e.preventDefault();
        if (mobileDropdown && mobileDropdownToggle) {
            mobileDropdown.classList.toggle("active");
            mobileDropdownToggle.classList.toggle("open");
        }
    }

    // Event Listeners
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener("click", openMobileMenu);
    }

    if (mobileCloseBtn) {
        mobileCloseBtn.addEventListener("click", closeMobileMenu);
    }

    if (mobileOverlay) {
        mobileOverlay.addEventListener("click", closeMobileMenu);
    }

    if (mobileDropdownToggle) {
        mobileDropdownToggle.addEventListener("click", toggleMobileDropdown);
    }

    // Close mobile menu when clicking on links (except for the dropdown toggle)
    document.querySelectorAll(".mobile-nav-link, .mobile-dropdown-item").forEach(link => {
        link.addEventListener("click", (e) => {
            // Only close if it's not the dropdown toggle itself
            if (!link.id || link.id !== "mobileDropdownToggle") {
                closeMobileMenu();
            }
        });
    });

    // Close on Escape key
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closeMobileMenu();
        }
    });
});
