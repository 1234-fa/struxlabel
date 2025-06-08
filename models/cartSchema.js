const mongoose = require("mongoose");
const { Schema } = mongoose;

const cartSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  items: [
    {
      productId: {
        type: Schema.Types.ObjectId,
        ref: "Product",
        required: true,
      },
      quantity: {
        type: Number,
        default: 1,
      },
      variant: {
        size: {
          type: String,
          default: null,
        },
      },
      totalPrice: {
        type: Number,
        default: 0,
      },
      status: {
        type: String,
        default: "placed",
      },
      cancellationReason: {
        type: String,
        default: "none",
      },
    },
  ],
});

module.exports = mongoose.model("Cart", cartSchema);
