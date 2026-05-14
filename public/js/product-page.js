/**
 * Product Page JS
 * Handles add-to-cart via sessionStorage redirect, size selection, FAQ accordion
 */

document.addEventListener('DOMContentLoaded', () => {
    initSizeSelection();
    initFAQAccordion();
    initMobileTicker();
});

function initSizeSelection() {
    document.querySelectorAll('.product-page-sizes .size-option').forEach(option => {
        option.addEventListener('click', () => {
            const container = option.closest('.product-page-sizes');
            container.querySelectorAll('.size-option').forEach(o => o.classList.remove('selected'));
            option.classList.add('selected');

            // Update price display
            const priceContainer = document.querySelector('.product-page-price');
            const currentPriceEl = priceContainer.querySelector('.current-price');
            const oldPriceEl = priceContainer.querySelector('.old-price');

            const newPrice = option.dataset.newPrice || option.dataset.price;
            const oldPrice = option.dataset.oldPrice;

            priceContainer.classList.add('animating');
            setTimeout(() => {
                currentPriceEl.textContent = '€' + newPrice;
                if (oldPriceEl) {
                    if (oldPrice) {
                        oldPriceEl.textContent = '€' + oldPrice;
                        oldPriceEl.style.display = 'inline';
                    } else {
                        oldPriceEl.style.display = 'none';
                    }
                }
                priceContainer.classList.remove('animating');
            }, 150);
        });
    });
}

function initFAQAccordion() {
    document.querySelectorAll('.product-page-faq .faq-question').forEach(question => {
        question.addEventListener('click', () => {
            const faqItem = question.parentElement;
            const wasActive = faqItem.classList.contains('active');

            document.querySelectorAll('.product-page-faq .faq-item').forEach(item => {
                item.classList.remove('active');
            });

            if (!wasActive) {
                faqItem.classList.add('active');
            }
        });
    });
}


function showNotification(message, type) {
    const existing = document.querySelector('.pp-notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.className = 'pp-notification pp-notification-' + type;
    notification.innerHTML = '<i class="fas fa-' +
        (type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle') +
        '"></i><span>' + message + '</span>';
    notification.style.cssText = 'position:fixed;top:20px;right:20px;background:#fff;padding:16px 24px;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.15);display:flex;align-items:center;gap:12px;z-index:9999;animation:ppSlideIn 0.3s ease;border-left:4px solid ' +
        (type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#f59e0b') + ';font-weight:500;';

    const icon = notification.querySelector('i');
    if (icon) icon.style.color = type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#f59e0b';

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transition = 'opacity 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function initMobileTicker() {
    if (window.innerWidth > 768) return;

    const items = document.querySelectorAll('.ticker-item');
    if (items.length < 2) return;

    let currentIndex = 0;
    const uniqueItems = Array.from(items).slice(0, Math.ceil(items.length / 2));

    setInterval(() => {
        uniqueItems.forEach(item => item.classList.remove('active'));
        currentIndex = (currentIndex + 1) % uniqueItems.length;
        uniqueItems[currentIndex].classList.add('active');
    }, 3000);
}
