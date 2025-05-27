const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Brand = require("../../models/brandSchema");
const User = require("../../models/userSchema");
const {StatusCode} = require('../../config/statuscode');
const fs = require("fs");
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
      const products = req.body;
      const validationErrors = [];
     
      if (!products.productName || products.productName.trim().length < 3) {
          validationErrors.push('Product name must be at least 3 characters long');
      }

      if (!products.description || products.description.trim().length < 10) {
          validationErrors.push('Short description must be at least 10 characters long');
      }

      if (!products.longDescription || products.longDescription.trim().length < 10) {
          validationErrors.push('Full description must be at least 20 characters long');
      }

      if (!products.specifications || products.specifications.trim().length < 10) {
          validationErrors.push('Specifications must be at least 10 characters long');
      }

      if (!products.regularPrice || isNaN(products.regularPrice) || parseFloat(products.regularPrice) <= 0) {
          validationErrors.push('Regular price must be a positive number');
      }

      if (!products.salePrice || isNaN(products.salePrice) || parseFloat(products.salePrice) <= 0) {
          validationErrors.push('Sale price must be a positive number');
      } else if (parseFloat(products.salePrice) >= parseFloat(products.regularPrice)) {
          validationErrors.push('Sale price must be less than regular price');
      }

      if (!products.category) {
          validationErrors.push('Category is required');
      }
      

    // Image validation
    if (!req.files || req.files.length !== 4) {
        validationErrors.push('Exactly 4 product images are required');
    } else {
        const validTypes = ['image/jpeg', 'image/png', 'image/jpg','image/webp'];
        const maxSize = 5 * 1024 * 1024; // 5MB

        for (const file of req.files) {
            if (!validTypes.includes(file.mimetype)) {
                validationErrors.push('Only JPG, JPEG, and PNG images are allowed');
                break;
            }
            if (file.size > maxSize) {
              validationErrors.push('Image size must be less than 5MB');
              break;
          }
      }
  }

  // Return validation errors if any
  if (validationErrors.length) {
      return res.status(StatusCode.BAD_REQUEST).json({ errors: validationErrors });
  }

  // Check for duplicate product name
  const productExists = await Product.findOne({
      productName: products.productName.trim(),
  });

  if(productExists){
      return res.status(StatusCode.BAD_REQUEST).json({ error: "Product already exists, please try another name" });
  }

  let images = [];

  if(req.files && req.files.length === 4){
      const uploadDir = path.join(__dirname, '../../public/uploads/product-images');
      if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
      }
      for(let i = 0; i < req.files.length; i++){
        const file = req.files[i];
        const filename = `product-${Date.now()}-${i}.jpg`;
        const resizedImagePath = path.join(uploadDir, filename);

        try {
            // Resize and save image
            await sharp(file.path)
                .resize(450, 490, {
                    fit: 'cover',
                    position: 'center'
                })
                .jpeg({ quality: 80 })
                .toFile(resizedImagePath);

            images.push(filename);

            // Delete the temporary file
            await fs.promises.unlink(file.path);
        } catch (error) {
            console.error('Error processing image:', error);
            try {
                await fs.promises.unlink(file.path);
            } catch (unlinkError) {
                console.error('Error deleting temporary file:', unlinkError);
            }
            return res.status(StatusCode.INTERNAL_SERVER_ERROR).json({ error: "Error processing image" });
        }
    }
}
const categoryId = await Category.findOne({name: products.category});

        if(!categoryId){
            return res.status(StatusCode.BAD_REQUEST).json({ error: "Invalid category name" });
        }
        const newProduct = new Product({
            productName: products.productName.trim(),
            description: products.description.trim(),
            longDescription: products.longDescription.trim(),
            specifications: products.specifications.trim(),
            category: categoryId._id,
            brand: products.brand,
            regularPrice: parseFloat(products.regularPrice),
            salePrice: parseFloat(products.salePrice),
            quantity: products.quantity,
            color: products.color,
            productImages: images,
            status: "Available",
        });

        await newProduct.save();
        return res.redirect("/admin/products");
    
    } catch (error) {
        console.error('Error saving product:', error);
        return res.status(StatusCode.INTERNAL_SERVER_ERROR).json({ error: "Error saving product", details: error.message });
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
      const id = req.params.id;
      const {
          productName,
          description,
          longDescription,
          specifications,
          category,
          regularPrice,
          salePrice,
          quantity,
          color,
          existingImages
      } = req.body;

      const product = await Product.findOne({ _id: id });
      if (!product) {
          return res.status(StatusCode.NOT_FOUND).json({ message: "Product not found" });
      }

      if (!productName || !description || !longDescription || !specifications || !category || !regularPrice || !salePrice) {
          return res.status(StatusCode.BAD_REQUEST).json({ message: "All fields are required" });
      }

      let images = [...product.productImages];
      const uploadDir = path.join(__dirname, '../../public/uploads/product-images');
      if (existingImages) {
        let imagesToRemove;
        try {
            imagesToRemove = JSON.parse(existingImages);
        } catch (err) {
            imagesToRemove = [];
        }
        imagesToRemove.forEach(imageName => {
            const index = images.indexOf(imageName);
            if (index !== -1) {
                const imagePath = path.join(uploadDir, imageName);
                if (fs.existsSync(imagePath)) {
                    fs.unlinkSync(imagePath);
                }
                images[index] = null;
            }
        });
    }

        // Handle new image 
        if (req.files) {
          if (Array.isArray(req.files)) {
              req.files.forEach(file => {
                  const match = file.fieldname.match(/productImages\[(\d+)\]/);
                  if (match) {
                      const idx = parseInt(match[1], 10);
                      images[idx] = file.filename;
                  }
              });
          } else {
              Object.keys(req.files).forEach(key => {
                  const match = key.match(/productImages\[(\d+)\]/);
                  if (match) {
                      const idx = parseInt(match[1], 10);
                      const file = req.files[key][0];
                      images[idx] = file.filename;
                  }
              });
          }
      }

      // Update 
      product.productName = productName;
      product.description = description;
      product.longDescription = longDescription;
      product.specifications = specifications;
      product.category = category;
      product.regularPrice = regularPrice;
      product.salePrice = salePrice;
      product.quantity = quantity;
      product.color = color;
      product.productImages = images.filter(img => img !== null);

      // Save
      await product.save();

      res.status(StatusCode.OK).redirect('/admin/products');
  } catch (error) {
      console.error('Error in editProduct:', error);
      res.status(StatusCode.INTERNAL_SERVER_ERROR).json({ message: "Internal server error" });
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