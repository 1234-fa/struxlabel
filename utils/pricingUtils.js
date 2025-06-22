/**
 * Centralized Pricing Utility
 * Ensures consistent pricing calculations across the entire application
 */

const Coupon = require('../models/coupenSchema');

class PricingCalculator {
  
  /**
   * Calculate delivery charge based on order amount
   * @param {number} orderAmount - Total order amount before delivery
   * @returns {number} Delivery charge
   */
  static calculateDeliveryCharge(orderAmount) {
    const DELIVERY_THRESHOLD = 2000;
    const DELIVERY_CHARGE = 54;
    
    return orderAmount >= DELIVERY_THRESHOLD ? 0 : DELIVERY_CHARGE;
  }

  /**
   * Calculate product pricing details
   * @param {Object} product - Product object with regularPrice and salePrice
   * @param {number} quantity - Quantity ordered
   * @returns {Object} Pricing breakdown
   */
  static calculateProductPricing(product, quantity) {
    const regularPrice = product.regularPrice || 0;
    const salePrice = product.salePrice || regularPrice;
    
    const originalAmount = regularPrice * quantity;
    const saleAmount = salePrice * quantity;
    const offerDiscount = originalAmount - saleAmount;
    
    return {
      regularPrice,
      salePrice,
      quantity,
      originalAmount,
      saleAmount,
      offerDiscount,
      unitOfferDiscount: regularPrice - salePrice
    };
  }

  /**
   * Calculate coupon discount
   * @param {Object} coupon - Coupon object
   * @param {number} eligibleAmount - Amount eligible for coupon discount
   * @param {number} minimumAmount - Minimum amount required for coupon
   * @returns {Object} Coupon calculation result
   */
  static calculateCouponDiscount(coupon, eligibleAmount, minimumAmount = 0) {
    if (!coupon || eligibleAmount < minimumAmount) {
      return {
        isValid: false,
        discount: 0,
        reason: eligibleAmount < minimumAmount ? 'Minimum amount not met' : 'No coupon provided'
      };
    }

    let discount = 0;
    
    if (coupon.discount) {
      // Percentage discount
      discount = (eligibleAmount * coupon.discount) / 100;
    } else if (coupon.offerPrice) {
      // Fixed amount discount
      discount = Math.min(coupon.offerPrice, eligibleAmount);
    }

    // Apply maximum discount limit if exists
    if (coupon.maxDiscount && discount > coupon.maxDiscount) {
      discount = coupon.maxDiscount;
    }

    return {
      isValid: true,
      discount: Math.round(discount * 100) / 100,
      type: coupon.discount ? 'percentage' : 'fixed',
      percentage: coupon.discount || 0,
      maxDiscount: coupon.maxDiscount || null
    };
  }

  /**
   * Calculate complete order pricing
   * @param {Array} items - Array of order items with product details
   * @param {Object} coupon - Coupon object (optional)
   * @param {number} deliveryCharge - Manual delivery charge override (optional)
   * @returns {Object} Complete order pricing breakdown
   */
  static calculateOrderPricing(items, coupon = null, deliveryCharge = null) {
    let totalOriginalAmount = 0;
    let totalSaleAmount = 0;
    let totalOfferDiscount = 0;
    
    const itemBreakdown = items.map(item => {
      const pricing = this.calculateProductPricing(item.product, item.quantity);
      
      totalOriginalAmount += pricing.originalAmount;
      totalSaleAmount += pricing.saleAmount;
      totalOfferDiscount += pricing.offerDiscount;
      
      return {
        ...item,
        pricing
      };
    });

    // Calculate delivery charge
    const calculatedDeliveryCharge = deliveryCharge !== null 
      ? deliveryCharge 
      : this.calculateDeliveryCharge(totalSaleAmount);

    // Calculate coupon discount
    const couponCalculation = coupon 
      ? this.calculateCouponDiscount(coupon, totalSaleAmount, coupon.price || 0)
      : { isValid: false, discount: 0 };

    // Calculate final amounts
    const subtotalAfterOffers = totalSaleAmount;
    const subtotalAfterCoupon = subtotalAfterOffers - couponCalculation.discount;
    const finalAmount = subtotalAfterCoupon + calculatedDeliveryCharge;

    return {
      items: itemBreakdown,
      totals: {
        originalAmount: Math.round(totalOriginalAmount * 100) / 100,
        saleAmount: Math.round(totalSaleAmount * 100) / 100,
        offerDiscount: Math.round(totalOfferDiscount * 100) / 100,
        couponDiscount: couponCalculation.discount,
        deliveryCharge: calculatedDeliveryCharge,
        subtotalAfterOffers: Math.round(subtotalAfterOffers * 100) / 100,
        subtotalAfterCoupon: Math.round(subtotalAfterCoupon * 100) / 100,
        finalAmount: Math.round(finalAmount * 100) / 100
      },
      coupon: couponCalculation,
      breakdown: {
        step1_original: totalOriginalAmount,
        step2_afterOffers: subtotalAfterOffers,
        step3_afterCoupon: subtotalAfterCoupon,
        step4_withDelivery: finalAmount
      }
    };
  }

