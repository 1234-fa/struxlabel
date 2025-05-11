const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Brand = require("../../models/brandSchema");
const User = require("../../models/userSchema");
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');
const Wallet = require('../../models/walletSchema');
const Coupon = require('../../models/coupenSchema');

// Load dashboard
const loaddashboard = async (req, res) => {
    if (req.session.admin) {
      try {
        res.render('dashboard');
      } catch (error) {
        console.log("Dashboard loading error:", error);
        res.redirect('/admin/pageerror');
      }
    } else {
      res.redirect('/admin/login');  // Added fallback
    }
  };

module.exports ={loaddashboard};