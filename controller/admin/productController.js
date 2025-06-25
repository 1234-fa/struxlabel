const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Brand = require("../../models/brandSchema");
const User = require("../../models/userSchema");
const { StatusCode } = require("../../config/statuscode");
const fss = require("fs");
const fs = require("fs").promises;
const path = require("path");
const sharp = require("sharp");

const getProductPage = async (req, res) => {
  try {
    const search = req.query.search || "";
    const page = req.query.page || 1;
    const limit = 6;

    const productData = await Product.find({
      $or: [
        { productName: { $regex: new RegExp(".*" + search + ".*", "i") } },
        { brand: { $regex: new RegExp(".*" + search + ".*", "i") } },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate("category")
      .exec();

    const count = await Product.find({
      $or: [
        { productName: { $regex: new RegExp(".*" + search + ".*", "i") } },
        { brand: { $regex: new RegExp(".*" + search + ".*", "i") } },
      ],
    }).countDocuments();

    const category = await Category.find({ isListed: true });
    const brand = await Brand.find({ isBlocked: false });

    if (category && brand) {
      res.render("products", {
        data: productData,
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        cat: category,
        brand: brand,
      });
    } else {
      res.render("page-error");
    }
  } catch (error) {
    console.error("Error loading product page:", error);
    res.redirect("/pageerror");
  }
};

const getAddProduct = async (req, res) => {
  try {
    const category = await Category.find({ isListed: true });
    const brand = await Brand.find({ isBlocked: false });
    res.render("addproduct", {
      cat: category,
      brand: brand,
    });
  } catch (error) {
    res.redirect("/pageerror");
  }
};

const addProducts = async (req, res) => {
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
      productImages, // This will be the JSON string from the form
    } = req.body;

    // Validate required fields
    if (
      !productName ||
      !description ||
      !longDescription ||
      !specifications ||
      !brand ||
      !category ||
      !regularPrice ||
      !salePrice ||
      !color
    ) {
      return res.status(StatusCode.BAD_REQUEST).json({
        success: false,
        message: "All required fields must be filled",
      });
    }

    // Find category by name and get ObjectId
    const categoryDoc = await Category.findOne({ name: category });
    if (!categoryDoc) {
      return res.status(StatusCode.BAD_REQUEST).json({
        success: false,
        message: "Invalid category selected",
      });
    }

    // Process variants - create Map from form data
    const variants = new Map();
    const sizeArray = [];

    // Add quantities to variants Map and track available sizes
    if (quantity_xs && parseInt(quantity_xs) > 0) {
      variants.set("XS", parseInt(quantity_xs));
      sizeArray.push("XS");
    }
    if (quantity_s && parseInt(quantity_s) > 0) {
      variants.set("S", parseInt(quantity_s));
      sizeArray.push("S");
    }
    if (quantity_m && parseInt(quantity_m) > 0) {
      variants.set("M", parseInt(quantity_m));
      sizeArray.push("M");
    }
    if (quantity_l && parseInt(quantity_l) > 0) {
      variants.set("L", parseInt(quantity_l));
      sizeArray.push("L");
    }
    if (quantity_xl && parseInt(quantity_xl) > 0) {
      variants.set("XL", parseInt(quantity_xl));
      sizeArray.push("XL");
    }
    if (quantity_xxl && parseInt(quantity_xxl) > 0) {
      variants.set("XXL", parseInt(quantity_xxl));
      sizeArray.push("XXL");
    }

    // Validate that at least one size has quantity
    if (sizeArray.length === 0) {
      return res.status(StatusCode.BAD_REQUEST).json({
        success: false,
        message: "At least one size must have quantity greater than 0",
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
          if (imageData.src.startsWith("data:image/")) {
            // Extract base64 data
            const base64Data = imageData.src.replace(
              /^data:image\/\w+;base64,/,
              ""
            );
            const buffer = Buffer.from(base64Data, "base64");

            // Extract format from base64 data
            const formatMatch = imageData.src.match(/^data:image\/(\w+);base64,/);
            const format = formatMatch ? formatMatch[1] : 'jpg';

            // Generate filename with correct extension
            const filename = `product-${Date.now()}-${i}.${format}`;
            const filepath = path.join(
              "public/uploads/product-images/",
              filename
            );

            fss.writeFileSync(filepath, buffer);
            imageUrls.push(`/uploads/product-images/${filename}`);
          }
        }
      } catch (error) {
        console.error("Error processing product images:", error);
      }
    }

    // Handle direct file uploads (fallback)
    if (req.files && req.files.length > 0) {
      req.files.forEach((file) => {
        imageUrls.push(`/uploads/product-images/${file.filename}`);
      });
    }

    // Validate image requirements
    if (imageUrls.length < 4) {
      return res.status(StatusCode.BAD_REQUEST).json({
        success: false,
        message: "At least 4 product images are required",
      });
    }

    if (imageUrls.length > 10) {
      return res.status(StatusCode.BAD_REQUEST).json({
        success: false,
        message: "Maximum 10 product images allowed",
      });
    }

    // Calculate total stock for status
    const totalStock = Array.from(variants.values()).reduce(
      (sum, qty) => sum + qty,
      0
    );
    const status = totalStock > 0 ? "Available" : "Out of Stock";

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
      material: material ? material.trim() : "",
      design: design ? design.trim() : "",
      occasion: occasion ? occasion.trim() : "",
      productImages: imageUrls,
      status: status,
    });

    await newProduct.save();

    return res.status(201).json({
      success: true,
      message: "Product added successfully!",
      productId: newProduct._id,
    });
  } catch (error) {
    console.error("Error adding product:", error);

    if (req.files) {
      req.files.forEach((file) => {
        fs.unlink(file.path, (err) => {
          if (err) console.error("Error deleting file:", err);
        });
      });
    }

    res.status(StatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Error adding product. Please try again.",
      error: error.message,
    });
  }
};

