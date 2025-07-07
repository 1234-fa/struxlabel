const User = require('../../models/userSchema');
const Cart = require('../../models/cartSchema');
const Product = require('../../models/productSchema')
const Address = require('../../models/addressSchema')
const Order = require('../../models/orderSchema');
const razorpay = require('../../config/payments');
const Coupon = require('../../models/coupenSchema');
const UserCoupon = require('../../models/userCouponSchema');
const {StatusCode} = require('../../config/statuscode');
const PricingCalculator = require('../../utils/pricingUtils');

const crypto = require('crypto');
const mongoose = require('mongoose');

const generateOrderId = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let orderId = '';
    for (let i = 0; i < 10; i++) {
      orderId += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return orderId;
  };

const getorderFailurePage = async (req, res) => {
    try {
        const { orderId } = req.query;
        let failedOrder = null;

        if (orderId) {
            // Get failed order details
            const userId = req.session.user?._id;
            if (userId) {
                failedOrder = await Order.findOne({
                    orderId,
                    user: userId,
                    status: 'payment_failed'
                }).populate('orderedItems.product');
            }
        }

        res.render('orderFailure', {
            failedOrder,
            user: req.session.user
        });
    } catch (error) {
        console.error('Error loading order failure page:', error);
        res.redirect('/pageNotFound');
    }
}

