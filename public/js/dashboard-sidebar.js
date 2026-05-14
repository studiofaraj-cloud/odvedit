// Shared Dashboard Sidebar Component
// This provides a consistent sidebar navigation across all dashboard pages

export function renderDashboardSidebar(activePage = 'dashboard') {
    const navItems = [
        { id: 'dashboard', href: 'dashboard.html', icon: '📊', label: 'Dashboard' },
        { id: 'orders', href: 'dashboard_orders.html', icon: '📦', label: 'Ordini' },
        { id: 'analytics', href: 'dashboard_analytics.html', icon: '📈', label: 'Analytics' },
        { id: 'messages', href: 'dashboard_messages.html', icon: '💬', label: 'Messaggi' },
        { id: 'newsletter', href: 'dashboard_newsletter.html', icon: '📬', label: 'Newsletter' }
    ];

    const activeItem = navItems.find(item => item.id === activePage);
    
    return `
        <button class="dashboard-hamburger" aria-label="Menu">☰</button>
        <div class="sidebar-overlay"></div>
        <aside class="dashboard-sidebar">
            <div class="sidebar-header">
                <a href="index.html" class="sidebar-logo">
                    <img src="assets/odvlogo.png" alt="l'Olio di Valeria">
                </a>
            </div>
            
            <nav class="sidebar-nav">
                <div class="nav-section">
                    <div class="nav-section-label">Menu</div>
                    ${navItems.map(item => `
                        <a href="${item.href}" class="nav-item ${item.id === activePage ? 'active' : ''}">
                            <span class="nav-icon">${item.icon}</span>
                            <span class="nav-label">${item.label}</span>
                        </a>
                    `).join('')}
                </div>
            </nav>

            <div class="sidebar-footer">
                <a href="index.html" class="nav-item">
                    <span class="nav-icon">🏠</span>
                    <span class="nav-label">Home</span>
                </a>
                <button id="logout-btn" class="nav-item logout-btn">
                    <span class="nav-icon">🚪</span>
                    <span class="nav-label">Esci</span>
                </button>
            </div>
        </aside>
    `;
}

export function initializeDashboardSidebar() {
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        import('./auth.js').then(({ logout }) => {
            logoutBtn.addEventListener('click', logout);
        });
    }

    // Initialize Mobile Navigation
    initializeMobileNav();
}

function initializeMobileNav() {
    const hamburger = document.querySelector('.dashboard-hamburger');
    const sidebar = document.querySelector('.dashboard-sidebar');
    const overlay = document.querySelector('.sidebar-overlay');

    if (hamburger && sidebar && overlay) {
        hamburger.addEventListener('click', () => {
            sidebar.classList.add('active');
            overlay.classList.add('active');
            document.body.style.overflow = 'hidden'; // Prevent scrolling when menu is open
        });

        overlay.addEventListener('click', () => {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
            document.body.style.overflow = '';
        });

        // Close sidebar on link click (useful for internal anchors or SPA-like feel)
        const navLinks = sidebar.querySelectorAll('.nav-item');
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                sidebar.classList.remove('active');
                overlay.classList.remove('active');
                document.body.style.overflow = '';
            });
        });
    }
}
