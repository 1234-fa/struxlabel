const Cart = require('../models/cartSchema');
const Wishlist = require('../models/wishlistSchema');

const addCartWishlistCount = async (req, res, next) => {
    try {
        // Initialize counts
        let cartCount = 0;
        let wishlistCount = 0;

        // If user is logged in, get actual counts
        if (req.session.user) {
            // Handle different session structures
            const userId = req.session.user._id || req.session.user;

            // Get cart count
            const cart = await Cart.findOne({ userId });
            if (cart && cart.items) {
                cartCount = cart.items.length;
            }

            // Get wishlist count
            const wishlist = await Wishlist.findOne({ userId });
            if (wishlist && wishlist.products) {
                wishlistCount = wishlist.products.length;
            }

            console.log(`Cart/Wishlist counts for user ${userId}: Cart=${cartCount}, Wishlist=${wishlistCount}`);
        }

        // Add counts to res.locals so they're available in all templates
        res.locals.cartCount = cartCount;
        res.locals.wishlistCount = wishlistCount;

        next();
    } catch (error) {
        console.error('Error in cartWishlistCount middleware:', error);
        // Set default values on error
        res.locals.cartCount = 0;
        res.locals.wishlistCount = 0;
        next();
    }
};

module.exports = addCartWishlistCount;
