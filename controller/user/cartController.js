const Cart = require('../../models/cartSchema');
const Product = require('../../models/productSchema');
const User = require('../../models/userSchema');
const Wishlist = require('../../models/wishlistSchema');
const {StatusCode} = require('../../config/statuscode');


const getCartPage = async (req, res) => {
  try {
    const userId = req.session.user;

    if (!userId) return res.redirect('/login');

    let cart = await Cart.findOne({ userId }).populate('items.productId');

    if (!cart || cart.items.length === 0) {
      return res.render('cart', {
        cartItems: [],
        total: 0,
        user: req.session.user || null,
        isLoggedIn: !!req.session.user
      });
    }

    const validItems = cart.items.filter(item => item.productId);

    let total = 0;
    validItems.forEach(item => {
      total += item.totalPrice;
    });

    res.render('cart', {
      cartItems: validItems,
      total,
      user: req.session.user || null,
      isLoggedIn: !!req.session.user
    });

  } catch (err) {
    console.error("Error loading cart page:", err);
    res.redirect('/pageNotFound');
  }
};

const addToCart = async (req, res) => {
  try {
    const userId = req.session.user;

    if (!userId) {
      console.log('❌ User not logged in');
      res.setHeader('Content-Type', 'application/json');
      return res.status(401).json({ success: false, message: 'Please login to add items to cart' });
    }

    const { productId, variant, quantity = 1 } = req.body;

    console.log('add to cart req.body', req.body);

    const product = await Product.findById(productId);
    if (!product) {
      console.log('❌ Product not found:', productId);
      res.setHeader('Content-Type', 'application/json');
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    let cart = await Cart.findOne({ userId });

    if (!cart) {
      cart = new Cart({ userId, items: [] });
    }

    const existingItemIndex = cart.items.findIndex(
      item => item.productId.toString() === productId
    );

    const qty = parseInt(quantity) || 1;
    const itemPrice = product.salePrice;

    if (existingItemIndex > -1) {
      cart.items[existingItemIndex].quantity += qty;
      cart.items[existingItemIndex].totalPrice = cart.items[existingItemIndex].quantity * itemPrice;
    } else {
      cart.items.push({
        productId: product._id,
        quantity: qty,
        variant: {
          size: variant || null
        },
        totalPrice: itemPrice * qty
      });
    }

    await cart.save();

    let wishlist = await Wishlist.findOne({ userId });

    if (!wishlist) {
      wishlist = new Wishlist({ userId, products: [] });
      await wishlist.save();
    }

    if (wishlist && Array.isArray(wishlist.products)) {
      const productIndex = wishlist.products.findIndex(item => item.productId.toString() === productId);

      if (productIndex > -1) {
        console.log(`Removing product from wishlist: ${productId}`); 
        wishlist.products.splice(productIndex, 1);
        await wishlist.save();
      } else {
        console.log(`Product not found in wishlist: ${productId}`);
      }
    } else {
      console.log("Wishlist products is not an array or no wishlist found."); 
    }

    

    // Check if this is an AJAX request - enhanced detection
    const isAjax = req.xhr ||
                  req.headers.accept?.indexOf('json') > -1 ||
                  req.headers['x-requested-with'] === 'XMLHttpRequest' ||
                  req.headers['content-type']?.indexOf('json') > -1 ||
                  req.headers['accept']?.includes('application/json');

    console.log('Cart addition debug:', {
      isAjax,
      xhr: req.xhr,
      acceptHeader: req.headers.accept,
      xRequestedWith: req.headers['x-requested-with'],
      contentType: req.headers['content-type'],
      variant,
      cartItemsCount: cart.items.length,
      allHeaders: req.headers
    });

    // Force JSON response for requests with XMLHttpRequest header
    if (req.headers['x-requested-with'] === 'XMLHttpRequest' ||
        req.headers.accept?.includes('application/json')) {
      console.log('✅ Returning JSON response for cart addition');
      res.setHeader('Content-Type', 'application/json');
      return res.json({
        success: true,
        message: `Product added to cart successfully! Size: ${variant}`,
        cartItemsCount: cart.items.length,
        productId: productId
      });
    }

    // Fallback redirect for non-AJAX requests
    console.log('❌ Redirecting to cart page - AJAX not detected');
    res.redirect('/cart');

  } catch (err) {
    console.error("❌ Error adding to cart:", err.message);

    // Always return JSON error for now (since we're using AJAX)
    res.setHeader('Content-Type', 'application/json');
    return res.status(500).json({
      success: false,
      message: 'Failed to add product to cart',
      error: err.message
    });
  }
};


const removeCartItem = async (req, res) => {
  try {
    const cartItemId = req.params.id; 
    await Cart.updateOne(
      { userId: req.session.user._id },
      { $pull: { items: { _id: cartItemId } } }
    );

    res.redirect('/cart');
  } catch (err) {
    console.error('Error removing item:', err);
    res.status(StatusCode.INTERNAL_SERVER_ERROR).send("Something went wrong");
  }
};


const updateCartQty = async (req, res) => {
  try {
    const cartItemId = req.params.id;
    const qty = parseInt(req.body.qty);

    if (!qty || qty < 1 || qty > 99) {
      return res.json({ success: false, message: 'Invalid quantity' });
    }

    // Find the cart
    const cart = await Cart.findOne({ userId: req.session.user._id });
    if (!cart) {
      return res.json({ success: false, message: 'Cart not found' });
    }

    // Find the item inside the cart
    const item = cart.items.find(item => item._id.toString() === cartItemId);
    if (!item) {
      return res.json({ success: false, message: 'Item not found in cart' });
    }

    // Fetch the current product price
    const product = await Product.findById(item.productId);
    if (!product) {
      return res.json({ success: false, message: 'Product not found' });
    }

    // Update quantity and total price
    item.quantity = qty;
    item.totalPrice = qty * product.salePrice;

    await cart.save();

    res.json({ success: true, message: 'Quantity updated successfully' });
  } catch (err) {
    console.error('Error:', err);
    res.status(StatusCode.INTERNAL_SERVER_ERROR).send('Something went wrong');
  }
};

const updateVariant = async (req, res) => {
  try {
    console.log('its workingsss');
    const cartItemId = req.params.id;
    const { newSize } = req.body;
    console.log(cartItemId);
    console.log(req.body);
    console.log(newSize);

    const cart = await Cart.findOne({ userId: req.session.user._id });
    if (!cart) {
      return res.json({ success: false, message: 'Cart not found' });
    }

    const item = cart.items.find(item => item._id.toString() === cartItemId);
    if (!item) {
      return res.json({ success: false, message: 'Item not found in cart' });
    }

    item.variant.size = newSize;

    await cart.save();

    res.status(200).json({ 
      message: 'Variant updated successfully',
      newSize: newSize 
    });
  } catch (error) {
    console.error('Error updating variant:', error);
    res.status(500).json({ message: 'Server error' });
  }
};


module.exports = {
  getCartPage,
  addToCart,
  removeCartItem,
  updateCartQty,
  updateVariant
};