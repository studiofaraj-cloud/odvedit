/**
 * Shopping Cart Implementation for l'Olio di Valeria
 * Handles cart logic, storage, and UI updates across all pages
 */

import { secureStorage, migrateToEncryptedStorage } from './encryption-utils.js';

// Migrate existing cart data to encrypted storage if needed
migrateToEncryptedStorage(['oliodiValeriaCart']);

export class ShoppingCart {
    constructor() {
        this.items = []
        this.storageKey = "oliodiValeriaCart"
        this.init()
    }

    async init() {
        try {
            await this.loadFromLocalStorage()
            await this.checkPendingCartItems()
            this.bindEvents()
            this.updateCartDisplay()
        } catch (error) {
            console.error("Failed to initialize shopping cart:", error)
        }
    }

    async checkPendingCartItems() {
        try {
            const pendingItem = sessionStorage.getItem('pendingCartItem');
            if (pendingItem) {
                const productData = JSON.parse(pendingItem);
                
                // Validate required fields
                if (!productData.id || !productData.name || typeof productData.price !== 'number' || 
                    !productData.size || !productData.image) {
                    console.error('Invalid product data:', productData);
                    sessionStorage.removeItem('pendingCartItem');
                    this.showNotification('Errore: dati prodotto non validi', 'error');
                    return;
                }
                
                const item = {
                    id: productData.id,
                    name: productData.name,
                    size: productData.size,
                    price: productData.price,
                    quantity: 1,
                    image: productData.image
                };
                
                await this.addItem(item);
                
                sessionStorage.removeItem('pendingCartItem');
                
                this.openCart();
                
                this.showNotification('Prodotto aggiunto al carrello!', 'success');
            }
        } catch (error) {
            console.error('Error processing pending cart item:', error);
            sessionStorage.removeItem('pendingCartItem');
            this.showNotification('Errore nell\'aggiungere il prodotto al carrello', 'error');
        }
    }

    bindEvents() {
        // Use event delegation for better performance
        document.addEventListener("click", this.handleDocumentClick.bind(this))

        // Specific cart events
        this.bindCartEvents()
    }

    handleDocumentClick(e) {
        const { target } = e

        // Size selection (for shop page)
        if (target.closest(".size-option")) {
            this.handleSizeSelection(e)
        }

        // Add to cart
        if (target.closest(".add-to-cart") || target.closest(".product-page-add-to-cart")) {
            this.handleAddToCart(e)
        }

        // Quantity controls
        if (target.closest(".quantity-btn")) {
            this.handleQuantityChange(e)
        }

        // Checkout
        if (target.closest(".checkout-btn")) {
            this.handleCheckout(e)
        }
    }

    bindCartEvents() {
        const cartToggle = document.getElementById("cartToggle")
        const cartClose = document.getElementById("cartClose")
        const cartOverlay = document.getElementById("cartOverlay")

        cartToggle?.addEventListener("click", this.toggleCart.bind(this))
        cartClose?.addEventListener("click", this.closeCart.bind(this))
        cartOverlay?.addEventListener("click", this.closeCart.bind(this))
    }

    handleSizeSelection(e) {
        // Only if on shop page style grid
        const selectedOption = e.target.closest(".size-option")
        if (!selectedOption) return

        const card = selectedOption.closest(".product-card")
        if (!card) return

        const sizeOptions = card.querySelectorAll(".size-option")

        // Update selection
        sizeOptions.forEach((opt) => opt.classList.remove("selected"))
        selectedOption.classList.add("selected")

        // Update price display
        this.updatePriceDisplay(card, selectedOption)
    }

    updatePriceDisplay(card, selectedOption) {
        const { newPrice, oldPrice, price } = selectedOption.dataset
        const displayPrice = newPrice || price

        const productPrice = card.querySelector(".product-price")
        const oldPriceElement = card.querySelector(".old-price")
        const newPriceElement = card.querySelector(".price-value")

        if (!productPrice || !newPriceElement) return

        // Animate price change
        productPrice.classList.add("animating")

        setTimeout(() => {
            newPriceElement.textContent = displayPrice

            // Handle old price display
            if (oldPriceElement) {
                if (oldPrice) {
                    oldPriceElement.textContent = `€${oldPrice}`
                    oldPriceElement.style.display = "inline"
                } else {
                    oldPriceElement.style.display = "none"
                }
            }

            productPrice.classList.remove("animating")
        }, 150)
    }

