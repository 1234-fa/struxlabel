const Brand = require("../../models/brandSchema");
const Product = require("../../models/productSchema");

const getBrandPage = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 4;
    const skip = (page - 1) * limit;

    const brandData = await Brand.find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalBrands = await Brand.countDocuments();
    const totalPages = Math.ceil(totalBrands / limit);
    const reverseBrand = brandData.reverse();

    // Get error/success messages from URL parameters
    const errorMessage = req.query.error || null;
    const successMessage = req.query.success || null;

    res.render("brands", {
      data: reverseBrand,
      currentPage: page,
      totalPages: totalPages,
      totalBrands: totalBrands,
      errorMessage: errorMessage,
      successMessage: successMessage,
    });
  } catch (error) {
    console.error("Error loading brands page:", error);
    res.redirect("/pageerror");
  }
};

const addBrand = async (req, res) => {
  try {
    const brandName = req.body.name;

    // Validate input
    if (!brandName) {
      console.log("Brand validation error: Brand name is required");
      return res.redirect("/admin/brands?error=Brand name is required");
    }

    // Trim and validate brand name
    const trimmedBrandName = brandName.trim();
    if (trimmedBrandName.length === 0) {
      console.log("Brand validation error: Brand name cannot be empty");
      return res.redirect("/admin/brands?error=Brand name cannot be empty or just spaces");
    }

    // Validate image upload
    if (!req.file) {
      console.log("Brand validation error: Brand image is required");
      return res.redirect("/admin/brands?error=Brand image is required");
    }

    // Check for existing brand (case-insensitive)
    const existingBrand = await Brand.findOne({
      brandName: { $regex: new RegExp(`^${trimmedBrandName}$`, 'i') }
    });

    if (existingBrand) {
      console.log("Brand validation error: Brand already exists -", trimmedBrandName);
      return res.redirect("/admin/brands?error=Brand with this name already exists");
    }

    // Create new brand
    const image = req.file.filename;
    const newBrand = new Brand({
      brandName: trimmedBrandName,
      brandImage: image,
    });

    await newBrand.save();
    console.log("Brand added successfully:", trimmedBrandName);
    res.redirect("/admin/brands?success=Brand added successfully");

  } catch (error) {
    console.error("Error while adding brand:", error);

    // Handle MongoDB duplicate key error
    if (error.code === 11000) {
      console.log("MongoDB duplicate key error for brand:", brandName);
      return res.redirect("/admin/brands?error=Brand with this name already exists");
    }

    console.log("General error adding brand:", error.message);
    res.redirect("/admin/brands?error=Error adding brand. Please try again.");
  }
};

const blockBrand = async (req, res) => {
  try {
    const brandId = req.query.id;

    if (!brandId) {
      return res.redirect("/pageerror"); // Validation for missing ID
    }

    await Brand.updateOne({ _id: brandId }, { $set: { isBlocked: true } });
    res.redirect("/admin/brands");
  } catch (error) {
    console.error("Error blocking brand:", error);
    res.redirect("/pageerror");
  }
};

const unBlockBrand = async (req, res) => {
  try {
    const brandId = req.query.id;

    if (!brandId) {
      return res.redirect("/pageerror"); // Validation for missing ID
    }

    await Brand.updateOne({ _id: brandId }, { $set: { isBlocked: false } });
    res.redirect("/admin/brands");
  } catch (error) {
    console.error("Error unblocking brand:", error);
    res.redirect("/pageerror");
  }
};

const deleteBrand = async (req, res) => {
  try {
    const { id } = req.query;

    if (!id) {
      console.warn("Delete request missing brand ID");
      return res.redirect("/pageerror");
    }

    const brand = await Brand.findById(id);

    if (!brand) {
      console.warn("Brand not found");
      return res.redirect("/pageerror");
    }

    await Brand.deleteOne({ _id: id });
    res.redirect("/admin/brands");
  } catch (error) {
    console.error("Error deleting brand:", error);
    res.redirect("/pageerror");
  }
};
module.exports = {
  getBrandPage,
  addBrand,
  blockBrand,
  unBlockBrand,
  deleteBrand,
};
