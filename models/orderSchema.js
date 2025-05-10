const mongoose = require('mongoose');
const { Schema } = mongoose;
const { v4: uuidv4 } = require('uuid');

const orderSchema = new Schema({
  orderId: {
    type: String,
    default: () => uuidv4(),
    unique: true,
  },
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  orderedItems: [{
    product: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
    },
    price: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['processing', 'shipped', 'delivered', 'cancelled', 'return request', 'returned','return approved','return rejected'],
      default: 'processing',
      lowercase: true,
    },
    cancelReason: {
      type: String,
      default: '',
    },
    returnReason: {
      type: String,
      default: '',
    },
    deliveredOn: {
      type: Date, 
    },
    deliveredOn: {
      type: Date, 
    },
  }],
  deliveredOn: {
    type: Date, 
  },
  totalPrice: {
    type: Number,
    default: 0,
  },
  discount: {
    type: Number,
    default: 0,
  },
  finalAmount: {
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
    enum: ['processing','placed', 'shipped', 'delivered', 'cancelled', 'return request', 'returned' , 'return approved','return rejected'],
    lowercase: true,
  },
  createdOn: {
    type: Date,
    default: Date.now,
    required: true,
  },
  coupon: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Coupon',
  },
  cancelReason: {
    type: String,
    default: '',
  },
  returnReason: {
    type: String,
    default: '',
  },
  paymentMethod: {
    type: String,
    required: true,
    enum: ['credit_card', 'paypal', 'cash_on_delivery'],
  },
}, {
  timestamps: true  
});

module.exports = mongoose.model('Order', orderSchema);