// Create Razorpay order
const createRazorpayOrder = async (req, res) => {
    try {
      const { productId, quantity,variant,couponId, totalPrice ,deliveryCharge} = req.body;
      const userId = req.session.user;
      
      if (!userId) {
        return res.status(StatusCode.UNAUTHORIZED).json({ error: 'User not authenticated' });
      }
      
      // Convert to paise (Razorpay requires amount in smallest currency unit)
      const amount = Math.round(parseFloat(totalPrice) * 100);
      
      // Create order in Razorpay
      const order = await razorpay.orders.create({
        amount,
        currency: 'INR',
        receipt: `receipt_${Date.now()}_${userId}`,
        notes: {
          productId,
          quantity,
          userId,
          couponId: couponId || ''
        }
      });
      
      console.log('Razorpay order created:', order.id);
      res.json({ order_id: order.id, amount: order.amount });
    } catch (error) {
      console.error('Error creating Razorpay order:', error);
      res.status(StatusCode.INTERNAL_SERVER_ERROR).json({ error: 'Failed to create payment order' });
    }
  };

  const createRazorpayOrderCart = async (req, res) => {
    try {
      const { 
        cartItems, 
        totalPrice, 
        couponId, 
        selected,
        // Include pre-calculated pricing data for consistency
        calculatedTotal,
        calculatedOriginalTotal,
        calculatedSaleTotal,
        calculatedSaveAmount,
        calculatedCouponDiscount,
        calculatedDeliveryCharge,
        calculatedFinalAmount
      } = req.body;
      const userId = req.session.user;
  
      if (!userId) {
        return res.status(StatusCode.UNAUTHORIZED).json({ error: 'User not authenticated' });
      }

      console.log('=== CREATING RAZORPAY ORDER FOR CART ===');
      console.log('Cart items:', cartItems);
      console.log('Pre-calculated pricing data:', {
        calculatedTotal,
        calculatedOriginalTotal,
        calculatedSaleTotal,
        calculatedSaveAmount,
        calculatedCouponDiscount,
        calculatedDeliveryCharge,
        calculatedFinalAmount
      });
      console.log('==========================================');
  
      const amount = Math.round(parseFloat(totalPrice) * 100); // Convert to paise
  
      const order = await razorpay.orders.create({
        amount,
        currency: 'INR',
        receipt: `receipt_${Date.now()}_${userId}`,
        notes: {
          userId: String(userId),
          cartItems: JSON.stringify(cartItems),
          selected: JSON.stringify(selected),
          couponId: couponId || '',
          // Store pre-calculated pricing data in Razorpay order notes
          calculatedTotal: calculatedTotal || '',
          calculatedOriginalTotal: calculatedOriginalTotal || '',
          calculatedSaleTotal: calculatedSaleTotal || '',
          calculatedSaveAmount: calculatedSaveAmount || '',
          calculatedCouponDiscount: calculatedCouponDiscount || '',
          calculatedDeliveryCharge: calculatedDeliveryCharge || '',
          calculatedFinalAmount: calculatedFinalAmount || ''
        }
      });
  
      console.log('Razorpay order created:', order.id);
      
      res.json({
        order_id: order.id,
        amount: order.amount,
        razorpayKey: process.env.RAZORPAY_KEY_ID 
      });
    } catch (error) {
      console.error('Error creating Razorpay order:', error);
      res.status(StatusCode.INTERNAL_SERVER_ERROR).json({ error: 'Failed to create payment order' });
    }
  };

  

  const verifyRazorpayPayment = async (req, res) => {
    let newOrder = null; // Declare order variable outside try block
    
    try {
      const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        productId,
        quantity,
        variant,
        totalPrice,
        selected,
        couponId,
        deliveryCharge
      } = req.body;

      console.log('Payment verification request received:', {
        razorpay_order_id,
        razorpay_payment_id,
        productId,
        quantity,
        variant
      });

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
      
      if (availableStock < orderQty) {
          return res.status(StatusCode.BAD_REQUEST).json({ 
              message: `Insufficient stock available for size ${variant}. Only ${availableStock} items left.` 
          });
      }

      // Verify Razorpay signature
      let isPaymentValid = false;
      let paymentVerificationError = null;
      
      try {
        if (razorpay_payment_id && razorpay_signature) {
          const generated_signature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(razorpay_order_id + '|' + razorpay_payment_id)
            .digest('hex');
          
          isPaymentValid = generated_signature === razorpay_signature;
          console.log('Payment verification result:', isPaymentValid);
        } else {
          paymentVerificationError = 'Missing payment details';
          console.log('Payment verification failed: Missing payment details');
        }
      } catch (verifyError) {
        paymentVerificationError = verifyError.message;
        console.log('Payment verification error:', verifyError);
      }

      // Prepare common order data
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
      console.log('Razorpay payment - Delivery charge from request:', deliveryCharge, 'Converted to:', deliveryChargeNum);

      // Calculate pricing using centralized utility for consistent split coupon discount
      const orderItemsForPricing = [{
        product: product,
        quantity: orderQty,
        variant: { size: variant || null }
      }];

      const pricingResult = PricingCalculator.calculateOrderPricing(orderItemsForPricing, appliedCoupon, deliveryChargeNum);

      console.log('Razorpay payment - Pricing calculation result:', pricingResult);
      console.log('Razorpay payment - Final amount includes delivery charge:', pricingResult.totals.finalAmount);

      const orderedItem = {
        product: product._id,
        quantity: orderQty,
        price: product.salePrice,
        regularPrice: product.regularPrice,
        salePrice: product.salePrice,
        offerDiscount: pricingResult.items[0].pricing.unitOfferDiscount,
        couponDiscount: pricingResult.items[0].couponDiscount || 0,
        variant: { 
          size: variant || null 
        },
        status: isPaymentValid ? 'processing' : 'payment_failed'
      };

      // Mark coupon as used if applicable
      if (appliedCoupon && pricingResult.coupon.isValid && isPaymentValid) {
        if (!appliedCoupon.usersUsed.includes(userId)) {
          await Coupon.findByIdAndUpdate(
            couponId,
            { $push: { usersUsed: userId } }
          );
        }
      }

      let orderId = generateOrderId();

      // ALWAYS CREATE AND SAVE THE ORDER REGARDLESS OF PAYMENT STATUS
      newOrder = new Order({
        orderId,
        user: userId,
        orderedItems: [orderedItem],
        totalPrice: pricingResult.totals.originalAmount,
        offerDiscount: pricingResult.totals.offerDiscount,
        couponDiscount: pricingResult.totals.couponDiscount,
        discount: pricingResult.totals.offerDiscount + pricingResult.totals.couponDiscount,
        finalAmount: pricingResult.totals.finalAmount,
        address: address,
        invoiceDate: new Date(),
        status: isPaymentValid ? 'processing' : 'payment_failed',
        createdOn: new Date(),
        coupon: couponId ? couponId : null,
        couponApplied: pricingResult.coupon.isValid,
        paymentMethod: 'razorpay',
        paymentStatus: isPaymentValid ? 'Paid' : 'Failed',
        deliveryCharge: pricingResult.totals.deliveryCharge,
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id || null,
        failureReason: paymentVerificationError || (isPaymentValid ? null : 'Payment verification failed')
      });

      console.log('Razorpay order being saved with:');
      console.log('- totalPrice:', newOrder.totalPrice);
      console.log('- deliveryCharge:', newOrder.deliveryCharge);
      console.log('- finalAmount:', newOrder.finalAmount);
      console.log('- Expected total (totalPrice + deliveryCharge):', newOrder.totalPrice + newOrder.deliveryCharge);

      console.log('Attempting to save order with status:', newOrder.status);
      const savedOrder = await newOrder.save();
      console.log('Order saved successfully:', savedOrder.orderId, 'Status:', savedOrder.status);

      if (isPaymentValid) {
        // Update stock only on successful payment
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

        // Assign best next coupon if no coupon was used
        if (!couponId) {
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
            }
          }
        }

        if (req.session.appliedCoupon) {
          delete req.session.appliedCoupon;
        }

        return res.json({
          success: true,
          redirect: `/order-success?orderId=${savedOrder.orderId}`
        });
      } else {
        // Payment verification failed - order already saved with failed status
        console.log('Payment verification failed for order:', savedOrder.orderId);
        return res.status(StatusCode.BAD_REQUEST).json({ 
          success: false, 
          message: 'Payment verification failed',
          orderId: savedOrder.orderId,
          redirect: `/order-failure?orderId=${savedOrder.orderId}`
        });
      }

    } catch (error) {
      console.error('Error in payment verification:', error);
      
      // If order was created but there was an error, still return the order ID
      if (newOrder && newOrder.orderId) {
        return res.status(StatusCode.INTERNAL_SERVER_ERROR).json({
          success: false,
          message: 'Error processing payment',
          orderId: newOrder.orderId,
          redirect: `/order-failure?orderId=${newOrder.orderId}`
        });
      }
      
      return res.status(StatusCode.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Error processing payment',
        redirect: '/order-failure'
      });
    }
};

  const verifyRazorpayPaymentCart = async (req, res) => {
    try {
      const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        cartItems,
        totalPrice,
        selected,
        couponId,
        deliveryCharge,
        totalDiscount,
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

      console.log('=== CART RAZORPAY PAYMENT VERIFICATION DEBUG ===');
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
      console.log('total discount:', totalDiscount);
      console.log('================================================');
  
      const generated_signature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(razorpay_order_id + "|" + razorpay_payment_id)
        .digest("hex");
  
      if (generated_signature !== razorpay_signature) {
        return res.status(StatusCode.BAD_REQUEST).json({ success: false, message: "Payment verification failed" });
      }
  
      const userId = req.session.user?._id;
      if (!userId) {
        return res.status(StatusCode.UNAUTHORIZED).json({ message: "User not logged in" });
      }

      // Validate cart items
      if (!normalizedCartItems || normalizedCartItems.length === 0) {
        console.log('❌ Invalid cart items received:', cartItems);
        console.log('❌ Normalized cart items:', normalizedCartItems);
        return res.status(StatusCode.BAD_REQUEST).json({ 
          success: false, 
          message: "Invalid cart items provided" 
        });
      }
  
      const cart = await Cart.findOne({ userId }).populate("items.productId");
      if (!cart) {
        console.log('❌ Cart not found for user:', userId);
        return res.status(StatusCode.NOT_FOUND).json({ message: "Cart not found" });
      }

      console.log('📦 Cart found with items:', cart.items.length);
      console.log('🔍 Looking for cart items:', normalizedCartItems);
      
      const orderedItems = cart.items
        .filter(item => normalizedCartItems.includes(item._id.toString()))
        .filter(item => item.productId); // filter valid products

      console.log('✅ Found ordered items:', orderedItems.length);
      console.log('📋 Ordered items details:', orderedItems.map(item => ({
        id: item._id,
        productId: item.productId?._id,
        productName: item.productId?.productName,
        quantity: item.quantity,
        variant: item.variant
      })));

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
          message: "No valid products to order. The selected items may have been removed from your cart." 
        });
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
      const deliveryChargeNum = Number(calculatedDeliveryCharge) || 0;

      console.log('Using pre-calculated pricing for Razorpay payment:');
      console.log('- finalAmount:', finalAmount);
      console.log('- originalAmount:', originalAmount);
      console.log('- saleAmount:', saleAmount);
      console.log('- offerDiscount:', offerDiscount);
      console.log('- couponDiscount:', couponDiscount);
      console.log('- deliveryCharge:', deliveryChargeNum);

      // Still need to calculate per-item coupon discounts for the order items
      const orderItemsForPricing = orderedItems.map(item => {
        return {
          product: item.productId,
          quantity: item.quantity,
          variant: item.variant
        };
      });

      const pricingResult = PricingCalculator.calculateOrderPricing(orderItemsForPricing, appliedCoupon, deliveryChargeNum);

      console.log('Per-item pricing calculation for coupon distribution:', pricingResult);

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
          status: "processing"
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

      const address = {
        addressType: selected.addressType,
        name: selected.name,
        city: selected.city,
        landMark: selected.landMark,
        state: selected.state,
        pincode: selected.pincode,
        phone: selected.phone,
        altphone: selected.altphone
      };

      const newOrder = new Order({
        orderId: generateOrderId(),
        user: userId,
        orderedItems: finalOrderItems,
        totalPrice: originalAmount,
        offerDiscount: offerDiscount,
        couponDiscount: couponDiscount,
        discount: offerDiscount + couponDiscount,
        deliveryCharge: deliveryChargeNum,
        finalAmount: finalAmount,
        address,
        invoiceDate: new Date(),
        status: "processing",
        createdOn: new Date(),
        coupon: couponId || null,
        couponApplied: pricingResult.coupon.isValid,
        paymentMethod: "razorpay",
        paymentStatus: "Paid"
      });

      console.log('Cart Razorpay order being saved with pre-calculated values:');
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
      console.log('🗑️ Removing ordered items from cart...');
      const originalCartItemCount = cart.items.length;
      cart.items = cart.items.filter(item =>
        !normalizedCartItems.includes(item._id.toString())
      );
      const removedItemCount = originalCartItemCount - cart.items.length;
      console.log(`✅ Removed ${removedItemCount} items from cart. Remaining: ${cart.items.length}`);
      await cart.save();
  
      // Clear session coupon
      if (req.session.appliedCoupon) {
        delete req.session.appliedCoupon;
      }
  
      console.log('🎉 Cart order placed successfully!');
      console.log('📋 Order details:', {
        orderId: newOrder.orderId,
        totalItems: newOrder.orderedItems.length,
        finalAmount: newOrder.finalAmount,
        status: newOrder.status
      });

      return res.json({
        success: true,
        redirect: `/order-success?orderId=${newOrder.orderId}`
      });
  
    } catch (error) {
      console.error("❌ Error verifying Razorpay cart payment:", error);
      console.error("Error details:", {
        message: error.message,
        stack: error.stack,
        cartItems: cartItems,
        userId: req.session.user?._id
      });
      return res.status(StatusCode.INTERNAL_SERVER_ERROR).json({
        success: false,
        redirect: '/order-failure',
        message: "Payment verification failed. Please try again or contact support."
      });
    }
  };

