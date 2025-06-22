const User = require('../../models/userSchema');
const Cart = require('../../models/cartSchema');
const Product = require('../../models/productSchema')
const Address = require('../../models/addressSchema')
const Order = require('../../models/orderSchema');
const Coupon = require('../../models/coupenSchema');
const UserCoupon = require('../../models/userCouponSchema');
const Wallet = require('../../models/walletSchema');
const {StatusCode} = require('../../config/statuscode');
const mongoose = require("mongoose");
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const PricingCalculator = require('../../utils/pricingUtils');
const path = require('path');

const generateOrderId = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let orderId = '';
  for (let i = 0; i < 10; i++) {
    orderId += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return orderId;
};


const getOrderPage = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) return res.redirect('/login');

    const user = await User.findById(userId);
    if (!user) return res.redirect('/login');

    const coupons = await Coupon.find();
    console.log("coupons are ",coupons)

    const cart = await Cart.findOne({ userId }).populate('items.productId');

    let cartItems = [];
    let total = 0;

    if (cart && cart.items && cart.items.length > 0) {
      cartItems = cart.items.map(item => {
        const product = item.productId;
        const quantity = item.quantity;
        const variant = item.variant;
        const totalPrice = product ? product.salePrice * quantity : 0;

        total += totalPrice;

        return {
          product,
          quantity,
          variant,
          totalPrice
        };
      });
    }


    const userAddress = await Address.findOne({ userId });
      const addresses = userAddress ? userAddress.address : [];

    res.render('ordercart', {
      cartItems,
      totalAmount: total,
      user,
      addresses,
      coupons,
      isLoggedIn: true
    });

  } catch (error) {
    console.error("Error loading order page:", error.message);
    res.redirect('/pageNotFound');
  }
};


