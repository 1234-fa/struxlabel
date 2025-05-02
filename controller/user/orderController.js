const User = require('../../models/userSchema');
const Cart = require('../../models/cartSchema');
const Product = require('../../models/productSchema')
const Address = require('../../models/addressSchema')
const Order = require('../../models/orderSchema');
const mongoose = require("mongoose");
const { v4: uuidv4 } = require('uuid');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const generateOrderId = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let orderId = '';
  for (let i = 0; i < 10; i++) {
    orderId += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return orderId;
};


const generateInvoice = async (orderId) => {
  try {
    const order = await Order.findById(orderId).populate('orderedItems.product');

    if (!order) {
      throw new Error('Order not found');
    }

    const doc = new PDFDocument();

    // Define the file path for the invoice PDF
    const invoicePath = path.join(__dirname, `../invoices/invoice_${orderId}.pdf`);

    // Pipe the document to a file
    doc.pipe(fs.createWriteStream(invoicePath));

    // Add content to the PDF
    doc.fontSize(16).text('Invoice', { align: 'center' });
    doc.moveDown();

    doc.fontSize(12).text(`Order ID: ${order._id}`);
    doc.text(`Order Date: ${order.createdAt.toDateString()}`);
    doc.moveDown();

    doc.text(`Customer: ${order.customerName}`);
    doc.text(`Email: ${order.customerEmail}`);
    doc.moveDown();

    // Add ordered items
    doc.text('Items:');
    order.orderedItems.forEach(item => {
      doc.text(`${item.product.name} (Quantity: ${item.quantity}) - Price: ₹${item.product.salePrice * item.quantity}`);
    });
    doc.moveDown();

    // Add total amount
    const totalAmount = order.orderedItems.reduce((total, item) => total + item.product.salePrice * item.quantity, 0);
    doc.text(`Total Amount: ₹${totalAmount}`);
    doc.moveDown();

    // Finalize the document
    doc.end();


    // Return the path of the generated invoice
    return invoicePath;
  } catch (error) {
    console.error('Error generating invoice:', error);
    throw error;
  }
};


const getOrderPage = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) return res.redirect('/login');

    const user = await User.findById(userId);
    if (!user) return res.redirect('/login');

    const cart = await Cart.findOne({ userId }).populate('items.productId');

    let cartItems = [];
    let total = 0;

    if (cart && cart.items && cart.items.length > 0) {
      cartItems = cart.items.map(item => {
        const product = item.productId;
        const quantity = item.quantity;
        const totalPrice = product ? product.salePrice * quantity : 0;

        total += totalPrice;

        return {
          product,
          quantity,
          totalPrice
        };
      });
    }

    const userAddress = await Address.findOne({ userId });
      const addresses = userAddress ? userAddress.address : [];

    res.render('ordercart', {
      cartItems,
      totalAmount: total,
      user,
      addresses,
      isLoggedIn: true
    });

  } catch (error) {
    console.error("Error loading order page:", error.message);
    res.redirect('/pageNotFound');
  }
};


const getSingleOrderPage = async (req, res) => {
    try {
      const userId = req.session.user;
      const productId = req.query.id;
  
      if (!userId) return res.redirect('/login');
      if (!productId) return res.redirect('/shop');
  
      const user = await User.findById(userId);
      if (!user) return res.redirect('/login');
  
      const product = await Product.findById(productId);
      if (!product) return res.redirect('/shop');
  
      const quantity = 1;
      const totalPrice = product.salePrice * quantity;
  
      const item = {
        product,
        quantity,
        totalPrice,
      };
  
      const userAddress = await Address.findOne({ userId });
      const addresses = userAddress ? userAddress.address : [];
  
      res.render('order', {
        item,
        user,
        addresses, 
        isLoggedIn: true,
      });
  
    } catch (error) {
      console.error("Error loading single product order page:", error.message);
      res.redirect('/pageNotFound');
    }
  };


