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
    
    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = 9;
    const skip = (page - 1) * limit;
    
    // Get products with better error handling
    const productQuery = {
      isBlocked: false,
      category: { $in: categoryIds }   
    };
    
    // console.log('Product query:', productQuery);
    
    const products = await Product.find(productQuery)
      .sort({ createdOn: 1 }) // Changed to -1 for newest first
      .skip(skip)
      .limit(limit)
      .lean(); // Use lean() for better performance
    
    // console.log('Found products:', products.length);
    
    // Count total products
    const totalProducts = await Product.countDocuments(productQuery);
    const totalPages = Math.ceil(totalProducts / limit);
    
    // Get brands
    const brands = await Brand.find({ isBlocked: false });
    // console.log('Found brands:', brands.length);
    
    // Format categories
    const categoriesWithIds = categories.map(category => ({
      _id: category._id,
      name: category.name
    }));
    
    // Debug logging
    // console.log('Rendering shop page with:', {
    //   productsCount: products.length,
    //   categoriesCount: categoriesWithIds.length,
    //   brandsCount: brands.length,
    //   totalProducts,
    //   currentPage: page,
    //   totalPages
    // });
    
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
    const { category, brand, price, query, sort } = req.body;
    console.log("Received filters from frontend:");
    console.log("Categories:", category);
    console.log("Brands:", brand);
    console.log("Price ranges:", price);
    console.log("Search Value:", query);
    console.log("Sort By:", sort);

    // Initialize the filter object
    let filter = {};
    let searchConditions = [];

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
        // We need to handle this carefully if we also have search conditions
        if (filter.$or) {
          // If $or already exists, we need to combine conditions differently
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

    // Add search query filter if provided
    if (query && query.trim() !== '') {
      const searchRegex = new RegExp(query.trim(), 'i'); // Case-insensitive search
      
      // Search in multiple fields
      searchConditions = [
        { productName: { $regex: searchRegex } },
        { description: { $regex: searchRegex } },
        { brand: { $regex: searchRegex } },
        // Add more fields as needed
      ];

      // Handle combining search with existing $or conditions (like price ranges)
      if (filter.$or) {
        // If we already have $or conditions (like price ranges), combine them with $and
        filter.$and = [
          { $or: filter.$or }, // Existing $or conditions (price ranges)
          { $or: searchConditions } // Search conditions
        ];
        delete filter.$or;
      } else {
        // No existing $or conditions, so we can use $or directly for search
        filter.$or = searchConditions;
      }
      
      console.log("Added search filter for query:", query);
    }

    console.log('Final combined filter object:', JSON.stringify(filter, null, 2));

    // Build the query
    let productQuery = Product.find(filter);

    // Add sorting if provided
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
          // Default sorting by price ascending if sort value is not recognized
          sortObject = { salePrice: 1 };
          console.log("Using default sorting (price ascending)");
          break;
      }
      
      productQuery = productQuery.sort(sortObject);
    }

    // Execute the query with all filters and sorting
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

    // Return the filtered and sorted products
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