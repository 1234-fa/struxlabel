const mongoose = require('mongoose');
 const { Schema } = mongoose;

const userCouponSchema = new Schema({
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    couponDetails: {
        type: Schema.Types.ObjectId,
        ref: 'Coupon',
        required: true,
    },
    status: {
      type: String,
      enum: ['can_apply', 'applied', 'expired'],
      default: 'can_apply',
    },
    appliedOrder: {
        type: Schema.Types.ObjectId,
        ref: 'Order', 
        default: null,
      },
    createdAt: {
      type: Date,
      default: Date.now,
    }
  });
  
  module.exports = mongoose.model('UserCoupon', userCouponSchema);