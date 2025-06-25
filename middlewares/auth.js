const User = require("../models/userSchema");
const { StatusCode } = require("../config/statuscode");

const userAuth = (req, res, next) => {
  if (req.session.user) {
    User.findById(req.session.user._id)
      .then((user) => {
        if (user && !user.isBlocked) {
          next();
        } else {
          req.session.destroy();
          res.redirect("/login");
        }
      })
      .catch((error) => {
        console.log("Error in user auth middleware:", error);
        res.status(StatusCode.INTERNAL_SERVER_ERROR).send("Internal server error");
      });
  } else {
    res.redirect("/login");
  }
};

const adminAuth = async (req, res, next) => {
  try {
    const userId = req.session.admin;
    console.log("adminAuth checking session.admin:", req.session.admin);
    if (!userId) {
      return res.redirect("/admin/login");
    }

    const user = await User.findById(userId);

    if (user && user.isAdmin) {
      next(); 
    } else {
      res.redirect("/admin/login");
    }
  } catch (error) {
    console.log("Error in adminAuth middleware:", error);
    res.redirect("/admin/pageerror");
  }
};

module.exports = {
  userAuth,
  adminAuth,
};
