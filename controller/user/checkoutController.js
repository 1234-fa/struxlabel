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

const getorderFailurePage =async (req,res)=>{
    try {
        res.render('orderFailure');
    } catch (error) {
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
  
      // Verify Razorpay signature
      const generated_signature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(razorpay_order_id + '|' + razorpay_payment_id)
        .digest('hex');
  
      if (generated_signature !== razorpay_signature) {
        return res.status(StatusCode.BAD_REQUEST).json({ success: false, message: 'Payment verification failed' });
      }
  
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
            status: 'processing'
      };
  
      const originalPrice = product.regularPrice * orderQty;
      const salePrice = product.salePrice * orderQty;
      const productDiscount = originalPrice - salePrice;
      let couponDiscount = 0;
      let appliedCoupon = null;
  
      console.log('coupon in resorpay order',couponId);
      if (couponId) {
        appliedCoupon = await Coupon.findById(couponId);
        if (appliedCoupon) {
          couponDiscount = (salePrice * appliedCoupon.discount) / 100;
          // Update coupon usage
          if (!appliedCoupon.usersUsed.includes(userId)) {
            await Coupon.findByIdAndUpdate(
              couponId,
              { $push: { usersUsed: userId } }
            );
          }
        }
      }
  
      const finalAmount = originalPrice - (productDiscount + couponDiscount);
      let orderId= generateOrderId();
      const newOrder = new Order({
        orderId,
        user: userId,
        orderedItems: [orderedItem],
        totalPrice: originalPrice,
        discount: productDiscount + couponDiscount,
        finalAmount: finalAmount,
        address: address,
        invoiceDate: new Date(),
        status: 'processing',
        createdOn: new Date(),
        coupon: couponId ? couponId : null,
        couponApplied: !!couponId,
        paymentMethod: 'razorpay',
        paymentStatus:'Paid',
        deliveryCharge:deliveryCharge
      });
  
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
        redirect: `/order-success?orderId=${newOrder.orderId}`
      });

    } catch (error) {
      console.error('Error verifying Razorpay payment:', error);
      return res.redirect('/order-failure');
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

module.exports={verifyRazorpayPayment,createRazorpayOrder,getorderFailurePage,createRazorpayOrderCart,verifyRazorpayPaymentCart}