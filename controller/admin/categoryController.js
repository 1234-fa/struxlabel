const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");
const { StatusCode } = require("../../config/statuscode");

const categoryInfo = async (req, res) => {
  try {
    const page = Number.isNaN(parseInt(req.query.page))
      ? 1
      : parseInt(req.query.page);
    const limit = 6;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";

    // Filter by search if provided
    const query = search
      ? { name: { $regex: new RegExp(search, "i") } }
      : {};

    const categoryData = await Category.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalCategories = await Category.countDocuments(query);
    const totalPages = Math.max(1, Math.ceil(totalCategories / limit));

    res.render("category", {
      cat: categoryData,
      currentPage: page,
      totalPages: totalPages,
      totalCategories: totalCategories,
      search, // Pass search value to view
    });
  } catch (error) {
    console.error("Error in categoryInfo:", error);
    res.redirect("/pageerror");
  }
};

const addCategory = async (req, res) => {
  const { name, description } = req.body;

  // Validate input
  if (!name || !description) {
    return res
      .status(StatusCode.BAD_REQUEST)
      .json({ error: "Name and description are required." });
  }

  // Trim and validate name
  const trimmedName = name.trim();
  if (trimmedName.length === 0) {
    return res
      .status(StatusCode.BAD_REQUEST)
      .json({ error: "Category name cannot be empty or just spaces." });
  }

  try {
    // Check for existing category (case-insensitive)
    const existingCategory = await Category.findOne({
      name: { $regex: new RegExp(`^${trimmedName}$`, 'i') }
    });

    if (existingCategory) {
      return res
        .status(StatusCode.CONFLICT)
        .json({ error: "Category with this name already exists" });
    }

    // Create new category
    const newCategory = new Category({
      name: trimmedName,
      description: description.trim()
    });
    await newCategory.save();

    return res.json({ message: "Category added successfully" });
  } catch (error) {
    console.error("Error in addCategory:", error);

    // Handle MongoDB duplicate key error
    if (error.code === 11000) {
      return res
        .status(StatusCode.CONFLICT)
        .json({ error: "Category with this name already exists" });
    }

    return res
      .status(StatusCode.INTERNAL_SERVER_ERROR)
      .json({ error: "Internal server error", details: error.message });
  }
};

const addCategoryOffer = async (req, res) => {
  try {
    const percentage = parseInt(req.body.percentage);
    const categoryId = req.body.categoryId;
    const category = await Category.findById(categoryId);
    if (!category) {
      return res
        .status(StatusCode.INTERNAL_SERVER_ERROR)
        .json({ status: false, message: "Category not found" });
    }

    const products = await Product.find({ category: category._id });
    const hasProductOffer = products.some(
      (product) => (product.productOffer || 0) > percentage
    );

    if (hasProductOffer) {
      return res.json({
        status: false,
        message: "Products within this category already have product offers",
      });
    }

    await Category.updateOne(
      { _id: categoryId },
      { $set: { categoryOffer: percentage } }
    );

    for (const product of products) {
      product.productOffer = 0;
      product.salePrice =
        product.regularPrice -
        Math.floor(product.regularPrice * (percentage / 100));
      await product.save();
    }

    res.json({ status: true });
  } catch (error) {
    res
      .status(StatusCode.INTERNAL_SERVER_ERROR)
      .json({ status: false, message: "Internal server error" });
  }
};

const removeCategoryOffer = async (req, res) => {
  try {
    const categoryId = req.body.categoryId;
    const category = await Category.findById(categoryId);

    if (!category) {
      return res
        .status(StatusCode.NOT_FOUND)
        .json({ status: false, message: "Category not found" });
    }

    const percentage = category.categoryOffer;
    const products = await Product.find({ category: category._id });

    for (const product of products) {
      product.salePrice = product.regularPrice;
      product.productOffer = 0;
      await product.save();
    }

    category.categoryOffer = 0;
    await category.save();
    res.json({ status: true });
  } catch (error) {
    res
      .status(StatusCode.INTERNAL_SERVER_ERROR)
      .json({ status: false, message: "Internal server error" });
  }
};

