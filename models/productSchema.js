const mongoose = require('mongoose');
const { Schema } = mongoose;

const productSchema = new Schema({
  productName: {
    type: String,
    required: true
  },
  description: { 
    type: String,
    required: true
  },
  brand: {
    type: String,
    required: true
  },
  category: { 
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  regularPrice: {
    type: Number,
    required: true
  },
  salePrice: {
    type: Number,
    required: true
  },
  productOffer: {
    type: Number,
    default: 0
  },
  quantity: {
    type: Number,
    required: true
  },
  size: {
    type: [String], // optional based on your use case
    default: []
  },
  color: {
    type: String,
    required: true
  },
  productImages: { // ✅ fixed typo
    type: [String],
    required: true
  },
  isBlocked: { // ✅ fixed typo
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['Available', 'Out of Stock', 'Discount'], // ✅ fixed typo in "Discound"
    required: true,
    default: 'Available'
  }
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);