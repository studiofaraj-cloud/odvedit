/**
 * Image Protection Module
 * Prevents unauthorized downloading and saving of images
 */
class ImageProtection {
    constructor() {
        this.warningShown = false;
        this.longPressTimer = null;
        this.longPressDelay = 500;
        this.init();
    }

    init() {
        this.preventContextMenu();
        this.preventDragAndDrop();
        this.preventKeyboardShortcuts();
        this.preventMobileLongPress();
        this.addImageAttributes();
    }

    preventContextMenu() {
        document.addEventListener('contextmenu', (e) => {
            if (e.target.tagName === 'IMG') {
                e.preventDefault();
                this.showWarning('Right-click disabled on images');
                return false;
            }
        });
    }

    preventDragAndDrop() {
        document.addEventListener('dragstart', (e) => {
            if (e.target.tagName === 'IMG') {
                e.preventDefault();
                this.showWarning('Image dragging is disabled');
                return false;
            }
        });

        document.addEventListener('drag', (e) => {
            if (e.target.tagName === 'IMG') {
                e.preventDefault();
                return false;
            }
        });
    }

    preventKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            const target = e.target;
            
            if (target.tagName === 'IMG' || target.closest('img')) {
                if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                    e.preventDefault();
                    this.showWarning('Saving images is disabled');
                    return false;
                }
            }

            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'I') {
                const selection = window.getSelection();
                if (selection && selection.anchorNode) {
                    const selectedElement = selection.anchorNode.nodeType === Node.ELEMENT_NODE 
                        ? selection.anchorNode 
                        : selection.anchorNode.parentElement;
                    
                    if (selectedElement && selectedElement.closest('img')) {
                        e.preventDefault();
                        this.showWarning('Developer tools are restricted on images');
                        return false;
                    }
                }
            }
        });
    }

    preventMobileLongPress() {
        let touchedElement = null;

        document.addEventListener('touchstart', (e) => {
            if (e.target.tagName === 'IMG') {
                touchedElement = e.target;
                
                this.longPressTimer = setTimeout(() => {
                    this.showWarning('Long-press disabled on images');
                }, this.longPressDelay);
            }
        }, { passive: true });

        document.addEventListener('touchend', () => {
            if (this.longPressTimer) {
                clearTimeout(this.longPressTimer);
                this.longPressTimer = null;
            }
            touchedElement = null;
        });

        document.addEventListener('touchmove', () => {
            if (this.longPressTimer) {
                clearTimeout(this.longPressTimer);
                this.longPressTimer = null;
            }
        });

        document.addEventListener('touchcancel', () => {
            if (this.longPressTimer) {
                clearTimeout(this.longPressTimer);
                this.longPressTimer = null;
            }
            touchedElement = null;
        });
    }

    addImageAttributes() {
        const images = document.querySelectorAll('img');
        images.forEach(img => {
            img.setAttribute('draggable', 'false');
            img.style.userSelect = 'none';
            img.style.webkitUserSelect = 'none';
            img.style.mozUserSelect = 'none';
            img.style.msUserSelect = 'none';
            img.style.pointerEvents = 'auto';
        });

        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if (node.tagName === 'IMG') {
                            this.protectImage(node);
                        }
                        const images = node.querySelectorAll('img');
                        images.forEach(img => this.protectImage(img));
                    }
                });
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    protectImage(img) {
        img.setAttribute('draggable', 'false');
        img.style.userSelect = 'none';
        img.style.webkitUserSelect = 'none';
        img.style.mozUserSelect = 'none';
        img.style.msUserSelect = 'none';
        img.style.pointerEvents = 'auto';
    }

    showWarning(message) {
        console.warn(`🔒 Image Protection: ${message}`);
        
        if (!this.warningShown) {
            console.warn('🔒 Image Protection: Images on this site are protected from unauthorized downloading.');
            this.warningShown = true;
        }
    }

    destroy() {
        const images = document.querySelectorAll('img');
        images.forEach(img => {
            img.removeAttribute('draggable');
            img.style.userSelect = '';
            img.style.webkitUserSelect = '';
            img.style.mozUserSelect = '';
            img.style.msUserSelect = '';
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.imageProtection = new ImageProtection();
    });
} else {
    window.imageProtection = new ImageProtection();
}