const addProductOffer = async (req, res) => {
  try {
    const { productId, percentage } = req.body;
    const findProduct = await Product.findOne({ _id: productId });
    const findCategory = await Category.findOne({ _id: findProduct.category });
    if (findCategory.categoryOffer > percentage) {
      return res.json({
        status: false,
        message: "This product category already has a category offer",
      });
    }
    findProduct.salePrice = Math.floor(
      findProduct.regularPrice - findProduct.regularPrice * (percentage / 100)
    );
    findProduct.productOffer = parseInt(percentage);
    await findProduct.save();
    findCategory.categoryOffer = 0;
    await findCategory.save();
    return res.json({ status: true });
  } catch (error) {
    res.redirect("/pageerror");
  }
};

const removeProductOffer = async (req, res) => {
  try {
    const { productId } = req.body;
    const findProduct = await Product.findOne({ _id: productId });
    const percentage = findProduct.productOffer;
    findProduct.salePrice = Math.floor(
      findProduct.regularPrice - findProduct.regularPrice * (percentage / 100)
    );
    findProduct.productOffer = 0;
    await findProduct.save();
    return res.json({ status: true });
  } catch (error) {
    res.redirect("/pageerror");
  }
};

const blockProduct = async (req, res) => {
  try {
    let productId = req.query.id;
    await Product.updateOne({ _id: productId }, { $set: { isBlocked: true } });
    res.redirect("/admin/products");
  } catch (error) {
    res.redirect("/pageerror");
  }
};

const unblockProduct = async (req, res) => {
  try {
    let productId = req.query.id;
    await Product.updateOne({ _id: productId }, { $set: { isBlocked: false } });
    res.redirect("/admin/products");
  } catch (error) {
    res.redirect("/pageerror");
  }
};

const getEditProduct = async (req, res) => {
  try {
    const productId = req.query.id;

    const product = await Product.findById(productId);
    console.log("Fetched product:", product);

    const category = await Category.find();
    const brand = await Brand.find();
    product.variants = Object.fromEntries(product.variants);
    console.log("product images ", product.productImages);
    res.render("editproduct", {
      cat: category,
      product: product,
      brand: brand,
    });
  } catch (error) {
    console.log("Edit Product Error:", error);
    res.redirect("/admin/pageerror");
  }
};

