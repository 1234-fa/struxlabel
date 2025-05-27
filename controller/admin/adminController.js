const User = require("../../models/userSchema");
const {StatusCode} = require('../../config/statuscode');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

// Load login page
const loadlogin = async (req, res) => {
  if (req.session.admin) {
    return res.redirect('/admin');
  }
  res.render('admin-login', { message: null });
};

const login = async (req, res) => {
    try {
      const { email, password } = req.body;
      const admin = await User.findOne({ email, isAdmin: true });
  
      if (admin) {
        const passwordMatch = await bcrypt.compare(password, admin.password); 
        if (passwordMatch) {
          req.session.admin = admin._id;  
        //   console.log("Login successful, Admin ID stored in session:", req.session.admin);
          return res.redirect('/admin');  
        } else {
          console.log("Password mismatch");
          return res.render('admin-login',{message:"invalid credentials"});  
        }
      } else {
        console.log("Admin not found");
        return res.render('admin-login',{message:"invalid credentials"});    
      }
    } catch (error) {
      console.log("Admin login error:", error);
      return res.redirect('/admin/pageerror');
    }
  }



// Logout admin
const logout = async (req, res) => {
  try {
    req.session.destroy(err => {
      if (err) {
        console.log("Error destroying session:", err);
        return res.redirect('/admin/pageerror');
      }
      res.redirect('/admin/login');
    });
  } catch (error) {
    console.log("Unexpected error during logout:", error);
    res.redirect('/admin/pageerror');
  }
};

// Load error page
const pageerror = async (req, res) => {
  res.render('page-error');
};

module.exports = { loadlogin, login, pageerror, logout };