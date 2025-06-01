const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Brand = require("../../models/brandSchema");
const User = require("../../models/userSchema");
const {StatusCode} = require('../../config/statuscode');
const fs = require('fs').promises;
const path = require("path");
const sharp = require("sharp");


const getProductPage = async (req, res) => {
  try {
    const search = req.query.search || "";
    const page=req.query.page || 1;
    const limit=6;

    const productData = await Product.find({
      $or:[
        {productName:{$regex:new RegExp(".*"+search+".*","i")}},
        {brand:{$regex:new RegExp(".*"+search+".*","i")}}
      ],  
    }).limit(limit*1).skip((page-1)*limit).populate('category').exec();

    const count= await Product.find({
      $or:[
        {productName:{$regex:new RegExp(".*"+search+".*","i")}},
        {brand:{$regex:new RegExp(".*"+search+".*","i")}}
      ],
    }).countDocuments();

    const category= await Category.find({isListed:true});
    const brand = await Brand.find({isBlocked:false});

    if(category&&brand){
      res.render('products',{
        data:productData,
        currentPage:page,
        totalPages:Math.ceil(count/limit),
        cat:category,
        brand:brand,
      })
    }else{
      res.render('page-error');
    }

  } catch (error) {
    console.error('Error loading product page:', error);
    res.redirect('/pageerror');
  }
};

const getAddProduct =async (req, res) => {
  try {
    const category= await Category.find({isListed:true});
    const brand=await Brand.find({isBlocked:false});
    res.render('addproduct',{
      cat:category,
      brand:brand
    }); 
  } catch (error) {
    res.redirect('/pageerror');
  }
};

const addProducts = async (req,res)=>{
  try {
        const {
            productName,
            description,
            longDescription,
            specifications,
            brand,
            category,
            regularPrice,
            salePrice,
            color,
            material,
            design,
            occasion,
            quantity_xs,
            quantity_s,
            quantity_m,
            quantity_l,
            quantity_xl,
            quantity_xxl,
            productImages // This will be the JSON string from the form
        } = req.body;

        // Validate required fields
        if (!productName || !description || !longDescription || !specifications || 
            !brand || !category || !regularPrice || !salePrice || !color) {
            return res.status(400).json({
                success: false,
                message: 'All required fields must be filled'
            });
        }

        // Find category by name and get ObjectId
        const categoryDoc = await Category.findOne({ name: category });
        if (!categoryDoc) {
            return res.status(400).json({
                success: false,
                message: 'Invalid category selected'
            });
        }

        // Process variants - create Map from form data
        const variants = new Map();
        const sizeArray = [];

        // Add quantities to variants Map and track available sizes
        if (quantity_xs && parseInt(quantity_xs) > 0) {
            variants.set('XS', parseInt(quantity_xs));
            sizeArray.push('XS');
        }
        if (quantity_s && parseInt(quantity_s) > 0) {
            variants.set('S', parseInt(quantity_s));
            sizeArray.push('S');
        }
        if (quantity_m && parseInt(quantity_m) > 0) {
            variants.set('M', parseInt(quantity_m));
            sizeArray.push('M');
        }
        if (quantity_l && parseInt(quantity_l) > 0) {
            variants.set('L', parseInt(quantity_l));
            sizeArray.push('L');
        }
        if (quantity_xl && parseInt(quantity_xl) > 0) {
            variants.set('XL', parseInt(quantity_xl));
            sizeArray.push('XL');
        }
        if (quantity_xxl && parseInt(quantity_xxl) > 0) {
            variants.set('XXL', parseInt(quantity_xxl));
            sizeArray.push('XXL');
        }

        // Validate that at least one size has quantity
        if (sizeArray.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'At least one size must have quantity greater than 0'
            });
        }

        // Process images
        let imageUrls = [];

        // Handle images from the cropped/uploaded images (JSON string)
        if (productImages) {
            try {
                const parsedImages = JSON.parse(productImages);
                
                // Save base64 images to files
                for (let i = 0; i < parsedImages.length; i++) {
                    const imageData = parsedImages[i];
                    if (imageData.src.startsWith('data:image/')) {
                        // Extract base64 data
                        const base64Data = imageData.src.replace(/^data:image\/\w+;base64,/, '');
                        const buffer = Buffer.from(base64Data, 'base64');
                        
                        // Generate filename
                        const filename = `product-${Date.now()}-${i}.jpg`;
                        const filepath = path.join('public/uploads/product-images/', filename);
                        
                        // Save file
                        fs.writeFileSync(filepath, buffer);
                        imageUrls.push(`/uploads/product-images/${filename}`);
                    }
                }
            } catch (error) {
                console.error('Error processing product images:', error);
            }
        }

        // Handle direct file uploads (fallback)
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => {
                imageUrls.push(`/uploads/product-images/${file.filename}`);
            });
        }

        // Validate image requirements
        if (imageUrls.length < 4) {
            return res.status(400).json({
                success: false,
                message: 'At least 4 product images are required'
            });
        }

        if (imageUrls.length > 10) {
            return res.status(400).json({
                success: false,
                message: 'Maximum 10 product images allowed'
            });
        }

        // Calculate total stock for status
        const totalStock = Array.from(variants.values()).reduce((sum, qty) => sum + qty, 0);
        const status = totalStock > 0 ? 'Available' : 'Out of Stock';

        // Create new product
        const newProduct = new Product({
            productName: productName.trim(),
            description: description.trim(),
            longDescription: longDescription.trim(),
            specifications: specifications.trim(),
            brand: brand,
            category: categoryDoc._id,
            regularPrice: parseFloat(regularPrice),
            salePrice: parseFloat(salePrice),
            variants: variants,
            size: sizeArray,
            color: color.trim(),
            material: material ? material.trim() : '',
            design: design ? design.trim() : '',
            occasion: occasion ? occasion.trim() : '',
            productImages: imageUrls,
            status: status
        });

        await newProduct.save();

        // ❌ REMOVE THIS LINE - This is causing the error
        // return res.redirect("/admin/products");

        // ✅ REPLACE WITH THIS - Return JSON response
        return res.status(201).json({
            success: true,
            message: 'Product added successfully!',
            productId: newProduct._id
        });

    } catch (error) {
        console.error('Error adding product:', error);
        
        // Clean up uploaded files in case of error
        if (req.files) {
            req.files.forEach(file => {
                fs.unlink(file.path, (err) => {
                    if (err) console.error('Error deleting file:', err);
                });
            });
        }

        res.status(500).json({
            success: false,
            message: 'Error adding product. Please try again.',
            error: error.message
        });
    }
}




