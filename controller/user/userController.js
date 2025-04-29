const User = require("../../models/userSchema");
const Banner= require("../../models/bannerSchema");
const Category = require('../../models/categorySchema');
const Brand = require('../../models/brandSchema')
const Product = require('../../models/productSchema')
const env = require('dotenv').config();
const nodemailer = require('nodemailer');
const bcrypt = require("bcrypt");
const { request } = require("../../app");

// const loadHomepage = async (req, res) => {
//     try {
//         const today=new Date().toISOString();
//         const findBanner= await Banner.find({
//             startDate:{$lt:new Date(today)},
//             endDate:{$gt: new Date(today)}
//         })
//         const user=req.session.user;
//         if(user){
//             const userData = await User.findById(user._id);
//             res.render('home', { user: userData ,banner:findBanner || []});
//         }else{
//              return res.render('home',{user:null, banner:findBanner || []})
//         }
//     } catch (error) {
//         console.error(error);
//         res.status(500).send("Server error");
//     }
// };

const loadHomepage = async (req, res) => {
    try {
        const today = new Date().toISOString();
        const findBanner = await Banner.find({
            startDate: { $lt: new Date(today) },
            endDate: { $gt: new Date(today) }
        });

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

        return res.render('home', {
            user: userData,
            newArrivals,
            menProducts,
            banner: findBanner || []
        });

    } catch (error) {
        console.log("Error in loading homepage:", error);
        res.status(500).send("Server error");
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
        res.status(500).send("Server error");
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
        const { name, phone, email, password } = req.body;

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
        req.session.userData = { name, phone, email, password };

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
            return res.status(400).json({ success: false, message: "Session expired, please sign up again" });
        }

        if (otp === req.session.userOtp) {
            const user = req.session.userData;
            const passwordHash = await securePassword(user.password);

            if (!passwordHash) {
                return res.status(500).json({ success: false, message: "Error processing password" });
            }

            // **Check if the user already exists before saving**
            const existingUser = await User.findOne({ email: user.email });
            if (existingUser) {
                return res.status(400).json({ success: false, message: "User already exists. Please log in." });
            }

            const newUser = new User({
                name: user.name,
                email: user.email,
                phone: user.phone,
                password: passwordHash,
            });

            await newUser.save();
            req.session.user = newUser._id;

            return res.json({ success: true, redirectUrl: "/login" });
        }

        res.status(400).json({ success: false, message: "Invalid OTP, please try again" });
    } catch (error) {
        console.error("Error verifying OTP:", error);

        // Handle MongoDB duplicate key error
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: "User already exists. Please log in." });
        }

        res.status(500).json({ success: false, message: "An error occurred" });
    }
};

const resendOtp = async (req, res) => {
    try {
        const { email } = req.session.userData;

        if (!email) {
            return res.status(400).json({ success: false, message: "Email not found in the session" });
        }

        const otp = generateotp();  // Corrected the variable name
        req.session.userOtp = otp;  // Store new OTP in session

        const emailSent = await sendVerificationEmail(email, otp);

        if (emailSent) {
            console.log("Resent OTP:", otp);
            res.status(200).json({ success: true, message: "OTP sent successfully" });
        } else {
            res.status(400).json({ success: false, message: "Failed to resend OTP, please try again" });
        }
    } catch (error) {
        console.error("Error resending OTP", error);
        res.status(500).json({ success: false, message: "Internal server error, please try again later" });
    }
};

const pageNotFound = async (req, res) => {
    try {
        return res.render('errorpage');
    } catch (error) {
        console.error(error);
        res.status(500).send("Something went wrong");
    }
};


