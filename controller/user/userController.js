const User = require("../../models/userSchema");
const Banner= require("../../models/bannerSchema");
const Category = require('../../models/categorySchema');
const Brand = require('../../models/brandSchema')
const Product = require('../../models/productSchema')
const Wallet =require('../../models/walletSchema');
const {StatusCode} = require('../../config/statuscode');
const env = require('dotenv').config();
const nodemailer = require('nodemailer');
const bcrypt = require("bcrypt");
const { request } = require("../../app");
const { v4: uuidv4 } = require('uuid');

const referrelcodeGenerate = ()=>{
  let chars ='ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'
  let refcode ='';
  for(let i=0;i<10;i++){
    refcode += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return refcode;
}

const loadHomepage = async (req, res) => {
    try {
        const today = new Date().toISOString();
        const findBanner = await Banner.find({});

        const user = req.session.user;
        const categories = await Category.find({ isListed: true });

        // Get all valid products
        let allProducts = await Product.find({
            isBlocked: false,
            category: { $in: categories.map(category => category._id) }
        }).populate('category');

        // Sort and get the latest 4 for New Arrivals
        const newArrivals = [...allProducts]
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, 4);

        // Filter out those 4 from allProducts and pick random ones for Men section
        const newArrivalIds = newArrivals.map(p => p._id.toString());

        const menProducts = [...allProducts]
            .filter(p => !newArrivalIds.includes(p._id.toString()))
            .sort(() => 0.5 - Math.random()) // shuffle
            .slice(0, 4); // limit to 4 random items

        const userData = user ? await User.findById(user._id) : null;
        // console.log('banners:',findBanner);

        return res.render('home', {
            user: userData,
            newArrivals,
            menProducts,
            banner: findBanner || []
        });

    } catch (error) {
        console.log("Error in loading homepage:", error);
        res.status(StatusCode.INTERNAL_SERVER_ERROR).send("Server error");
    }
};

const loadlogin = async (req, res) => {
    try {
        if(!req.session.user){
            res.render('login')
        }else{
            res.redirect('/')
        }
    } catch (error) {
        res.redirect('/pageNotFound')
    }
};

const loadsignup = async (req, res) => {
    try {
        return res.render("signup");
    } catch (error) {
        console.log("Signup page not loading", error);
        res.status(StatusCode.INTERNAL_SERVER_ERROR).send("Server error");
    }
};

function generateotp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendVerificationEmail(email, otp) {
    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            port: 587,
            secure: false,
            requireTLS: true,
            auth: {
                user: process.env.NODEMAILER_EMAIL,
                pass: process.env.NODEMAILER_PASSWORD
            }
        });

        const info = await transporter.sendMail({
            from: process.env.NODEMAILER_EMAIL,
            to: email,
            subject: "Verify your account",
            text: `Your OTP is ${otp}`,
            html: `<b>Your OTP: ${otp}</b>`
        });

        return info.accepted.length > 0;
    } catch (error) {
        console.log("Error sending email", error);
        return false;
    }
}

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const findUser = await User.findOne({ isAdmin: 0, email: email });

        if (!findUser) {
            return res.render("login", { message: "User Not found" });
        }
        if (findUser.isBlocked) {
            return res.render("login", { message: "User is blocked by admin" });
        }

        const passwordMatch = await bcrypt.compare(password, findUser.password);
        if (!passwordMatch) {
            return res.render("login", { message: "Wrong password" });
        }

        req.session.user = findUser;  // Store the full user object in session
        res.redirect('/');  // Redirect to homepage after login
    } catch (error) {
        console.error("login error", error);
        res.render('login', { message: "Login failed, Please try again later" });
    }
};

const logout=async (req,res)=>{
    try {
        req.session.destroy((error)=>{
            if(error){
                console.log("session destruction error:",error.message)
                return res.redirect('/pageNotFound')
            }
            return res.redirect('/login')
        })
    } catch (error) {
        console.log("logout error",error);
        return res.redirect('/pageNotFound')
    }
}

const signup = async (req, res) => {
    try {
        const { name, phone, email, password ,referralCode} = req.body;

        const findUser = await User.findOne({ email });
        if (findUser) {
            return res.render('signup', { message: 'User already exists' });
        }

        const otp = generateotp();
        const emailSent = await sendVerificationEmail(email, otp);
        
        if (!emailSent) {
            return res.json({ success: false, message: "Error sending email" });
        }

        req.session.userOtp = otp;
        req.session.userData = { name, phone, email, password ,referralCode};

        res.render('verify-otp');
        console.log("OTP sent:", otp);
    } catch (error) {
        console.log("Signup error:", error);
        res.redirect("/pageNotFound");
    }
};

const securePassword = async (password) => {
    try {
        return await bcrypt.hash(password, 10);
    } catch (error) {
        console.error("Error hashing password:", error);
        return null;
    }
};

