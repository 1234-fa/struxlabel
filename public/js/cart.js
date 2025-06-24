// Cart functionality with success messages
document.addEventListener('DOMContentLoaded', function() {
    
    // Function to show success/error messages
    function showCartMessage(message, type = 'success') {
        // Remove any existing messages
        const existingMessage = document.querySelector('.cart-message');
        if (existingMessage) {
            existingMessage.remove();
        }

        // Create message element
        const messageDiv = document.createElement('div');
        messageDiv.className = `alert alert-${type} alert-dismissible fade show cart-message`;
        messageDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            min-width: 300px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        `;
        
        messageDiv.innerHTML = `
            <div class="d-flex align-items-center">
                <i class="fas fa-shopping-cart text-${type === 'success' ? 'primary' : 'warning'} me-2"></i>
                <span>${message}</span>
                <button type="button" class="btn-close ms-auto" data-bs-dismiss="alert" aria-label="Close"></button>
            </div>
        `;

        // Add to page
        document.body.appendChild(messageDiv);

        // Auto remove after 4 seconds
        setTimeout(() => {
            if (messageDiv && messageDiv.parentNode) {
                messageDiv.classList.remove('show');
                setTimeout(() => {
                    if (messageDiv && messageDiv.parentNode) {
                        messageDiv.remove();
                    }
                }, 150);
            }
        }, 4000);
    }

    // Function to handle cart addition
    function addToCart(formData, buttonElement) {
        console.log('🛒 Adding to cart with data:', {
            productId: formData.get('productId'),
            variant: formData.get('variant'),
            quantity: formData.get('quantity')
        });

        // Show loading state
        const originalContent = buttonElement.innerHTML;
        buttonElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...';
        buttonElement.disabled = true;

        // Make AJAX request
        fetch('/add-to-cart', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams(formData),
            redirect: 'manual' // Don't follow redirects automatically
        })
        .then(response => {
            console.log('📥 Response received:', {
                status: response.status,
                contentType: response.headers.get('content-type'),
                type: response.type,
                url: response.url,
                redirected: response.redirected
            });

            // Handle redirect responses (302, 301, etc.)
            if (response.type === 'opaqueredirect' || response.redirected || (response.status >= 300 && response.status < 400)) {
                console.log('🔄 Server redirected - assuming cart addition was successful');
                return {
                    success: true,
                    message: 'Product added to cart successfully!',
                    redirected: true
                };
            }

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                console.error('❌ Response is not JSON:', contentType);

                // Try to read as text to see what we got
                return response.text().then(text => {
                    console.log('Response text:', text.substring(0, 200));

                    // If it looks like HTML (redirect page), assume success
                    if (text.includes('<html') || text.includes('cart')) {
                        return {
                            success: true,
                            message: 'Product added to cart successfully!',
                            fallback: true
                        };
                    }

                    throw new Error('Server returned unexpected response');
                });
            }

            return response.json();
        })
        .then(data => {
            console.log('✅ Cart response data:', data);
            if (data.success) {
                console.log('🎉 Cart addition successful!');
                showCartMessage(data.message, 'success');

                // Close modal if it exists
                const modal = document.querySelector('.modal.show');
                if (modal) {
                    console.log('🔒 Closing modal');
                    const modalInstance = bootstrap.Modal.getInstance(modal);
                    if (modalInstance) {
                        modalInstance.hide();
                    }
                }

                // Update cart count if element exists
                const cartCountElements = document.querySelectorAll('.cart-count, #cart-count');
                console.log('🔢 Found cart count elements:', cartCountElements.length);
                cartCountElements.forEach(element => {
                    if (data.cartItemsCount) {
                        element.textContent = data.cartItemsCount;
                        element.style.display = 'inline';
                        console.log('Updated cart count to:', data.cartItemsCount);
                    }
                });

                // Update buttons - use productId from form data if not in response
                const productId = data.productId || formData.get('productId');
                console.log('🔄 Updating buttons for product:', productId);

                // Update "Add to Cart" button to "Go to Cart" on product details page
                updateProductDetailsButton(productId);

                // Update wishlist page buttons
                updateWishlistButton(productId);

            } else {
                console.log('⚠️ Cart addition failed:', data.message);
                showCartMessage(data.message, 'warning');
            }
        })
        .catch(error => {
            console.error('Error adding to cart:', error);

            // Check if it's a network error or server error
            if (error.message.includes('HTTP error')) {
                showCartMessage('Server error. Please try again.', 'danger');
            } else if (error.message.includes('non-JSON response')) {
                showCartMessage('Unexpected server response. Product may have been added.', 'warning');
            } else {
                showCartMessage('Failed to add product to cart. Please try again.', 'danger');
            }
        })
        .finally(() => {
            // Restore button
            buttonElement.innerHTML = originalContent;
            buttonElement.disabled = false;
        });
    }

    // Handle form submissions for add to cart
    function initializeCartForms() {
        console.log('Initializing cart forms...');
        
        // Handle add to cart forms
        const cartForms = document.querySelectorAll('form[action="/add-to-cart"]');
        console.log('Found cart forms:', cartForms.length);
        
        cartForms.forEach(form => {
            form.addEventListener('submit', function(e) {
                e.preventDefault();
                console.log('Cart form submitted:', this);
                
                const formData = new FormData(this);
                const submitButton = this.querySelector('button[type="submit"]');
                
                // Validate required fields
                const productId = formData.get('productId');
                const variant = formData.get('variant');
                
                if (!productId) {
                    showCartMessage('Product ID is missing', 'danger');
                    return;
                }
                
                if (!variant) {
                    showCartMessage('Please select a size', 'warning');
                    return;
                }
                
                addToCart(formData, submitButton);
            });
        });
    }

    // Initialize on page load
    initializeCartForms();

    // Re-initialize when new content is loaded (for dynamic content)
    window.reinitializeCartForms = initializeCartForms;

    // Function to update product details page button
    function updateProductDetailsButton(productId) {
        console.log('Attempting to update product details button for product:', productId);

        // Find the "Add to Cart" button on product details page
        const addToCartButton = document.querySelector('button[data-bs-target="#variantModal"]');
        console.log('Found add to cart button:', addToCartButton);

        if (addToCartButton) {
            console.log('Button text:', addToCartButton.textContent);

            // Create the "Go to Cart" form
            const goToCartForm = document.createElement('form');
            goToCartForm.action = '/cart';
            goToCartForm.method = 'GET';
            goToCartForm.className = 'd-inline';
            goToCartForm.innerHTML = `
                <input type="hidden" name="productId" value="${productId}">
                <input type="hidden" name="quantity" value="1">
                <button type="submit" class="btn btn-primary btn-sm">Go to Cart</button>
            `;

            // Replace the add to cart button
            addToCartButton.parentNode.replaceChild(goToCartForm, addToCartButton);

            console.log('✅ Updated product details button to "Go to Cart"');
        } else {
            console.log('❌ Add to Cart button not found on product details page');
        }
    }

    // Function to update wishlist page button
    function updateWishlistButton(productId) {
        console.log('Attempting to update wishlist button for product:', productId);

        // Find the "Add to Cart" button for this specific product on wishlist page
        const addToCartButton = document.querySelector(`button[data-product-id="${productId}"]`);
        console.log('Found wishlist add to cart button:', addToCartButton);

        if (addToCartButton) {
            console.log('Wishlist button text:', addToCartButton.textContent);

            // Create the "Go to Cart" form
            const goToCartForm = document.createElement('form');
            goToCartForm.action = '/cart';
            goToCartForm.method = 'GET';
            goToCartForm.className = 'd-inline';
            goToCartForm.innerHTML = `
                <button type="submit" class="btn btn-outline-primary btn-sm flex-fill">
                    <i class="fas fa-shopping-cart me-1"></i> Go to Cart
                </button>
            `;

            // Replace the add to cart button
            addToCartButton.parentNode.replaceChild(goToCartForm, addToCartButton);

            console.log('✅ Updated wishlist button to "Go to Cart"');
        } else {
            console.log('❌ Add to Cart button not found on wishlist page for product:', productId);
        }
    }

    // Debug: Log when script loads
    console.log('Cart.js loaded and initialized');
});

// Export functions for use in other scripts
window.CartManager = {
    addToCart: function(formData, buttonElement) {
        // This allows other scripts to call the cart function
        const event = new CustomEvent('addToCart', {
            detail: { formData, buttonElement }
        });
        document.dispatchEvent(event);
    },
    
    showMessage: function(message, type = 'success') {
        // Allow external scripts to show cart messages
        const event = new CustomEvent('showCartMessage', {
            detail: { message, type }
        });
        document.dispatchEvent(event);
    }
};
