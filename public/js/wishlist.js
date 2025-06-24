// Wishlist functionality with success messages
document.addEventListener('DOMContentLoaded', function() {
    
    // Function to show success/error messages
    function showWishlistMessage(message, type = 'success') {
        // Remove any existing messages
        const existingMessage = document.querySelector('.wishlist-message');
        if (existingMessage) {
            existingMessage.remove();
        }

        // Create message element
        const messageDiv = document.createElement('div');
        messageDiv.className = `alert alert-${type} alert-dismissible fade show wishlist-message`;
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
                <i class="fas fa-heart text-${type === 'success' ? 'danger' : 'warning'} me-2"></i>
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

    // Function to handle wishlist addition
    function addToWishlist(productId, buttonElement) {
        console.log('Adding to wishlist:', productId);

        // Show loading state
        const originalContent = buttonElement.innerHTML;
        buttonElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        buttonElement.style.pointerEvents = 'none';

        // Make AJAX request
        fetch(`/addToWishlist?id=${productId}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/json'
            }
        })
        .then(response => {
            console.log('Response status:', response.status);
            console.log('Response headers:', response.headers.get('content-type'));
            return response.json();
        })
        .then(data => {
            console.log('Response data:', data);
            if (data.success) {
                showWishlistMessage(data.message, 'success');
                
                // Optional: Change button appearance to indicate added state
                buttonElement.innerHTML = '<i class="fas fa-heart text-danger"></i>';
                buttonElement.style.backgroundColor = '#f8f9fa';
                buttonElement.style.borderColor = '#dc3545';
                buttonElement.title = 'Added to Wishlist';
                
                // Disable the button to prevent duplicate additions
                setTimeout(() => {
                    buttonElement.style.pointerEvents = 'none';
                    buttonElement.style.opacity = '0.7';
                }, 500);
                
            } else {
                showWishlistMessage(data.message, 'warning');
                // Restore button
                buttonElement.innerHTML = originalContent;
                buttonElement.style.pointerEvents = 'auto';
            }
        })
        .catch(error => {
            console.error('Error adding to wishlist:', error);
            showWishlistMessage('Failed to add product to wishlist. Please try again.', 'danger');
            // Restore button
            buttonElement.innerHTML = originalContent;
            buttonElement.style.pointerEvents = 'auto';
        });
    }

    // Add click event listeners to all wishlist buttons
    function initializeWishlistButtons() {
        console.log('Initializing wishlist buttons...');

        // Handle direct wishlist links
        const wishlistLinks = document.querySelectorAll('a[href*="/addToWishlist"]');
        console.log('Found wishlist links:', wishlistLinks.length);

        wishlistLinks.forEach(link => {
            link.addEventListener('click', function(e) {
                e.preventDefault();
                console.log('Wishlist link clicked:', this.href);
                const url = new URL(this.href);
                const productId = url.searchParams.get('id');
                if (productId) {
                    addToWishlist(productId, this);
                }
            });
        });

        // Handle wishlist buttons with data attributes
        document.querySelectorAll('[data-wishlist-id]').forEach(button => {
            button.addEventListener('click', function(e) {
                e.preventDefault();
                const productId = this.dataset.wishlistId;
                if (productId) {
                    addToWishlist(productId, this);
                }
            });
        });
    }

    // Initialize on page load
    initializeWishlistButtons();

    // Re-initialize when new content is loaded (for dynamic content)
    window.reinitializeWishlistButtons = initializeWishlistButtons;
});

// Export functions for use in other scripts
window.WishlistManager = {
    addToWishlist: function(productId, buttonElement) {
        // This allows other scripts to call the wishlist function
        const event = new CustomEvent('addToWishlist', {
            detail: { productId, buttonElement }
        });
        document.dispatchEvent(event);
    }
};
