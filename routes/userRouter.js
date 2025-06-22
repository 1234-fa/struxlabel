const express = require('express');
const router = express.Router();
const userController = require('../controller/user/userController');
const profileController = require('../controller/user/profileController');
const productController = require('../controller/user/productController');
const orderController = require('../controller/user/orderController');
const cartController =  require('../controller/user/cartController');
const wishlistController = require('../controller/user/wishlistController')
const invoiceController = require('../controller/user/invoiceController')
const walletController = require('../controller/user/walletController');
const couponController = require('../controller/user/couponController');
const checkoutController = require('../controller/user/checkoutController');
const shopController = require('../controller/user/shopController');
const shopDetailController = require('../controller/user/shopDetailController');
const passport = require('passport');
const multer=require('multer');
const profileUpload = require('../helpers/profileUpload');
const { userAuth, adminAuth } = require('../middlewares/auth');



router.get('/pagenotfound', userController.pageNotFound);
router.get('/login',userController.loadlogin);
router.post('/login',userController.login);
router.get('/logout',userAuth,userController.logout);
router.get('/signup',userController.loadsignup);
router.post('/signup',userController.signup);
router.post('/verify-otp',userController.verifyOtp);
router.post('/resend-otp',userController.resendOtp);


router.get('/', userController.loadHomepage);

// Debug route to test cart/wishlist counts
router.get('/debug-counts', userAuth, (req, res) => {
    res.json({
        cartCount: res.locals.cartCount,
        wishlistCount: res.locals.wishlistCount,
        user: req.session.user ? 'logged in' : 'not logged in'
    });
});

router.post('/search',userAuth,userController.searchProducts);


router.get('/auth/google',passport.authenticate('google',{scope:['profile','email'],prompt: 'select_account'}));
router.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/signup' }),
  (req, res) => {
    
    if (req.user && req.isAuthenticated()) {
        req.session.user = req.user;
      console.log('✅ User authenticated, redirecting to home');
      res.redirect('/');
    } else {
      console.log('❌ Authentication failed - no user in session');
      res.redirect('/signup');
    }
  }
);


router.get('/forgot-password',profileController.getForgotPassPage)
router.post('/forgot-email-valid',profileController.forgotEmailValid)
router.post('/verify-passForgot-otp',profileController.verifyForgotpassOtp);
router.get('/reset-password-forgot',profileController.getResetPassforgot)
router.post('/reset-password-forgot',profileController.resetPasswordforgot)
router.get('/reset-password',userAuth,profileController.getResetPassPage)
router.post('/reset-password',userAuth,profileController.resetPassword)
router.get('/userProfile',userAuth,profileController.userProfile);
router.get('/change-email',userAuth,profileController.changeEmail)
router.post('/change-email', userAuth, profileController.changeEmailvalid);
router.post('/verify-email-otp',userAuth, profileController.verifyEmailOtp);
router.post('/verify-new-email-otp',userAuth ,profileController.verifyNewEmailOtp)
router.post('/update-email',userAuth, profileController.updateEmail);
router.get('/change-password',userAuth , profileController.changePassword);
router.post('/change-password',userAuth , profileController.changePasswordvalid);
router.post('/verify-changepassword-otp',userAuth,profileController.verifychangepassOtp)
router.post('/upload-profile-image', userAuth,profileUpload.single('profileImage'), profileController .uploadProfileImage);
router.post('/update-profile',userAuth, profileController.updateProfile);


router.get('/address',userAuth,profileController.getAddress);
router.get('/addAddress',userAuth,profileController.addAddress);
router.post('/addAddressinorder',userAuth,profileController.addAddressOrder);
router.post('/addAddress',userAuth,profileController.postAddAddress);
router.get('/editAddress/:id', userAuth, profileController.getEditAddress);
router.post('/editAddress/:id', userAuth,profileController.postEditAddress);
router.get('/deleteAddress/:id', userAuth, profileController.deleteAddress);


router.get('/productDetails',userAuth,productController.productDetails)


router.get('/cart', userAuth, cartController.getCartPage);
router.post('/add-to-cart', userAuth, cartController.addToCart);
router.post('/remove-from-cart/:id',userAuth,cartController.removeCartItem);
router.post('/update-cart/:id',userAuth,cartController.updateCartQty);
router.post('/update-variant/:id',userAuth,cartController.updateVariant);



