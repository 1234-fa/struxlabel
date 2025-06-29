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

    // Get messages from URL parameters
    const errorMessage = req.query.error || null;
    const successMessage = req.query.success || null;
    const warningMessage = req.query.warning || null;

    res.render("customers", {
      data: userData,
      totalPages,
      currentPage: page,
      errorMessage,
      successMessage,
      warningMessage
    });
  } catch (error) {
    console.error("Error fetching customer data:", error);
    res.status(StatusCode.INTERNAL_SERVER_ERROR).send("Internal Server Error");
  }
};

const customerBlocked = async (req, res) => {
  try {
    const userId = req.query.id;

    // Validate user ID
    if (!userId) {
      console.error("Block user error: User ID is required");
      return res.redirect("/admin/users?error=User ID is required");
    }

    // Find user first to get details for logging
    const user = await User.findById(userId);
    if (!user) {
      console.error("Block user error: User not found with ID:", userId);
      return res.redirect("/admin/users?error=User not found");
    }

    // Check if user is already blocked
    if (user.isBlocked) {
      console.log("Block user warning: User already blocked -", user.email);
      return res.redirect("/admin/users?warning=User is already blocked");
    }

    // Block the user
    await User.updateOne({ _id: userId }, { $set: { isBlocked: true } });

    console.log(`User blocked successfully: ${user.name} (${user.email}) - ID: ${userId}`);
    res.redirect("/admin/users?success=User blocked successfully");

  } catch (error) {
    console.error("Error blocking user:", error);
    res.redirect("/admin/users?error=Error blocking user. Please try again.");
  }
};

const cutomerunBlocked = async (req, res) => {
  try {
    const userId = req.query.id;

    // Validate user ID
    if (!userId) {
      console.error("Unblock user error: User ID is required");
      return res.redirect("/admin/users?error=User ID is required");
    }

    // Find user first to get details for logging
    const user = await User.findById(userId);
    if (!user) {
      console.error("Unblock user error: User not found with ID:", userId);
      return res.redirect("/admin/users?error=User not found");
    }

    // Check if user is already unblocked
    if (!user.isBlocked) {
      console.log("Unblock user warning: User already active -", user.email);
      return res.redirect("/admin/users?warning=User is already active");
    }

    // Unblock the user
    await User.updateOne({ _id: userId }, { $set: { isBlocked: false } });

    console.log(`User unblocked successfully: ${user.name} (${user.email}) - ID: ${userId}`);
    res.redirect("/admin/users?success=User unblocked successfully");

  } catch (error) {
    console.error("Error unblocking user:", error);
    res.redirect("/admin/users?error=Error unblocking user. Please try again.");
  }
};

module.exports = { customerInfo, customerBlocked, cutomerunBlocked };
