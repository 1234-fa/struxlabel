const Category = require('../../models/categorySchema');
const Product = require('../../models/productSchema')
const StatusCode = require('../../config/statuscode');


const categoryInfo = async (req, res) => {
    try {
        const page = Number.isNaN(parseInt(req.query.page)) ? 1 : parseInt(req.query.page);
        const limit = 6;
        const skip = (page - 1) * limit;

        const categoryData = await Category.find({})
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const totalCategories = await Category.countDocuments();
        const totalPages = Math.max(1, Math.ceil(totalCategories / limit));

        res.render('category', {
            cat: categoryData,
            currentPage: page,
            totalPages: totalPages,
            totalCategories: totalCategories
        });
        
    } catch (error) {
        console.error("Error in categoryInfo:", error);
        res.redirect('/pageerror');
    }
};

const addCategory = async (req, res) => {
    const { name, description } = req.body;

    if (!name || !description) {
        return res.status(StatusCode.NOT_FOUND).json({ error: "Name and description are required." });
    }

    try {
        const existingCategory = await Category.findOne({ name });
        if (existingCategory) {
            return res.status(StatusCode.NOT_FOUND).json({ error: "Category already exists" });
        }

        const newCategory = new Category({ name, description });
        await newCategory.save();

        return res.json({ message: "Category added successfully" });

    } catch (error) {
        console.error("Error in addCategory:", error);
        return res.status(StatusCode.INTERNAL_SERVER_ERROR).json({ error: "Internal server error", details: error.message });
    }
};

const addCategoryOffer = async (req, res) => {
    try {
      const percentage = parseInt(req.body.percentage);
      const categoryId = req.body.categoryId;
      const category = await Category.findById(categoryId);
      if (!category) {
        return res.status(StatusCode.INTERNAL_SERVER_ERROR).json({ status: false, message: "Category not found" });
      }
  
      const products = await Product.find({ category: category._id });
      const hasProductOffer = products.some(product => (product.productOffer || 0) > percentage);
  
      if (hasProductOffer) {
        return res.json({ status: false, message: "Products within this category already have product offers" });
      }
  
      await Category.updateOne({ _id: categoryId }, { $set: { categoryOffer: percentage } });
  
      for (const product of products) {
        product.productOffer = 0;
        product.salePrice = product.regularPrice - Math.floor(product.regularPrice * (percentage / 100));
        await product.save();
      }
  
      res.json({ status: true });
    } catch (error) {
      res.status(500).json({ status: false, message: "Internal server error" });
    }
  };

const removeCategoryOffer = async (req, res) => {
    try {
      const categoryId = req.body.categoryId;
      const category = await Category.findById(categoryId);
  
      if (!category) {
        return res.status(404).json({ status: false, message: "Category not found" });
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
      res.status(500).json({ status: false, message: "Internal server error" });
    }
  };

const getlistCategory=async (req,res)=>{
    try {
        const categoryId=req.query.id;
        await Category.updateOne({_id:categoryId},{$set: {isListed:false}});
        res.redirect('/admin/category')
    } catch (error) {
        res.redirect('/pageerror')
    }
}


const getunlistCategory=async (req,res)=>{
    try {
        const categoryId=req.query.id;
        await Category.updateOne({_id:categoryId},{$set:{isListed:true}});
        res.redirect('/admin/category');
    } catch (error) {
        res.redirect('/pageerror');
    }
}

const editCategory = async (req, res) => {
    try {
      const id = req.params.id;
      const { name, description } = req.body;
  
      const existingCategory = await Category.findOne({ name });
  
      if (existingCategory && existingCategory._id.toString() !== id) {
        return res.status(400).json({ status: false, message: "Category name already exists" });
      }
  
      const updatedCategory = await Category.findByIdAndUpdate(
        id,
        { name, description },
        { new: true }
      );
  
      if (updatedCategory) {
        return res.status(200).json({ status: true, message: "Category updated successfully" });
      } else {
        return res.status(404).json({ status: false, message: "Category not found" });
      }
    } catch (error) {
      console.error("Edit Category Error:", error);
      return res.status(500).json({ status: false, message: "Internal server error" });
    }
  };

 

module.exports = { categoryInfo, addCategory , addCategoryOffer , removeCategoryOffer , getlistCategory , getunlistCategory , editCategory};