const postPlaceOrder = async (req, res) => {
    try {
      const {
        productId,
        quantity,
        totalPrice,
        selected,
        paymentMethod,
      } = req.body;

      console.log('Received data:', req.body);

      const userId = req.session.user?._id;

      if (!userId) {
        return res.status(401).json({ message: 'User not logged in' });
      }

      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }

      const orderQty = Number(quantity);
      if (product.quantity < orderQty) {
        return res.status(400).json({ message: 'Insufficient stock available' });
        
      }

      // Ensure selected data is being passed correctly
      console.log('Selected Address:', selected);

      // Create an address object with only the required fields
      const address = {
        addressType: selected.addressType,
        name: selected.name,
        city: selected.city,
        landMark: selected.landMark,
        state: selected.state,
        pincode: selected.pincode,
        phone: selected.phone,
        altphone: selected.altphone,
      };

      const orderedItem = {
        product: product._id,
        quantity: orderQty,
        price: product.salePrice,
      };

      const newOrder = new Order({
        orderId: generateOrderId(),
        user: userId,
        orderedItems: [orderedItem],
        totalPrice: Number(totalPrice),
        finalAmount: Number(totalPrice),
        address: address, // Only passing the cleaned address object
        invoiceDate: new Date(),
        status: 'processing',
        createdOn: new Date(),
        coupenApplied: false,
        paymentMethod: paymentMethod,
      });

      // Save the order
      await newOrder.save();

      // Update product stock
      const updatedProduct = await Product.findByIdAndUpdate(
        productId,
        { $inc: { quantity: -orderQty } },
        { new: true }
      );

      if (!updatedProduct) {
        console.error('Stock update failed.');
      } else {
        console.log(`Stock updated. Remaining quantity: ${updatedProduct.quantity}`);
      }

      // Redirect to success page
      return res.redirect(`/order-success?orderId=${newOrder.orderId}`);
    } catch (error) {
      console.error('Error placing order:', error);
      return res.status(500).json({
        success: false,
        message: 'Something went wrong while placing the order',
      });
    }
  };
  


  const getPaymentPage = async (req, res) => {
    try {
      const { selectedAddress, productId, quantity, totalPrice } = req.body;
      const userId = req.session.user;
  
      if (!userId) return res.redirect('/login');

      console.log(selectedAddress);
      
      const addressDoc = await Address.findOne({ 'address._id': selectedAddress });
      let selected=null;
      if (addressDoc) {
         selected = addressDoc.address.find(addr => addr._id.toString() === selectedAddress.toString());
        
      } else {
        console.log("No address found.");
      }

      console.log(selected);
      const user = await User.findById(userId);
      const product = await Product.findById(productId);
  
      if (!product) return res.redirect('/shop');
  
      res.render('payment', {
        user,
        selected,
        orderSummary: {
          productId,
          quantity,
          total: totalPrice,
          productName: product.productName,
          productImages: product.productImages,
          price: product.salePrice,
          
        }
      });
    } catch (error) {
      console.error('Error in getPaymentPage:', error);
      res.status(500).send('Something went wrong');
    }
  };


  const orderSuccess = async (req, res) => {
    try {
      const orderId = req.query.orderId; 
      const order = await Order.findOne({ orderId })
        .populate('orderedItems.product')
        .populate('address');
  
      if (!order) {
        return res.status(404).json({ message: 'Order not found' });
      }
  
      res.render('order-success', { order });
    } catch (error) {
      console.error('Error fetching order details:', error);
      res.status(500).json({ message: 'Something went wrong' });
    }
  };


  const orderSuccessCart = async (req,res)=>{
    try {
        res.render('order-success-cart')
    } catch (error) {
        res.redirect('/pageNotFound');
    }
  }


  const viewOrders = async (req, res) => {
    try {
      const userId = req.session.user;
      console.log("Logged in user:", userId); 
  
      if (!userId) return res.redirect('/login');
  
      const orders = await Order.find({ user: userId })
        .sort({ createdAt: -1 })
        .populate('orderedItems.product');
  
      console.log('Fetched Orders:', orders); 
  
      res.render('vieworder', { orders, user: userId });
    } catch (error) {
      console.error('Error fetching orders:', error);
      res.status(500).send('Internal Server Error');
    }
  };


  const cancelOrder = async (req, res) => {
    try {
      const { orderId } = req.params;
      const { reason } = req.body;
  
      const order = await Order.findById(orderId).populate('orderedItems.product');
  
      if (!order) {
        return res.status(404).send('Order not found');
      }
  
      if (!['processing', 'placed','shipped'].includes(order.status.toLowerCase())) {
        return res.status(400).send('Order cannot be canceled at this stage');
      }
  
      for (let item of order.orderedItems) {
        await Product.findByIdAndUpdate(item.product._id, {
          $inc: { quantity: item.quantity }
        });
      }
  
      const cancelReason = typeof reason === 'string' ? reason : 'No reason provided';
  
      // Instead of deleting, update the order status and reason
      order.status = 'cancelled';
      order.cancelReason = cancelReason; 
      await order.save();

      console.log(orderId)
      res.render('cancel-order-successful', {
        order_id: order.orderId,
        reason: cancelReason
      });
  
    } catch (err) {
      console.error('Error cancelling order:', err);
      res.status(500).send('Server Error');
    }
  };



  const cancelProduct = async (req, res) => {
    try {
      const { orderId, productId } = req.params;
      const { reason } = req.body;
  
      const order = await Order.findById(orderId);
      if (!order || !order.orderedItems || !Array.isArray(order.orderedItems)) {
        return res.status(404).send('Order not found');
      }
  
      const item = order.orderedItems.find(
        i => i.product.toString() === productId
      );
  
  
      await Product.findByIdAndUpdate(productId, {
        $inc: { quantity: item.quantity }
      });
  
      item.status = 'cancelled';
      item.cancelReason = reason;
  
      const refundAmount = item.totalPrice || (item.price * item.quantity);
      order.totalPrice -= refundAmount;
      order.finalAmount -= refundAmount;
  
      const allCancelled = order.orderedItems.every(i => i.status === 'cancelled');
      if (allCancelled) {
        order.status = 'cancelled';
      }
  
      await order.save();
  
      res.render('cancel-product-success', {
        order_id: order.orderId,
        reason
      });
    } catch (err) {
      console.error(err);
      res.status(500).send('Server Error');
    }
  };
  
  const returnOrder = async (req, res) => {
    try {
      const { orderId } = req.params;
      const { reason } = req.body;
  
      if (!reason || reason.trim() === '') {
        return res.status(400).send('Return reason is required.');
      }

      const order = await Order.findById(orderId);
      if (!order || order.status !== 'delivered') {
        return res.status(400).send('Order cannot be returned.');
      }

      // Check if the order contains only one item and access the first item
      const item = order.orderedItems[0]; // Since there's only one item

      if (!item) {
        return res.status(404).send('Item not found in order');
      }

      // Update item status
      item.status = 'return request';
      item.returnReason = reason;
      
      order.status = 'return request';
      order.returnReason = reason;
      await order.save();


      res.render('returnRequested',{reason})
    } catch (err) {
      console.error(err);
      res.status(500).send('Server Error');
    }
  };

  const returnProduct = async (req, res) => {
    try {
      const { itemId } = req.params;
      const { reason } = req.body;
  
      // Find the order that contains this item
      const order = await Order.findOne({ 'orderedItems._id': itemId });
  
      if (!order) {
        return res.status(404).send('Order or item not found');
      }
  
      // Find the specific item
      const item = order.orderedItems.id(itemId);
  
      if (!item) {
        return res.status(404).send('Item not found in order');
      }
  
      // Update item status
      item.status = 'return request';
      item.returnReason = reason;
  
      await order.save();
  
      // Render the confirmation page
      res.render('returnRequested', {
        orderId: order.orderId,
        productId: item.product,
        reason
      });
  
    } catch (err) {
      console.error('Return request failed:', err);
      res.status(500).send('Server error');
    }
  };

  const loadPaymentPagecart = async (req, res) => {
    try {
      const userId = req.session.user._id;
  
      if (!userId) return res.redirect('/login');
  
      const user = await User.findById(userId);
      
      const cart = await Cart.findOne({ userId }).populate('items.productId');
      
      if (!cart || cart.items.length === 0) {
        return res.redirect("/cart");
      }
  
      const selectedAddressId = req.body.selectedAddressId || req.body.selectedAddress || "";
      let selected = null;
  
      if (selectedAddressId) {
        const addressDoc = await Address.findOne({ 'address._id': selectedAddressId });
        if (addressDoc) {
          selected = addressDoc.address.find(addr => addr._id.toString() === selectedAddressId.toString());
        }
      }
  
      const totalAmount = cart.items.reduce((acc, item) => {
        return acc + item.quantity * item.productId.salePrice;
      }, 0);
  
      res.render('paymentcart', {
        cartItems: cart.items,
        totalAmount,
        user,
        selected,
      });
  
    } catch (err) {
      console.error("Error loading payment page:", err);
      res.status(500).send("Internal Server Error");
    }
  };


  const placeOrderFromCart = async (req, res) => {
    try {
      const userId = req.session.user._id;
      const { selected, totalAmount, paymentMethod, cartItems } = req.body;
  
      if (!userId || !selected || !cartItems || cartItems.length === 0) {
        return res.redirect("/cart");
      }
  
      const cart = await Cart.findOne({ userId }).populate("items.productId");
  
      const orderedItems = cart.items.filter(item =>
        cartItems.includes(item._id.toString())
      );
  
      const orderItems = orderedItems.map(item => {
        const product = item.productId;
        const price = product.salePrice || product.price || 0;
        const quantity = item.quantity;
        const totalPrice = price * quantity;
        const status = "processing"
  
        const orderqty = Number(quantity);
        if (product.quantity < orderqty) {
          return res.status(400).json({ message: 'Insufficient stock available' });
        }
  
        return {
          product: product._id,
          quantity,
          price,
          totalPrice,
          status
        };
      });
  
      const calculatedTotal = orderItems.reduce((acc, item) => acc + item.totalPrice, 0);
      if (isNaN(calculatedTotal) || calculatedTotal <= 0) {
        return res.status(400).json({ message: 'Invalid order total' });
      }
  
  
      const address = {
        addressType: selected.addressType,
        name: selected.name,
        city: selected.city,
        landMark: selected.landMark,
        state: selected.state,
        pincode: selected.pincode,
        phone: selected.phone,
        altphone: selected.altphone,
      };
 
      const newOrder = new Order({
        user: userId,
        address: address, 
        paymentMethod,
        totalAmount: calculatedTotal,
        orderedItems: orderItems,
        status: "processing",
        orderId: generateOrderId(),
        createdOn: new Date(),
        discount: 0,
        finalAmount: calculatedTotal,
        coupenApplied: false
      });
  
      for (const item of orderItems) {
        if (!item.product || !item.quantity) {
          return res.status(400).json({ message: 'Order item data is incomplete' });
        }
      }
  
      await newOrder.save();
  
      for (const item of orderItems) {
        await Product.findByIdAndUpdate(
          item.product,
          { $inc: { stock: -item.quantity } },
          { new: true }
        );
      }
  
      cart.items = cart.items.filter(item => !cartItems.includes(item._id.toString()));
      await cart.save();
  
      res.redirect('/order-success-cart');
    } catch (error) {
      console.error("Error placing cart order:", error);
      if (!res.headersSent) {
        res.status(500).send("Something went wrong while placing your order.");
      }
    }
  };

  const viewOrderDetails = async (req, res) => {
    try {
      const userId = req.session.user;
      const { orderId } = req.params;
  
      if (!userId) {
        return res.redirect('/login');
      }
  
      const order = await Order.findById(orderId).populate('orderedItems.product');
  
      if (!order) {
        return res.status(404).render('errorPage', { message: 'Order not found' });
      }
  
      res.render('viewOrderDetail', { user: userId, order });
    } catch (error) {
      console.error('Error fetching order details:', error);
      res.status(500).render('errorPage', { message: 'Something went wrong!' });
    }
  };


  const downloadInvoice = async (req,res)=>{
    try {
      const { orderId } = req.params;
  
      const invoicePath = await generateInvoice(orderId);
  
      res.download(invoicePath, (err) => {
        if (err) {
          console.error('Error downloading the invoice:', err);
          res.status(500).send('Error downloading the invoice.');
        }
  
        fs.unlink(invoicePath, (unlinkErr) => {
          if (unlinkErr) {
            console.error('Error deleting the invoice file:', unlinkErr);
          }
        });
      });
    } catch (error) {
      console.error('Error generating or downloading invoice:', error);
      res.status(500).send('Error generating invoice.');
    }
  }



module.exports = {
  getOrderPage,
  getSingleOrderPage,
  postPlaceOrder,
  getPaymentPage,
  orderSuccess,
  viewOrders,
  cancelOrder,
  cancelProduct,
  returnOrder,
  returnProduct,
  loadPaymentPagecart,
  placeOrderFromCart,
  orderSuccessCart,
  downloadInvoice,
  viewOrderDetails
};