const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Brand = require("../../models/brandSchema");
const User = require("../../models/userSchema");
const Address = require("../../models/addressSchema");
const Order = require("../../models/orderSchema");
const Wallet = require("../../models/walletSchema");
const Coupon = require("../../models/coupenSchema");
const { StatusCode } = require("../../config/statuscode");

const { v4: uuidv4 } = require("uuid");

const getAllOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;

    const searchTerm = req.query.search || "";

    // Base query to exclude failed orders
    const baseQuery = {
      status: { $nin: ["payment_failed"] }
    };

    const searchQuery = searchTerm
      ? {
          ...baseQuery,
          $or: [
            { "user.name": { $regex: searchTerm, $options: "i" } },
            { orderId: { $regex: searchTerm, $options: "i" } },
            {
              "orderedItems.product.name": {
                $regex: searchTerm,
                $options: "i",
              },
            },
          ],
        }
      : baseQuery;

    const [orders, totalOrders] = await Promise.all([
      Order.find(searchQuery)
        .populate("user")
        .populate("orderedItems.product")
        .sort({ createdOn: -1 })
        .skip(skip)
        .limit(limit),
      Order.countDocuments(searchQuery),
    ]);

    console.log(orders);

    const totalPages = Math.ceil(totalOrders / limit);

    res.render("orderList", {
      orders,
      currentPage: page,
      totalPages,
      searchTerm,
    });
  } catch (err) {
    console.error("Order fetching error:", err);
    res.status(StatusCode.INTERNAL_SERVER_ERROR).send("Error fetching orders");
  }
};

const updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    // Get the current order
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(StatusCode.NOT_FOUND).send("Order not found");
    }

    const newStatus = status.toLowerCase();
    const updateFields = { status: newStatus };

    // Set delivery date if status is delivered
    if (newStatus === "delivered") {
      updateFields.deliveredOn = new Date();
    }

    // Update the order status
    await Order.findByIdAndUpdate(orderId, updateFields);

    // For single product orders, automatically sync the product status
    if (order.orderedItems.length === 1) {
      const productUpdateFields = {
        "orderedItems.0.status": newStatus
      };

      // Set product delivery date if delivered
      if (newStatus === "delivered") {
        productUpdateFields["orderedItems.0.deliveredOn"] = new Date();
      }

      await Order.findByIdAndUpdate(orderId, { $set: productUpdateFields });
    }

    res.redirect("/admin/orderList");
  } catch (err) {
    console.error("Status update error:", err);
    res
      .status(StatusCode.INTERNAL_SERVER_ERROR)
      .send("Failed to update status");
  }
};

const viewOrderDetails = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId).populate(
      "orderedItems.product"
    );

    if (!order) {
      return res
        .status(StatusCode.NOT_FOUND)
        .render("errorPage", { message: "Order not found" });
    }

    // Prevent access to payment failed orders
    if (order.status.toLowerCase() === "payment_failed") {
      return res
        .status(StatusCode.NOT_FOUND)
        .render("errorPage", { message: "Order not found" });
    }

    res.render("orderDetails", { order });
  } catch (error) {
    console.error("Error fetching order details:", error);
    res
      .status(StatusCode.INTERNAL_SERVER_ERROR)
      .render("pageerror", { message: "Something went wrong!" });
  }
};

// Helper function to determine overall order status based on item statuses
const calculateOverallOrderStatus = (orderedItems) => {
  const statuses = orderedItems.map(item => item.status.toLowerCase());

  // If all items are delivered, order is delivered
  if (statuses.every(status => status === 'delivered')) {
    return 'delivered';
  }

  // If all items are cancelled, order is cancelled
  if (statuses.every(status => status === 'cancelled')) {
    return 'cancelled';
  }

  // If any item is out for delivery, order is out for delivery
  if (statuses.some(status => status === 'out_for_delivery')) {
    return 'out_for_delivery';
  }

  // If any item is shipped, order is shipped
  if (statuses.some(status => status === 'shipped')) {
    return 'shipped';
  }

  // If any item is processing, order is processing
  if (statuses.some(status => status === 'processing')) {
    return 'processing';
  }

  // Default to processing
  return 'processing';
};

const updateOrderItemStatus = async (req, res) => {
  try {
    const { orderId, productId, status } = req.body;

    // Get the current order
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(StatusCode.NOT_FOUND).send("Order not found");
    }

    const updateFields = {
      "orderedItems.$[elem].status": status.toLowerCase(),
    };

    if (status.toLowerCase() === "delivered") {
      updateFields["orderedItems.$[elem].deliveredOn"] = new Date();
    }

    // Update the specific item status
    const result = await Order.updateOne(
      { _id: orderId, "orderedItems.product": productId },
      { $set: updateFields },
      { arrayFilters: [{ "elem.product": productId }] }
    );

    if (result.modifiedCount === 0) {
      return res
        .status(StatusCode.NOT_FOUND)
        .send("Order item not found or status not updated.");
    }

    // Get updated order to calculate new overall status
    const updatedOrder = await Order.findById(orderId);

    // For multi-product orders, automatically update overall order status
    if (updatedOrder.orderedItems.length > 1) {
      const newOverallStatus = calculateOverallOrderStatus(updatedOrder.orderedItems);

      // Update overall order status if it changed
      if (newOverallStatus !== updatedOrder.status.toLowerCase()) {
        await Order.findByIdAndUpdate(orderId, {
          status: newOverallStatus,
          ...(newOverallStatus === 'delivered' && { deliveredOn: new Date() })
        });
      }
    }

    res.redirect("back");
  } catch (error) {
    console.error("Error updating item status:", error);
    res
      .status(StatusCode.INTERNAL_SERVER_ERROR)
      .send("Server error while updating item status.");
  }
};

