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

        // Check if this is an AJAX request
        const isAjaxRequest = req.headers['x-requested-with'] === 'XMLHttpRequest';

        // Extract query parameters
        const page = parseInt(req.query.page) || 1;
        const limit = 9;
        const skip = (page - 1) * limit;

        // Get all categories and brands for filters
        const categories = await Category.find({ isListed: true });
        const brands = await Brand.find({ isBlocked: false });

        if (!categories || categories.length === 0) {
            const emptyData = {
                user: userData,
                products: [],
                category: [],
                brand: [],
                totalProducts: 0,
                currentPage: 1,
                totalPages: 0,
                filters: {
                    sort: '',
                    search: '',
                    selectedCategories: [],
                    selectedBrands: [],
                    selectedPriceRanges: []
                }
            };

            if (isAjaxRequest) {
                return res.json({ success: true, ...emptyData });
            }
            return res.render("shop", emptyData);
        }

        const categoryIds = categories.map((category) => category._id.toString());
        
        // Build base query
        let query = { isBlocked: false, category: { $in: categoryIds } };

        // Apply category filter
        const selectedCategories = req.query.category;
        if (selectedCategories) {
            const categoryArray = Array.isArray(selectedCategories) ? selectedCategories : [selectedCategories];
            query.category = { $in: categoryArray };
        }

        // Apply brand filter
        const selectedBrands = req.query.brand;
        if (selectedBrands) {
            const brandArray = Array.isArray(selectedBrands) ? selectedBrands : [selectedBrands];
            const brandObjects = await Brand.find({ _id: { $in: brandArray } });
            const brandNames = brandObjects.map(brand => brand.brandName);
            query.brand = { $in: brandNames };
        }

        // Apply search filter
        const search = req.query.search;
        if (search && search.trim()) {
            query.$or = [
                { productName: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { brand: { $regex: search, $options: 'i' } }
            ];
        }

        // Apply price filter with buffer for better performance
        const selectedPriceRanges = req.query.price;
        if (selectedPriceRanges) {
            const priceArray = Array.isArray(selectedPriceRanges) ? selectedPriceRanges : [selectedPriceRanges];
            const priceConditions = [];
            
            priceArray.forEach(range => {
                const [min, max] = range.split('-').map(Number);
                if (max === 100000) { // For ₹1500.00+ range
                    priceConditions.push({ salePrice: { $gte: min } });
                } else {
                    priceConditions.push({ salePrice: { $gte: min, $lte: max } });
                }
            });
            
            if (priceConditions.length > 0) {
                if (priceConditions.length === 1) {
                    Object.assign(query, priceConditions[0]);
                } else {
                    query.$or = priceConditions;
                }
            }
        }

        // Build sort query
        const sort = req.query.sort || '';
        let sortQuery = { createdOn: -1 }; 
        
        switch (sort) {
            case 'ascending':
                sortQuery = { salePrice: 1 };
                break;
            case 'descending':
                sortQuery = { salePrice: -1 };
                break;
            case 'name_asc':
                sortQuery = { productName: 1 };
                break;
            case 'name_dsc':
                sortQuery = { productName: -1 };
                break;
            default:
                sortQuery = { createdOn: -1 };
        }

        console.log('Product Query:', JSON.stringify(query, null, 2));
        console.log('Sort Query:', sortQuery);

        // Execute query with filters and sorting
        const products = await Product.find(query)
            .populate('category', 'name')
            .sort(sortQuery)
            .lean();

        // Count total products with filters applied
        const totalProducts = products.length;
        const totalPages = Math.ceil(totalProducts / limit);

        // Get products for current page
        const paginatedProducts = products.slice(skip, skip + limit);

        // Prepare categories and brands with IDs
        const categoriesWithIds = categories.map(category => ({
            _id: category._id,
            name: category.name
        }));

        // Ensure products have required fields
        const safeProducts = paginatedProducts.map(product => ({
            ...product,
            productName: product.productName || 'Unnamed Product',
            brand: product.brand || 'Unknown Brand',
            salePrice: product.salePrice || 0,
            regularPrice: product.regularPrice || 0,
            description: product.description || '',
            productImages: product.productImages || ['/images/placeholder.jpg']
        }));

        // Prepare filter state for template
        const filters = {
            sort: sort || '',
            search: search || '',
            selectedCategories: Array.isArray(selectedCategories) ? selectedCategories : (selectedCategories ? [selectedCategories] : []),
            selectedBrands: Array.isArray(selectedBrands) ? selectedBrands : (selectedBrands ? [selectedBrands] : []),
            selectedPriceRanges: Array.isArray(selectedPriceRanges) ? selectedPriceRanges : (selectedPriceRanges ? [selectedPriceRanges] : [])
        };

        const responseData = {
            user: userData,
            products: safeProducts,
            category: categoriesWithIds,
            brand: brands,
            totalProducts: totalProducts,
            currentPage: page,
            totalPages: totalPages,
            filters: filters
        };

        // Return JSON for AJAX requests, render template for regular requests
        if (isAjaxRequest) {
            return res.json({ success: true, ...responseData });
        }

        res.render("shop", responseData);

    } catch (error) {
        console.error('Error in loadShoppingPage:', error);
        
        const errorData = {
            user: null,
            products: [],
            category: [],
            brand: [],
            totalProducts: 0,
            currentPage: 1,
            totalPages: 0,
            filters: {
                sort: '',
                search: '',
                selectedCategories: [],
                selectedBrands: [],
                selectedPriceRanges: []
            },
            error: 'Error loading products. Please try again later.'
        };

        if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
            return res.json({ success: false, message: 'Error loading products', ...errorData });
        }

        res.render("shop", errorData);
    }
};


