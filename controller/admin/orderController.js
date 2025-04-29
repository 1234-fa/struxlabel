const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Brand = require("../../models/brandSchema");
const User = require("../../models/userSchema");
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');

const getAllOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;  
    const limit = 5;  
    const skip = (page - 1) * limit;  

    // Get the search term from the query params
    const searchTerm = req.query.search || '';

    // Build the search query if there's a search term
    const searchQuery = searchTerm ? {
      $or: [
        { 'user.name': { $regex: searchTerm, $options: 'i' } },  // Search by user name
        { orderId: { $regex: searchTerm, $options: 'i' } },  // Search by Order ID
        { 'orderedItems.product.name': { $regex: searchTerm, $options: 'i' } }  // Search by product name
      ]
    } : {};

    // Fetch orders with the search query
    const [orders, totalOrders] = await Promise.all([
      Order.find(searchQuery)  // Apply the search filter
        .populate('user')  
        .populate('orderedItems.product')  
        .sort({ createdOn: -1 })  
        .skip(skip)  
        .limit(limit),  
      Order.countDocuments(searchQuery)  // Count total orders with the search filter
    ]);

    console.log(orders);  // Check the structure of orders

    const totalPages = Math.ceil(totalOrders / limit);  

    // Render the order list page with the search term
    res.render('orderList', {
      orders,
      currentPage: page,
      totalPages,
      searchTerm  // Pass the search term to the view for retaining the input value
    });
  } catch (err) {
    console.error("Order fetching error:", err);
    res.status(500).send('Error fetching orders');
  }
};

const updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    await Order.findByIdAndUpdate(orderId, { status: status.toLowerCase() });
    res.redirect('/admin/orderList');
  } catch (err) {
    console.error("Status update error:", err);
    res.status(500).send('Failed to update status');
  }
};

module.exports = {
  getAllOrders,
  updateOrderStatus,
};