// Handle payment failure and create failed order
const handlePaymentFailure = async (req, res) => {
  try {
    console.log('🔴 Payment failure handler called');
    console.log('Request body:', req.body);

    const userId = req.session.user?._id;
    if (!userId) {
      console.log('❌ User not logged in');
      return res.status(StatusCode.UNAUTHORIZED).json({
        success: false,
        message: 'User not logged in'
      });
    }

    const {
      productId,
      quantity,
      variant,
      totalPrice,
      selected,
      couponId,
      deliveryCharge,
      cartItems,
      totalDiscount,
      razorpay_order_id,
      error_code,
      error_description,
      isCartOrder,
      // Use the pre-calculated pricing data from the payment page
      calculatedTotal,
      calculatedOriginalTotal,
      calculatedSaleTotal,
      calculatedSaveAmount,
      calculatedCouponDiscount,
      calculatedDeliveryCharge,
      calculatedFinalAmount
    } = req.body;

    console.log('📝 Creating failed order...');
    console.log('Is cart order:', isCartOrder);

    let newOrder;

    if (isCartOrder) {
      // Handle cart order failure
      console.log('Processing cart order failure');

      const cart = await Cart.findOne({ userId }).populate('items.productId');
      if (!cart) {
        throw new Error('Cart not found');
      }

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

      console.log('📦 Cart found with items:', cart.items.length);
      console.log('🔍 Looking for cart items:', normalizedCartItems);

      const orderItems = [];
      let totalOriginalPrice = 0;
      let calculatedDiscount = 0;

      for (const itemId of normalizedCartItems) {
        const cartItem = cart.items.find(item => item._id.toString() === itemId);
        if (!cartItem) {
          console.log('⚠️ Cart item not found:', itemId);
          continue;
        }

        const product = cartItem.productId;
        const itemQuantity = cartItem.quantity;
        const itemVariant = cartItem.variant;

        const originalPrice = product.regularPrice * itemQuantity;
        const salePrice = product.salePrice * itemQuantity;
        const productDiscount = originalPrice - salePrice;

        totalOriginalPrice += originalPrice;
        calculatedDiscount += productDiscount;

        orderItems.push({
          product: product._id,
          quantity: itemQuantity,
          variant: typeof itemVariant === 'string' ? { size: itemVariant } : itemVariant,
          price: product.salePrice,
          status: 'payment_failed'
        });
      }

      console.log('✅ Created order items for failed cart order:', orderItems.length);

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

      // Use pre-calculated pricing data if available, otherwise fall back to calculated values
      const finalAmount = Number(calculatedFinalAmount) || Number(totalPrice) || 0;
      const originalAmount = Number(calculatedOriginalTotal) || totalOriginalPrice;
      const offerDiscount = Number(calculatedSaveAmount) || calculatedDiscount;
      const couponDiscount = Number(calculatedCouponDiscount) || 0;
      const deliveryChargeNum = Number(calculatedDeliveryCharge) || Number(deliveryCharge) || 0;

      console.log('Using pricing data for failed cart order:');
      console.log('- finalAmount:', finalAmount);
      console.log('- originalAmount:', originalAmount);
      console.log('- offerDiscount:', offerDiscount);
      console.log('- couponDiscount:', couponDiscount);
      console.log('- deliveryCharge:', deliveryChargeNum);

      newOrder = new Order({
        orderId: generateOrderId(),
        user: userId,
        orderedItems: orderItems,
        totalPrice: originalAmount,
        offerDiscount: offerDiscount,
        couponDiscount: couponDiscount,
        discount: offerDiscount + couponDiscount,
        finalAmount: finalAmount,
        address,
        invoiceDate: new Date(),
        status: 'payment_failed',
        createdOn: new Date(),
        coupon: couponId || null,
        couponApplied: !!couponId,
        paymentMethod: 'razorpay',
        paymentStatus: 'Failed',
        razorpayOrderId: razorpay_order_id,
        paymentFailureReason: `${error_code}: ${error_description}`,
        retryAttempts: 0,
        lastPaymentAttempt: new Date(),
        deliveryCharge: deliveryChargeNum
      });

    } else {
      // Handle single product order failure
      console.log('Processing single product order failure');

      const product = await Product.findById(productId);
      if (!product) {
        throw new Error('Product not found');
      }

      const originalPrice = product.regularPrice * quantity;
      const salePrice = product.salePrice * quantity;
      const productDiscount = originalPrice - salePrice;

      let couponDiscount = 0;
      if (couponId) {
        const coupon = await Coupon.findById(couponId);
        if (coupon && coupon.isList && new Date() <= coupon.expireOn) {
          couponDiscount = Math.min(coupon.offerPrice, salePrice * (coupon.discount / 100));
        }
      }

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

      const orderedItem = {
        product: productId,
        quantity,
        variant: typeof variant === 'string' ? { size: variant } : variant,
        price: product.salePrice,
        status: 'payment_failed'
      };

      newOrder = new Order({
        orderId: generateOrderId(),
        user: userId,
        orderedItems: [orderedItem],
        totalPrice: originalPrice,
        discount: productDiscount + couponDiscount,
        finalAmount: totalPrice,
        address,
        invoiceDate: new Date(),
        status: 'payment_failed',
        createdOn: new Date(),
        coupon: couponId || null,
        couponApplied: !!couponId,
        paymentMethod: 'razorpay',
        paymentStatus: 'Failed',
        razorpayOrderId: razorpay_order_id,
        paymentFailureReason: `${error_code}: ${error_description}`,
        retryAttempts: 0,
        lastPaymentAttempt: new Date(),
        deliveryCharge: deliveryCharge || 0
      });
    }

    await newOrder.save();
    console.log('✅ Failed order created successfully:', newOrder.orderId);

    return res.json({
      success: true,
      message: 'Failed order saved',
      orderId: newOrder.orderId,
      redirect: `/order-failure?orderId=${newOrder.orderId}`
    });

  } catch (error) {
    console.error('❌ Error handling payment failure:', error);
    return res.status(StatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error saving failed order'
    });
  }
};

