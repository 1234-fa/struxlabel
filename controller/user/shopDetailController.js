const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const {StatusCode} = require('../../config/statuscode');

const getPrivacyPolicy = async (req,res)=>{
    try {
        res.render('privacy-policy');
    } catch (error) {
        res.redirect('/pageNotFound');
    }
}

const getAboutPage = async (req,res)=>{
    try {
        res.render('aboutUs');
    } catch (error) {
        res.redirect('/pageNotFound');
    }
}

const getShippingDetails = async (req,res)=>{
    try {
        res.render('shippingPolicy');
    } catch (error) {
       res.redirect('/pageNotFound'); 
    }
}

const getTermsAndConditions = async (req,res)=>{
    try {
        res.render('termsAndConditions');
    } catch (error) {
        res.redirect('/pageNotFound'); 
    }
}

const getContactPage = async (req,res)=>{
    try {
        res.render('contact');
    } catch (error) {
        res.redirect('/pagenotfound');
    }
}

const searchfromhome = async (req, res) => {
  try {
    const query = req.query.q || '';
    const page = parseInt(req.query.page) || 1;
    const limit = 8; 
    const skip = (page - 1) * limit;

    const filter = {
      productName: { $regex: query, $options: 'i' },
      isBlocked: false
    };

    const totalProducts = await Product.countDocuments(filter);
    const products = await Product.find(filter).skip(skip).limit(limit);

    const totalPages = Math.ceil(totalProducts / limit);

    res.render('searchProductsInHome', {
      query,
      products,
      currentPage: page,
      totalPages
    });
  } catch (err) {
    console.error('Search error:', err);
    res.redirect('/');
  }
};

module.exports={getPrivacyPolicy,getAboutPage,getShippingDetails,getTermsAndConditions,getContactPage,searchfromhome}