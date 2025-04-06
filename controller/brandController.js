const Brand = require('../models/brandSchema');
const Product = require('../models/productSchema')


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
  
      res.render("brands", {
        data: reverseBrand,
        currentPage: page,
        totalPages: totalPages,
        totalBrands: totalBrands,
      });
    } catch (error) {
      res.redirect("/pageerror");
    }
  };


  const addBrand = async (req, res) => {
    try {
      const brand = req.body.name;
      const findBrand = await Brand.findOne({ brandName: brand });
      
      if (!findBrand) {
        const image = req.file.filename;
        const newBrand = new Brand({
          brandName: brand,
          brandImage: image,
        });
  
        await newBrand.save();
      }
  
      res.redirect("/admin/brands");
    } catch (error) {
      console.error("Error while adding brand:", error);
      res.redirect("/pageerror");
    }
  };

const blockBrand = async (req, res) => {
    try {
      const id = req.query.id;
  
      if (!id) {
        return res.redirect("/pageerror"); // Validation for missing ID
      }
  
      await Brand.updateOne({ _id: id }, { $set: { isBlocked: true } });
      res.redirect("/admin/brands");
    } catch (error) {
      console.error("Error blocking brand:", error);
      res.redirect("/pageerror");
    }
  }; 

const unBlockBrand = async (req, res) => {
    try {
      const id = req.query.id;
  
      if (!id) {
        return res.redirect("/pageerror"); // Validation for missing ID
      }
  
      await Brand.updateOne({ _id: id }, { $set: { isBlocked: false } });
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
module.exports={getBrandPage , addBrand , blockBrand , unBlockBrand , deleteBrand}