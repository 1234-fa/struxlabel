const express = require('express');
const router = express.Router();
const userController = require('../controller/userController');
const passport = require('passport');


router.get('/', userController.loadHomepage);
router.get('/pagenotfound', userController.pageNotFound);
router.get('/login',userController.loadlogin);
router.post('/login',userController.login);
router.get('/logout',userController.logout);
router.get('/signup',userController.loadsignup);
router.post('/signup',userController.signup);
router.post('/verify-otp',userController.verifyOtp);
router.post('/resend-otp',userController.resendOtp);


router.get('/auth/google',passport.authenticate('google',{scope:['profile','email']}));
router.get('/auth/google/callback',passport.authenticate('google',{failureRedirect:'/signup'}),(req,res)=>{
    res.redirect('/')
})


module.exports = router;