// Retry payment for failed order
const retryPayment = async (req, res) => {
  try {
    console.log('🔄 Retry payment route called');
    const { orderId } = req.params;
    const userId = req.session.user?._id;

    console.log('Order ID:', orderId);
    console.log('User ID:', userId);

    if (!userId) {
      console.log('❌ User not logged in, redirecting to login');
      return res.redirect('/login');
    }

    console.log('🔍 Looking for failed order...');
    const order = await Order.findOne({
      orderId,
      user: userId,
      $or: [
        { status: 'payment_failed' },
        { paymentStatus: 'Failed' }
      ]
    }).populate('orderedItems.product');

    console.log('Found order:', order ? 'Yes' : 'No');
    if (order) {
      console.log('Order status:', order.status);
      console.log('Payment status:', order.paymentStatus);
    }

    if (!order) {
      console.log('❌ Failed order not found');

      // Let's check what orders exist for this user
      const allUserOrders = await Order.find({ user: userId }).select('orderId status paymentStatus');
      console.log('All user orders:', allUserOrders);

      return res.status(StatusCode.NOT_FOUND).send(`
        <h1>Order Not Found</h1>
        <p>Failed order with ID "${orderId}" not found.</p>
        <p>Order ID: ${orderId}</p>
        <p>User ID: ${userId}</p>
        <h3>Available Orders:</h3>
        <ul>
          ${allUserOrders.map(o => `<li>${o.orderId} - Status: ${o.status} - Payment: ${o.paymentStatus}</li>`).join('')}
        </ul>
        <a href="/view-orders">View All Orders</a>
        <br><br>
        <a href="/debug-orders">Debug Orders (JSON)</a>
      `);
    }

    // Update retry attempts
    console.log('📝 Updating retry attempts...');
    order.retryAttempts += 1;
    order.lastPaymentAttempt = new Date();
    await order.save();
    console.log('✅ Retry attempts updated:', order.retryAttempts);

    // Create new Razorpay order for retry
    const amount = Math.round(parseFloat(order.finalAmount) * 100);
    console.log('💰 Creating Razorpay order for amount:', amount);

    const razorpayOrder = await razorpay.orders.create({
      amount,
      currency: 'INR',
      receipt: `retry_${order.retryAttempts}_${Date.now().toString().slice(-8)}`,
      notes: {
        orderId: order.orderId,
        userId: String(userId),
        retryAttempt: order.retryAttempts
      }
    });
    console.log('✅ Razorpay order created:', razorpayOrder.id);

    // Render retry payment page
    console.log('🎨 Rendering retry payment page...');
    res.render('retryPayment', {
      user: userId,
      order,
      razorpayKey: process.env.RAZORPAY_KEY_ID,
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount
    });
    console.log('✅ Retry payment page rendered successfully');

  } catch (error) {
    console.error('Error in retry payment:', error);
    res.status(StatusCode.INTERNAL_SERVER_ERROR).send('Something went wrong');
  }
};