    async handleAddToCart(e) {
        try {
            const button = e.target.closest(".add-to-cart") || e.target.closest(".product-page-add-to-cart")
            if (!button) return

            // Prevent default behavior if it's a link or form submit
            e.preventDefault();

            let card, productName, selectedSize, productImage;

            if (button.classList.contains('product-page-add-to-cart')) {
                // Product page logic
                card = document.querySelector('.product-page-container') || document.body;
                productName = button.dataset.product;
                selectedSize = document.querySelector(".product-page-sizes .size-option.selected");
                productImage = document.querySelector('.product-hero-image img')?.src || '';
            } else {
                // Shop page logic
                card = button.closest(".product-card")
                productName = button.dataset.product
                selectedSize = card?.querySelector(".size-option.selected")
                productImage = card?.querySelector(".product-image img")?.src || 
                               card?.querySelector(".product-image")?.style.backgroundImage?.replace(/url\(['"]?([^'"]*)['"]?\)/, '$1') ||
                               'assets/odvlogo.png'
            }

            if (!selectedSize) {
                this.showNotification("Seleziona una taglia prima di aggiungere al carrello", "warning")
                return
            }

            const { size, newPrice, price } = selectedSize.dataset
            const itemPrice = Number.parseFloat(newPrice || price)

            if (isNaN(itemPrice)) {
                throw new Error("Invalid price data")
            }

            const item = {
                id: `${productName}-${size}`,
                name: productName,
                size: size,
                price: itemPrice,
                quantity: 1,
                image: productImage
            }

            await this.addItem(item)
            this.showAddedToCartAnimation(button)
        } catch (error) {
            console.error("Error adding item to cart:", error)
            this.showNotification("Errore nell'aggiungere il prodotto al carrello", "error")
        }
    }

    async addItem(newItem) {
        // Ensure this.items is an array before proceeding
        if (!Array.isArray(this.items)) {
            this.items = [];
        }

        const existingItemIndex = this.items.findIndex((item) => item && item.id === newItem.id)

        if (existingItemIndex !== -1) {
            this.items[existingItemIndex].quantity += (newItem.quantity || 1)
        } else {
            this.items.push(newItem)
        }

        this.updateCartDisplay()
        await this.saveToLocalStorage()
    }

    async removeItem(itemId) {
        this.items = this.items.filter((item) => item.id !== itemId)
        this.updateCartDisplay()
        await this.saveToLocalStorage()
    }

    async updateQuantity(itemId, newQuantity) {
        if (newQuantity <= 0) {
            await this.removeItem(itemId)
            return
        }

        const item = this.items.find((item) => item.id === itemId)
        if (item) {
            item.quantity = newQuantity
            this.updateCartDisplay()
            await this.saveToLocalStorage()
        }
    }

    async handleQuantityChange(e) {
        const button = e.target.closest(".quantity-btn")
        if (!button) return

        const { itemId, action } = button.dataset
        const item = this.items.find((item) => item.id === itemId)

        if (!item) return

        const newQuantity = action === "increase" ? item.quantity + 1 : item.quantity - 1

        await this.updateQuantity(itemId, newQuantity)
    }

    updateCartDisplay() {
        this.updateCartBadge()
        this.updateCartItems()
        this.updateCartTotal()
    }

    updateCartBadge() {
        const badge = document.getElementById("cartBadge")
        if (!badge) return

        // Guard against non-array this.items
        const totalItems = Array.isArray(this.items) ? this.items.reduce((sum, item) => sum + (item.quantity || 0), 0) : 0
        badge.textContent = totalItems
        badge.style.display = totalItems > 0 ? "flex" : "none"
    }

