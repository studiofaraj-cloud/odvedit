    document.addEventListener('DOMContentLoaded', () => {
        const triggers = document.querySelectorAll('.quick-add-trigger');
        const overlay = document.getElementById('quickAddOverlay');
        const closeBtn = document.querySelector('.quick-add-close');
        
        // Modal Elements — may be absent on pages without the modal HTML
        const modalImg = document.getElementById('qa-image');
        const modalTitle = document.getElementById('qa-title');
        const modalSizes = document.getElementById('qa-sizes');
        const modalPrice = document.getElementById('qa-price');
        const modalQty = document.getElementById('qa-qty');
        const btnMinus = document.querySelector('.qa-qty-btn.minus');
        const btnPlus = document.querySelector('.qa-qty-btn.plus');
        const btnSubmit = document.getElementById('qa-submit');

        // If no triggers are present, nothing to do
        if (!triggers.length) return;
        
        let currentProduct = null;
        let selectedVariant = null;
        let currentQuantity = 1;

        function updateModalPrice() {
            if (!selectedVariant) return;
            const total = (selectedVariant.price * currentQuantity).toFixed(2);
            modalPrice.innerHTML = `€${total}`;
        }
        
        function renderSizes(variants) {
            modalSizes.innerHTML = '';
            variants.forEach((v, index) => {
                const btn = document.createElement('div');
                btn.className = `qa-size-option ${index === 0 ? 'selected' : ''}`;
                btn.textContent = v.size;
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.qa-size-option').forEach(el => el.classList.remove('selected'));
                    btn.classList.add('selected');
                    selectedVariant = v;
                    updateModalPrice();
                });
                modalSizes.appendChild(btn);
                if (index === 0) selectedVariant = v;
            });
        }
        
        function openModal(productName, imageSrc, variants) {
            currentProduct = productName;
            currentQuantity = 1;
            modalQty.textContent = currentQuantity;
            
            modalTitle.textContent = productName;
            modalImg.src = imageSrc;
            
            renderSizes(variants);
            updateModalPrice();
            
            overlay.classList.add('open');
            document.body.style.overflow = "hidden";
        }
        
        function closeModal() {
            overlay.classList.remove('open');
            document.body.style.overflow = "";
            currentProduct = null;
            selectedVariant = null;
            
            // Allow animation to finish before reset
            setTimeout(() => {
                if (btnSubmit) {
                    btnSubmit.innerHTML = '<i class="fas fa-cart-plus"></i> Aggiungi al Carrello';
                    btnSubmit.style.background = '';
                }
            }, 300);
        }

        triggers.forEach(trigger => {
            trigger.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                const productName = trigger.dataset.product;
                const imageSrc = trigger.dataset.image;
                const variants = JSON.parse(trigger.dataset.variants || '[]');
                
                if (variants.length === 0) return;
                
                // If single size, add immediately!
                if (variants.length === 1) {
                    const v = variants[0];
                    const item = {
                        id: `${productName}-${v.size}`,
                        name: productName,
                        price: v.price,
                        size: v.size,
                        image: imageSrc,
                        quantity: 1
                    };
                    
                    if (window.shoppingCart) {
                        try {
                            const origHtml = trigger.innerHTML;
                            trigger.innerHTML = '<i class="fas fa-check"></i>';
                            trigger.style.background = '#10b981';
                            trigger.style.color = '#fff';
                            
                            await window.shoppingCart.addItem(item);
                            
                            // Show sleek modern notification
                            window.shoppingCart.showNotification(`<strong>${productName}</strong> aggiunto al carrello!`, 'success');
                            
                            // Re-use global flying animation from shoppingCart!
                            if (window.shoppingCart.createFlyingCartAnimation) {
                                window.shoppingCart.createFlyingCartAnimation(trigger);
                            }
                            
                            setTimeout(() => {
                                trigger.innerHTML = origHtml;
                                trigger.style.background = '';
                                trigger.style.color = '';
                            }, 2000);
                        } catch (err) {
                            console.error('[Quick Add] Error adding item:', err);
                        }
                    }
                } else {
                    openModal(productName, imageSrc, variants);
                }
            });
        });

        // Quantity handlers (only if modal elements exist)
        if (btnMinus) btnMinus.addEventListener('click', () => {
            if (currentQuantity > 1) {
                currentQuantity--;
                modalQty.textContent = currentQuantity;
                updateModalPrice();
            }
        });
        
        if (btnPlus) btnPlus.addEventListener('click', () => {
            currentQuantity++;
            modalQty.textContent = currentQuantity;
            updateModalPrice();
        });
        
        // Form Submit handler
        if (btnSubmit) btnSubmit.addEventListener('click', async () => {
            if (!currentProduct || !selectedVariant) return;
            
            const item = {
                id: `${currentProduct}-${selectedVariant.size}`,
                name: currentProduct,
                price: selectedVariant.price,
                size: selectedVariant.size,
                image: modalImg.src,
                quantity: currentQuantity
            };
            
            if (window.shoppingCart) {
                btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Aggiunta in corso...';
                
                try {
                    await window.shoppingCart.addItem(item);
                    
                    // Show sleek modern notification
                    window.shoppingCart.showNotification(`<strong>${currentProduct}</strong> aggiunto al carrello!`, 'success');
                    
                    btnSubmit.innerHTML = '<i class="fas fa-check"></i> Aggiunto!';
                    btnSubmit.style.background = 'linear-gradient(135deg, #10b981, #059669)';
                    
                    // Automatically open cart overlay after success delay (let them see success first!)
                    setTimeout(() => {
                        closeModal();
                        if(window.shoppingCart.openCart) {
                             window.shoppingCart.openCart();
                        }
                    }, 500);
                } catch(err) {
                    console.error('[Quick Modal] Add failed:', err);
                    btnSubmit.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Errore';
                    btnSubmit.style.background = '#ef4444';
                }
            }
        });

        // Close handlers (only if modal elements exist)
        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        if (overlay) overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });

        // Inject "Add to cart" tooltip into each trigger button.
        // The translation value for t_1f8f127a includes an <i> icon (it's shared with the modal
        // submit button), so we must use innerHTML, not textContent. data-i18n keeps the tooltip
        // in sync on language change (applyTranslations re-queries the entire DOM).
        triggers.forEach(trigger => {
            const tooltip = document.createElement('span');
            tooltip.className = 'quick-add-tooltip';
            tooltip.setAttribute('data-i18n', 't_1f8f127a');
            const html = (window.translate ? window.translate('t_1f8f127a', '<i class="fas fa-cart-plus"></i> Aggiungi al Carrello') : '<i class="fas fa-cart-plus"></i> Aggiungi al Carrello');
            tooltip.innerHTML = html;
            trigger.appendChild(tooltip);
        });
    });