const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  },
  discount: {
    type: Number,
    required: true,
    min: 1,
    max: 100,
  },
  price: {
    type: Number,
    required: true,
  },
  activeFrom: {
    type: Date,
    required: true,
  },
  validDays: {
    type: Number,
    required: true,
  },
  userLimit: {
    type: Number,
    required: true,
  },
  usersUsed: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: "User",
    default: [],
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

couponSchema.virtual("expiresOn").get(function () {
  const expiry = new Date(this.activeFrom);
  expiry.setDate(expiry.getDate() + this.validDays);
  return expiry;
});

module.exports = mongoose.model("Coupon", couponSchema);
