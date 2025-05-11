const mongoose = require('mongoose');

const paymentBackupSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
  },
  razorpayOrderId: {
    type: String,
    required: true,
  },
  razorpayPaymentId: {
    type: String,
    required: true,
  },
  error: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['failed', 'pending', 'manual_review'],
    default: 'failed',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  }
});

module.exports = mongoose.model('PaymentBackup', paymentBackupSchema);