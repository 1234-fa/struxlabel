const express=require('express');
const router=express.Router();
const adminController = require('../controller/admin/adminController');
const customerController=require('../controller/admin/customerController')
const categoryController=require('../controller/admin/categoryController');
const brandController=require('../controller/admin/brandController');
const productController=require('../controller/admin/productController');
const bannerController=require('../controller/admin/bannerController');
const orderController=require('../controller/admin/orderController')
const couponController=require('../controller/admin/couponController');
const salesreportController = require('../controller/admin/salesreportController');
const {userAuth,adminAuth}=require('../middlewares/auth');
const multer=require('multer');
const uploads=require('../helpers/multer');
const productSchema = require('../models/productSchema');



router.get('/pageerror', adminController.pageerror);
router.get('/login', adminController.loadlogin);
router.post('/login', adminController.login);
router.get('/logout', adminController.logout);


router.get('/users', adminAuth, customerController.customerInfo);
// AJAX routes for user management
router.post('/blockCustomer',adminAuth, customerController.blockUserAjax);
router.post('/unblockCustomer',adminAuth,customerController.unblockUserAjax);


router.get('/category',adminAuth, categoryController.categoryInfo)
router.post('/addCategory',adminAuth,categoryController.addCategory);
router.post('/addCategoryOffer',adminAuth,categoryController.addCategoryOffer);
router.post('/removeCategoryOffer',adminAuth,categoryController.removeCategoryOffer);
router.post('/editCategory/:id',adminAuth,categoryController.editCategory);
router.post('/listCategoryAjax',adminAuth,categoryController.listCategoryAjax);
router.post('/unlistCategoryAjax',adminAuth,categoryController.unlistCategoryAjax);


router.get('/brands',adminAuth,brandController.getBrandPage);
router.post('/addBrand',adminAuth,uploads.single("image"),brandController.addBrand);
// AJAX routes for brand management
router.post('/blockBrand',adminAuth,brandController.blockBrandAjax);
router.post('/unblockBrand',adminAuth,brandController.unblockBrandAjax);
router.get('/deleteBrand',adminAuth,brandController.deleteBrand);


router.get('/products', adminAuth, productController.getProductPage);
router.get('/addProducts',adminAuth,productController.getAddProduct);
router.post('/addProducts',adminAuth,uploads.array("images",10),productController.addProducts);
router.post('/addProductOffer',adminAuth,productController.addProductOffer);
router.post('/removeProductOffer',adminAuth,productController.removeProductOffer)
// AJAX routes for product management
router.post('/blockProduct',adminAuth,productController.blockProductAjax);
router.post('/unblockProduct',adminAuth,productController.unblockProductAjax);
router.get('/editProduct',adminAuth,productController.getEditProduct);
router.post('/editProduct/:id', adminAuth, uploads.array('images', 10), productController.editProduct);


router.get('/banner',adminAuth,bannerController.getBannerPage)
router.get('/addBanner',adminAuth,bannerController.getAddBannerPage);
router.post('/addBanner',adminAuth,uploads.single("image"),bannerController.addBanner)
router.get('/deleteBanner',adminAuth,bannerController.deleteBanner);

// Debug route to test WebP support
router.get('/test-webp', adminAuth, (req, res) => {
    res.json({
        message: 'WebP support test',
        multerConfig: {
            allowedExtensions: 'jpeg|jpg|png|webp',
            allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
            maxFileSize: '5MB'
        },
        instructions: [
            '1. Try uploading a WebP image through the banner upload',
            '2. Check server console for processing logs',
            '3. Verify the saved file maintains WebP format'
        ]
    });
});



router.get('/orderList', adminAuth, orderController.getAllOrders);
router.post('/update-order-status/:orderId', adminAuth, orderController.updateOrderStatus);
router.get('/singleOrderDetails/:orderId',adminAuth,orderController.viewOrderDetails);
router.post('/update-order-item-status',adminAuth,orderController.updateOrderItemStatus);
router.get('/returnRequests', adminAuth,orderController.getAllReturnRequests);
router.post('/returnRequests/:orderId/item/:itemId/approve', adminAuth,orderController.approveReturnItem);
router.post('/returnRequests/:orderId/item/:itemId/reject', adminAuth,orderController.rejectReturnItem);


router.get('/coupon',adminAuth,couponController.getCoupons);
router.post('/add-coupon',adminAuth,couponController.addCoupons);
router.post('/edit-coupon/:id',adminAuth ,couponController.editCoupon);
router.post('/delete-coupon/:id',adminAuth,couponController.deteleCoupon);


router.get('/', adminAuth, salesreportController.loaddashboard);
router.get('/ledger',adminAuth, salesreportController.getLedger);
router.get('/salesReport',adminAuth,salesreportController.loadsalesreport)
router.post('/sales-report/download', adminAuth,salesreportController.downloadSalesReport);


module.exports=router;