const { request } = require('../../app');
const Cart = require('../../models/cartSchema');
const Product = require('../../models/productSchema');
const User = require('../../models/userSchema');
const Wishlist  = require('../../models/wishlistSchema')
const {StatusCode} = require('../../config/statuscode');



const getWishlist = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = 8;
    const skip = (page - 1) * limit;
    const user = await User.findById(userId);

    const wishlistDoc = await Wishlist.findOne({ userId }).populate({
      path: 'products.productId',
      populate: { path: 'category' }
    });

    const cartDoc = await Cart.findOne({ userId });
    const cartProductIds = (cartDoc && cartDoc.items)  
      ? cartDoc.items.map(p => p.productId.toString())  // ← Changed from 'products' to 'items'
      : [];

    if (!wishlistDoc) {
      return res.render('wishlist', {
        user,
        wishlist: [],
        totalPages: 0,
        currentPage: 1
      });
    }

    const validProducts = wishlistDoc.products.filter(p => p.productId);
    const totalCount = validProducts.length;
    const totalPages = Math.ceil(totalCount / limit);

    const wishlistProducts = validProducts
      .slice(skip, skip + limit)
      .map(p => ({
        ...p.productId.toObject(),
        isInCart: cartProductIds.includes(p.productId._id.toString())
      }));

    console.log('cartdata', wishlistProducts);
    res.render('wishlist', {
      user,
      wishlist: wishlistProducts,
      totalPages,
      currentPage: page
    });
  } catch (error) {
    console.log("Error in wishlist:", error);
    res.redirect('/pageNotFound');
  }
};

const addToWishlist = async (req, res) => {
    try {
        const productId = req.query.id;
        const userId = req.session.user._id;

        // Debug logging
        console.log('Add to wishlist request:', {
            productId,
            userId,
            isXHR: req.xhr,
            acceptHeader: req.headers.accept,
            xRequestedWith: req.headers['x-requested-with']
        });

        if (!userId) {
            console.error('User not logged in.');
            if (req.xhr || req.headers.accept?.indexOf('json') > -1 || req.headers['x-requested-with'] === 'XMLHttpRequest') {
                return res.status(401).json({ success: false, message: 'Please login to add items to wishlist' });
            }
            return res.redirect('/login');
        }

        let wishlist = await Wishlist.findOne({ userId });

        if (!wishlist) {
            wishlist = new Wishlist({
                userId,
                products: [{ productId }]
            });
        } else {
            const isAlreadyInWishlist = wishlist.products.some(item =>
                item.productId.toString() === productId
            );

            if (isAlreadyInWishlist) {
                if (req.xhr || req.headers.accept?.indexOf('json') > -1 || req.headers['x-requested-with'] === 'XMLHttpRequest') {
                    return res.json({ success: false, message: 'Product is already in your wishlist' });
                }
                return res.redirect('/wishlist');
            }

            wishlist.products.push({ productId });
        }

        await wishlist.save();

        // Check if this is an AJAX request
        const isAjax = req.xhr ||
                      req.headers.accept?.indexOf('json') > -1 ||
                      req.headers['x-requested-with'] === 'XMLHttpRequest' ||
                      req.headers['content-type']?.indexOf('json') > -1;

        console.log('Is AJAX request:', isAjax);

        // Return JSON response for AJAX requests
        if (isAjax) {
            console.log('Returning JSON response for wishlist addition');
            return res.json({ success: true, message: 'Product added to wishlist successfully!' });
        }

        // Fallback redirect for non-AJAX requests
        console.log('Redirecting to wishlist page');
        res.redirect('/wishlist');
    } catch (error) {
        console.error("Error adding to wishlist:", error.message);
        if (req.xhr || req.headers.accept?.indexOf('json') > -1 || req.headers['x-requested-with'] === 'XMLHttpRequest') {
            return res.status(500).json({ success: false, message: 'Failed to add product to wishlist' });
        }
        res.status(500).send("Internal Server Error");
    }
};



const removeFromWishlist = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const productId = req.query.id;

        await Wishlist.updateOne(
            { userId },
            { $pull: { products: { productId: productId } } }
        );

        res.redirect('/wishlist');
    } catch (err) {
        console.log("Error removing from wishlist:", err);
        res.status().send('Internal Server Error');
    }
};




module.exports={getWishlist,addToWishlist,removeFromWishlist}