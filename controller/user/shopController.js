const User = require("../../models/userSchema");
const Category = require('../../models/categorySchema');
const Brand = require('../../models/brandSchema')
const Product = require('../../models/productSchema')
const {StatusCode} = require('../../config/statuscode');
const mongoose = require('mongoose');

const loadShoppingPage = async (req, res) => {
  try {
    console.log('Loading shop page...');
    
    const user = req.session.user;
    const userData = user ? await User.findById(user._id) : null;
    
    // Get categories
    const categories = await Category.find({ isListed: true });
    // console.log('Found categories:', categories.length);
    
    if (!categories || categories.length === 0) {
      console.log('No categories found');
      return res.render("shop", {
        user: userData,
        products: [],
        category: [],
        brand: [],
        totalProducts: 0,
        currentPage: 1,
        totalPages: 0
      });
    }
    
    const categoryIds = categories.map((category) => category._id.toString());
    // console.log('Category IDs:', categoryIds);
    
    const page = parseInt(req.query.page) || 1;
    const limit = 9;
    const skip = (page - 1) * limit;
    
    const productQuery = {
      isBlocked: false,
      category: { $in: categoryIds }   
    };
    
    
    const products = await Product.find(productQuery)
      .sort({ createdOn: 1 })
      .skip(skip)
      .limit(limit)
      .lean(); 
    
    // Count total products
    const totalProducts = await Product.countDocuments(productQuery);
    const totalPages = Math.ceil(totalProducts / limit);
    
    
    const brands = await Brand.find({ isBlocked: false });
    // console.log('Found brands:', brands.length);
    
    
    const categoriesWithIds = categories.map(category => ({
      _id: category._id,
      name: category.name
    }));
    

    // Ensure products have required fields
    const safeProducts = products.map(product => ({
      ...product,
      productName: product.productName || 'Unnamed Product',
      brand: product.brand || 'Unknown Brand',
      salePrice: product.salePrice || 0,
      productImages: product.productImages || ['/images/placeholder.jpg']
    }));
    
    res.render("shop", {
      user: userData,
      products: safeProducts,
      category: categoriesWithIds,
      brand: brands,
      totalProducts: totalProducts,
      currentPage: page,
      totalPages: totalPages
    });
    
  } catch (error) {
    console.error('Error in loadShoppingPage:', error);
    
    // Render empty shop page instead of redirecting to error
    res.render("shop", {
      user: null,
      products: [],
      category: [],
      brand: [],
      totalProducts: 0,
      currentPage: 1,
      totalPages: 0,
      error: 'Error loading products. Please try again later.'
    });
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
      category: { $in: categoryIds }
    }).populate('category');

    
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
    const { category, brand, price, query, sort } = req.body;
    console.log("Received filters from frontend:");
    console.log("Categories:", category);
    console.log("Brands:", brand);
    console.log("Price ranges:", price);
    console.log("Search Value:", query);
    console.log("Sort By:", sort);

    let filter = {};
    let searchConditions = [];

    
    if (category && category.length > 0) {
      filter.category = {
        $in: category.map(id => new mongoose.Types.ObjectId(id))
      };
      console.log("Added category filter:", JSON.stringify(filter.category));
    }

    if (brand && brand.length > 0) {
      const brandDocs = await Brand.find({
        _id: { $in: brand.map(id => new mongoose.Types.ObjectId(id)) }
      });
      console.log("Found brand documents:", brandDocs);
      
      if (brandDocs.length > 0) {
        const brandNames = brandDocs.map(b => b.brandName);
        console.log("Brand names to filter by:", brandNames);
        filter.brand = { $in: brandNames };
      }
    }

    if (price && price.length > 0) {
      const priceConditions = price.map(range => {
        const [min, max] = range.split('-').map(Number);
        return { salePrice: { $gte: min, $lte: max } };
      });
      
      if (priceConditions.length === 1) {
        filter.salePrice = priceConditions[0].salePrice;
      } else if (priceConditions.length > 1) {
        if (filter.$or) {
          filter.$and = [
            { $or: priceConditions },
            { $or: filter.$or }
          ];
          delete filter.$or;
        } else {
          filter.$or = priceConditions;
        }
      }
      console.log("Added price filter:", JSON.stringify(priceConditions));
    }

    if (query && query.trim() !== '') {
      const searchRegex = new RegExp(query.trim(), 'i'); 
      
      // Search in multiple fields
      searchConditions = [
        { productName: { $regex: searchRegex } },
        { description: { $regex: searchRegex } },
        { brand: { $regex: searchRegex } },
      ];

      if (filter.$or) {
        filter.$and = [
          { $or: filter.$or }, 
          { $or: searchConditions } 
        ];
        delete filter.$or;
      } else {
        filter.$or = searchConditions;
      }
      
      console.log("Added search filter for query:", query);
    }

    console.log('Final combined filter object:', JSON.stringify(filter, null, 2));

    // Build the query
    let productQuery = Product.find(filter);

    if (sort && sort.trim() !== '') {
      let sortObject = {};
      
      switch (sort.toLowerCase()) {
        case 'ascending':
        case 'asc':
        case 'price_asc':
          sortObject = { salePrice: 1 };
          console.log("Sorting by price ascending");
          break;
        case 'descending':
        case 'desc':
        case 'price_desc':
          sortObject = { salePrice: -1 };
          console.log("Sorting by price descending");
          break;
        case 'name_asc':
          sortObject = { productName: 1 };
          console.log("Sorting by name ascending");
          break;
        case 'name_desc':
          sortObject = { productName: -1 };
          console.log("Sorting by name descending");
          break;
        case 'newest':
        case 'date_desc':
          sortObject = { createdAt: -1 };
          console.log("Sorting by newest first");
          break;
        case 'oldest':
        case 'date_asc':
          sortObject = { createdAt: 1 };
          console.log("Sorting by oldest first");
          break;
        default:
          sortObject = { salePrice: 1 };
          console.log("Using default sorting (price ascending)");
          break;
      }
      
      productQuery = productQuery.sort(sortObject);
    }

    const products = await productQuery.exec();
    
    console.log('products', products);
    console.log(`Total filtered products found: ${products.length}`);

    if (products.length > 0) {
      console.log("First 5 filtered products (sample):",
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

    res.json({
      status: "success",
      count: products.length,
      data: products,
      appliedFilters: {
        category: category || [],
        brand: brand || [],
        price: price || [],
        query: query || '',
        sort: sort || ''
      }
    });

  } catch (error) {
    console.error('Error filtering products:', error);
    res.status(StatusCode.INTERNAL_SERVER_ERROR).json({ 
      status: "error",
      message: 'Internal Server Error',
      error: error.message 
    });
  }
};

module.exports = {getfilter,loadShoppingPage,loadNewArrivalPage};