    updateCartItems() {
        const cartItemsContainer = document.getElementById("cartItems")
        if (!cartItemsContainer) return

        if (this.items.length === 0) {
            cartItemsContainer.innerHTML = this.getEmptyCartHTML()
            return
        }

        cartItemsContainer.innerHTML = this.items.map((item) => this.getCartItemHTML(item)).join("")
    }

    getEmptyCartHTML() {
        return `
            <div class="empty-cart">
                <i class="fas fa-shopping-cart"></i>
                <p class="footer-title">Il tuo carrello è vuoto</p>
                <p>Aggiungi alcuni prodotti per iniziare</p>
            </div>
        `
    }

    getCartItemHTML(item) {
        return `
            <div class="cart-item" data-item-id="${item.id}">
                <div class="cart-item-image">
                    <img src="${item.image || 'assets/odvlogo.png'}" 
                         alt="${this.escapeHtml(item.name)}" 
                         style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px;"
                         onerror="this.src='assets/odvlogo.png'">
                </div>
                <div class="cart-item-details">
                    <div class="cart-item-name">${this.escapeHtml(item.name)}</div>
                    <div class="cart-item-size">${this.escapeHtml(item.size)}</div>
                    <div class="cart-item-price">€${item.price.toFixed(2)}</div>
                </div>
                <div class="quantity-controls">
                    <button class="quantity-btn" data-action="decrease" data-item-id="${item.id}" aria-label="Diminuisci quantità">
                        <i class="fas fa-minus"></i>
                    </button>
                    <span class="quantity" aria-label="Quantità">${item.quantity}</span>
                    <button class="quantity-btn" data-action="increase" data-item-id="${item.id}" aria-label="Aumenta quantità">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
            </div>
        `
    }

    updateCartTotal() {
        const cartTotal = document.getElementById("cartTotal")
        const totalPriceElement = document.getElementById("totalPrice")

        if (!cartTotal || !totalPriceElement) return

        if (this.items.length === 0) {
            cartTotal.style.display = "none"
            return
        }

        const total = this.items.reduce((sum, item) => sum + item.price * item.quantity, 0)
        totalPriceElement.textContent = total.toFixed(2)
        cartTotal.style.display = "block"
    }

    toggleCart() {
        const sidebar = document.getElementById("cartSidebar")
        const overlay = document.getElementById("cartOverlay")

        if (!sidebar || !overlay) return

        const isOpen = sidebar.classList.contains("open")

        if (isOpen) {
            this.closeCart()
        } else {
            this.openCart()
        }
    }

    openCart() {
        const sidebar = document.getElementById("cartSidebar")
        const overlay = document.getElementById("cartOverlay")

        sidebar?.classList.add("open")
        overlay?.classList.add("open")
        document.body.style.overflow = "hidden"
    }

    closeCart() {
        const sidebar = document.getElementById("cartSidebar")
        const overlay = document.getElementById("cartOverlay")

        sidebar?.classList.remove("open")
        overlay?.classList.remove("open")
        document.body.style.overflow = ""
    }

    showAddedToCartAnimation(button) {
        const originalContent = button.innerHTML
        const originalBackground = button.style.background

        button.innerHTML = '<i class="fas fa-check"></i> ' + (button.classList.contains('product-page-add-to-cart') ? 'Aggiunto!' : 'Aggiunto!')
        button.style.background = "linear-gradient(135deg, #10b981, #059669)"
        button.disabled = true

        // Create sleek modern toast notification
        this.showNotification('Prodotto aggiunto al carrello!', 'success');

        // Create flying animation if applicable
        this.createFlyingCartAnimation(button);

        setTimeout(() => {
            button.innerHTML = originalContent
            button.style.background = originalBackground
            button.disabled = false
        }, 2000)
    }

