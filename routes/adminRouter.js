const express=require('express');
const router=express.Router();
const adminController = require('../controller/adminController');
const customerController=require('../controller/customerController')
const categoryController=require('../controller/categoryController');
const brandController=require('../controller/brandController');
const {userAuth,adminAuth}=require('../middlewares/auth');
const multer=require('multer');
const storage=require('../helpers/multer');
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

module.exports=router;