  /**
   * Calculate refund amount for cancelled/returned items
   * @param {Object} order - Complete order object
   * @param {Array} refundItems - Items to be refunded
   * @returns {Object} Refund calculation
   */
  static calculateRefundAmount(order, refundItems) {
    // Get remaining active items
    const remainingItems = order.orderedItems.filter(item => 
      !refundItems.some(refundItem => refundItem._id.toString() === item._id.toString()) &&
      !['cancelled', 'returned', 'return approved'].includes(item.status)
    );

    // Calculate remaining order value
    const remainingAmount = remainingItems.reduce((sum, item) => {
      return sum + (item.price * item.quantity);
    }, 0);

    // Calculate refund item amount
    const refundAmount = refundItems.reduce((sum, item) => {
      return sum + (item.price * item.quantity);
    }, 0);

    // Check if coupon is still valid with remaining items
    let couponStillValid = false;
    let adjustedRefund = refundAmount;

    if (order.coupon && order.couponApplied) {
      const couponMinAmount = order.coupon.price || 0;
      couponStillValid = remainingAmount >= couponMinAmount;

      if (!couponStillValid && order.coupon) {
        // If coupon becomes invalid, adjust refund
        // User should get back the amount they would have paid without coupon
        const originalOrderAmount = order.totalPrice; // Original amount before any discounts
        const couponDiscount = order.discount || 0;
        
        // Calculate what the remaining amount should be without coupon
        const remainingAmountWithoutCoupon = remainingAmount + (couponDiscount * remainingAmount / (originalOrderAmount - couponDiscount));
        
        // Adjust refund to account for lost coupon benefit
        adjustedRefund = (order.finalAmount - order.deliveryCharge) - remainingAmountWithoutCoupon;
        adjustedRefund = Math.max(adjustedRefund, refundAmount); // Never refund less than item value
      }
    }

    return {
      refundAmount: Math.round(adjustedRefund * 100) / 100,
      remainingAmount: Math.round(remainingAmount * 100) / 100,
      couponStillValid,
      originalRefundAmount: Math.round(refundAmount * 100) / 100,
      adjustment: Math.round((adjustedRefund - refundAmount) * 100) / 100
    };
  }

  /**
   * Validate pricing consistency
   * @param {Object} orderData - Order data to validate
   * @returns {Object} Validation result
   */
  static validatePricing(orderData) {
    const errors = [];
    const warnings = [];

    // Check if all required pricing fields exist
    if (!orderData.totalPrice) errors.push('Missing totalPrice');
    if (!orderData.finalAmount) errors.push('Missing finalAmount');
    if (orderData.deliveryCharge === undefined) warnings.push('Missing deliveryCharge');

    // Validate item pricing
    if (orderData.orderedItems) {
      orderData.orderedItems.forEach((item, index) => {
        if (!item.price) errors.push(`Item ${index}: Missing price`);
        if (!item.quantity) errors.push(`Item ${index}: Missing quantity`);
      });
    }

    // Check calculation consistency
    const recalculated = this.calculateOrderPricing(
      orderData.orderedItems || [],
      orderData.coupon,
      orderData.deliveryCharge
    );

    const tolerance = 0.01; // 1 paisa tolerance for rounding
    if (Math.abs(recalculated.totals.finalAmount - orderData.finalAmount) > tolerance) {
      warnings.push(`Final amount mismatch: Expected ${recalculated.totals.finalAmount}, Got ${orderData.finalAmount}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      recalculated: recalculated.totals
    };
  }
}

module.exports = PricingCalculator;
