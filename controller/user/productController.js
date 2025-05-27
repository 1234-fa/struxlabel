const User = require("../../models/userSchema");
const Category = require('../../models/categorySchema');
const Product = require('../../models/productSchema');
const Cart = require('../../models/cartSchema');
const {StatusCode} = require('../../config/statuscode');


const productDetails = async (req, res) => {
    try {
      const userId = req.session.user;
      const userData = await User.findById(userId);
      const productId = req.query.id;
  
      if (!productId) {
        return res.redirect('/pageNotFound');
      }
  
      const product = await Product.findById(productId).populate('category');
      if (!product) {
        return res.redirect('/pageNotFound');
      }
  
      const findCategory = product.category;
      const categoryOffer = findCategory?.categoryOffer || 0;
      const productOffer = product.productOffer || 0;
      const totalOffer = categoryOffer + productOffer;
  
      const similarProducts = await Product.find({
        category: product.category._id,
        _id: { $ne: product._id },
      }).limit(4);

      let existingQtyincart=0;
      if(userId){
        const cart = await Cart.findOne({ userId: userId._id });
        if(cart){
          const cartItem = cart.items.find(item=>item.productId.toString()===productId);
          if(cartItem){
            existingQtyincart=cartItem.quantity;
          }
        }
      }
      console.log(existingQtyincart);
  
      res.render('product-details', {
        user: userData,
        product: product,
        quantity: product.quantity,
        totalOffer: totalOffer,
        category: findCategory,
        similarProducts: similarProducts,
        existingQtyincart,
        message:null
      });
  
    } catch (error) {
      console.error("Error in productDetails:", error);
      res.redirect('/pageNotFound');
    }
  };

module.exports = {productDetails}