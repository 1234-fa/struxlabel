const User = require("../../models/userSchema");
const { StatusCode } = require("../../config/statuscode");

const customerInfo = async (req, res) => {
  try {
    let search = req.query.search || "";
    let page = parseInt(req.query.page) || 1;
    const limit = 10;

    const userData = await User.find({
      isAdmin: false,
      $or: [
        { name: { $regex: ".*" + search + ".*", $options: "i" } },
        { email: { $regex: ".*" + search + ".*", $options: "i" } },
      ],
    })
      .sort({ createdOn: -1 }) // Sort by creation date, latest first
      .limit(limit)
      .skip((page - 1) * limit)
      .exec();

    const count = await User.countDocuments({
      isAdmin: false,
      $or: [
        { name: { $regex: ".*" + search + ".*", $options: "i" } },
        { email: { $regex: ".*" + search + ".*", $options: "i" } },
      ],
    });

    const totalPages = Math.ceil(count / limit);

    res.render("customers", {
      data: userData,
      totalPages,
      currentPage: page
    });
  } catch (error) {
    console.error("Error fetching customer data:", error);
    res.status(StatusCode.INTERNAL_SERVER_ERROR).send("Internal Server Error");
  }
};

// AJAX-based block user function
const blockUserAjax = async (req, res) => {
  try {
    const userId = req.body.userId || req.query.id;

    // Validate user ID
    if (!userId) {
      console.error("Block user error: User ID is required");
      return res.status(400).json({
        success: false,
        message: "User ID is required"
      });
    }

    // Find user first to get details for logging
    const user = await User.findById(userId);
    if (!user) {
      console.error("Block user error: User not found with ID:", userId);
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Check if user is already blocked
    if (user.isBlocked) {
      console.log("Block user warning: User already blocked -", user.email);
      return res.status(400).json({
        success: false,
        message: "User is already blocked"
      });
    }

    // Block the user
    await User.updateOne({ _id: userId }, { $set: { isBlocked: true } });

    console.log(`User blocked successfully: ${user.name} (${user.email}) - ID: ${userId}`);
    res.json({
      success: true,
      message: "User blocked successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        isBlocked: true
      }
    });

  } catch (error) {
    console.error("Error blocking user:", error);
    res.status(500).json({
      success: false,
      message: "Error blocking user. Please try again."
    });
  }
};

// AJAX-based unblock user function
const unblockUserAjax = async (req, res) => {
  try {
    const userId = req.body.userId || req.query.id;

    // Validate user ID
    if (!userId) {
      console.error("Unblock user error: User ID is required");
      return res.status(400).json({
        success: false,
        message: "User ID is required"
      });
    }

    // Find user first to get details for logging
    const user = await User.findById(userId);
    if (!user) {
      console.error("Unblock user error: User not found with ID:", userId);
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Check if user is already unblocked
    if (!user.isBlocked) {
      console.log("Unblock user warning: User already active -", user.email);
      return res.status(400).json({
        success: false,
        message: "User is already active"
      });
    }

    // Unblock the user
    await User.updateOne({ _id: userId }, { $set: { isBlocked: false } });

    console.log(`User unblocked successfully: ${user.name} (${user.email}) - ID: ${userId}`);
    res.json({
      success: true,
      message: "User unblocked successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        isBlocked: false
      }
    });

  } catch (error) {
    console.error("Error unblocking user:", error);
    res.status(500).json({
      success: false,
      message: "Error unblocking user. Please try again."
    });
  }
};

module.exports = { 
  customerInfo, 
  blockUserAjax,
  unblockUserAjax
};
