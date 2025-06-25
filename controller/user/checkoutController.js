const User = require('../../models/userSchema');
const Cart = require('../../models/cartSchema');
const Product = require('../../models/productSchema')
const Address = require('../../models/addressSchema')
const Order = require('../../models/orderSchema');
const razorpay = require('../../config/payments');
const Coupon = require('../../models/coupenSchema');
const UserCoupon = require('../../models/userCouponSchema');
const {StatusCode} = require('../../config/statuscode');

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
      const { cartItems, totalPrice, couponId, selected } = req.body;
      const userId = req.session.user;
  
      if (!userId) {
        return res.status(StatusCode.UNAUTHORIZED).json({ error: 'User not authenticated' });
      }
  
      const amount = Math.round(parseFloat(totalPrice) * 100); // Convert to paise
  
      const order = await razorpay.orders.create({
        amount,
        currency: 'INR',
        receipt: `receipt_${Date.now()}_${userId}`,
        notes: {
          userId: String(userId),
          cartItems: JSON.stringify(cartItems),
          selected: JSON.stringify(selected),
          couponId: couponId || ''
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

      const orderedItem = {
        product: product._id,
        quantity: orderQty,
        price: product.salePrice,
        variant: { 
          size: variant || null 
        },
        status: isPaymentValid ? 'processing' : 'payment_failed'
      };

      const originalPrice = product.regularPrice * orderQty;
      const salePrice = product.salePrice * orderQty;
      const productDiscount = originalPrice - salePrice;
      let couponDiscount = 0;
      let appliedCoupon = null;

      if (couponId && isPaymentValid) {
        appliedCoupon = await Coupon.findById(couponId);
        if (appliedCoupon) {
          couponDiscount = (salePrice * appliedCoupon.discount) / 100;
          // Update coupon usage only on successful payment
          if (!appliedCoupon.usersUsed.includes(userId)) {
            await Coupon.findByIdAndUpdate(
              couponId,
              { $push: { usersUsed: userId } }
            );
          }
        }
      }

      const finalAmount = originalPrice - (productDiscount + couponDiscount);
      let orderId = generateOrderId();

      // ALWAYS CREATE AND SAVE THE ORDER REGARDLESS OF PAYMENT STATUS
      newOrder = new Order({
        orderId,
        user: userId,
        orderedItems: [orderedItem],
        totalPrice: originalPrice,
        discount: productDiscount + couponDiscount,
        finalAmount: finalAmount,
        address: address,
        invoiceDate: new Date(),
        status: isPaymentValid ? 'processing' : 'payment_failed',
        createdOn: new Date(),
        coupon: couponId ? couponId : null,
        couponApplied: !!couponId,
        paymentMethod: 'razorpay',
        paymentStatus: isPaymentValid ? 'Paid' : 'Failed',
        deliveryCharge: deliveryCharge,
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id || null,
        failureReason: paymentVerificationError || (isPaymentValid ? null : 'Payment verification failed')
      });

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
        totalDiscount
      } = req.body;
      console.log('total discount:',totalDiscount);
  
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
  
      const cart = await Cart.findOne({ userId }).populate("items.productId");
      if (!cart) {
        return res.status(StatusCode.NOT_FOUND).json({ message: "Cart not found" });
      }
  
      const orderedItems = cart.items
        .filter(item => cartItems.includes(item._id.toString()))
        .filter(item => item.productId); // filter valid products
  
      if (orderedItems.length === 0) {
        return res.status(StatusCode.BAD_REQUEST).json({ message: "No valid products to order" });
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
        
              let availableStock;
        if (product.variants && variant?.size) {
          // For products with variants, check variant-specific stock
          availableStock = product.variants.get(variant.size) || 0;
          
          if (availableStock < quantity) {
            return res.status(StatusCode.BAD_REQUEST).json({ 
              message: `Insufficient stock for ${product.name} (Size: ${variant.size}). Only ${availableStock} available.` 
            });
          }
        } else {
          // For products without variants, check general stock
          availableStock = product.quantity || 0;
          
          if (availableStock < quantity) {
            return res.status(StatusCode.BAD_REQUEST).json({ 
              message: `Insufficient stock for ${product.name}. Only ${availableStock} available.` 
            });
          }
        }
        
              const itemTotal = price * quantity;
              const itemOriginalTotal = originalPrice * quantity;
        
              totalOriginalPrice += itemOriginalTotal;
              totalSalePrice += itemTotal;
        
              orderItems.push({
                product: product._id,
                quantity,
                variant: variant || { size: null },
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
        orderedItems: orderItems,
        totalPrice: totalOriginalPrice,
        discount: Number(totalDiscount),
        deliveryCharge:deliveryCharge,
        finalAmount: totalPrice,
        address,
        invoiceDate: new Date(),
        status: "processing",
        createdOn: new Date(),
        coupon: couponId || null,
        couponApplied: !!couponId,
        paymentMethod: "razorpay",
        paymentStatus: "Paid"
      });
  console.log(newOrder.discount);
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
  
      // Clear session coupon
      if (req.session.appliedCoupon) {
        delete req.session.appliedCoupon;
      }
  
      return res.json({
        success: true,
        redirect: `/order-success?orderId=${newOrder.orderId}`
      });
  
    } catch (error) {
      console.error("❌ Error verifying Razorpay cart payment:", error);
      return res.status(StatusCode.INTERNAL_SERVER_ERROR).json({
        success: false,
        redirect: '/order-failure',
        message: "Payment verification failed"
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
      isCartOrder
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

      const orderItems = [];
      let totalOriginalPrice = 0;
      let calculatedDiscount = 0;

      for (const itemId of cartItems) {
        const cartItem = cart.items.find(item => item._id.toString() === itemId);
        if (!cartItem) continue;

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

      newOrder = new Order({
        orderId: generateOrderId(),
        user: userId,
        orderedItems: orderItems,
        totalPrice: totalOriginalPrice,
        discount: totalDiscount || calculatedDiscount,
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