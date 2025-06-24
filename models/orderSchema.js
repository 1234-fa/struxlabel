const mongoose = require("mongoose");
const { Schema } = mongoose;
const { v4: uuidv4 } = require("uuid");

const orderSchema = new Schema(
  {
    orderId: {
      type: String,
      default: () => uuidv4(),
      unique: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    orderedItems: [
      {
        product: {
          type: Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
        },
        variant: {
          size: {
            type: String,
            default: null,
          },
        },
        price: {
          type: Number,
          default: 0,
        },
        regularPrice: {
          type: Number,
          default: 0,
        },
        salePrice: {
          type: Number,
          default: 0,
        },
        offerDiscount: {
          type: Number,
          default: 0,
        },
        status: {
          type: String,
          enum: [
            "processing",
            "shipped",
            "out_for_delivery",
            "delivered",
            "cancelled",
            "return request",
            "returned",
            "return approved",
            "return rejected",
            "payment_failed",
          ],
          default: "processing",
          lowercase: true,
        },
        cancelReason: {
          type: String,
          default: "",
        },
        returnReason: {
          type: String,
          default: "",
        },
        deliveredOn: {
          type: Date,
        },
        deliveredOn: {
          type: Date,
        },
      },
    ],
    deliveredOn: {
      type: Date,
    },
    totalPrice: {
      type: Number,
      default: 0,
    },
    deliveryCharge: {
      type: Number,
      default: 0,
    },
    discount: {
      type: Number,
      default: 0,
    },
    offerDiscount: {
      type: Number,
      default: 0,
    },
    couponDiscount: {
      type: Number,
      default: 0,
    },
    finalAmount: {
      type: Number,
      default: 0,
    },
    refundAmount: {
      type: Number,
      default: 0,
    },
    address: {
      addressType: { type: String, required: true },
      name: { type: String, required: true },
      city: { type: String, required: true },
      landMark: { type: String, required: true },
      state: { type: String, required: true },
      pincode: { type: String, required: true },
      phone: { type: String, required: true },
      altphone: { type: String },
    },
    invoiceDate: {
      type: Date,
    },
    status: {
      type: String,
      required: true,
      enum: [
        "processing",
        "placed",
        "shipped",
        "delivered",
        "cancelled",
        "out_for_delivery",
        "return request",
        "returned",
        "return approved",
        "return rejected",
        "payment_failed",
      ],
      lowercase: true,
    },
    createdOn: {
      type: Date,
      default: Date.now,
      required: true,
    },
    coupon: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Coupon",
    },
    couponApplied: {
      type: Boolean,
      default: false,
    },
    cancelReason: {
      type: String,
      default: "",
    },
    returnReason: {
      type: String,
      default: "",
    },
    paymentMethod: {
      type: String,
      required: true,
      enum: ["credit_card", "paypal", "razorpay", "cash_on_delivery"],
    },
    paymentStatus: {
      type: String,
      enum: ["Pending", "Paid", "Failed", "Refunded", "Partially Refunded"],
      default: "Pending",
    },
    razorpayOrderId: {
      type: String,
    },
    razorpayPaymentId: {
      type: String,
    },
    paymentFailureReason: {
      type: String,
      default: "",
    },
    retryAttempts: {
      type: Number,
      default: 0,
    },
    lastPaymentAttempt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Order", orderSchema);