const getSingleOrderPage = async (req, res) => {
    try {
        const userId = req.session.user;
        const { productId, variant, variantStock, quantity = 1 } = req.body;
        
        
        if (!userId) return res.redirect('/login');
        if (!productId || !variant || !variantStock) {
            console.log("Missing required fields:", { productId, variant, variantStock });
            return res.redirect('/shop');
        }
        
        const user = await User.findById(userId);
        if (!user) return res.redirect('/login');
        
        const product = await Product.findById(productId);
        if (!product) return res.redirect('/shop');
        
        const availableStock = product.variants?.get(variant) || 0;
        if (availableStock < quantity) {
            return res.redirect('/shop?error=insufficient_stock');
        }
        
        const coupons = await Coupon.find();
        console.log("coupons are ", coupons);
        
        const totalPrice = product.salePrice * parseInt(quantity);
        
        const item = {
            product,
            variant,
            quantity: parseInt(quantity),
            availableStock: parseInt(variantStock),
            totalPrice,
        };
        
        const userAddress = await Address.findOne({ userId });
        const addresses = userAddress ? userAddress.address : [];
        
        res.render('order', {
            item,
            user,
            addresses,
            coupons,
            isLoggedIn: true,
        });
        
    } catch (error) {
        console.error("Error loading single product order page:", error.message);
        res.redirect('/pageNotFound');
    }
};


  const postPlaceOrder = async (req, res) => {
    try {
      const {
        productId,
        quantity,
        totalPrice,
        selected,
        paymentMethod,
        couponId ,
        deliveryCharge,
        variant
      } = req.body;
      
      console.log('=== ORDER PLACEMENT DEBUG ===');
        console.log('Raw req.body:', req.body);
        console.log('Extracted variant:', variant);
        console.log('Variant type:', typeof variant);
        console.log('Variant value:', JSON.stringify(variant));
        console.log('===============================');
      
      const userId = req.session.user?._id;
      if (!userId) {
        return res.status(StatusCode.UNAUTHORIZED).json({ message: 'User not logged in' });
      }
      
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(StatusCode.NOT_FOUND).json({ message: 'Product not found' });
      }
      
      const orderQty = Number(quantity);
        
        const availableStock = product.variants.get(variant) || 0;
        console.log(`Stock check - Size: ${variant}, Available: ${availableStock}, Requested: ${orderQty}`);
        
        if (availableStock < orderQty) {
            return res.status(StatusCode.BAD_REQUEST).json({ 
                message: `Insufficient stock available for size ${variant}. Only ${availableStock} items left.` 
            });
        }
      
      // console.log('Selected Address:', selected);
      
      // Create an address object with only the required fields
      const address = {
        addressType: selected.addressType,
        name: selected.name,
        city: selected.city,
        landMark: selected.landMark,
        state: selected.state,
        pincode: selected.pincode,
        phone: selected.phone,
        altphone: selected.altphone,
      };
      
      // Get coupon if provided
      let appliedCoupon = null;
      if (couponId) {
        appliedCoupon = await Coupon.findById(couponId);
      }

      // Calculate pricing using centralized utility
      const orderItems = [{
        product: product,
        quantity: orderQty,
        variant: { size: variant || null }
      }];

      const pricingResult = PricingCalculator.calculateOrderPricing(
        orderItems,
        appliedCoupon,
        deliveryCharge
      );

      console.log('Pricing calculation result:', pricingResult);

      // Create ordered item with complete pricing info
      const orderedItem = {
        product: product._id,
        quantity: orderQty,
        price: product.salePrice,
        regularPrice: product.regularPrice,
        salePrice: product.salePrice,
        offerDiscount: pricingResult.items[0].pricing.unitOfferDiscount,
        variant: { size: variant || null },
        status: 'processing'
      };

      // Mark coupon as used if applicable
      if (appliedCoupon && pricingResult.coupon.isValid) {
        if (!appliedCoupon.usersUsed.includes(userId)) {
          await Coupon.findByIdAndUpdate(
            couponId,
            { $push: { usersUsed: userId } }
          );
        }
      }

      const newOrder = new Order({
        orderId: generateOrderId(),
        user: userId,
        orderedItems: [orderedItem],
        totalPrice: pricingResult.totals.originalAmount,
        offerDiscount: pricingResult.totals.offerDiscount,
        couponDiscount: pricingResult.totals.couponDiscount,
        discount: pricingResult.totals.offerDiscount + pricingResult.totals.couponDiscount,
        finalAmount: pricingResult.totals.finalAmount,
        address: address,
        invoiceDate: new Date(),
        status: 'processing',
        createdOn: new Date(),
        coupon: couponId ? couponId : null,
        couponApplied: pricingResult.coupon.isValid,
        paymentMethod: paymentMethod,
        deliveryCharge: pricingResult.totals.deliveryCharge
      });
      
      // Save the order
      await newOrder.save();
      console.log('Saved order variant:', newOrder.orderedItems[0].variant);
        
        const updatedProduct = await Product.findByIdAndUpdate(
            productId,
            { $inc: { [`variants.${variant}`]: -orderQty } },
            { new: true }
        );
        
        if (!updatedProduct) {
            console.error('Stock update failed.');
        } else {
            const remainingStock = updatedProduct.variants.get(variant);
            console.log(`Stock updated for size ${variant}. Remaining: ${remainingStock}`);
        }
      
      // Clear any coupon from session
      if (req.session.appliedCoupon) {
        delete req.session.appliedCoupon;
      }
      
      // Only assign new coupons if no coupon was applied on this order
      if (!couponId) {
        // Find eligible coupons for next purchase
        const matchingCoupons = await Coupon.find({
          isActive: true,
          price: { $lte: totalPrice },
        });
        
        const validCoupons = [];
        for (let coupon of matchingCoupons) {
          const userUsedCount = coupon.usersUsed.filter(
            user => user.toString() === userId.toString()
          ).length;
          
          if (userUsedCount < coupon.userLimit) {
            validCoupons.push(coupon);
          }
        }
        
        // Pick highest discount
        validCoupons.sort((a, b) => b.discount - a.discount);
        
        if (validCoupons.length > 0) {
          const bestCoupon = validCoupons[0];
          const exists = await UserCoupon.findOne({
            userId: userId,
            couponDetails: bestCoupon._id,
          });
          
          if (!exists) {
            const newUserCoupon = new UserCoupon({
              userId: userId,
              couponDetails: bestCoupon._id,
              status: 'can_apply',
            });
            
            await newUserCoupon.save();
            console.log(`Best coupon "${bestCoupon.code}" assigned to user.`);
          }
        }
      }
      
      // Redirect to success page
      return res.redirect(`/order-success?orderId=${newOrder.orderId}`);
      
    } catch (error) {
      console.error('Error placing order:', error);
      return res.status(StatusCode.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Something went wrong while placing the order',
      });
    }
  };

  const getPaymentPage = async (req, res) => {
    try {
      const { selectedAddress, productId, quantity, totalPrice, couponId ,variant} = req.body;
      const userId = req.session.user;
      if (!userId) return res.redirect('/login');
      
      console.log("Selected Address:", selectedAddress);
      const addressDoc = await Address.findOne({ 'address._id': selectedAddress });
      let selected = null;
      
      if (addressDoc) {
        selected = addressDoc.address.find(addr => addr._id.toString() === selectedAddress.toString());
      } else {
        console.log("No address found.");
        return res.redirect('/checkout'); // Redirect if no address is found
      }
      
      const user = await User.findById(userId);
      const product = await Product.findById(productId);
      
      if (!product) return res.redirect('/shop');
      
      // Initialize variables for price calculation
      let originalPrice = product.regularPrice * quantity;
      let salePrice = product.salePrice * quantity;
      let finalTotal = totalPrice; // This is the price after any coupon discount
      let discountAmount = originalPrice - salePrice;
      let couponDiscount = 0;
      let appliedCoupon = null;
      
      // Check if coupon was applied
      if (couponId) {
        appliedCoupon = await Coupon.findById(couponId);
        if (appliedCoupon) {
          couponDiscount = (salePrice * appliedCoupon.discount / 100);
          finalTotal = salePrice - couponDiscount;
        }
      } else if (req.session.appliedCoupon) {
        // Fallback to session coupon if exists
        appliedCoupon = req.session.appliedCoupon;
        couponDiscount = salePrice - req.session.appliedCoupon.newTotal;
        finalTotal = req.session.appliedCoupon.newTotal;
      }
      const deliveryCharge = Number(finalTotal <= 2000 ? 54 :0);

      finalTotal=Number(finalTotal)+deliveryCharge;


      console.log("Price details:", {
        originalPrice,
        salePrice,
        couponDiscount,
        finalTotal,
        deliveryCharge
      });
      
      res.render('payment', {
        user,
        selected,
        razorpayKey: process.env.RAZORPAY_KEY_ID,
        orderSummary: {
          productId,
          quantity,
          variant,
          total: finalTotal,
          productName: product.productName,
          productImages: product.productImages,
          price: product.salePrice,
          regularPrice: product.regularPrice,
          originalTotal: originalPrice,
          saleTotal: salePrice,
          saveAmount: discountAmount,
          couponDiscount: couponDiscount,
          couponId: appliedCoupon ? appliedCoupon._id : null,
          couponName: appliedCoupon ? appliedCoupon.name : null,
          deliveryCharge: deliveryCharge          
        }
      });
    } catch (error) {
      console.error('Error in getPaymentPage:', error);
      res.status(StatusCode.INTERNAL_SERVER_ERROR).send('Something went wrong');
    }
  };


  const orderSuccess = async (req, res) => {
    try {
      const orderId = req.query.orderId; 
      const order = await Order.findOne({ orderId })
        .populate('orderedItems.product')
        .populate('address');
  
      if (!order) {
        return res.status(404).json({ message: 'Order not found' });
      }
  
      res.render('order-success', { order });
    } catch (error) {
      console.error('Error fetching order details:', error);
      res.status(StatusCode.INTERNAL_SERVER_ERROR).json({ message: 'Something went wrong' });
    }
  };


  const orderSuccessCart = async (req,res)=>{
    try {
        res.render('order-success-cart')
    } catch (error) {
        res.redirect('/pageNotFound');
    }
  }


  const viewOrders = async (req, res) => {
    try {
      const userId = req.session.user;
      if (!userId) return res.redirect('/login');
  
      const searchTerm = req.query.search || '';
      const page = parseInt(req.query.page) || 1;   
      const limit = 5; 
      const skip = (page - 1) * limit;
      const regex = new RegExp(searchTerm, 'i');
  
      let orders = await Order.find({ user: userId })
        .sort({ createdAt: -1 })
        .populate('orderedItems.product');
  
      if (searchTerm) {
        orders = orders.filter(order => {
          const matchOrderId = regex.test(order.orderId);
          const matchProduct = order.orderedItems.some(item =>
            item.product && regex.test(item.product.productName)
          );
          return matchOrderId || matchProduct;
        });
      }
  
      const totalOrders = orders.length;
      const totalPages = Math.ceil(totalOrders / limit);
  
      const paginatedOrders = orders.slice(skip, skip + limit);
  
      res.render('vieworder', {
        orders: paginatedOrders,
        user: userId,
        searchTerm,
        currentPage: page,
        totalPages
      });
  
    } catch (error) {
      console.error('Error fetching orders:', error);
      res.status(StatusCode.INTERNAL_SERVER_ERROR).send('Internal Server Error');
    }
  };


  const cancelOrder = async (req, res) => {
    try {
      const { orderId } = req.params;
      const { reason } = req.body;
  
      const order = await Order.findById(orderId);
      if (!order || !Array.isArray(order.orderedItems)) {
        return res.status(StatusCode.NOT_FOUND).send('Order not found');
      }
  
      if (!['processing', 'placed', 'shipped'].includes(order.status.toLowerCase())) {
        return res.status(StatusCode.BAD_REQUEST).send('Order cannot be canceled at this stage');
      }
  
      let totalRefundAmount = 0;
  
      // Cancel each item
      for (let item of order.orderedItems) {
        if (item.status === 'cancelled') continue;

        let productId =item.product;
        console.log(productId);
  
        const variant = item.variant.size;
      const quantity =item.quantity;

      console.log('variant of the product to candel',variant);
      console.log('Quantity of the product to candel',quantity);

      // Update variant-specific stock
      const updatedProduct = await Product.findByIdAndUpdate(
            productId,
            { $inc: { [`variants.${variant}`]: quantity } },
            { new: true }
        );
        
        if (!updatedProduct) {
            console.error('Stock update failed.');
        } else {
            const remainingStock = updatedProduct.variants.get(variant);
            console.log(`Stock updated for size ${variant}. Remaining: ${remainingStock}`);
        }
  
        // Mark as cancelled with reason
        item.status = 'cancelled';
        item.cancelReason = typeof reason === 'string' ? reason : 'No reason provided';
  
        // Refund per item
        const currentItemRefundAmount = item.price * item.quantity;
        totalRefundAmount += currentItemRefundAmount;
      }
  
      // Determine if coupon is still valid based on remaining items
      let couponValid = false;
      let remainingItemsPrice = 0;
  
      if (order.coupon) {
        const coupon = await Coupon.findById(order.coupon);
        if (coupon) {
          const activeItems = order.orderedItems.filter(i => 
            i.status !== 'cancelled' &&
            i.status !== 'return approved' &&
            i.status !== 'return request'
          );
          remainingItemsPrice = activeItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
          if (remainingItemsPrice >= coupon.price) {
            couponValid = true;
          }
        }
      }
  
      // Adjust refund amount if coupon becomes invalid
      if (!couponValid && order.coupon) {
        const fullAmount = Number(order.finalAmount) || totalRefundAmount;
        totalRefundAmount = fullAmount - remainingItemsPrice;
  
        // Fallback to totalRefundAmount if calculated value is invalid
        if (isNaN(totalRefundAmount) || totalRefundAmount < 0) {
          totalRefundAmount = order.orderedItems.reduce(
            (sum, item) => sum + (item.price * item.quantity),
            0
          );
        }
      }
  
      // Add refund to wallet if not already added
      const existingWalletEntry = await Wallet.findOne({
        userId: order.user,
        orderId: order._id,
        type: 'cancel',
        entryType: 'CREDIT',
      });
  
      if (!existingWalletEntry) {
        const walletEntry = new Wallet({
          userId: order.user,
          orderId: order._id,
          transactionId: uuidv4(),
          payment_type: 'refund',
          amount: totalRefundAmount,
          status: 'success',
          entryType: 'CREDIT',
          type: 'cancel',
        });
        await walletEntry.save();
  
        // Update refund amount in order
        order.refundAmount = (Number(order.refundAmount) || 0) + totalRefundAmount;
      }
  
      // Set order as fully cancelled
      order.status = 'cancelled';
      order.cancelReason = typeof reason === 'string' ? reason : 'No reason provided';
      await order.save();
  
      console.log('Cancel refund details:', {
        orderId: order.orderId,
        totalRefundAmount,
        reason
      });
  
      res.render('cancel-order-successful', {
        order_id: order.orderId,
        reason: order.cancelReason
      });
    } catch (err) {
      console.error('Error cancelling order:', err);
      res.status(StatusCode.INTERNAL_SERVER_ERROR).send('Server Error');
    }
  };



  const cancelProduct = async (req, res) => {
    try {
      const { orderId, productId } = req.params;
      const { reason } = req.body;

      const order = await Order.findById(orderId);
      if (!order || !order.orderedItems || !Array.isArray(order.orderedItems)) {
        return res.status(StatusCode.NOT_FOUND).send('Order not found');
      }
      
      const item = order.orderedItems.find(
        i => i.product.toString() === productId
      );
      const variant = item.variant.size;
      const quantity =item.quantity;

      console.log('variant of the product to candel',variant);
      console.log('Quantity of the product to candel',quantity);


      if (!item) {
        return res.status(StatusCode.NOT_FOUND).send('Product not found in order');
      }
      // Update variant-specific stock
      const updatedProduct = await Product.findByIdAndUpdate(
            productId,
            { $inc: { [`variants.${variant}`]: quantity } },
            { new: true }
        );
        
        if (!updatedProduct) {
            console.error('Stock update failed.');
        } else {
            const remainingStock = updatedProduct.variants.get(variant);
            console.log(`Stock updated for size ${variant}. Remaining: ${remainingStock}`);
        }
      
      // Update the item status to cancelled
      item.status = 'cancelled';
      item.cancelReason = reason;
      
      // Get the current item's refund amount
      const currentItemRefundAmount = item.price * item.quantity;
      let refundAmount = currentItemRefundAmount;
      
      // Check if all items are now cancelled
      const allCancelled = order.orderedItems.every(i => i.status === 'cancelled');
      
      if (allCancelled) {
        // If all items are cancelled, refund the entire finalAmount
        order.status = 'cancelled';
        refundAmount = Number(order.finalAmount) || 0;
      } else {
        // Check remaining active items (not cancelled or return requested)
        const activeItems = order.orderedItems.filter(i => 
          i.status !== 'cancelled' && 
          i.status !== 'return approved' && 
          i.status !== 'return request'
        );
        
        if (activeItems.length > 0) {
          // Calculate total price of remaining active items
          const remainingItemsPrice = activeItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
          
          // Check if coupon is still valid for remaining items
          let couponValid = false;
          
          if (order.coupon) {
            // Retrieve coupon details
            const coupon = await Coupon.findById(order.coupon);
            
            if (coupon) {
              // Check minimum purchase requirement
              if (remainingItemsPrice >= coupon.price) {
                couponValid = true;
              } else {
                couponValid = false;
              }
            }
          }
          
          if (couponValid) {
            // If coupon is still valid, refund just the current item's price
            refundAmount = currentItemRefundAmount;
          } else {
            // If coupon is no longer valid, refund the difference
            const finalAmount = Number(order.finalAmount) || 0;
            refundAmount = finalAmount - remainingItemsPrice;
            
            // Guard against negative refunds
            if (isNaN(refundAmount) || refundAmount < 0) {
              refundAmount = currentItemRefundAmount;
            }
          }
        }
      }
      
      // Ensure refundAmount is a valid number
      refundAmount = Number(refundAmount);
      if (isNaN(refundAmount)) {
        refundAmount = currentItemRefundAmount; // Fallback to item price if calculation fails
      }
      
      // Process refund to wallet
      const existingWalletEntry = await Wallet.findOne({
        userId: order.user,
        orderId: order._id,
        type: 'cancel',
        entryType: 'CREDIT',
        itemId: productId
      });
      
      if (!existingWalletEntry) {
        const walletEntry = new Wallet({
          userId: order.user,
          orderId: order._id,
          itemId: productId,
          transactionId: uuidv4(),
          payment_type: 'refund',
          amount: refundAmount,
          status: 'success',
          entryType: 'CREDIT',
          type: 'cancel',
        });
        await walletEntry.save();
        
        // Update refundAmount in the order
        order.refundAmount = (Number(order.refundAmount) || 0) + refundAmount;
      }
      
      // Add debugging information
      console.log('Cancel refund details:', {
        itemPrice: item.price,
        quantity: item.quantity,
        currentItemRefundAmount,
        orderFinalAmount: order.finalAmount,
        calculatedRefundAmount: refundAmount
      });
      
      await order.save();
      
      res.render('cancel-product-success', {
        order_id: order.orderId,
        reason
      });
    } catch (err) {
      console.error(err);
      res.status(StatusCode.INTERNAL_SERVER_ERROR).send('Server Error');
    }
  };
  
  const returnOrder = async (req, res) => {
    try {
      const { orderId } = req.params;
      const { reason } = req.body;
  
      if (!reason || reason.trim() === '') {
        return res.status(StatusCode.BAD_REQUEST).send('Return reason is required.');
      }

      const order = await Order.findById(orderId);
      if (!order || order.status !== 'delivered') {
        return res.status(StatusCode.BAD_REQUEST).send('Order cannot be returned.');
      }

      // Check if the order contains only one item and access the first item
      const item = order.orderedItems[0]; // Since there's only one item

      if (!item) {
        return res.status(StatusCode.NOT_FOUND).send('Item not found in order');
      }

      // Update item status
      item.status = 'return request';
      item.returnReason = reason;
      
      order.status = 'return request';
      order.returnReason = reason;
      await order.save();


      res.render('returnRequested',{reason})
    } catch (err) {
      console.error(err);
      res.status(StatusCode.INTERNAL_SERVER_ERROR).send('Server Error');
    }
  };

  const returnProduct = async (req, res) => {
    try {
      const { itemId } = req.params;
      const { reason } = req.body;
  
      // Find the order that contains this item
      const order = await Order.findOne({ 'orderedItems._id': itemId });
  
      if (!order) {
        return res.status(StatusCode.NOT_FOUND).send('Order or item not found');
      }
  
      // Find the specific item
      const item = order.orderedItems.id(itemId);
  
      if (!item) {
        return res.status(StatusCode.NOT_FOUND).send('Item not found in order');
      }
  
      // Update item status
      item.status = 'return request';
      item.returnReason = reason;
  
      await order.save();
  
      // Render the confirmation page
      res.render('returnRequested', {
        orderId: order.orderId,
        productId: item.product,
        reason
      });
  
    } catch (err) {
      console.error('Return request failed:', err);
      res.status(StatusCode.INTERNAL_SERVER_ERROR).send('Server error');
    }
  };

  const loadPaymentPagecart = async (req, res) => {
    try {
      const userId = req.session.user;
  
      const { selectedAddress, couponId } = req.body;
      if (!userId) return res.redirect('/login');
  
      const user = await User.findById(userId);
      const cart = await Cart.findOne({ userId }).populate('items.productId');
  
      let cartItems = [];
      let originalTotal = 0;
      let saleTotal = 0;
      let totaQuantity =0;
  
      if (cart && cart.items && cart.items.length > 0) {
        cartItems = cart.items.filter(item => item.productId).map(item => {
          const product = item.productId;
          const quantity = item.quantity;
          const variant = item.variant;
          const itemOriginal = product ? product.regularPrice * quantity : 0;
          const itemSale = product ? product.salePrice * quantity : 0;
  
          originalTotal += itemOriginal;
          saleTotal += itemSale;
          totaQuantity +=item.quantity;
          console.log("items total quantity in cart ",totaQuantity)
  
          return {
            product,
            quantity,
            variant,
            totalPrice: itemSale
          };
        });
      }

      // Fetch selected address
      console.log("Selected Address:", selectedAddress);
      const addressDoc = await Address.findOne({ 'address._id': selectedAddress });
      let selected = null;
  
      if (addressDoc) {
        selected = addressDoc.address.find(addr => addr._id.toString() === selectedAddress.toString());
      } else {
        console.log("No address found.");
        return res.redirect('/checkout');
      }
  
      // Get coupon if provided
      let appliedCoupon = null;
      if (couponId) {
        appliedCoupon = await Coupon.findById(couponId);
      } else if (req.session.appliedCoupon) {
        appliedCoupon = req.session.appliedCoupon;
      }

      // Prepare items for pricing calculation
      const orderItems = cartItems.map(item => {
        return {
          product: item.product,
          quantity: item.quantity,
          variant: item.variant
        };
      });

      // Calculate pricing using centralized utility
      const pricingResult = PricingCalculator.calculateOrderPricing(
        orderItems,
        appliedCoupon
      );

      console.log('Cart pricing calculation result:', pricingResult);

      // console.log('cartItems :',cartItems)


      res.render('paymentcart', {
        user,
        selected,
        razorpayKey: process.env.RAZORPAY_KEY_ID,
        cartItems: cart.items,
        orderSummary: {
          quantity: cartItems.reduce((acc, item) => acc + item.quantity, 0),
          total: pricingResult.totals.finalAmount,
          originalTotal: pricingResult.totals.originalAmount,
          saleTotal: pricingResult.totals.saleAmount,
          saveAmount: pricingResult.totals.offerDiscount,
          couponDiscount: pricingResult.totals.couponDiscount,
          couponId: appliedCoupon ? appliedCoupon._id : null,
          couponName: appliedCoupon ? appliedCoupon.name : null,
          deliveryCharge: pricingResult.totals.deliveryCharge
        }
      });
  
    } catch (err) {
      console.error("Error loading payment page:", err);
      res.status(StatusCode.INTERNAL_SERVER_ERROR).send("Internal Server Error");
    }
  };


  const placeOrderFromCart = async (req, res) => {
    try {
      const userId = req.session.user?._id;
      const { selected, couponId, paymentMethod, cartItems ,totalPrice ,totalDiscount,deliveryCharge} = req.body;
  
      if (!userId || !selected || !cartItems || cartItems.length === 0) {
        return res.redirect("/cart");
      }
  
      const cart = await Cart.findOne({ userId }).populate("items.productId");
      if (!cart) {
        return res.status(StatusCode.NOT_FOUND).json({ message: "Cart not found" });
      }
  
      const orderedItems = cart.items
        .filter(item => cartItems.includes(item._id.toString()))
        .filter(item => item.productId); 
  
      cart.items.forEach(item => {
        if (cartItems.includes(item._id.toString()) && !item.productId) {
          console.warn(` Missing product for cart item ID: ${item._id}`);
        }
      });
  
      if (orderedItems.length === 0) {
        return res.status(StatusCode.BAD_REQUEST).json({ message: "Selected items are no longer available." });
      }
  
      let totalOriginalPrice = 0;
      let totalSalePrice = 0;
      let orderItems = [];
  
      for (const item of orderedItems) {
        const product = item.productId;
        const price = product.salePrice || product.price || 0;
        const originalPrice = product.regularPrice || 0;
        const quantity = item.quantity;
        const variant = item.variant;
  
        if (product.quantity < quantity) {
          return res.status(StatusCode.BAD_REQUEST).json({ message: `Insufficient stock for ${product.name}` });
        }
  
        const itemTotal = price * quantity;
        const itemOriginalTotal = originalPrice * quantity;
  
        totalOriginalPrice += itemOriginalTotal;
        totalSalePrice += itemTotal;
  
        orderItems.push({
          product: product._id,
          quantity,
          variant,
          price,
          totalPrice: itemTotal,
          status: "processing"
        });
      }
  
      // Coupon discount
      let couponDiscount = 0;
      let appliedCoupon = null;
  
      if (couponId) {
        appliedCoupon = await Coupon.findById(couponId);
        if (appliedCoupon && !appliedCoupon.usersUsed.includes(userId)) {
          couponDiscount = (totalSalePrice * appliedCoupon.discount) / 100;
  
          // Mark the coupon as used
          await Coupon.findByIdAndUpdate(
            couponId,
            { $push: { usersUsed: userId } }
          );
        }
      }
  
      
  console.log('delivery charge',deliveryCharge);

      const address = {
        addressType: selected.addressType,
        name: selected.name,
        city: selected.city,
        landMark: selected.landMark,
        state: selected.state,
        pincode: selected.pincode,
        phone: selected.phone,
        altphone: selected.altphone,
      };
  
      // Create order items with complete pricing info
      const finalOrderItems = pricingResult.items.map((item, index) => {
        return {
          product: item.product._id,
          quantity: item.quantity,
          price: item.product.salePrice,
          regularPrice: item.product.regularPrice,
          salePrice: item.product.salePrice,
          offerDiscount: item.pricing.unitOfferDiscount,
          variant: item.variant,
          status: 'processing'
        };
      });

      // Mark coupon as used if applicable
      if (appliedCoupon && pricingResult.coupon.isValid) {
        if (!appliedCoupon.usersUsed.includes(userId)) {
          await Coupon.findByIdAndUpdate(
            couponId,
            { $push: { usersUsed: userId } }
          );
        }
      }

      const newOrder = new Order({
        orderId: generateOrderId(),
        user: userId,
        orderedItems: finalOrderItems,
        totalPrice: pricingResult.totals.originalAmount,
        offerDiscount: pricingResult.totals.offerDiscount,
        couponDiscount: pricingResult.totals.couponDiscount,
        discount: pricingResult.totals.offerDiscount + pricingResult.totals.couponDiscount,
        finalAmount: pricingResult.totals.finalAmount,
        address,
        invoiceDate: new Date(),
        status: 'processing',
        createdOn: new Date(),
        coupon: couponId || null,
        couponApplied: pricingResult.coupon.isValid,
        paymentMethod,
        deliveryCharge: pricingResult.totals.deliveryCharge
      });
  
      await newOrder.save();
  
      // Update product stock (variant-specific or general)
            for (const item of orderItems) {
              const product = await Product.findById(item.product);
              
              if (product.variants && item.variant?.size) {
                // Update variant-specific stock
                const currentVariantStock = product.variants.get(item.variant.size) || 0;
                const newVariantStock = Math.max(0, currentVariantStock - item.quantity);
                
                await Product.findByIdAndUpdate(
                  item.product,
                  { 
                    $set: { [`variants.${item.variant.size}`]: newVariantStock }
                  },
                  { new: true }
                );
              } else {
                // Update general product stock for products without variants
                await Product.findByIdAndUpdate(
                  item.product,
                  { $inc: { quantity: -item.quantity } },
                  { new: true }
                );
              }
            }
  
      // Remove ordered items from cart
      cart.items = cart.items.filter(item =>
        !cartItems.includes(item._id.toString())
      );
      await cart.save();
  
      res.redirect('/order-success-cart');
  
    } catch (error) {
      console.error("❌ Error placing cart order:", error);
      if (!res.headersSent) {
        res.status(StatusCode.INTERNAL_SERVER_ERROR).send("Something went wrong while placing your order.");
      }
    }
  };

  const viewOrderDetails = async (req, res) => {
    try {
      const userId = req.session.user;
      const { orderId } = req.params;
  
      if (!userId) {
        return res.redirect('/login');
      }
  
      const order = await Order.findById(orderId).populate('orderedItems.product').populate('coupon');
  
      if (!order) {
        return res.status(StatusCode.NOT_FOUND).render('errorPage', { message: 'Order not found' });
      }
  
      res.render('viewOrderDetail', { user: userId, order });
    } catch (error) {
      console.error('Error fetching order details:', error);
      res.status(StatusCode.INTERNAL_SERVER_ERROR).render('errorPage', { message: 'Something went wrong!' });
    }
  };



module.exports = {
  getOrderPage,
  getSingleOrderPage,
  postPlaceOrder,
  getPaymentPage,
  orderSuccess,
  viewOrders,
  cancelOrder,
  cancelProduct,
  returnOrder,
  returnProduct,
  loadPaymentPagecart,
  placeOrderFromCart,
  orderSuccessCart,
  viewOrderDetails
};