const verifyOtp = async (req, res) => {
    try {
        const { otp } = req.body;

        if (!req.session.userOtp || !req.session.userData) {
            return res.status(StatusCode.BAD_REQUEST).json({ success: false, message: "Session expired, please sign up again" });
        }

        if (otp === req.session.userOtp) {
            const user = req.session.userData;
            const passwordHash = await securePassword(user.password);

            if (!passwordHash) {
                return res.status(StatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: "Error processing password" });
            } 

            // **Check if the user already exists before saving**
            const existingUser = await User.findOne({ email: user.email });
            if (existingUser) {
                return res.status(StatusCode.BAD_REQUEST).json({ success: false, message: "User already exists. Please log in." });
            }
            let codeUser;
            if (user.referralCode) {
                codeUser = await User.findOne({ referralCode: user.referralCode });
            
                if (codeUser) {
                    const walletEntry = new Wallet({
                        userId: codeUser._id,  
                        transactionId: uuidv4(),
                        amount: 100,
                        payment_type: 'referral',
                        status: 'success',
                        entryType: 'CREDIT',
                        type: 'referral',  
                    });
            
                    await walletEntry.save();
                } else {
                    console.log("Referral code does not belong to any user.");
                }
            }

            const newUser = new User({
                name: user.name,
                email: user.email,
                phone: user.phone,
                password: passwordHash,
                referralCode: referrelcodeGenerate(),
            });

            await newUser.save();
            req.session.user = newUser._id;

            return res.json({ success: true, redirectUrl: "/login" });
        }

        res.status(StatusCode.BAD_REQUEST).json({ success: false, message: "Invalid OTP, please try again" });
    } catch (error) {
        console.error("Error verifying OTP:", error);

        // Handle MongoDB duplicate key error
        if (error.code === 11000) {
            return res.status(StatusCode.BAD_REQUEST).json({ success: false, message: "User already exists. Please log in." });
        }

        res.status(StatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: "An error occurred" });
    }
};

const resendOtp = async (req, res) => {
    try {
        const { email } = req.session.userData;

        if (!email) {
            return res.status(StatusCode.BAD_REQUEST).json({ success: false, message: "Email not found in the session" });
        }

        const otp = generateotp();  // Corrected the variable name
        req.session.userOtp = otp;  // Store new OTP in session

        const emailSent = await sendVerificationEmail(email, otp);

        if (emailSent) {
            console.log("Resent OTP:", otp);
            res.status(StatusCode.OK).json({ success: true, message: "OTP sent successfully" });
        } else {
            res.status(StatusCode.BAD_REQUEST).json({ success: false, message: "Failed to resend OTP, please try again" });
        }
    } catch (error) {
        console.error("Error resending OTP", error);
        res.status(StatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: "Internal server error, please try again later" });
    }
};

const pageNotFound = async (req, res) => {
    try {
        return res.render('errorpage');
    } catch (error) {
        console.error(error);
        res.status(StatusCode.INTERNAL_SERVER_ERROR).send("Something went wrong");
    }
};

const searchProducts = async (req, res) => {
    try {
      const user = req.session.user;
      const userData = await User.findOne({ _id: user });
      let search = req.body.query;
  
      const brands = await Brand.find({}).lean();
      const categories = await Category.find({ isListed: true }).lean();
      const categoryIds = categories.map(category => category._id.toString());
  
      let searchResult = [];
  
      if (req.session.filteredProducts && req.session.filteredProducts.length > 0) {
        searchResult = req.session.filteredProducts.filter(product =>
          product.productName.toLowerCase().includes(search.toLowerCase())
        );
      } else {
        searchResult = await Product.find({
          productName: { $regex: ".*" + search + ".*", $options: "i" },
          isBlocked: false,
          quantity: { $gt: 0 },
          category: { $in: categoryIds }
        });
      }
      searchResult.sort((a, b) => new Date(b.createdOn) - new Date(a.createdOn));
      let itemsPerPage = 6;
      let currentPage = parseInt(req.query.page) || 1;
      let startIndex = (currentPage - 1) * itemsPerPage;
      let endIndex = startIndex + itemsPerPage;
      let totalPages = Math.ceil(searchResult.length / itemsPerPage);
      const currentProduct = searchResult.slice(startIndex, endIndex);

      console.log("searched products are ",currentProduct)
      
      res.render("shop", {
        user: userData,
        products: currentProduct,
        category: categories,
        brand: brands,
        totalPages,
        currentPage,
        count: searchResult.length,
      });
    } catch (error) {
        res.redirect('/pageNotFound')
    }
  };


module.exports = { loadHomepage,
     pageNotFound,
      loadlogin, 
      loadsignup,
       signup, 
       verifyOtp ,
       resendOtp ,
       login ,
       logout ,    
       searchProducts,

};