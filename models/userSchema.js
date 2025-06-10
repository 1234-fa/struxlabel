const mongoose = require("mongoose");
const { Schema } = mongoose;

const userSchema = new Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    // unique: true,
  },
  phone: {
  type: String,
  required: false,
  // unique: true,
  // sparse: true,
  // default: null,
},
  profileImage: {
    type: String,
    default: "img/profile_Picture.png",
  },
  googleId: {
    type: String,
    // unique: true,
    sparse: true,
  },
  password: {
    type: String,
    required: false,
  },
  isBlocked: {
    type: Boolean,
    default: false,
  },
  isAdmin: {
    type: Boolean,
    default: false,
  },
  cart: {
    type: Schema.Types.ObjectId,
    ref: "Cart",
  },
  wishlist: {
    type: Schema.Types.ObjectId,
    ref: "Wishlist",
  },
  orderHistory: {
    type: Schema.Types.ObjectId,
    ref: "Order",
  },
  createdOn: {
    type: Date,
    default: Date.now,
  },
  referralCode: {
    type: String,
  },
  redeemed: {
    type: Boolean,
  },
  redeemedUsers: [
    {
      type: Schema.Types.ObjectId,
    },
  ],
  searchHistory: [
    {
      category: {
        type: Schema.Types.ObjectId,
        ref: "Category",
      },
      brand: {
        type: String,
      },
      searchOn: {
        type: Date,
        default: Date.now,
      },
    },
  ],
});

module.exports = mongoose.model("User", userSchema);