// Verify retry payment
const verifyRetryPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orderId
    } = req.body;

    // Verify Razorpay signature
    const generated_signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + '|' + razorpay_payment_id)
      .digest('hex');

    if (generated_signature !== razorpay_signature) {
      return res.status(StatusCode.BAD_REQUEST).json({
        success: false,
        message: 'Payment verification failed'
      });
    }

    const userId = req.session.user?._id;
    if (!userId) {
      return res.status(StatusCode.UNAUTHORIZED).json({ message: 'User not logged in' });
    }

    // Find and update the failed order
    const order = await Order.findOne({
      orderId,
      user: userId,
      status: 'payment_failed'
    }).populate('orderedItems.product');

    if (!order) {
      return res.status(StatusCode.NOT_FOUND).json({ message: 'Failed order not found' });
    }

    // Update order status to successful
    order.status = 'processing';
    order.paymentStatus = 'Paid';
    order.razorpayPaymentId = razorpay_payment_id;
    order.paymentFailureReason = '';

    // Update all ordered items status
    order.orderedItems.forEach(item => {
      if (item.status === 'payment_failed') {
        item.status = 'processing';
      }
    });

    await order.save();

    // Update product stock
    for (const item of order.orderedItems) {
      const product = await Product.findById(item.product);
      if (product) {
        const variantSize = item.variant?.size || item.variant;
        if (variantSize && product.variants) {
          const variantStock = product.variants.get(variantSize);
          if (variantStock !== undefined && variantStock >= item.quantity) {
            product.variants.set(variantSize, variantStock - item.quantity);
            await product.save();
          }
        }
      }
    }

    // Update coupon usage if applicable
    if (order.couponApplied && order.coupon) {
      const coupon = await Coupon.findById(order.coupon);
      if (coupon && !coupon.usersUsed.includes(userId)) {
        await Coupon.findByIdAndUpdate(
          order.coupon,
          { $push: { usersUsed: userId } }
        );
      }
    }

    return res.json({
      success: true,
      message: 'Payment successful',
      redirect: `/order-success?orderId=${order.orderId}`
    });

  } catch (error) {
    console.error('Error verifying retry payment:', error);
    return res.status(StatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Payment verification failed'
    });
  }
};

module.exports={
  verifyRazorpayPayment,
  createRazorpayOrder,
  getorderFailurePage,
  createRazorpayOrderCart,
  verifyRazorpayPaymentCart,
  handlePaymentFailure,
  retryPayment,
  verifyRetryPayment
}