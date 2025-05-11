
const Razorpay = require("razorpay");

const razorpayInstance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Verify the environment variables are set
if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  console.error("WARNING: Razorpay API keys are missing in environment variables!");
}

module.exports = razorpayInstance;