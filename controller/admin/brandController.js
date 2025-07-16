const Brand = require("../../models/brandSchema");
const Product = require("../../models/productSchema");
const { StatusCode } = require("../../config/statuscode");

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
    const { name } = req.body;
    const image = req.file;

    if (!name || !image) {
      return res.status(StatusCode.BAD_REQUEST).json({
        success: false,
        message: "Brand name and image are required"
      });
    }

    // Check if brand already exists
    const existingBrand = await Brand.findOne({ brandName: name });
    if (existingBrand) {
      return res.status(StatusCode.BAD_REQUEST).json({
        success: false,
        message: "Brand with this name already exists"
      });
    }

    const brand = new Brand({
      brandName: name,
      brandImage: [image.filename]
    });

    await brand.save();

    res.json({
      success: true,
      message: "Brand added successfully"
    });
  } catch (error) {
    console.error("Error adding brand:", error);
    res.status(StatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Error adding brand. Please try again."
    });
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

// AJAX-based block brand function
const blockBrandAjax = async (req, res) => {
  try {
    const brandId = req.body.brandId || req.query.id;

    // Validate brand ID
    if (!brandId) {
      console.error("Block brand error: Brand ID is required");
      return res.status(StatusCode.BAD_REQUEST).json({
        success: false,
        message: "Brand ID is required"
      });
    }

    // Find brand first to get details for logging
    const brand = await Brand.findById(brandId);
    if (!brand) {
      console.error("Block brand error: Brand not found with ID:", brandId);
      return res.status(StatusCode.NOT_FOUND).json({
        success: false,
        message: "Brand not found"
      });
    }

    // Check if brand is already blocked
    if (brand.isBlocked) {
      console.log("Block brand warning: Brand already blocked -", brand.brandName);
      return res.status(StatusCode.BAD_REQUEST).json({
        success: false,
        message: "Brand is already blocked"
      });
    }

    // Block the brand
    await Brand.updateOne({ _id: brandId }, { $set: { isBlocked: true } });

    console.log(`Brand blocked successfully: ${brand.brandName} - ID: ${brandId}`);
    res.json({
      success: true,
      message: "Brand blocked successfully",
      brand: {
        id: brand._id,
        name: brand.brandName,
        isBlocked: true
      }
    });

  } catch (error) {
    console.error("Error blocking brand:", error);
    res.status(StatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Error blocking brand. Please try again."
    });
  }
};

// AJAX-based unblock brand function
const unblockBrandAjax = async (req, res) => {
  try {
    const brandId = req.body.brandId || req.query.id;

    // Validate brand ID
    if (!brandId) {
      console.error("Unblock brand error: Brand ID is required");
      return res.status(StatusCode.BAD_REQUEST).json({
        success: false,
        message: "Brand ID is required"
      });
    }

    // Find brand first to get details for logging
    const brand = await Brand.findById(brandId);
    if (!brand) {
      console.error("Unblock brand error: Brand not found with ID:", brandId);
      return res.status(StatusCode.NOT_FOUND).json({
        success: false,
        message: "Brand not found"
      });
    }

    // Check if brand is already unblocked
    if (!brand.isBlocked) {
      console.log("Unblock brand warning: Brand already active -", brand.brandName);
      return res.status(StatusCode.BAD_REQUEST).json({
        success: false,
        message: "Brand is already active"
      });
    }

    // Unblock the brand
    await Brand.updateOne({ _id: brandId }, { $set: { isBlocked: false } });

    console.log(`Brand unblocked successfully: ${brand.brandName} - ID: ${brandId}`);
    res.json({
      success: true,
      message: "Brand unblocked successfully",
      brand: {
        id: brand._id,
        name: brand.brandName,
        isBlocked: false
      }
    });

  } catch (error) {
    console.error("Error unblocking brand:", error);
    res.status(StatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Error unblocking brand. Please try again."
    });
  }
};

module.exports = {
  getBrandPage,
  addBrand,
  blockBrandAjax,
  unblockBrandAjax,
  deleteBrand,
};
