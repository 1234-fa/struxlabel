const Coupon = require('../../models/coupenSchema');
const User = require('../../models/userSchema');
const Order = require('../../models/orderSchema');

const generateCouponCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let orderId = '';
    for (let i = 0; i < 6; i++) {
      orderId += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return orderId;
  };

const getCoupons=async (req,res)=>{
    try {
        const coupons = await Coupon.find();
    
        res.render('coupon',{coupons});
    } catch (error) {
        res.redirect('/pageerror')
    }
}

const addCoupons = async (req, res) => {
    try {
      const { name, discount, price, activeFrom, validDays, userLimit } = req.body;
  
      // Check if coupon with the same name already exists
      const existingCoupon = await Coupon.findOne({ name });
      if (existingCoupon) {
        const coupons = await Coupon.find();
        return res.render('coupon', { coupons, message: 'Coupon already exists' });
      }
  
      // Generate a unique coupon code
      const code = generateCouponCode();
  
      // Create new coupon
      const newCoupon = new Coupon({
        name,
        code,
        discount,
        price,
        activeFrom,
        validDays,
        userLimit
      });
  
      // Save the coupon
      await newCoupon.save();
  
      // Redirect to coupon list
      res.redirect('/admin/coupon');
    } catch (error) {
      console.error('Error adding coupon:', error);
      res.redirect('/pageerror');
    }
  };

  
    const editCoupon = async (req, res) => {
        try {
        const couponId = req.params.id;
          const { name, discount, price, activeFrom, validDays, userLimit } = req.body;
      
          const updated = await Coupon.findByIdAndUpdate(
            couponId,
            {
              name,
              discount,
              price,
              activeFrom,
              validDays,
              userLimit
            },
            { new: true } 
          );
      
          if (!updated) {
            return res.redirect('/pageerror');
          }
      
          res.redirect('/admin/coupon');
        } catch (error) {
          console.error('Error editing coupon:', error);
          res.redirect('/pageerror');
        }
      };

      const deteleCoupon = async (req,res)=>{
        try {
            const id = req.params.id;
            await Coupon.deleteOne({_id:id});
            res.redirect('/admin/coupon');
        } catch (error) {
            console.log("error:",error)
            res.redirect('/pageerror');
        }
      }

module.exports = {getCoupons,addCoupons,editCoupon,deteleCoupon}