const loadNewArrivalPage = async (req, res) => {
  try {
        console.log('Loading new arrivals page...');
        const user = req.session.user;
        const userData = user ? await User.findById(user._id) : null;

        // Check if this is an AJAX request
        const isAjaxRequest = req.headers['x-requested-with'] === 'XMLHttpRequest';

        // Extract query parameters
        const page = parseInt(req.query.page) || 1;
        const limit = 9;
        const skip = (page - 1) * limit;

        // Get all categories and brands for filters
        const categories = await Category.find({ isListed: true });
        const brands = await Brand.find({ isBlocked: false });

        if (!categories || categories.length === 0) {
            const emptyData = {
                user: userData,
                products: [],
                category: [],
                brand: [],
                totalProducts: 0,
                currentPage: 1,
                totalPages: 0,
                filters: {
                    sort: '',
                    search: '',
                    selectedCategories: [],
                    selectedBrands: [],
                    selectedPriceRanges: []
                }
            };

            if (isAjaxRequest) {
                return res.json({ success: true, ...emptyData });
            }
            return res.render("newArrivals", emptyData);
        }

        const categoryIds = categories.map((category) => category._id.toString());
        
        // Build base query
        let query = { isBlocked: false, category: { $in: categoryIds } };

        // Check if any filters are applied
        const hasFilters = req.query.category || req.query.brand || req.query.price || req.query.search || req.query.sort;

        // Apply category filter
        const selectedCategories = req.query.category;
        if (selectedCategories) {
            const categoryArray = Array.isArray(selectedCategories) ? selectedCategories : [selectedCategories];
            query.category = { $in: categoryArray };
        }

        // Apply brand filter
        const selectedBrands = req.query.brand;
        if (selectedBrands) {
            const brandArray = Array.isArray(selectedBrands) ? selectedBrands : [selectedBrands];
            const brandObjects = await Brand.find({ _id: { $in: brandArray } });
            const brandNames = brandObjects.map(brand => brand.brandName);
            query.brand = { $in: brandNames };
        }

        // Apply search filter
        const search = req.query.search;
        if (search && search.trim()) {
            query.$or = [
                { productName: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { brand: { $regex: search, $options: 'i' } }
            ];
        }

        // Apply price filter with buffer for better performance
        const selectedPriceRanges = req.query.price;
        if (selectedPriceRanges) {
            const priceArray = Array.isArray(selectedPriceRanges) ? selectedPriceRanges : [selectedPriceRanges];
            const priceConditions = [];
            
            priceArray.forEach(range => {
                const [min, max] = range.split('-').map(Number);
                if (max === 100000) { 
                    priceConditions.push({ salePrice: { $gte: min } });
                } else {
                    priceConditions.push({ salePrice: { $gte: min, $lte: max } });
                }
            });
            
            if (priceConditions.length > 0) {
                if (priceConditions.length === 1) {
                    Object.assign(query, priceConditions[0]);
                } else {
                    query.$or = priceConditions;
                }
            }
        }

        // Build sort query - for new arrivals, show random products by default if no filters
        const sort = req.query.sort || '';
        let sortQuery = { createdOn: -1 }; // Default: newest first
        
        switch (sort) {
            case 'ascending':
                sortQuery = { salePrice: 1 };
                break;
            case 'descending':
                sortQuery = { salePrice: -1 };
                break;
            case 'name_asc':
                sortQuery = { productName: 1 };
                break;
            case 'name_dsc':
                sortQuery = { productName: -1 };
                break;
            default:
                sortQuery = { createdOn: -1 }; // Default: newest first
        }

        console.log('Product Query:', JSON.stringify(query, null, 2));
        console.log('Sort Query:', sortQuery);
        console.log('Has Filters:', hasFilters);

        // Execute query with filters and sorting
        let products;
        
        if (!hasFilters && !sort) {
            // For new arrivals with no filters, get all products and shuffle them
            const allProducts = await Product.find({
                isBlocked: false,
                category: { $in: categoryIds }
            }).populate('category').lean();
            
            // Shuffle using the preferred technique
            products = [...allProducts]
                .sort(() => 0.5 - Math.random())
                .slice(skip, skip + limit);
                
            console.log('🔀 Products shuffled using sort(() => 0.5 - Math.random())');
        } else {
            // For filtered results, use normal find with pagination
            products = await Product.find(query)
                .populate('category', 'name')
                .sort(sortQuery)
                .skip(skip)
                .limit(limit)
                .lean();
        }

        // Count total products with filters applied
        const totalProducts = products.length;
        const totalPages = Math.ceil(totalProducts / limit);

        // Prepare categories and brands with IDs
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
            regularPrice: product.regularPrice || 0,
            description: product.description || '',
            productImages: product.productImages || ['/images/placeholder.jpg']
        }));

        // Prepare filter state for template
        const filters = {
            sort: sort || '',
            search: search || '',
            selectedCategories: Array.isArray(selectedCategories) ? selectedCategories : (selectedCategories ? [selectedCategories] : []),
            selectedBrands: Array.isArray(selectedBrands) ? selectedBrands : (selectedBrands ? [selectedBrands] : []),
            selectedPriceRanges: Array.isArray(selectedPriceRanges) ? selectedPriceRanges : (selectedPriceRanges ? [selectedPriceRanges] : [])
        };

        const responseData = {
            user: userData,
            products: safeProducts,
            category: categoriesWithIds,
            brand: brands,
            totalProducts: totalProducts,
            currentPage: page,
            totalPages: totalPages,
            filters: filters
        };

        // Return JSON for AJAX requests, render template for regular requests
        if (isAjaxRequest) {
            return res.json({ success: true, ...responseData });
        }

        res.render("newArrivals", responseData);

    } catch (error) {
        console.error('Error in loadNewArrivalPage:', error);
        
        const errorData = {
            user: null,
            products: [],
            category: [],
            brand: [],
            totalProducts: 0,
            currentPage: 1,
            totalPages: 0,
            filters: {
                sort: '',
                search: '',
                selectedCategories: [],
                selectedBrands: [],
                selectedPriceRanges: []
            },
            error: 'Error loading products. Please try again later.'
        };

        if (isAjaxRequest) {
            return res.status(StatusCode.INTERNAL_SERVER_ERROR).json({ success: false, ...errorData });
        }

        res.render("newArrivals", errorData);
    }
};


module.exports = {
    loadShoppingPage,
    filterProducts: loadShoppingPage, 
    loadNewArrivalPage
};