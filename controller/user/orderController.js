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

    // Calculate pricing using centralized utility for split coupon discount
    let appliedCoupon = null;
    // Check for coupon in query params, session, or request body
    if (req.query.couponId) {
      appliedCoupon = await Coupon.findById(req.query.couponId);
    } else if (req.session.appliedCoupon && req.session.appliedCoupon.id) {
      appliedCoupon = await Coupon.findById(req.session.appliedCoupon.id);
    }
    
    const orderItemsForPricing = cartItems.map(item => ({
      product: item.product,
      quantity: item.quantity,
      variant: item.variant
    }));
    
    const pricingResult = PricingCalculator.calculateOrderPricing(orderItemsForPricing, appliedCoupon);
    
    // Attach couponDiscount to each cartItem
    cartItems = cartItems.map((item, idx) => ({
      ...item,
      couponDiscount: pricingResult.items[idx]?.couponDiscount || 0,
      netPaid: (item.totalPrice) - (pricingResult.items[idx]?.couponDiscount || 0)
    }));

    const userAddress = await Address.findOne({ userId });
    const addresses = userAddress ? userAddress.address : [];

    res.render('ordercart', {
      cartItems,
      totalAmount: total,
      user,
      addresses,
      coupons,
      isLoggedIn: true,
      appliedCoupon: appliedCoupon,
      pricingResult: pricingResult
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
        
        // Calculate pricing using centralized utility for split coupon discount
        let appliedCoupon = null;
        if (req.query.couponId) {
          appliedCoupon = await Coupon.findById(req.query.couponId);
        } else if (req.session.appliedCoupon && req.session.appliedCoupon.id) {
          appliedCoupon = await Coupon.findById(req.session.appliedCoupon.id);
        }
        
        const orderItemsForPricing = [{
          product: product,
          quantity: parseInt(quantity),
          variant: { size: variant || null }
        }];
        
        const pricingResult = PricingCalculator.calculateOrderPricing(orderItemsForPricing, appliedCoupon);
        
        const item = {
            product,
            variant,
            quantity: parseInt(quantity),
            availableStock: parseInt(variantStock),
            totalPrice,
            couponDiscount: pricingResult.items[0]?.couponDiscount || 0,
            netPaid: totalPrice - (pricingResult.items[0]?.couponDiscount || 0)
        };
        
        const userAddress = await Address.findOne({ userId });
        const addresses = userAddress ? userAddress.address : [];
        
        res.render('order', {
            item,
            user,
            addresses,
            coupons,
            isLoggedIn: true,
            appliedCoupon: appliedCoupon,
            pricingResult: pricingResult
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

      // Ensure deliveryCharge is a number
      const deliveryChargeNum = Number(deliveryCharge) || 0;
      console.log('Delivery charge from request:', deliveryCharge, 'Converted to:', deliveryChargeNum);

      // Calculate pricing using centralized utility
      const orderItems = [{
        product: product,
        quantity: orderQty,
        variant: { size: variant || null }
      }];

      const pricingResult = PricingCalculator.calculateOrderPricing(
        orderItems,
        appliedCoupon,
        deliveryChargeNum
      );

      console.log('Pricing calculation result:', pricingResult);
      console.log('Final amount includes delivery charge:', pricingResult.totals.finalAmount);
      console.log('Delivery charge calculated:', pricingResult.totals.deliveryCharge);

      // Create ordered item with complete pricing info
      const orderedItem = {
        product: product._id,
        quantity: orderQty,
        price: product.salePrice,
        regularPrice: product.regularPrice,
        salePrice: product.salePrice,
        offerDiscount: pricingResult.items[0].pricing.unitOfferDiscount,
        couponDiscount: pricingResult.items[0].couponDiscount || 0,
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
      
      console.log('Order being saved with:');
      console.log('- totalPrice:', newOrder.totalPrice);
      console.log('- deliveryCharge:', newOrder.deliveryCharge);
      console.log('- finalAmount:', newOrder.finalAmount);
      console.log('- Expected total (totalPrice + deliveryCharge):', newOrder.totalPrice + newOrder.deliveryCharge);
      
      // Save the order
      await newOrder.save();
      console.log('Saved order variant:', newOrder.orderedItems[0].variant);
        
        // ATOMIC STOCK CHECK & DECREMENT
        const stockField = `variants.${variant}`;
        const updatedProduct = await Product.findOneAndUpdate(
          {
            _id: productId,
            [stockField]: { $gte: orderQty }
          },
          { $inc: { [stockField]: -orderQty } },
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
      
      // Calculate pricing using centralized utility for split coupon discount
      let appliedCoupon = null;
      if (couponId) {
        appliedCoupon = await Coupon.findById(couponId);
      }
      
      const orderItemsForPricing = [{
        product: product,
        quantity: parseInt(quantity),
        variant: { size: variant || null }
      }];
      
      const pricingResult = PricingCalculator.calculateOrderPricing(orderItemsForPricing, appliedCoupon);
      
      // Initialize variables for price calculation
      const quantityNum = Number(quantity);
      let originalPrice = Number(product.regularPrice) * quantityNum;
      let salePrice = Number(product.salePrice) * quantityNum;
      let finalTotal = Number(totalPrice); // This is the price after any coupon discount
      let discountAmount = originalPrice - salePrice;
      let couponDiscount = pricingResult.items[0]?.couponDiscount || 0;
      
      // Use the delivery charge from PricingCalculator for consistency
      const calculatedDeliveryCharge = pricingResult.totals.deliveryCharge;
      
      // Use the final amount from PricingCalculator to avoid string concatenation
      const finalAmount = pricingResult.totals.finalAmount;

      console.log("Price details:", {
        originalPrice,
        salePrice,
        couponDiscount,
        finalAmount,
        calculatedDeliveryCharge
      });

      // Calculate wallet balance
      let walletBalance = 0;
      try {
        // Handle both cases: userId could be the full user object or just the ID
        let actualUserId = userId;
        if (typeof userId === 'object' && userId !== null) {
          if (userId._id) {
            actualUserId = userId._id;
          } else {
            console.log("userId is object but no _id property found");
            return res.status(StatusCode.INTERNAL_SERVER_ERROR).send('Invalid user session');
          }
        }
        
        const userIdObj = typeof actualUserId === 'string' ? new mongoose.Types.ObjectId(actualUserId) : actualUserId;
        
        const totalWalletAmount = await Wallet.aggregate([
          { 
            $match: { 
              status: 'success', 
              userId: userIdObj
            } 
          },
          {
            $group: {
              _id: "$userId", 
              total: {
                $sum: {
                  $cond: {
                    if: { $eq: ["$entryType", "CREDIT"] },  
                    then: "$amount",  
                    else: { $multiply: [-1, "$amount"] }
                  }
                }
              }
            }
          }
        ]);
        
        if (totalWalletAmount.length > 0) {
          walletBalance = totalWalletAmount[0].total;
        }
        
        console.log("Wallet balance:", walletBalance);
      } catch (walletError) {
        console.error("Error calculating wallet balance:", walletError);
        walletBalance = 0;
      }
      
      res.render('payment', {
        user,
        selected,
        razorpayKey: process.env.RAZORPAY_KEY_ID,
        walletBalance: walletBalance,
        orderSummary: {
          productId,
          quantity: quantityNum,
          variant,
          total: finalAmount,
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
          deliveryCharge: calculatedDeliveryCharge,
          // Add split coupon discount data
          itemCouponDiscount: pricingResult.items[0]?.couponDiscount || 0,
          netPaid: (salePrice) - (pricingResult.items[0]?.couponDiscount || 0)
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
        return res.status(StatusCode.NOT_FOUND).json({ message: 'Order not found' });
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
        const currentItemRefundAmount = (item.price * item.quantity) - (item.couponDiscount || 0);
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
      }
      
      // Update the item status to cancelled
      item.status = 'cancelled';
      item.cancelReason = reason;
      
      // Calculate refund for this product only
      const currentItemRefundAmount = (item.price * item.quantity) - (item.couponDiscount || 0);
      let refundAmount = currentItemRefundAmount;
      
      // Check if all items are now cancelled (after this cancellation)
      const allCancelled = order.orderedItems.every(i => i.status === 'cancelled');
      
      // Only refund delivery charge if this is the last item being cancelled
      let deliveryChargeRefund = 0;
      if (allCancelled) {
        order.status = 'cancelled';
        deliveryChargeRefund = Number(order.deliveryCharge) || 0;
      }
      // Final refund for this action
      refundAmount += deliveryChargeRefund;
      
      // Ensure refundAmount is a valid number
      refundAmount = Number(refundAmount);
      if (isNaN(refundAmount)) {
        refundAmount = currentItemRefundAmount; // Fallback to item price if calculation fails
      }
      
      // Process refund to wallet (one entry per product per cancellation)
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
            _id: item._id, // Preserve the original cart item ID
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

      // Attach couponDiscount to each cartItem
      cartItems = cartItems.map((item, idx) => ({
        ...item,
        couponDiscount: pricingResult.items[idx]?.couponDiscount || 0,
        netPaid: (item.totalPrice) - (pricingResult.items[idx]?.couponDiscount || 0)
      }));

      // Calculate wallet balance
      let walletBalance = 0;
      try {
        // Handle both cases: userId could be the full user object or just the ID
        let actualUserId = userId;
        if (typeof userId === 'object' && userId !== null) {
          if (userId._id) {
            actualUserId = userId._id;
          } else {
            console.log("userId is object but no _id property found");
            return res.status(StatusCode.INTERNAL_SERVER_ERROR).send('Invalid user session');
          }
        }
        
        const userIdObj = typeof actualUserId === 'string' ? new mongoose.Types.ObjectId(actualUserId) : actualUserId;
        
        const totalWalletAmount = await Wallet.aggregate([
          { 
            $match: { 
              status: 'success', 
              userId: userIdObj
            } 
          },
          {
            $group: {
              _id: "$userId", 
              total: {
                $sum: {
                  $cond: {
                    if: { $eq: ["$entryType", "CREDIT"] },  
                    then: "$amount",  
                    else: { $multiply: [-1, "$amount"] }
                  }
                }
              }
            }
          }
        ]);
        
        if (totalWalletAmount.length > 0) {
          walletBalance = totalWalletAmount[0].total;
        }
        
        console.log("Wallet balance:", walletBalance);
      } catch (walletError) {
        console.error("Error calculating wallet balance:", walletError);
        walletBalance = 0;
      }

      console.log('=== PAYMENT PAGE CART ITEMS DEBUG ===');
      console.log('Cart items being passed to template:');
      cartItems.forEach((item, index) => {
        console.log(`Item ${index + 1}:`, {
          _id: item._id,
          productName: item.product?.productName,
          quantity: item.quantity,
          variant: item.variant
        });
      });
      console.log('=====================================');

      res.render('paymentcart', {
        user,
        selected,
        razorpayKey: process.env.RAZORPAY_KEY_ID,
        walletBalance: walletBalance,
        cartItems: cartItems,
        orderSummary: {
          quantity: cartItems.reduce((acc, item) => acc + Number(item.quantity), 0),
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
      console.log('=== CART ORDER PLACEMENT DEBUG ===');
      console.log('Raw request body:', req.body);
      console.log('Request method:', req.method);
      console.log('Content-Type:', req.headers['content-type']);
      console.log('Form data keys:', Object.keys(req.body));
      console.log('Cart items in request:', req.body.cartItems);
      console.log('Cart items type:', typeof req.body.cartItems);
      if (Array.isArray(req.body.cartItems)) {
        console.log('Cart items array length:', req.body.cartItems.length);
        console.log('Cart items array contents:', req.body.cartItems);
      }
      
      const userId = req.session.user?._id;
      console.log('User ID from session:', userId);
      
      const { 
        selected, 
        couponId, 
        paymentMethod, 
        cartItems,
        // Use the pre-calculated pricing data from the payment page
        calculatedTotal,
        calculatedOriginalTotal,
        calculatedSaleTotal,
        calculatedSaveAmount,
        calculatedCouponDiscount,
        calculatedDeliveryCharge,
        calculatedFinalAmount
      } = req.body;
  
      // Normalize cartItems to handle both array and string formats
      let normalizedCartItems = cartItems;
      if (typeof cartItems === 'string') {
        try {
          normalizedCartItems = JSON.parse(cartItems);
        } catch (e) {
          // If it's not JSON, it might be a single item
          normalizedCartItems = [cartItems];
        }
      } else if (!Array.isArray(cartItems)) {
        // If it's not an array, make it an array
        normalizedCartItems = cartItems ? [cartItems] : [];
      }
  
      console.log('Extracted data:');
      console.log('- selected:', selected);
      console.log('- couponId:', couponId);
      console.log('- paymentMethod:', paymentMethod);
      console.log('- original cartItems:', cartItems);
      console.log('- normalized cartItems:', normalizedCartItems);
      console.log('- cartItems type:', typeof cartItems);
      console.log('- normalized cartItems type:', typeof normalizedCartItems);
      console.log('- normalized cartItems length:', normalizedCartItems ? normalizedCartItems.length : 'undefined');
      console.log('Received pricing data from payment page:');
      console.log('- calculatedTotal:', calculatedTotal);
      console.log('- calculatedOriginalTotal:', calculatedOriginalTotal);
      console.log('- calculatedSaleTotal:', calculatedSaleTotal);
      console.log('- calculatedSaveAmount:', calculatedSaveAmount);
      console.log('- calculatedCouponDiscount:', calculatedCouponDiscount);
      console.log('- calculatedDeliveryCharge:', calculatedDeliveryCharge);
      console.log('- calculatedFinalAmount:', calculatedFinalAmount);
      console.log('=====================================');
  
      if (!userId || !selected || !normalizedCartItems || normalizedCartItems.length === 0) {
        console.log('❌ Validation failed:');
        console.log('- userId:', !!userId);
        console.log('- selected:', !!selected);
        console.log('- normalizedCartItems:', !!normalizedCartItems);
        console.log('- normalizedCartItems length:', normalizedCartItems ? normalizedCartItems.length : 'undefined');
        return res.redirect("/cart");
      }
  
      console.log('🔍 Looking for cart with userId:', userId);
      const cart = await Cart.findOne({ userId }).populate("items.productId");
      if (!cart) {
        console.log('❌ Cart not found for user:', userId);
        return res.status(StatusCode.NOT_FOUND).json({ message: "Cart not found" });
      }
  
      console.log('📦 Cart found with items:', cart.items.length);
      console.log('🔍 Available cart items:', cart.items.map(item => ({
        id: item._id,
        productId: item.productId?._id,
        productName: item.productId?.productName
      })));
      console.log('🔍 Looking for cart items:', normalizedCartItems);
      console.log('🔍 Normalized cart items type:', typeof normalizedCartItems);
      console.log('🔍 Normalized cart items length:', normalizedCartItems ? normalizedCartItems.length : 'undefined');
      if (Array.isArray(normalizedCartItems)) {
        console.log('🔍 Normalized cart items contents:', normalizedCartItems);
      }
      
      console.log('🔍 Starting cart item filtering...');
      const orderedItems = cart.items
        .filter(item => {
          const itemId = item._id.toString();
          const isIncluded = normalizedCartItems.includes(itemId);
          console.log(`🔍 Checking item ${itemId}: ${isIncluded ? '✅ INCLUDED' : '❌ NOT INCLUDED'}`);
          return isIncluded;
        })
        .filter(item => item.productId); 
  
      console.log('✅ Found ordered items:', orderedItems.length);
      console.log('📋 Ordered items details:', orderedItems.map(item => ({
        id: item._id,
        productId: item.productId?._id,
        productName: item.productId?.productName,
        quantity: item.quantity,
        variant: item.variant
      })));

      cart.items.forEach(item => {
        if (normalizedCartItems.includes(item._id.toString()) && !item.productId) {
          console.warn(`⚠️ Missing product for cart item ID: ${item._id}`);
        }
      });
  
      if (orderedItems.length === 0) {
        console.log('❌ No valid products to order');
        console.log('🔍 Available cart items:', cart.items.map(item => ({
          id: item._id,
          productId: item.productId?._id,
          productName: item.productId?.productName
        })));
        console.log('🔍 Requested cart items:', normalizedCartItems);
        return res.status(StatusCode.BAD_REQUEST).json({ 
          success: false,
          message: "Selected items are no longer available." 
        });
      }

      // Validate stock for all items
      console.log('🔍 Validating stock for ordered items...');
      for (const item of orderedItems) {
        const product = item.productId;
        const quantity = item.quantity;
        const variant = item.variant?.size;

        console.log(`📦 Checking stock for ${product.productName} (Size: ${variant || 'N/A'}) - Quantity: ${quantity}`);

        let availableStock;
        if (product.variants && variant) {
          availableStock = product.variants.get(variant) || 0;
          
          if (availableStock < quantity) {
            console.log(`❌ Insufficient stock for ${product.productName} (Size: ${variant}). Available: ${availableStock}, Required: ${quantity}`);
            return res.status(StatusCode.BAD_REQUEST).json({ 
              success: false,
              message: `Insufficient stock for ${product.productName} (Size: ${variant}). Only ${availableStock} available.` 
            });
          }
        } else {
          availableStock = product.quantity || 0;
          
          if (availableStock < quantity) {
            console.log(`❌ Insufficient stock for ${product.productName}. Available: ${availableStock}, Required: ${quantity}`);
            return res.status(StatusCode.BAD_REQUEST).json({ 
              success: false,
              message: `Insufficient stock for ${product.productName}. Only ${availableStock} available.` 
            });
          }
        }
        console.log(`✅ Stock sufficient for ${product.productName} - Available: ${availableStock}`);
      }
  
      // Get coupon if provided
      let appliedCoupon = null;
      if (couponId) {
        appliedCoupon = await Coupon.findById(couponId);
      }

      // Use the pre-calculated pricing data instead of recalculating
      const finalAmount = Number(calculatedFinalAmount) || 0;
      const originalAmount = Number(calculatedOriginalTotal) || 0;
      const saleAmount = Number(calculatedSaleTotal) || 0;
      const offerDiscount = Number(calculatedSaveAmount) || 0;
      const couponDiscount = Number(calculatedCouponDiscount) || 0;
      const deliveryCharge = Number(calculatedDeliveryCharge) || 0;

      console.log('Using pre-calculated pricing:');
      console.log('- finalAmount:', finalAmount);
      console.log('- originalAmount:', originalAmount);
      console.log('- saleAmount:', saleAmount);
      console.log('- offerDiscount:', offerDiscount);
      console.log('- couponDiscount:', couponDiscount);
      console.log('- deliveryCharge:', deliveryCharge);

      // Still need to calculate per-item coupon discounts for the order items
      const pricingOrderItems = orderedItems.map(item => {
        return {
          product: item.productId,
          quantity: item.quantity,
          variant: item.variant
        };
      });

      // Calculate per-item pricing for coupon discount distribution
      const pricingResult = PricingCalculator.calculateOrderPricing(
        pricingOrderItems,
        appliedCoupon,
        deliveryCharge
      );

      console.log('Per-item pricing calculation for coupon distribution:', pricingResult);

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

      // Create order items with complete pricing info using pre-calculated totals
      const finalOrderItems = pricingResult.items.map((item) => {
        return {
          product: item.product._id,
          quantity: item.quantity,
          price: item.product.salePrice,
          regularPrice: item.product.regularPrice,
          salePrice: item.product.salePrice,
          offerDiscount: item.pricing.unitOfferDiscount,
          couponDiscount: item.couponDiscount || 0,
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
        totalPrice: originalAmount,
        offerDiscount: offerDiscount,
        couponDiscount: couponDiscount,
        discount: offerDiscount + couponDiscount,
        finalAmount: finalAmount,
        address,
        invoiceDate: new Date(),
        status: 'processing',
        createdOn: new Date(),
        coupon: couponId || null,
        couponApplied: pricingResult.coupon.isValid,
        paymentMethod,
        deliveryCharge: deliveryCharge
      });

      console.log('Cart order being saved with pre-calculated values:');
      console.log('- totalPrice:', newOrder.totalPrice);
      console.log('- deliveryCharge:', newOrder.deliveryCharge);
      console.log('- finalAmount:', newOrder.finalAmount);
      console.log('- Expected total (totalPrice + deliveryCharge):', newOrder.totalPrice + newOrder.deliveryCharge);
  
      await newOrder.save();
  
      // Update product stock (variant-specific or general)
            for (const item of finalOrderItems) {
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
        !normalizedCartItems.includes(item._id.toString())
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

  // Wallet payment handler for single product orders
  const processWalletPayment = async (req, res) => {
    try {
      console.log('=== SINGLE PRODUCT WALLET PAYMENT DEBUG ===');
      console.log('Raw request body:', req.body);
      console.log('Form data keys:', Object.keys(req.body));
      
      const {
        productId,
        quantity,
        totalPrice,
        selected,
        couponId,
        deliveryCharge,
        variant
      } = req.body;
      
      console.log('Extracted data:');
      console.log('- productId:', productId);
      console.log('- quantity:', quantity);
      console.log('- totalPrice:', totalPrice);
      console.log('- selected:', selected);
      console.log('- couponId:', couponId);
      console.log('- deliveryCharge:', deliveryCharge);
      console.log('- variant:', variant);
      console.log('==========================================');
      
      const userId = req.session.user?._id;
      if (!userId) {
        return res.status(StatusCode.UNAUTHORIZED).json({ message: 'User not logged in' });
      }

      // Handle both cases: userId could be the full user object or just the ID
      let actualUserId = req.session.user;
      if (typeof actualUserId === 'object' && actualUserId !== null) {
        if (actualUserId._id) {
          actualUserId = actualUserId._id;
        } else {
          return res.status(StatusCode.UNAUTHORIZED).json({ message: 'Invalid user session' });
        }
      }

      // Calculate wallet balance
      const userIdObj = typeof actualUserId === 'string' ? new mongoose.Types.ObjectId(actualUserId) : actualUserId;
      const totalWalletAmount = await Wallet.aggregate([
        { 
          $match: { 
            status: 'success', 
            userId: userIdObj
          } 
        },
        {
          $group: {
            _id: "$userId", 
            total: {
              $sum: {
                $cond: {
                  if: { $eq: ["$entryType", "CREDIT"] },  
                  then: "$amount",  
                  else: { $multiply: [-1, "$amount"] }
                }
              }
            }
          }
        }
      ]);
      
      let walletBalance = 0;
      if (totalWalletAmount.length > 0) {
        walletBalance = totalWalletAmount[0].total;
      }

      console.log('Wallet balance check:');
      console.log('- walletBalance:', walletBalance);
      console.log('- totalPrice:', totalPrice);
      console.log('- totalPriceNum:', Number(totalPrice));

      // Check if wallet balance is sufficient
      const totalPriceNum = Number(totalPrice);
      if (walletBalance < totalPriceNum) {
        console.log('❌ Insufficient wallet balance');
        return res.status(StatusCode.BAD_REQUEST).json({ 
          message: 'Insufficient wallet balance' 
        });
      }
      
      console.log('✅ Wallet balance sufficient');

      // Process the order similar to postPlaceOrder but with wallet payment
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(StatusCode.NOT_FOUND).json({ message: 'Product not found' });
      }
      
      const orderQty = Number(quantity);
      const availableStock = product.variants.get(variant) || 0;
      
      if (availableStock < orderQty) {
        return res.status(StatusCode.BAD_REQUEST).json({ 
          message: `Insufficient stock available for size ${variant}. Only ${availableStock} items left.` 
        });
      }

      // Create address object
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

      // Ensure deliveryCharge is a number
      const deliveryChargeNum = Number(deliveryCharge) || 0;
      console.log('Wallet payment - Delivery charge from request:', deliveryCharge, 'Converted to:', deliveryChargeNum);

      // Calculate pricing using centralized utility
      const orderItems = [{
        product: product,
        quantity: orderQty,
        variant: { size: variant || null }
      }];

      const pricingResult = PricingCalculator.calculateOrderPricing(
        orderItems,
        appliedCoupon,
        deliveryChargeNum
      );

      console.log('Wallet payment - Pricing calculation result:', pricingResult);
      console.log('Wallet payment - Final amount includes delivery charge:', pricingResult.totals.finalAmount);

      // Define finalAmount for wallet transaction
      const finalAmount = pricingResult.totals.finalAmount;
      console.log('Final amount for wallet transaction:', finalAmount);

      // Create ordered item with complete pricing info
      const orderedItem = {
        product: product._id,
        quantity: orderQty,
        price: product.salePrice,
        regularPrice: product.regularPrice,
        salePrice: product.salePrice,
        offerDiscount: pricingResult.items[0].pricing.unitOfferDiscount,
        couponDiscount: pricingResult.items[0].couponDiscount || 0,
        variant: { size: variant || null },
        status: 'processing'
      };

      // Mark coupon as used if applicable
      if (appliedCoupon && pricingResult.coupon.isValid) {
        if (!appliedCoupon.usersUsed.includes(actualUserId)) {
          await Coupon.findByIdAndUpdate(
            couponId,
            { $push: { usersUsed: actualUserId } }
          );
        }
      }

      const newOrder = new Order({
        orderId: generateOrderId(),
        user: actualUserId,
        orderedItems: [orderedItem],
        totalPrice: pricingResult.totals.originalAmount,
        offerDiscount: pricingResult.totals.offerDiscount,
        couponDiscount: pricingResult.totals.couponDiscount,
        discount: pricingResult.totals.offerDiscount + pricingResult.totals.couponDiscount,
        finalAmount: pricingResult.totals.finalAmount,
        address: address,
        invoiceDate: new Date(),
        status: 'processing',
        paymentStatus: 'Paid',
        createdOn: new Date(),
        coupon: couponId ? couponId : null,
        couponApplied: pricingResult.coupon.isValid,
        paymentMethod: 'wallet',
        deliveryCharge: pricingResult.totals.deliveryCharge
      });
      
      console.log('Wallet payment order being saved with:');
      console.log('- totalPrice:', newOrder.totalPrice);
      console.log('- deliveryCharge:', newOrder.deliveryCharge);
      console.log('- finalAmount:', newOrder.finalAmount);
      console.log('- Expected total (totalPrice + deliveryCharge):', newOrder.totalPrice + newOrder.deliveryCharge);
      
      // Save the order
      await newOrder.save();

      // Update product stock
      await Product.findByIdAndUpdate(
        productId,
        { $inc: { [`variants.${variant}`]: -orderQty } },
        { new: true }
      );

      // Create wallet transaction for payment
      const walletTransaction = new Wallet({
        userId: actualUserId,
        orderId: newOrder._id,
        transactionId: `WALLET_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        payment_type: 'wallet_payment',
        amount: Number(finalAmount),
        status: 'success',
        entryType: 'DEBIT',
        type: 'product_purchase'
      });

      await walletTransaction.save();

      // Clear any coupon from session
      if (req.session.appliedCoupon) {
        delete req.session.appliedCoupon;
      }
      
      return res.json({
        success: true,
        message: 'Order placed successfully using wallet',
        orderId: newOrder.orderId,
        redirect: `/order-success?orderId=${newOrder.orderId}`
      });
      
    } catch (error) {
      console.error('Error processing wallet payment:', error);
      return res.status(StatusCode.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Something went wrong while processing wallet payment',
      });
    }
  };

  // Wallet payment handler for cart orders
  const processWalletPaymentCart = async (req, res) => {
    try {
      const { 
        selected, 
        couponId, 
        cartItems, 
        totalPrice, 
        totalDiscount, 
        deliveryCharge,
        // Use the pre-calculated pricing data from the payment page
        calculatedTotal,
        calculatedOriginalTotal,
        calculatedSaleTotal,
        calculatedSaveAmount,
        calculatedCouponDiscount,
        calculatedDeliveryCharge,
        calculatedFinalAmount
      } = req.body;

      // Normalize cartItems to handle both array and string formats
      let normalizedCartItems = cartItems;
      if (typeof cartItems === 'string') {
        try {
          normalizedCartItems = JSON.parse(cartItems);
        } catch (e) {
          // If it's not JSON, it might be a single item
          normalizedCartItems = [cartItems];
        }
      } else if (!Array.isArray(cartItems)) {
        // If it's not an array, make it an array
        normalizedCartItems = cartItems ? [cartItems] : [];
      }

      console.log('=== CART WALLET PAYMENT DEBUG ===');
      console.log('Raw request body:', req.body);
      console.log('Form data keys:', Object.keys(req.body));
      console.log('Original cartItems:', cartItems);
      console.log('Original cartItems type:', typeof cartItems);
      console.log('Normalized cartItems:', normalizedCartItems);
      console.log('Normalized cartItems type:', typeof normalizedCartItems);
      if (Array.isArray(normalizedCartItems)) {
        console.log('Normalized cart items array length:', normalizedCartItems.length);
        console.log('Normalized cart items array contents:', normalizedCartItems);
      }
      console.log('Received pricing data from payment page:');
      console.log('- calculatedTotal:', calculatedTotal);
      console.log('- calculatedOriginalTotal:', calculatedOriginalTotal);
      console.log('- calculatedSaleTotal:', calculatedSaleTotal);
      console.log('- calculatedSaveAmount:', calculatedSaveAmount);
      console.log('- calculatedCouponDiscount:', calculatedCouponDiscount);
      console.log('- calculatedDeliveryCharge:', calculatedDeliveryCharge);
      console.log('- calculatedFinalAmount:', calculatedFinalAmount);
      console.log('=====================================');

      // Handle both cases: userId could be the full user object or just the ID
      let actualUserId = req.session.user;
      if (typeof actualUserId === 'object' && actualUserId !== null) {
        if (actualUserId._id) {
          actualUserId = actualUserId._id;
        } else {
          return res.status(StatusCode.UNAUTHORIZED).json({ message: 'Invalid user session' });
        }
      }

      if (!actualUserId || !selected || !normalizedCartItems || normalizedCartItems.length === 0) {
        return res.status(StatusCode.BAD_REQUEST).json({ message: "Invalid request data" });
      }

      // Calculate wallet balance
      const userIdObj = typeof actualUserId === 'string' ? new mongoose.Types.ObjectId(actualUserId) : actualUserId;
      const totalWalletAmount = await Wallet.aggregate([
        { 
          $match: { 
            status: 'success', 
            userId: userIdObj
          } 
        },
        {
          $group: {
            _id: "$userId", 
            total: {
              $sum: {
                $cond: {
                  if: { $eq: ["$entryType", "CREDIT"] },  
                  then: "$amount",  
                  else: { $multiply: [-1, "$amount"] }
                }
              }
            }
          }
        }
      ]);
      
      let walletBalance = 0;
      if (totalWalletAmount.length > 0) {
        walletBalance = totalWalletAmount[0].total;
      }

      // Use the pre-calculated pricing data instead of recalculating
      const finalAmount = Number(calculatedFinalAmount) || 0;
      const originalAmount = Number(calculatedOriginalTotal) || 0;
      const saleAmount = Number(calculatedSaleTotal) || 0;
      const offerDiscount = Number(calculatedSaveAmount) || 0;
      const couponDiscount = Number(calculatedCouponDiscount) || 0;
      const deliveryChargeNum = Number(calculatedDeliveryCharge) || 0;

      console.log('Using pre-calculated pricing for wallet payment:');
      console.log('- finalAmount:', finalAmount);
      console.log('- originalAmount:', originalAmount);
      console.log('- saleAmount:', saleAmount);
      console.log('- offerDiscount:', offerDiscount);
      console.log('- couponDiscount:', couponDiscount);
      console.log('- deliveryCharge:', deliveryChargeNum);

      // Check if wallet balance is sufficient
      if (walletBalance < finalAmount) {
        return res.status(StatusCode.BAD_REQUEST).json({ 
          message: 'Insufficient wallet balance' 
        });
      }

      const cart = await Cart.findOne({ userId: actualUserId }).populate("items.productId");
      if (!cart) {
        return res.status(StatusCode.NOT_FOUND).json({ message: "Cart not found" });
      }

      const orderedItems = cart.items
        .filter(item => normalizedCartItems.includes(item._id.toString()))
        .filter(item => item.productId);

      if (orderedItems.length === 0) {
        return res.status(StatusCode.BAD_REQUEST).json({ message: "Selected items are no longer available." });
      }

      // Validate stock for all items
      for (const item of orderedItems) {
        const product = item.productId;
        const quantity = item.quantity;

        if (product.quantity < quantity) {
          return res.status(StatusCode.BAD_REQUEST).json({ message: `Insufficient stock for ${product.name}` });
        }
      }

      // Get coupon if provided
      let appliedCoupon = null;
      if (couponId) {
        appliedCoupon = await Coupon.findById(couponId);
      }

      console.log('Cart wallet payment - Using pre-calculated delivery charge:', deliveryChargeNum);

      // Prepare items for pricing calculation
      const pricingOrderItems = orderedItems.map(item => {
        return {
          product: item.productId,
          quantity: item.quantity,
          variant: item.variant
        };
      });

      // Still need to calculate per-item coupon discounts for the order items
      const pricingResult = PricingCalculator.calculateOrderPricing(
        pricingOrderItems,
        appliedCoupon,
        deliveryChargeNum
      );

      console.log('Per-item pricing calculation for coupon distribution:', pricingResult);

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
      const finalOrderItems = pricingResult.items.map((item) => {
        return {
          product: item.product._id,
          quantity: item.quantity,
          price: item.product.salePrice,
          regularPrice: item.product.regularPrice,
          salePrice: item.product.salePrice,
          offerDiscount: item.pricing.unitOfferDiscount,
          couponDiscount: item.couponDiscount || 0,
          variant: item.variant,
          status: 'processing'
        };
      });

      // Mark coupon as used if applicable
      if (appliedCoupon && pricingResult.coupon.isValid) {
        if (!appliedCoupon.usersUsed.includes(actualUserId)) {
          await Coupon.findByIdAndUpdate(
            couponId,
            { $push: { usersUsed: actualUserId } }
          );
        }
      }

      const newOrder = new Order({
        orderId: generateOrderId(),
        user: actualUserId,
        orderedItems: finalOrderItems,
        totalPrice: originalAmount,
        offerDiscount: offerDiscount,
        couponDiscount: couponDiscount,
        discount: offerDiscount + couponDiscount,
        finalAmount: finalAmount,
        address: address,
        invoiceDate: new Date(),
        status: 'processing',
        paymentStatus: 'Paid',
        createdOn: new Date(),
        coupon: couponId ? couponId : null,
        couponApplied: pricingResult.coupon.isValid,
        paymentMethod: 'wallet',
        deliveryCharge: deliveryChargeNum
      });

      console.log('Cart wallet payment order being saved with pre-calculated values:');
      console.log('- totalPrice:', newOrder.totalPrice);
      console.log('- deliveryCharge:', newOrder.deliveryCharge);
      console.log('- finalAmount:', newOrder.finalAmount);
      console.log('- Expected total (totalPrice + deliveryCharge):', newOrder.totalPrice + newOrder.deliveryCharge);
  
      await newOrder.save();

      // Update product stock
      for (const item of orderedItems) {
        const product = item.productId;
        const quantity = item.quantity;
        const variant = item.variant?.size;

        if (variant) {
          await Product.findByIdAndUpdate(
            product._id,
            { $inc: { [`variants.${variant}`]: -quantity } },
            { new: true }
          );
        }
      }

      // Create wallet transaction for payment
      const walletTransaction = new Wallet({
        userId: actualUserId,
        orderId: newOrder._id,
        transactionId: `WALLET_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        payment_type: 'wallet_payment',
        amount: Number(finalAmount),
        status: 'success',
        entryType: 'DEBIT',
        type: 'product_purchase'
      });

      await walletTransaction.save();

      // Remove ordered items from cart
      const updatedCartItems = cart.items.filter(item => 
        !normalizedCartItems.includes(item._id.toString())
      );
      
      await Cart.findByIdAndUpdate(cart._id, { items: updatedCartItems });

      return res.json({
        success: true,
        message: 'Order placed successfully using wallet',
        orderId: newOrder.orderId,
        redirect: `/order-success-cart`
      });

    } catch (error) {
      console.error('Error processing wallet payment for cart:', error);
      return res.status(StatusCode.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Something went wrong while processing wallet payment',
      });
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
  viewOrderDetails,
  processWalletPayment,
  processWalletPaymentCart
};