const editProduct = async (req, res) => {
  try {
    const productId = req.params.id;

    console.log("=== EDIT PRODUCT DEBUG ===");
    console.log("Product ID:", productId);
    console.log("Request body keys:", Object.keys(req.body));
    console.log("Deleted Images:", req.body.deletedImages);
    console.log(
      "Cropped Images count:",
      Array.isArray(req.body.croppedImages)
        ? req.body.croppedImages.length
        : "Not array or undefined"
    );
    console.log("Regular uploaded files:", req.files ? req.files.length : 0);

    const {
      productName,
      category,
      brand,
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
      description,
      longDescription,
      specifications,
      deletedImages = [], // Array of image indices to delete
      croppedImages = [], // Array of base64 cropped images
    } = req.body;

    // Find existing product
    const existingProduct = await Product.findById(productId);
    if (!existingProduct) {
      return res
        .status(StatusCode.NOT_FOUND)
        .json({ success: false, message: "Product not found" });
    }

    console.log(
      "Existing product images count:",
      existingProduct.productImages?.length || 0
    );

    if (
      !productName ||
      !category ||
      !regularPrice ||
      !salePrice ||
      !color ||
      !description ||
      !longDescription ||
      !specifications
    ) {
      return res
        .status(StatusCode.BAD_REQUEST)
        .json({
          success: false,
          message: "All required fields must be filled",
        });
    }

    const regPrice = parseFloat(regularPrice);
    const salPrice = parseFloat(salePrice);

    if (regPrice <= 0 || salPrice <= 0) {
      return res
        .status(StatusCode.BAD_REQUEST)
        .json({ success: false, message: "Prices must be greater than 0" });
    }
    if (salPrice >= regPrice) {
      return res
        .status(StatusCode.BAD_REQUEST)
        .json({
          success: false,
          message: "Sale price must be less than regular price",
        });
    }

    // Handle variants
    const quantities = {
      XS: parseInt(quantity_xs) || 0,
      S: parseInt(quantity_s) || 0,
      M: parseInt(quantity_m) || 0,
      L: parseInt(quantity_l) || 0,
      XL: parseInt(quantity_xl) || 0,
      XXL: parseInt(quantity_xxl) || 0,
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
      return res
        .status(StatusCode.BAD_REQUEST)
        .json({
          success: false,
          message: "At least one size quantity must be specified",
        });
    }

    // Handle image operations
    let finalImages = [...existingProduct.productImages];
    console.log("Initial final images count:", finalImages.length);

    // Delete specified images
    const deletedIndices = Array.isArray(deletedImages)
      ? deletedImages.map((idx) => parseInt(idx))
      : typeof deletedImages === "string"
      ? [parseInt(deletedImages)]
      : [];

    console.log("Processed deleted indices:", deletedIndices);

    // Remove deleted images (reverse sort to maintain indices)
    for (const index of deletedIndices.sort((a, b) => b - a)) {
      if (index >= 0 && index < finalImages.length) {
        // Delete file from server - handle both path formats
        const imageToDelete = finalImages[index];
        const imagePath = imageToDelete.startsWith("/uploads/")
          ? path.join("public", imageToDelete)
          : path.join("public/uploads/product-images/", imageToDelete);

        try {
          await fs.unlink(imagePath);
          console.log("Deleted image file:", imageToDelete);
        } catch (err) {
          console.warn("Could not delete image:", imageToDelete, err.message);
        }
        finalImages.splice(index, 1);
      }
    }

    console.log("Final images after deletion:", finalImages.length);

    const newImagePaths = [];

    // Process cropped images (base64 data)
    if (croppedImages && croppedImages.length > 0) {
      try {
        // Handle both array and single image cases
        const croppedImagesArray = Array.isArray(croppedImages)
          ? croppedImages
          : [croppedImages];
        console.log("Processing cropped images:", croppedImagesArray.length);

        for (let i = 0; i < croppedImagesArray.length; i++) {
          const base64Data = croppedImagesArray[i];

          if (base64Data && base64Data.startsWith("data:image/")) {
            try {
              // Extract base64 data
              const base64Content = base64Data.replace(
                /^data:image\/\w+;base64,/,
                ""
              );
              const buffer = Buffer.from(base64Content, "base64");

              // Extract format from base64 data
              const formatMatch = base64Data.match(/^data:image\/(\w+);base64,/);
              const format = formatMatch ? formatMatch[1] : 'jpg';

              // Generate unique filename with correct extension
              const timestamp = Date.now();
              const random = Math.random().toString(36).substring(2, 15);
              const filename = `product-${timestamp}-${random}-${i}.${format}`;
              const filePath = path.join(
                "public/uploads/product-images/",
                filename
              );

              const uploadDir = path.join("public/uploads/product-images/");

              try {
                // Check if directory exists and create if it doesn't
                await fs.access(uploadDir);
              } catch (error) {
                // Directory doesn't exist, create it
                await fs.mkdir(uploadDir, { recursive: true });
                console.log("Created upload directory:", uploadDir);
              }

              await fs.writeFile(filePath, buffer);

              // Add to new images array with consistent path format
              const imagePath = `/uploads/product-images/${filename}`;
              newImagePaths.push(imagePath);

              console.log(
                `Successfully processed cropped image ${i + 1}:`,
                filename,
                "Size:",
                buffer.length,
                "bytes"
              );
            } catch (error) {
              console.error(`Error processing cropped image ${i}:`, error);
              // Continue with other images instead of failing completely
            }
          } else {
            console.warn(
              `Invalid base64 data for cropped image ${i}:`,
              base64Data
                ? base64Data.substring(0, 50) + "..."
                : "null/undefined"
            );
          }
        }
      } catch (error) {
        console.error("Error processing cropped images array:", error);
      }
    } else {
      console.log("No cropped images to process");
    }

    console.log("New cropped image paths:", newImagePaths);

    // Add regular uploaded files (if any)
    if (req.files && req.files.length > 0) {
      const regularImagePaths = req.files.map(
        (file) => `/uploads/product-images/${file.filename}`
      );
      newImagePaths.push(...regularImagePaths);
      console.log("Added regular uploaded files:", regularImagePaths.length);
    }

    // Add new images to final array
    finalImages.push(...newImagePaths);
    console.log("Final total images:", finalImages.length);

    // Validate image count (4-10 images required)
    if (finalImages.length < 4 || finalImages.length > 10) {
      console.error("Invalid image count:", finalImages.length);
      return res.status(StatusCode.BAD_REQUEST).json({
        success: false,
        message: `Product must have between 4-10 images. Current: ${finalImages.length}`,
      });
    }


    const status = totalQuantity > 0 ? "Available" : "out of stock";

    // Update product
    const updatedProduct = await Product.findByIdAndUpdate(
      productId,
      {
        productName: productName.trim(),
        category,
        brand: brand || null,
        regularPrice: regPrice,
        salePrice: salPrice,
        color: color.trim(),
        material: material ? material.trim() : null,
        design: design ? design.trim() : null,
        occasion: occasion ? occasion.trim() : null,
        variants,
        size: sizeArray,
        description: description.trim(),
        longDescription: longDescription.trim(),
        specifications: specifications.trim(),
        productImages: finalImages,
        status,
        updatedAt: new Date(),
      },
      { new: true, runValidators: true }
    );

    if (!updatedProduct) {
      return res
        .status(StatusCode.INTERNAL_SERVER_ERROR)
        .json({ success: false, message: "Failed to update product" });
    }

    console.log(
      "Product updated successfully. Final image count:",
      updatedProduct.productImages.length
    );
    console.log("=== END EDIT PRODUCT DEBUG ===");

    return res.redirect("/admin/products");
  } catch (error) {
    console.error("Error updating product:", error);

    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res
        .status(StatusCode.BAD_REQUEST)
        .json({ success: false, message: messages.join(", ") });
    }

    if (error.name === "CastError") {
      return res
        .status(StatusCode.BAD_REQUEST)
        .json({ success: false, message: "Invalid product ID format" });
    }

    res
      .status(StatusCode.INTERNAL_SERVER_ERROR)
      .json({
        success: false,
        message: "Error updating product: " + error.message,
      });
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
