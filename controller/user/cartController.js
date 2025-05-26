const Cart = require('../../models/cartSchema');
const Product = require('../../models/productSchema');
const User = require('../../models/userSchema');
const Wishlist = require('../../models/wishlistSchema');
const StatusCode = require('../../config/statuscode');


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

    // Filter out items with null productId
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
    if (!userId) return res.redirect('/login');

    const { productId, quantity } = req.body;

    const product = await Product.findById(productId);
    if (!product) return res.status(StatusCode.NOT_FOUND).send("Product not found");

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

    // await Wishlist.updateOne({userId},{$pull:{items:{productId:product._id}}});

    res.redirect('/cart');

  } catch (err) {
    console.error("Error adding to cart:", err.message);
    res.status(StatusCode.INTERNAL_SERVER_ERROR).send("Internal Server Error");
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



module.exports = {
  getCartPage,
  addToCart,
  removeCartItem,
  updateCartQty
};