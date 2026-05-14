class ProductOptimization {
    constructor() {
        this.recentlyViewed = this.loadRecentlyViewed();
        this.reviewsStorageKey = 'productReviews';
        this.init();
    }

    init() {
        this.trackProductView();
        this.renderRecentlyViewed();
        this.renderYouMayLike();
        this.initFAQAccordion();
        this.initReviewSystem();
        this.initSizeGuide();
    }

    trackProductView() {
        const productCards = document.querySelectorAll('.product-card');
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
                    const productCard = entry.target;
                    const productId = productCard.querySelector('.add-to-cart')?.dataset.product;
                    const productName = productCard.querySelector('.product-title')?.textContent;
                    const productImage = productCard.querySelector('.product-image img')?.src;
                    const productPrice = productCard.querySelector('.price-value')?.textContent;
                    
                    if (productId) {
                        this.addToRecentlyViewed({
                            id: productId,
                            name: productName,
                            image: productImage,
                            price: productPrice,
                            timestamp: Date.now()
                        });
                    }
                }
            });
        }, { threshold: 0.5 });

        productCards.forEach(card => observer.observe(card));
    }

    loadRecentlyViewed() {
        const stored = localStorage.getItem('recentlyViewedProducts');
        return stored ? JSON.parse(stored) : [];
    }

    addToRecentlyViewed(product) {
        this.recentlyViewed = this.recentlyViewed.filter(p => p.id !== product.id);
        this.recentlyViewed.unshift(product);
        this.recentlyViewed = this.recentlyViewed.slice(0, 6);
        localStorage.setItem('recentlyViewedProducts', JSON.stringify(this.recentlyViewed));
    }

    renderRecentlyViewed() {
        const container = document.getElementById('recently-viewed-container');
        if (!container || this.recentlyViewed.length < 2) {
            container?.parentElement?.remove();
            return;
        }

        const html = this.recentlyViewed.map(product => `
            <div class="related-product-card">
                <div class="related-product-image">
                    <img src="${product.image}" alt="${product.name}">
                </div>
                <div class="related-product-info">
                    <h4>${product.name}</h4>
                    <p class="related-product-price">€${product.price}</p>
                </div>
            </div>
        `).join('');

        container.innerHTML = html;
    }

    renderYouMayLike() {
        const container = document.getElementById('you-may-like-container');
        if (!container) return;

        const recommendations = this.getRecommendations();
        
        const html = recommendations.map(product => `
            <div class="related-product-card">
                <div class="related-product-image">
                    <img src="${product.image}" alt="${product.name}">
                </div>
                <div class="related-product-info">
                    <h4>${product.name}</h4>
                    <p class="related-product-price">€${product.price}</p>
                    <a href="#${product.id}" class="view-product-btn">Scopri di più →</a>
                </div>
            </div>
        `).join('');

        container.innerHTML = html;
    }

    getRecommendations() {
        return [
            { id: 'spallata', name: 'SPALLATA', image: 'assets/olio-extravergine-biologico-bottiglia-spallata-siciliano.webp', price: '11.99' },
            { id: 'grandolio', name: 'GRANDOLIO', image: 'assets/olio-extravergine-biologico-bottiglia-grandolio-siciliano.webp', price: '13.99' },
            { id: 'king-quadra', name: 'KING QUADRA', image: 'assets/olio-extravergine-biologico-bottiglia-king-quadra-limited-edition.webp', price: '11.99' },
            { id: 'testa-moro-m', name: 'TESTA DI MORO M', image: 'assets/olio-extravergine-testa-di-moro-maschio-bottiglia-ceramica-siciliana.webp', price: '29.99' }
        ];
    }

    initFAQAccordion() {
        document.querySelectorAll('.faq-question').forEach(question => {
            question.addEventListener('click', () => {
                const faqItem = question.parentElement;
                const wasActive = faqItem.classList.contains('active');
                
                document.querySelectorAll('.faq-item').forEach(item => {
                    item.classList.remove('active');
                });
                
                if (!wasActive) {
                    faqItem.classList.add('active');
                }
            });
        });
    }

    initReviewSystem() {
        const reviewForm = document.getElementById('review-form');
        if (reviewForm) {
            reviewForm.addEventListener('submit', (e) => this.handleReviewSubmit(e));
        }

        const photoInput = document.getElementById('review-photos');
        if (photoInput) {
            photoInput.addEventListener('change', (e) => this.handlePhotoPreview(e));
        }

        this.renderReviews();
    }

    async handleReviewSubmit(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const review = {
            id: Date.now().toString(),
            name: formData.get('name'),
            rating: parseInt(formData.get('rating')),
            title: formData.get('title'),
            comment: formData.get('comment'),
            photos: await this.processPhotos(formData.getAll('photos')),
            date: new Date().toLocaleDateString('it-IT'),
            verified: false
        };

        this.saveReview(review);
        this.renderReviews();
        e.target.reset();
        document.getElementById('photo-preview').innerHTML = '';
        
        this.showNotification('Grazie per la tua recensione! Sarà pubblicata dopo la verifica.', 'success');
    }

    async processPhotos(files) {
        const photos = [];
        for (const file of files) {
            if (file && file.size > 0) {
                const dataUrl = await this.readFileAsDataURL(file);
                photos.push(dataUrl);
            }
        }
        return photos;
    }

    readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    handlePhotoPreview(e) {
        const files = Array.from(e.target.files);
        const previewContainer = document.getElementById('photo-preview');
        previewContainer.innerHTML = '';

        files.forEach((file, index) => {
            if (index < 3) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const img = document.createElement('img');
                    img.src = e.target.result;
                    img.style.width = '80px';
                    img.style.height = '80px';
                    img.style.objectFit = 'cover';
                    img.style.borderRadius = '8px';
                    img.style.marginRight = '8px';
                    previewContainer.appendChild(img);
                };
                reader.readAsDataURL(file);
            }
        });
    }

    saveReview(review) {
        const reviews = this.loadReviews();
        reviews.push(review);
        localStorage.setItem(this.reviewsStorageKey, JSON.stringify(reviews));
    }

    loadReviews() {
        const stored = localStorage.getItem(this.reviewsStorageKey);
        return stored ? JSON.parse(stored) : [];
    }

    renderReviews() {
        const container = document.getElementById('reviews-list');
        if (!container) return;

        const reviews = this.loadReviews();
        
        if (reviews.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 40px 0;">Nessuna recensione ancora. Sii il primo a recensire!</p>';
            return;
        }

        const html = reviews.map(review => `
            <div class="review-item">
                <div class="review-header">
                    <div class="review-author">
                        <div class="review-avatar">${review.name.charAt(0).toUpperCase()}</div>
                        <div>
                            <h4>${review.name}</h4>
                            <div class="review-rating">
                                ${this.renderStars(review.rating)}
                            </div>
                        </div>
                    </div>
                    <div class="review-date">${review.date}</div>
                </div>
                <h5 class="review-title">${review.title}</h5>
                <p class="review-comment">${review.comment}</p>
                ${review.photos && review.photos.length > 0 ? `
                    <div class="review-photos">
                        ${review.photos.map(photo => `
                            <img src="${photo}" alt="Foto recensione" class="review-photo">
                        `).join('')}
                    </div>
                ` : ''}
                ${review.verified ? '<span class="verified-badge"><i class="fas fa-check-circle"></i> Acquisto Verificato</span>' : ''}
            </div>
        `).join('');

        container.innerHTML = html;
    }

    renderStars(rating) {
        let stars = '';
        for (let i = 1; i <= 5; i++) {
            stars += `<i class="fas fa-star${i <= rating ? '' : '-o'}" style="color: #eab308;"></i>`;
        }
        return stars;
    }

    initSizeGuide() {
        const sizeGuideBtn = document.querySelector('.size-guide-trigger');
        if (sizeGuideBtn) {
            sizeGuideBtn.addEventListener('click', () => {
                document.getElementById('size-guide-modal')?.classList.add('active');
            });
        }

        const closeBtn = document.querySelector('.size-guide-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                document.getElementById('size-guide-modal')?.classList.remove('active');
            });
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            <span>${message}</span>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ProductOptimization();
});