const getAllReturnRequests = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;

    const filter = {
      // Exclude payment failed orders from return requests
      status: { $nin: ["payment_failed"] },
      $or: [
        { status: "return request" },
        { "orderedItems.status": "return request" },
      ],
    };

    const totalOrders = await Order.countDocuments(filter);
    const totalPages = Math.ceil(totalOrders / limit);

    const orders = await Order.find(filter)
      .populate("user")
      .populate("orderedItems.product")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.render("returnRequestDetails", {
      orders,
      currentPage: page,
      totalPages,
    });
  } catch (err) {
    console.error("Error fetching return requests:", err);
    res.redirect("/pageerror");
  }
};

const approveReturnItem = async (req, res) => {
  const { orderId, itemId } = req.params;
  try {
    const order = await Order.findById(orderId);
    if (!order) return res.status(StatusCode.NOT_FOUND).send("Order not found");

    const item = order.orderedItems.id(itemId);
    if (!item || item.status !== "return request") {
      return res
        .status(StatusCode.BAD_REQUEST)
        .send("Item not found or not in return request status");
    }

    item.status = "return approved";

    const allReturned = order.orderedItems.every(
      (i) => i.status === "return approved"
    );

    const currentItemRefundAmount = item.price * item.quantity;
    let refundAmount = currentItemRefundAmount;

    if (allReturned) {
      order.status = "return approved";
      refundAmount = Number(order.finalAmount) - Number(order.deliveryCharge || 0);
    } else {
      const activeItems = order.orderedItems.filter(
        (i) =>
          i.status !== "cancelled" &&
          i.status !== "return approved" &&
          i.status !== "return request"
      );

      if (activeItems.length > 0) {
        const remainingItemsPrice = activeItems.reduce(
          (sum, i) => sum + i.price * i.quantity,
          0
        );

        let couponValid = false;

        if (order.coupon) {
          const coupon = await Coupon.findById(order.coupon);

          if (coupon) {
            if (remainingItemsPrice >= coupon.price) {
              couponValid = true;
            } else {
              couponValid = false;
            }
          }
        }

        if (couponValid) {
          refundAmount = currentItemRefundAmount;
        } else {
          refundAmount = order.finalAmount - remainingItemsPrice;
        }
      }
    }

    // Update product inventory
    const productId = item.product;
    const variant = item.variant.size;

    console.log(variant);
    console.log(productId);

    const quantity = item.quantity;
    const product = await Product.findById(productId);
    if (product) {
      const updatedProduct = await Product.findByIdAndUpdate(
        productId,
        { $inc: { [`variants.${variant}`]: quantity } },
        { new: true }
      );

      if (!updatedProduct) {
        console.error("Stock update failed.");
      } else {
        const remainingStock = updatedProduct.variants.get(variant);
        console.log(
          `Stock updated for size ${variant}. Remaining: ${remainingStock}`
        );
      }
    }

    // Process refund to wallet
    const existingWalletEntry = await Wallet.findOne({
      userId: order.user,
      orderId: order._id,
      type: "refund",
      entryType: "CREDIT",
      itemId: itemId,
    });

    if (!existingWalletEntry) {
      const walletEntry = new Wallet({
        userId: order.user,
        orderId: order._id,
        itemId: itemId,
        transactionId: uuidv4(),
        payment_type: "refund",
        amount: refundAmount,
        status: "success",
        entryType: "CREDIT",
        type: "refund",
      });
      await walletEntry.save();

      order.refundAmount += refundAmount;
    }

    await order.save();
    res.redirect("/admin/returnRequests");
  } catch (err) {
    console.error(err);
    res.status(StatusCode.INTERNAL_SERVER_ERROR).send("Server Error");
  }
};

const rejectReturnItem = async (req, res) => {
  const { orderId, itemId } = req.params;

  try {
    const order = await Order.findById(orderId);
    if (!order) return res.status(StatusCode.NOT_FOUND).send("Order not found");

    const item = order.orderedItems.id(itemId);
    if (!item || item.status !== "return request") {
      return res
        .status(StatusCode.BAD_REQUEST)
        .send("Item not found or not in return request status");
    }

    item.status = "return rejected";
    await order.save();

    res.redirect("/admin/returnRequests");
  } catch (err) {
    console.error(err);
    res.status(StatusCode.INTERNAL_SERVER_ERROR).send("Server Error");
  }
};

module.exports = {
  getAllOrders,
  updateOrderStatus,
  viewOrderDetails,
  updateOrderItemStatus,
  getAllReturnRequests,
  approveReturnItem,
  rejectReturnItem,
  calculateOverallOrderStatus
};
