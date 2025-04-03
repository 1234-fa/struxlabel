const express=require('express');
const router=express.Router();
const adminController = require('../controller/adminController');
const customerController=require('../controller/customerController')
const {userAuth,adminAuth}=require('../middlewares/auth');



router.get('/pageerror',adminController.pageerror)
router.get('/login',adminController.loadlogin);
router.post('/login',adminController.login);
router.get('/',adminAuth,adminController.loaddashboard);
router.get('/logout',adminController.logout);


router.get('/users', adminAuth, customerController.customerInfo);
router.get('/blockCustomer',adminAuth, customerController.customerBlocked);
router.get('/unblockCustomer',adminAuth,customerController.cutomerunBlocked);

module.exports=router;