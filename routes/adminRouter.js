const express=require('express');
const router=express.Router();
const adminController = require('../controller/adminController');
const customerController=require('../controller/customerController')
const categoryController=require('../controller/categoryController');
const brandController=require('../controller/brandController');
const productController=require('../controller/productController');
const {userAuth,adminAuth}=require('../middlewares/auth');
const multer=require('multer');
const storage=require('../helpers/multer');
const productSchema = require('../models/productSchema');
const uploads= multer({storage:storage});


router.get('/pageerror',adminController.pageerror)
router.get('/login',adminController.loadlogin);
router.post('/login',adminController.login);
router.get('/',adminAuth,adminController.loaddashboard);
router.get('/logout',adminController.logout);


router.get('/users', adminAuth, customerController.customerInfo);
router.get('/blockCustomer',adminAuth, customerController.customerBlocked);
router.get('/unblockCustomer',adminAuth,customerController.cutomerunBlocked);


router.get('/category',adminAuth, categoryController.categoryInfo)
router.post('/addCategory',adminAuth,categoryController.addCategory);
router.post('/addCategoryOffer',adminAuth,categoryController.addCategoryOffer);
router.post('/removeCategoryOffer',adminAuth,categoryController.removeCategoryOffer);
router.get('/listCategory',adminAuth,categoryController.getlistCategory);
router.get('/unlistCategory',adminAuth,categoryController.getunlistCategory);
router.post('/editCategory/:id',adminAuth,categoryController.editCategory);


router.get('/brands',adminAuth,brandController.getBrandPage);
router.post('/addBrand',adminAuth,uploads.single("image"),brandController.addBrand);
router.get('/blockBrand',adminAuth,brandController.blockBrand);
router.get('/unblockBrand',adminAuth,brandController.unBlockBrand);
router.get('/deleteBrand',adminAuth,brandController.deleteBrand);


router.get('/products', adminAuth, productController.getProductPage);
router.get('/addProducts',adminAuth,productController.getAddProduct);
router.post('/addProducts',adminAuth,uploads.array("images[]",4),productController.addProducts);
router.post('/addProductOffer',adminAuth,productController.addProductOffer);
router.post('/removerProductOffer',adminAuth,productController.removeProductOffer)



module.exports=router;