const loadShoppingPage = async (req,res)=>{
    try {
  
      const user = req.session.user;
      const userData = await User.findOne({_id:user});
      const categories = await Category.find({isListed:true});
      const categoryIds = categories.map((category)=>category._id.toString());
      const page = parseInt(req.query.page) || 1;
      const limit = 6;
      const skip = (page-1)*limit;
      const products = await Product.find({
        isBlocked:false,
        category:{$in:categoryIds},
        quantity:{$gt:0}
      }).sort({createdOn:-1}).skip(skip).limit(limit);
  
      const totalProducts = await Product.countDocuments({
        isBlocked:false,
        category:{$in:categoryIds},
        quantity:{$gt:0}
      });
      const totalPages = Math.ceil(totalProducts/limit);
  
      const brands = await Brand.find({isBlocked:false});
      const categoriesWithIds = categories.map(category => ({_id:category._id,name:category.name}));
  
      res.render("shop",{
        user : userData,
        products : products,
        category : categoriesWithIds,
        brand : brands,
        totalProducts : totalProducts,
        currentPage : page,
        totalPages : totalPages
      })
    } 
    catch (error) {
      res.redirect("/pageNotFound")
    }
  }

  const filterProduct = async (req, res) => {
    try {
      const user = req.session.user;
      const category = req.query.category;
      const brand = req.query.brand;
  
      const findCategory = category ? await Category.findOne({ _id: category }) : null;
      const findBrand = brand ? await Brand.findOne({ _id: brand }) : null;
  
      const brands = await Brand.find({}).lean();
  
      const query = {
        isBlocked: false,
        quantity: { $gt: 0 }
      };
  
      if (findCategory) {
        query.category = findCategory._id;
      }
      if (findBrand) {
        query.brand = findBrand.brandName;
      }
  
      let findProducts = await Product.find(query).lean();
  
      findProducts.sort((a, b) => new Date(b.createdOn) - new Date(a.createdOn));
  
      const categories = await Category.find({ isListed: true });
  
      let itemsPerPage = 6;
      let currentPage = parseInt(req.query.page) || 1;
      let startIndex = (currentPage - 1) * itemsPerPage;
      let endIndex = startIndex + itemsPerPage;
      let totalPages = Math.ceil(findProducts.length / itemsPerPage);
  
      const currentProduct = findProducts.slice(startIndex, endIndex);

      let userData = null;
    if (user) {
      userData = await User.findOne({ _id: user });
      if (userData) {
        const searchEntry = {
          category: findCategory ? findCategory._id : null,
          brand: findBrand ? findBrand.brandName : null,
          searchedOn: new Date(),
        };
        userData.searchHistory.push(searchEntry);
        await userData.save();
      }
    }

    req.session.filteredProducts = currentProduct;

    res.render("shop", {
      user: userData,
      products: currentProduct,
      category: categories,
      brand: brands,
      totalPages,
      currentPage,
      selectedCategory: category || null,
      selectedBrand: brand || null,
    });
     
  
    } catch (error) {
      res.redirect('/pageNotFound');
    }
  };

  const filterByPrice = async (req, res) => {
    try {
      const user = req.session.user;
      const userData = await User.findOne({ _id: user }).lean();
      const brands = await Brand.find({}).lean();
      const categories = await Category.find({ isListed: true }).lean();
  
      let findProducts = await Product.find({
        salePrice: { $gt: req.query.gt, $lt: req.query.lt },
        isBlocked: false,
        quantity: { $gt: 0 }
      }).lean();
  
      findProducts.sort((a, b) => new Date(b.createdOn) - new Date(a.createdOn));
  
      let itemsPerPage = 6;
      let currentPage = parseInt(req.query.page) || 1;
      let startIndex = (currentPage - 1) * itemsPerPage;
      let endIndex = startIndex + itemsPerPage;
      let totalPages = Math.ceil(findProducts.length / itemsPerPage);
      const currentProduct = findProducts.slice(startIndex, endIndex);
  
      req.session.filteredProducts = findProducts;

      res.render('shop',{
        user :userData,
        products:currentProduct,
        category:categories,
        brand:brands,
        totalPages,
        currentPage
      })
    } catch (error) {
        res.redirect('/pageNotFound');
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

  const loadMoreProducts = async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = 6;
      const skip = (page - 1) * limit;
  
      const categories = await Category.find({ isListed: true });
      const categoryIds = categories.map(cat => cat._id.toString());
  
      const products = await Product.find({
        isBlocked: false,
        category: { $in: categoryIds },
        quantity: { $gt: 0 }
      }).sort({ createdOn: -1 }).skip(skip).limit(limit);
  
      res.render('partials/product-cards', { products }, (err, html) => {
        if (err) return res.status(500).send('Error loading more products');
        res.send(html);
      });
    } catch (error) {
      res.status(500).send('Something went wrong');
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
       loadShoppingPage ,
       filterProduct,
       filterByPrice,
       searchProducts,
       loadMoreProducts,

};