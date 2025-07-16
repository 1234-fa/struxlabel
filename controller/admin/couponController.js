const Coupon = require("../../models/coupenSchema");
const User = require("../../models/userSchema");
const Order = require("../../models/orderSchema");

const generateCouponCode = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let orderId = "";
  for (let i = 0; i < 6; i++) {
    orderId += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return orderId;
};

const getCoupons = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;

    const [coupons, totalCoupons] = await Promise.all([
      Coupon.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
      Coupon.countDocuments(),
    ]);

    const totalPages = Math.ceil(totalCoupons / limit);

    res.render("coupon", {
      coupons,
      currentPage: page,
      totalPages,
    });
  } catch (error) {
    console.error(error);
    res.redirect("/pageerror");
  }
};

const addCoupons = async (req, res) => {
  try {
    const { name, discount, price, activeFrom, validDays, userLimit } =
      req.body;

    const existingCoupon = await Coupon.findOne({ name });
    if (existingCoupon) {
      if (req.xhr || req.headers.accept?.includes('json')) {
        return res.status(409).json({ success: false, message: 'Coupon already exists' });
      }
      const coupons = await Coupon.find();
      return res.render("coupon", {
        coupons,
        message: "Coupon already exists",
      });
    }

    const code = generateCouponCode();

    const newCoupon = new Coupon({
      name,
      code,
      discount,
      price,
      activeFrom,
      validDays,
      userLimit,
    });

    await newCoupon.save();

    res.redirect("/admin/coupon");
  } catch (error) {
    console.error("Error adding coupon:", error);
    if (req.xhr || req.headers.accept?.includes('json')) {
      return res.status(StatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Server error' });
    }
    res.redirect("/pageerror");
  }
};

const editCoupon = async (req, res) => {
  try {
    const couponId = req.params.id;
    const { name, discount, price, activeFrom, validDays, userLimit } =
      req.body;

    const updated = await Coupon.findByIdAndUpdate(
      couponId,
      {
        name,
        discount,
        price,
        activeFrom,
        validDays,
        userLimit,
      },
      { new: true }
    );

    if (!updated) {
      return res.redirect("/pageerror");
    }

    res.redirect("/admin/coupon");
  } catch (error) {
    console.error("Error editing coupon:", error);
    res.redirect("/pageerror");
  }
};

const deteleCoupon = async (req, res) => {
  try {
    const id = req.params.id;
    await Coupon.deleteOne({ _id: id });
    res.redirect("/admin/coupon");
  } catch (error) {
    console.log("error:", error);
    res.redirect("/pageerror");
  }
};

module.exports = { getCoupons, addCoupons, editCoupon, deteleCoupon };
