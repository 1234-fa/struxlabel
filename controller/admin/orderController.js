const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Brand = require("../../models/brandSchema");
const User = require("../../models/userSchema");
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');
const Wallet = require('../../models/walletSchema');
const Coupon = require('../../models/coupenSchema');
const { v4: uuidv4 } = require('uuid');

const getAllOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;  
    const limit = 5;  
    const skip = (page - 1) * limit;  

    const searchTerm = req.query.search || '';

    const searchQuery = searchTerm ? {
      $or: [
        { 'user.name': { $regex: searchTerm, $options: 'i' } },  
        { orderId: { $regex: searchTerm, $options: 'i' } },  
        { 'orderedItems.product.name': { $regex: searchTerm, $options: 'i' } }  
      ]
    } : {};

    const [orders, totalOrders] = await Promise.all([
      Order.find(searchQuery)  
        .populate('user')  
        .populate('orderedItems.product')  
        .sort({ createdOn: -1 })  
        .skip(skip)  
        .limit(limit),  
      Order.countDocuments(searchQuery)  
    ]);

    console.log(orders);  

    const totalPages = Math.ceil(totalOrders / limit);  

    res.render('orderList', {
      orders,
      currentPage: page,
      totalPages,
      searchTerm  
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


const viewOrderDetails =async (req,res)=>{
try {
      const { orderId } = req.params;
  
      const order = await Order.findById(orderId).populate('orderedItems.product');
  
      if (!order) {
        return res.status(404).render('errorPage', { message: 'Order not found' });
      }
  
      res.render('orderDetails', {order });
    } catch (error) {
      console.error('Error fetching order details:', error);
      res.status(500).render('errorPage', { message: 'Something went wrong!' });
    }
}

const updateOrderItemStatus = async (req, res) => {
  try {
    const { orderId, productId, status } = req.body;

    const updateFields = {
      "orderedItems.$[elem].status": status
    };

    if (status === "delivered") {
      updateFields.deliveredOn = new Date();
    }

    const result = await Order.updateOne(
      { _id: orderId, "orderedItems.product": productId },
      { $set: updateFields },
      { arrayFilters: [{ "elem.product": productId }] }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).send("Order item not found or status not updated.");
    }

    res.redirect("back");
  } catch (error) {
    console.error("Error updating item status:", error);
    res.status(500).send("Server error while updating item status.");
  }
};

const getAllReturnRequests = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;

    const filter = {
      $or: [
        { status: 'return request' },
        { 'orderedItems.status': 'return request' }
      ]
    };

    const totalOrders = await Order.countDocuments(filter);
    const totalPages = Math.ceil(totalOrders / limit);

    const orders = await Order.find(filter)
      .populate('user')
      .populate('orderedItems.product')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.render('returnRequestDetails', {
      orders,
      currentPage: page,
      totalPages
    });
  } catch (err) {
    console.error('Error fetching return requests:', err);
    res.redirect('/pagerror');
  }
};

const approveReturnItem = async (req, res) => {
  const { orderId, itemId } = req.params;
  try {
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).send('Order not found');
    
    const item = order.orderedItems.id(itemId);
    if (!item || item.status !== 'return request') {
      return res.status(400).send('Item not found or not in return request status');
    }
    
    // Update the item status to return approved
    item.status = 'return approved';
    
    // Check if all items are now return approved
    const allReturned = order.orderedItems.every(i => i.status === 'return approved');
    
    // Get the current item's refund amount
    const currentItemRefundAmount = item.price * item.quantity;
    let refundAmount = currentItemRefundAmount;
    
    if (allReturned) {
      // If all items are returned, refund the entire finalAmount
      order.status = 'return approved';
      refundAmount = order.finalAmount;
    } else {
      // Check remaining active items (not cancelled or return requested)
      const activeItems = order.orderedItems.filter(i => 
        i.status !== 'cancelled' && 
        i.status !== 'return approved' && 
        i.status !== 'return request'
      );
      
      if (activeItems.length > 0) {
        // Calculate total price of remaining active items
        const remainingItemsPrice = activeItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
        
        // Check if coupon is still valid for remaining items
        let couponValid = false;
        
        if (order.coupon) {
          // Retrieve coupon details
          const coupon = await Coupon.findById(order.coupon);
          
          if (coupon) {
            if(remainingItemsPrice >=coupon.price){
              couponValid =true;
            }else {
              couponValid = false;
            }
          }
        }
        
        if (couponValid) {
          
          refundAmount = currentItemRefundAmount;
        } else {
          refundAmount = order.finalAmount-remainingItemsPrice
        }
      }
    }
    
    // Update product inventory
    const productId = item.product;
    const quantityToAdd = item.quantity;
    const product = await Product.findById(productId);
    if (product) {
      product.quantity += quantityToAdd;
      await product.save();
    }
    
    // Process refund to wallet
    const existingWalletEntry = await Wallet.findOne({
      userId: order.user,
      orderId: order._id,
      type: 'refund',
      entryType: 'CREDIT',
      itemId: itemId // Add itemId to make it specific to this item
    });
    
    if (!existingWalletEntry) {
      const walletEntry = new Wallet({
        userId: order.user,
        orderId: order._id,
        itemId: itemId, // Add itemId reference
        transactionId: uuidv4(),
        payment_type: 'refund',
        amount: refundAmount,
        status: 'success',
        entryType: 'CREDIT',
        type: 'refund',
      });
      await walletEntry.save();
      
      // Update refundAmount in the order
      order.refundAmount += refundAmount;
    }
    
    await order.save();
    res.redirect('/admin/returnRequests');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};

const rejectReturnItem = async (req, res) => {
  const { orderId, itemId } = req.params;

  try {
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).send('Order not found');

    const item = order.orderedItems.id(itemId);
    if (!item || item.status !== 'return request') {
      return res.status(400).send('Item not found or not in return request status');
    }

    item.status = 'return rejected'; 
    await order.save();

    res.redirect('/admin/returnRequests');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};

module.exports = {
  getAllOrders,
  updateOrderStatus,
  viewOrderDetails,
  updateOrderItemStatus,
  getAllReturnRequests,
  approveReturnItem,
  rejectReturnItem
};