    createFlyingCartAnimation(sourceElement) {
        // Get the product image based on where the add occurred
        let productImage;
        if (sourceElement.classList.contains('product-page-add-to-cart')) {
            productImage = document.querySelector('.product-hero-image img');
        } else {
            const card = sourceElement.closest('.product-card') || sourceElement.closest('.quick-add-modal');
            productImage = card ? card.querySelector('img') : null;
        }
        
        const cartIcon = document.querySelector('.cart-icon');
        
        if (!productImage || !cartIcon) {
            // Fallback if elements aren't found
            this.openCart();
            return;
        }

        const sourceRect = productImage.getBoundingClientRect();
        const cartRect = cartIcon.getBoundingClientRect();

        // Create flying element wrapper
        const flyingElement = document.createElement('div');
        flyingElement.className = 'flying-item';
        
        // Initial position (center of source image)
        flyingElement.style.left = `${sourceRect.left}px`;
        flyingElement.style.top = `${sourceRect.top}px`;
        flyingElement.style.width = `${sourceRect.width}px`;
        flyingElement.style.height = `${sourceRect.height}px`;
        
        // Ensure proper z-index and absolute positioning
        flyingElement.style.position = 'fixed';
        flyingElement.style.zIndex = '9999';
        flyingElement.style.pointerEvents = 'none';
        flyingElement.style.transition = 'all 0.8s cubic-bezier(0.25, 1, 0.5, 1)';
        
        // Clone the original product image
        const imgClone = productImage.cloneNode(true);
        imgClone.style.width = '100%';
        imgClone.style.height = '100%';
        imgClone.style.objectFit = 'cover';
        imgClone.style.borderRadius = '8px';
        imgClone.style.boxShadow = '0 10px 25px rgba(0,0,0,0.2)';
        flyingElement.appendChild(imgClone);

        document.body.appendChild(flyingElement);

        // Force browser repaint
        flyingElement.getBoundingClientRect();

        // Calculate translation distances and scale
        const tx = cartRect.left - sourceRect.left + (cartRect.width / 2) - (sourceRect.width / 2);
        const ty = cartRect.top - sourceRect.top + (cartRect.height / 2) - (sourceRect.height / 2);
        
        // Start animation to cart
        flyingElement.style.transform = `translate(${tx}px, ${ty}px) scale(0.1)`;
        flyingElement.style.opacity = '0.5';

        // Trigger cart pulse and cleanup
        setTimeout(() => {
            cartIcon.classList.add('cart-pulse');
            
            // Clean up pulse and open cart
            setTimeout(() => {
                cartIcon.classList.remove('cart-pulse');
                this.openCart();
            }, 300);
            
            flyingElement.remove();
        }, 800);
    }

    showNotification(message, type = "info") {
        // Create a simple notification system
        const notification = document.createElement("div")
        notification.className = `notification-toast notification-${type}`
        notification.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i> <span>${message}</span>`

        // Style the notification
        Object.assign(notification.style, {
            position: "fixed",
            top: "20px",
            right: "20px",
            padding: "16px 24px",
            borderRadius: "12px",
            backgroundColor: type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : type === 'warning' ? '#f59e0b' : '#3b82f6',
            color: "white",
            fontWeight: "600",
            boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
            zIndex: "10000",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            transform: "translateX(120%)",
            transition: "transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
        })

        document.body.appendChild(notification)

        // Animate in
        setTimeout(() => {
            notification.style.transform = "translateX(0)"
        }, 100)

        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.transform = "translateX(120%)"
            setTimeout(() => {
                document.body.removeChild(notification)
            }, 400)
        }, 3000)
    }

    async saveToLocalStorage() {
        try {
            secureStorage.setItem(this.storageKey, this.items);
        } catch (error) {
            console.error("Failed to save cart to localStorage:", error)
        }
    }

    async loadFromLocalStorage() {
        try {
            const saved = secureStorage.getItem(this.storageKey);
            // Ensure we always have an array
            this.items = Array.isArray(saved) ? saved : [];
            this.updateCartDisplay();
        } catch (error) {
            console.error("Failed to load cart from localStorage:", error)
            this.items = []
        }
    }

    handleCheckout(e) {
        e.preventDefault()
        if (this.items.length === 0) {
            this.showNotification("Il carrello è vuoto", "warning")
            return
        }
        window.location.href = "checkout.html"
    }

    // Utility method to escape HTML
    escapeHtml(text) {
        const div = document.createElement("div")
        div.textContent = text
        return div.innerHTML
    }
}

// The ShoppingCart class is exported and should be initialized by the consuming page.
