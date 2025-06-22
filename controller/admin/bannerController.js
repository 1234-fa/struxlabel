const Banner = require("../../models/bannerSchema");
const path = require("path");
const fs = require("fs");

const getBannerPage = async (req, res) => {
  try {
    const findBanner = await Banner.find({});
    res.render("banner", { data: findBanner });
  } catch (error) {
    res.redirect("/pageerror");
  }
};

const getAddBannerPage = async (req, res) => {
  try {
    res.render("addBanner");
  } catch (error) {
    res.redirect("/pageerror");
  }
};

const addBanner = async (req, res) => {
  try {
    const data = req.body;
    const image = req.file;
    let imageName = null;

    // Handle cropped image data (base64)
    if (data.croppedImage && data.croppedImage.startsWith("data:image/")) {
      try {
        // Extract format from base64 data
        const formatMatch = data.croppedImage.match(/^data:image\/(\w+);base64,/);
        const format = formatMatch ? formatMatch[1] : 'jpg';

        // Extract base64 content
        const base64Data = data.croppedImage.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");

        // Generate filename with correct extension
        const filename = `banner-${Date.now()}.${format}`;
        const filepath = path.join(__dirname, "../../public/uploads/product-images/", filename);

        // Ensure directory exists
        const uploadDir = path.dirname(filepath);
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }

        // Write file
        fs.writeFileSync(filepath, buffer);
        imageName = filename;

        console.log(`Cropped banner image saved: ${filename} (${format} format)`);
      } catch (error) {
        console.error("Error processing cropped banner image:", error);
        return res.redirect("/admin/pageerror");
      }
    }
    // Handle regular file upload
    else if (image) {
      imageName = image.filename;
      console.log(`Regular banner image uploaded: ${imageName}`);
    }
    else {
      console.error("No image file uploaded");
      return res.redirect("/admin/pageerror");
    }

    const newBanner = new Banner({
      image: imageName,
      title: data.title,
      description: data.description,
      startDate: new Date(data.startDate + "T00:00:00"),
      endDate: new Date(data.endDate + "T00:00:00"),
      link: data.link,
    });

    await newBanner.save();
    console.log("Banner saved:", newBanner);
    res.redirect("/admin/banner");
  } catch (error) {
    console.error("Error in addBanner:", error);
    res.redirect("/admin/pageerror");
  }
};

const deleteBanner = async (req, res) => {
  try {
    const id = req.query.id;
    console.log("Deleting banner with ID:", id); 

    const result = await Banner.deleteOne({ _id: id });
    console.log("Delete result:", result);

    if (result.deletedCount === 0) {
      console.log("No banner found with that ID");
      return res.redirect("/admin/pageerror");
    }
    res.redirect("/admin/banner");
  } catch (error) {
    console.error("Error deleting banner:", error); 
    res.redirect("/admin/pageerror");
  }
};

module.exports = {
  getBannerPage,
  getAddBannerPage,
  addBanner,
  deleteBanner,
};
