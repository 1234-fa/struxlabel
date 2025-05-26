const UserCoupon = require('../../models/userCouponSchema');
const Coupon = require('../../models/coupenSchema');
const Product = require('../../models/productSchema');
const StatusCode = require('../../config/statuscode');


const showUserCoupon = async (req, res) => {
    try {
      const userId = req.session.user._id;
  
      const userCoupons = await UserCoupon.find({ userId })
        .sort({ createdAt: -1 }) 
        .populate('couponDetails');
  
      res.render('userCoupon', {
        userCoupons,
      });
    } catch (err) {
      console.error('Error loading coupons:', err);
      res.status(StatusCode.INTERNAL_SERVER_ERROR).send('Internal server error');
    }
  };


  const applyCoupon = async (req, res) => {
    try {
      const { couponId, productId, quantity } = req.body;
  
      const product = await Product.findById(productId);
      const coupon = await Coupon.findById(couponId);
  
      if (!product || !coupon) {
        return res.json({ success: false, message: 'Invalid product or coupon.' });
      }
  
      if (product.salePrice < coupon.price) {
        return res.json({ success: false, message: 'Coupon not applicable for this product.' });
      }
  
      const discountAmount = (product.salePrice * quantity) * (coupon.discount / 100);
      const newTotal = (product.salePrice * quantity) - discountAmount;
  
      // Store in session for payment route
      req.session.appliedCoupon = {
        id: coupon._id,
        discountAmount,
        newTotal
      };
  
      return res.json({
        success: true,
        discountAmount,
        newTotal
      });
    } catch (err) {
      console.error('Coupon apply error:', err);
      return res.status(StatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Server error while applying coupon.' });
    }
  };

module.exports = {showUserCoupon,applyCoupon}