router.get('/orderOfCart',userAuth,orderController.getOrderPage);
router.post('/order', userAuth,orderController.getSingleOrderPage);
router.post('/place-order',userAuth,orderController.postPlaceOrder);
router.post('/payment', userAuth,orderController.getPaymentPage);
router.get('/order-success',userAuth,orderController.orderSuccess);
router.get('/order-success-cart',userAuth, orderController.orderSuccessCart)
router.get('/view-orders', userAuth, orderController.viewOrders);
router.post('/payment-cart',userAuth ,orderController.loadPaymentPagecart)
router.post("/place-order-cart", userAuth ,orderController.placeOrderFromCart);
router.post('/cancel-order/:orderId', userAuth, orderController.cancelOrder);
router.post('/cancel-product/:orderId/:productId', userAuth,orderController.cancelProduct);
router.post('/return-order/:orderId', userAuth,orderController.returnOrder);
router.post('/return-product/:itemId', userAuth,orderController.returnProduct);
router.get('/viewOrderDetails/:orderId',userAuth,orderController.viewOrderDetails);


router.get('/download-invoice/:orderId', userAuth,invoiceController.downloadInvoice)


router.get('/wishlist', userAuth , wishlistController.getWishlist);
router.get('/addToWishlist', userAuth , wishlistController.addToWishlist);
router.get('/removeFromWishlist', userAuth, wishlistController.removeFromWishlist);

router.get('/wallet', userAuth,walletController.getMyWallet)


router.get('/myCoupens',userAuth,couponController.showUserCoupon);
router.post('/apply-coupon', userAuth, couponController.applyCoupon);


router.post('/create-razorpay-order', userAuth, checkoutController.createRazorpayOrder);
router.post('/verify-razorpay-payment', userAuth, checkoutController.verifyRazorpayPayment);
router.post('/create-razorpay-order-cart', userAuth, checkoutController.createRazorpayOrderCart);
router.post('/verify-razorpay-payment-cart', userAuth, checkoutController.verifyRazorpayPaymentCart);
router.get('/order-failure',userAuth,checkoutController.getorderFailurePage);
router.post('/handle-payment-failure', userAuth, checkoutController.handlePaymentFailure);
router.get('/retry-payment/:orderId', userAuth, checkoutController.retryPayment);
router.post('/verify-retry-payment', userAuth, checkoutController.verifyRetryPayment);

// // Debug route to check failed orders
// router.get('/debug-orders', userAuth, async (req, res) => {
//   try {
//     const userId = req.session.user?._id;
//     const Order = require('../models/orderSchema');

//     const allOrders = await Order.find({ user: userId }).select('orderId status paymentStatus');
//     const failedOrders = await Order.find({ user: userId, status: 'payment_failed' }).select('orderId status paymentStatus');

//     res.json({
//       userId,
//       totalOrders: allOrders.length,
//       allOrders,
//       failedOrders: failedOrders.length,
//       failedOrdersList: failedOrders
//     });
//   } catch (error) {
//     res.json({ error: error.message });
//   }
// });

// // Test route for retry payment
// router.get('/test-retry/:orderId', userAuth, (req, res) => {
//   const { orderId } = req.params;
//   const userId = req.session.user?._id;

//   res.json({
//     message: 'Test retry route working',
//     orderId,
//     userId,
//     fullUrl: req.originalUrl,
//     params: req.params
//   });
// });

router.post('/filterSearchSort',userAuth,shopController.getfilter);
router.get('/shop',userAuth,shopController.loadShoppingPage)
router.get('/newArrivals',userAuth,shopController.loadNewArrivalPage);

router.get('/privacyPolicy',userAuth,shopDetailController.getPrivacyPolicy)
router.get('/aboutUs',userAuth,shopDetailController.getAboutPage);
router.get('/shippingPolicy',userAuth,shopDetailController.getShippingDetails);
router.get('/termsAndConditions',userAuth,shopDetailController.getTermsAndConditions);
router.get('/contact',userAuth,shopDetailController.getContactPage);
router.get('/searchFromHome',userAuth,shopDetailController.searchfromhome);


module.exports = router;