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
  longDescription: {
    type: String,
    required: true,
},
specifications: {
    type: String,
    required: true,
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
  variants: {
  type: Map,
  of: Number,
  default: {
    XS: 0,
    S: 0,
    M: 0,
    L: 0,
    XL: 0,
    XXL: 0
  }
},
  size: {
    type: [String],
    default: []
  },
  color: {
    type: String,
    required: true
  },
  material: {
    type: String,
    required: true
  },
  design: {
    type: String,
    required: true
  },
  occasion: {
    type: String,
    required: true
  },
  productImages: {
    type: [String],
    default:[],
    required: true
  },
  isBlocked: { 
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['Available', 'Out of Stock', 'Discount'], 
    required: true,
    default: 'Available'
  }
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);