const addProductOffer = async(req,res)=>{
  try {
    const {productId,percentage} = req.body;
    const findProduct =await Product.findOne({_id:productId});
    const findCategory = await Category.findOne({_id:findProduct.category});
    if(findCategory.categoryOffer>percentage){
      return res.json({status:false,message:"This product category already has a category offer"});  
    }
    findProduct.salePrice = Math.floor(findProduct.regularPrice - (findProduct.regularPrice * (percentage / 100)));
    findProduct.productOffer=parseInt(percentage);
    await findProduct.save();
    findCategory.categoryOffer=0;
    await findCategory.save();
    return res.json({status:true});
  } catch (error) {
    res.redirect('/pageerror');
  }
}

const removeProductOffer =async(req,res)=>{
  try {
    const {productId} = req.body;
    const findProduct = await Product.findOne({_id:productId});
    const percentage = findProduct.productOffer;
    findProduct.salePrice = Math.floor(findProduct.regularPrice - (findProduct.regularPrice * (percentage / 100)));
    findProduct.productOffer=0;
    await findProduct.save();
    return res.json({ status: true });
  } catch (error) {
    res.redirect('/pageerror');
  }
}

const blockProduct = async (req,res)=>{
  try {
    let id = req.query.id;
    await Product.updateOne({_id:id},{$set:{isBlocked:true}});
    res.redirect('/admin/products');
  } catch (error) {
    res.redirect('/pageerror');
  }
}

const unblockProduct = async (req,res)=>{
  try {
    let id = req.query.id;
    await Product.updateOne({_id:id},{$set:{isBlocked:false}});
    res.redirect('/admin/products'); 
  } catch (error) {
    res.redirect('/pageerror');
  }
}

const getEditProduct = async (req, res) => {
  try {
    const id = req.query.id;

    const product = await Product.findById(id);
    console.log("Fetched product:", product);

    const category = await Category.find();
    const brand = await Brand.find();
    product.variants = Object.fromEntries(product.variants);
console.log('product images ',product.productImages);
    res.render('editproduct', {
      cat:category,
      product:product,
      brand:brand
    });

  } catch (error) {
    console.log("Edit Product Error:", error);
    res.redirect('/admin/pageerror');
  }
};





const editProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const {
      productName, category, brand, regularPrice, salePrice, color, material,
      design, occasion, quantity_xs, quantity_s, quantity_m, quantity_l,
      quantity_xl, quantity_xxl, description, longDescription, specifications,
      deletedImages = []  // Array of image indices to delete
    } = req.body;

    // Find existing product
    const existingProduct = await Product.findById(productId);
    if (!existingProduct) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    // Validate required fields
    if (!productName || !category || !regularPrice || !salePrice || !color || !description || !longDescription || !specifications) {
      return res.status(400).json({ success: false, message: 'All required fields must be filled' });
    }

    // Validate prices
    const regPrice = parseFloat(regularPrice);
    const salPrice = parseFloat(salePrice);
    
    if (regPrice <= 0 || salPrice <= 0) {
      return res.status(400).json({ success: false, message: 'Prices must be greater than 0' });
    }
    if (salPrice >= regPrice) {
      return res.status(400).json({ success: false, message: 'Sale price must be less than regular price' });
    }

    // Handle variants
    const quantities = {
      'XS': parseInt(quantity_xs) || 0, 'S': parseInt(quantity_s) || 0,
      'M': parseInt(quantity_m) || 0, 'L': parseInt(quantity_l) || 0,
      'XL': parseInt(quantity_xl) || 0, 'XXL': parseInt(quantity_xxl) || 0
    };

    const variants = new Map();
    const sizeArray = [];
    let totalQuantity = 0;

    Object.entries(quantities).forEach(([size, qty]) => {
      if (qty > 0) {
        variants.set(size, qty);
        sizeArray.push(size);
        totalQuantity += qty;
      }
    });

    if (totalQuantity === 0) {
      return res.status(400).json({ success: false, message: 'At least one size quantity must be specified' });
    }

    // Handle image operations
    let finalImages = [...existingProduct.productImages];

    // Delete specified images
    const deletedIndices = Array.isArray(deletedImages) ? deletedImages.map(idx => parseInt(idx)) : 
                          typeof deletedImages === 'string' ? [parseInt(deletedImages)] : [];
    
    // Remove deleted images (reverse sort to maintain indices)
    deletedIndices.sort((a, b) => b - a).forEach(async (index) => {
      if (index >= 0 && index < finalImages.length) {
        // Delete file from server - handle both path formats
        const imageToDelete = finalImages[index];
        const imagePath = imageToDelete.startsWith('/uploads/') 
          ? path.join('public', imageToDelete) 
          : path.join('public/uploads/product-images/', imageToDelete);
        
        try {
          await fs.unlink(imagePath);
        } catch (err) {
          console.warn('Could not delete image:', imageToDelete, err.message);
        }
        finalImages.splice(index, 1);
      }
    });

    // Add new images (Multer has already saved them to disk)
    if (req.files && req.files.length > 0) {
      // ✅ FIXED: Add full path like in addProducts function
      const newImagePaths = req.files.map(file => `/uploads/product-images/${file.filename}`);
      finalImages.push(...newImagePaths);
    }

    // Validate image count (4-10 images required)
    if (finalImages.length < 4 || finalImages.length > 10) {
      return res.status(400).json({ 
        success: false, 
        message: `Product must have between 4-10 images. Current: ${finalImages.length}` 
      });
    }

    // Check for duplicate product name
    const existingProductWithName = await Product.findOne({
      productName: { $regex: new RegExp(`^${productName}$`, 'i') },
      _id: { $ne: productId }
    });

    const status = totalQuantity > 0 ? 'Available' : 'out of stock';

    // Update product
    const updatedProduct = await Product.findByIdAndUpdate(
      productId,
      {
        productName: productName.trim(),
        category, brand: brand || null,
        regularPrice: regPrice, salePrice: salPrice,
        color: color.trim(),
        material: material ? material.trim() : null,
        design: design ? design.trim() : null,
        occasion: occasion ? occasion.trim() : null,
        variants, size: sizeArray,
        description: description.trim(),
        longDescription: longDescription.trim(),
        specifications: specifications.trim(),
        productImages: finalImages,
        status, updatedAt: new Date()
      },
      { new: true, runValidators: true }
    );

    if (!updatedProduct) {
      return res.status(500).json({ success: false, message: 'Failed to update product' });
    }

    return res.redirect("/admin/products");

  } catch (error) {
    console.error('Error updating product:', error);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }

    if (error.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid product ID format' });
    }

    res.status(500).json({ success: false, message: 'Error updating product: ' + error.message });
  }
};



module.exports = {
  getProductPage,
  getAddProduct,
  addProducts,
  addProductOffer,
  removeProductOffer,
  blockProduct,
  unblockProduct,
  getEditProduct,
  editProduct,
  
};