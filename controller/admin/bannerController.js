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

const getAddBannerPage=async (req,res)=>{
    try {
        res.render('addBanner');
    } catch (error) {
        res.redirect('/pageerror');
    }
}

const addBanner = async (req, res) => {
    try {
      const data = req.body;
      const image = req.file;
  
      if (!image) {
        console.error("No image file uploaded");
        return res.redirect("/admin/pageerror");
      }
  
      const newBanner = new Banner({
        image: image.filename, 
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
      console.log("Deleting banner with ID:", id); // Debug log
  
      const result = await Banner.deleteOne({ _id: id });
      console.log("Delete result:", result);
  
      if (result.deletedCount === 0) {
        console.log("No banner found with that ID");
        return res.redirect("/admin/pageerror");
      }
  
      res.redirect("/admin/banner");
    } catch (error) {
      console.error("Error deleting banner:", error); // Show actual error
      res.redirect("/admin/pageerror");
    }
  };

module.exports = {
  getBannerPage,
  getAddBannerPage,
  addBanner,
  deleteBanner,
};