const getlistCategory = async (req, res) => {
  try {
    const categoryId = req.query.id;
    await Category.updateOne(
      { _id: categoryId },
      { $set: { isListed: false } }
    );
    res.redirect("/admin/category");
  } catch (error) {
    res.redirect("/pageerror");
  }
};

const getunlistCategory = async (req, res) => {
  try {
    const categoryId = req.query.id;
    await Category.updateOne({ _id: categoryId }, { $set: { isListed: true } });
    res.redirect("/admin/category");
  } catch (error) {
    res.redirect("/pageerror");
  }
};

const editCategory = async (req, res) => {
  try {
    const id = req.params.id;
    const { name, description } = req.body;

    // Validate input
    if (!name || !description) {
      return res
        .status(StatusCode.BAD_REQUEST)
        .json({ status: false, message: "Name and description are required" });
    }

    // Trim and validate name
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      return res
        .status(StatusCode.BAD_REQUEST)
        .json({ status: false, message: "Category name cannot be empty or just spaces" });
    }

    // Check for existing category with same name (case-insensitive) but different ID
    const existingCategory = await Category.findOne({
      name: { $regex: new RegExp(`^${trimmedName}$`, 'i') },
      _id: { $ne: id }
    });

    if (existingCategory) {
      return res
        .status(StatusCode.CONFLICT)
        .json({ status: false, message: "Category name already exists" });
    }

    const updatedCategory = await Category.findByIdAndUpdate(
      id,
      { name: trimmedName, description: description.trim() },
      { new: true }
    );

    if (updatedCategory) {
      return res
        .status(StatusCode.OK)
        .json({ status: true, message: "Category updated successfully" });
    } else {
      return res
        .status(StatusCode.NOT_FOUND)
        .json({ status: false, message: "Category not found" });
    }
  } catch (error) {
    console.error("Edit Category Error:", error);

    // Handle MongoDB duplicate key error
    if (error.code === 11000) {
      return res
        .status(StatusCode.CONFLICT)
        .json({ status: false, message: "Category name already exists" });
    }

    return res
      .status(StatusCode.INTERNAL_SERVER_ERROR)
      .json({ status: false, message: "Internal server error" });
  }
};

const unlistCategoryAjax = async (req, res) => {
  try {
    const categoryId = req.body.categoryId || req.query.id;
    if (!categoryId) {
      return res.status(StatusCode.BAD_REQUEST).json({ success: false, message: "Category ID is required" });
    }
    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(StatusCode.NOT_FOUND).json({ success: false, message: "Category not found" });
    }
    if (!category.isListed) {
      return res.status(StatusCode.BAD_REQUEST).json({ success: false, message: "Category is already unlisted" });
    }
    await Category.updateOne({ _id: categoryId }, { $set: { isListed: false } });
    res.json({ success: true, message: "Category unlisted successfully", category: { id: category._id, name: category.name, isListed: false } });
  } catch (error) {
    res.status(StatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: "Error unlisting category. Please try again." });
  }
};

const listCategoryAjax = async (req, res) => {
  try {
    const categoryId = req.body.categoryId || req.query.id;
    if (!categoryId) {
      return res.status(StatusCode.BAD_REQUEST).json({ success: false, message: "Category ID is required" });
    }
    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(StatusCode.NOT_FOUND).json({ success: false, message: "Category not found" });
    }
    if (category.isListed) {
      return res.status(StatusCode.BAD_REQUEST).json({ success: false, message: "Category is already listed" });
    }
    await Category.updateOne({ _id: categoryId }, { $set: { isListed: true } });
    res.json({ success: true, message: "Category listed successfully", category: { id: category._id, name: category.name, isListed: true } });
  } catch (error) {
    res.status(StatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: "Error listing category. Please try again." });
  }
};

module.exports = {
  categoryInfo,
  addCategory,
  addCategoryOffer,
  removeCategoryOffer,
  getlistCategory,
  getunlistCategory,
  editCategory,
  listCategoryAjax,
  unlistCategoryAjax,
};
