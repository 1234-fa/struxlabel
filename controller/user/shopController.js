const User = require("../../models/userSchema");
const Category = require('../../models/categorySchema');
const Brand = require('../../models/brandSchema')
const Product = require('../../models/productSchema')
const StatusCode = require('../../config/statuscode');
const mongoose = require('mongoose');

const loadShoppingPage = async (req,res)=>{
    try {
      const user = req.session.user;
      const userData = user ? await User.findById(user._id) : null;
      const categories = await Category.find({isListed:true});
      const categoryIds = categories.map((category)=>category._id.toString());
      const page = parseInt(req.query.page) || 1;
      const limit = 9;
      const skip = (page-1)*limit;
      const products = await Product.find({
        isBlocked:false,
        category:{$in:categoryIds},
        quantity:{$gt:0}
      }).sort({createdOn:1}).skip(skip).limit(limit);
  
      const totalProducts = await Product.countDocuments({
        isBlocked:false,
        category:{$in:categoryIds},
        quantity:{$gt:0}
      });
      const totalPages = Math.ceil(totalProducts/limit);
  
      const brands = await Brand.find({isBlocked:false});
      const categoriesWithIds = categories.map(category => ({_id:category._id,name:category.name}));

      res.render("shop",{
        user : userData,
        products : products,
        category : categoriesWithIds,
        brand : brands,
        totalProducts : totalProducts,
        currentPage : page,
        totalPages : totalPages
      })
    }
    catch (error) {
      res.redirect("/pageNotFound")
    }
  };

const loadNewArrivalPage = async (req, res) => {
  try {
    const user = req.session.user;
    const userData = user ? await User.findById(user._id) : null;

    const categories = await Category.find({ isListed: true });
    const categoryIds = categories.map(category => category._id.toString());

    const page = parseInt(req.query.page) || 1;
    const limit = 9;
    const skip = (page - 1) * limit;

    const allProducts = await Product.find({
      isBlocked: false,
      category: { $in: categoryIds },
      quantity: { $gt: 0 }
    }).populate('category');

    // Shuffle and paginate
    const products = [...allProducts]
      .sort(() => 0.5 - Math.random())
      .slice(skip, skip + limit);

    const totalProducts = allProducts.length;
    const totalPages = Math.ceil(totalProducts / limit);

    const brands = await Brand.find({ isBlocked: false });
    const categoriesWithIds = categories.map(category => ({ _id: category._id, name: category.name }));

    res.render("newArrivals", {
      user: userData,
      products,
      category: categoriesWithIds,
      brand: brands,
      totalProducts,
      currentPage: page,
      totalPages
    });
  } catch (error) {
    console.log('error in new Arrivals', error);
    res.redirect("/pageNotFound");
  }
};

const getfilter = async (req, res) => {
    try {
      const { category, brand, price } = req.body;
      console.log("Received filters from frontend:");
      console.log("Categories:", category);
      console.log("Brands:", brand);
      console.log("Price ranges:", price);
      
      // Initialize the filter object
      let filter = {};
      
      // Add category filter if provided
      if (category && category.length > 0) {
        filter.category = { 
          $in: category.map(id => new mongoose.Types.ObjectId(id)) 
        };
        console.log("Added category filter:", JSON.stringify(filter.category));
      }
      
      // Add brand filter if provided
      if (brand && brand.length > 0) {
        // First, get brand names from brand IDs
        const brandDocs = await Brand.find({ 
          _id: { $in: brand.map(id => new mongoose.Types.ObjectId(id)) } 
        });
        
        console.log("Found brand documents:", brandDocs);
        
        if (brandDocs.length > 0) {
          // Extract brand names from the brand documents
          const brandNames = brandDocs.map(b => b.brandName);
          console.log("Brand names to filter by:", brandNames);
          
          // Add brand names to filter
          filter.brand = { $in: brandNames };
        }
      }
      
      // Add price filter if provided
      if (price && price.length > 0) {
        // For price filters using $or for multiple ranges
        const priceConditions = price.map(range => {
          const [min, max] = range.split('-').map(Number);
          return { salePrice: { $gte: min, $lte: max } };
        });
        
        if (priceConditions.length === 1) {
          // If only one price range, no need for $or
          filter.salePrice = priceConditions[0].salePrice;
        } else if (priceConditions.length > 1) {
          // Multiple price ranges need $or
          filter.$or = priceConditions;
        }
        
        console.log("Added price filter:", JSON.stringify(priceConditions));
      }
      
      console.log('Final combined filter object:', JSON.stringify(filter, null, 2));
      
      // Execute the query with all filters combined
      const products = await Product.find(filter);
      console.log('products',products);
      
      console.log(`Total filtered products found: ${products.length})`);
      if (products.length > 0) {
        console.log("First 2 filtered products (sample):", 
          products.slice(0, 5).map(p => ({
            id: p._id,
            name: p.productName,
            brand: p.brand,
            category: p.category,
            price: p.salePrice
          }))
        );
      } else {
        console.log("No products found with these filters");
      }
      
      // Return the filtered products
      res.json({
        status: "success",
        count: products.length,
        data: products
      });
      
    } catch (error) {
      console.error('Error filtering products:', error);
      res.status(StatusCode.INTERNAL_SERVER_ERROR).json({ error: 'Internal Server Error' });
    }
  };

module.exports = {getfilter,loadShoppingPage,loadNewArrivalPage};