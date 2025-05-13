const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Brand = require("../../models/brandSchema");
const User = require("../../models/userSchema");
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');
const Wallet = require('../../models/walletSchema');
const Coupon = require('../../models/coupenSchema');
const moment = require('moment');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

// Load dashboard
const loaddashboard = async (req, res) => {
    try {
      let { startDate, endDate, filter, search, page = 1 } = req.query;
      const limit = 20; 
      const skip = (page - 1) * limit;
  
      if (filter) {
        const today = moment().startOf('day');
        if (filter === 'day') {
          startDate = today.toDate();
          endDate = moment(today).endOf('day').toDate();
        } else if (filter === 'week') {
          startDate = moment().subtract(7, 'days').startOf('day').toDate();
          endDate = moment().endOf('day').toDate();
        } else if (filter === 'month') {
          startDate = moment().subtract(30, 'days').startOf('day').toDate();
          endDate = moment().endOf('day').toDate();
        }
      }
  
      const query = {};
      if (startDate && endDate) {
        query.createdAt = {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        };
      }
  
      if (search) {
        query.orderId = { $regex: search, $options: 'i' };
      }
  
      const totalOrders = await Order.countDocuments(query);
      const orders = await Order.find(query)
        .populate('coupon')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
  
      let totalSales = 0, totalDiscount = 0, totalCoupon = 0;
      orders.forEach(order => {

        totalSales += order.finalAmount;
        totalDiscount += order.discount;
        if (order.coupon && order.coupon.discount) {
          totalCoupon += (order.totalPrice * order.coupon.discount) / 100;
        }
      });
  
      res.render('dashboard', {
        orders,
        totalSales,
        totalDiscount,
        totalCoupon,
        startDate,
        endDate,
        filter,
        search,
        currentPage: Number(page),
        totalPages: Math.ceil(totalOrders / limit)
      });
  
    } catch (err) {
      console.error(err);
      res.status(500).send("Error generating sales report");
    }
  };



  const downloadSalesReport = async (req, res) => {
    try {
      const { format, startDate, endDate } = req.body;
  
      // Validate dates
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({ error: 'Invalid start or end date' });
      }
  
      const query = {
        createdAt: {
          $gte: start,
          $lte: end
        }
      };
  
      const orders = await Order.find(query).populate('coupon');
  
      if (format === 'excel') {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Sales Report');
  
        sheet.columns = [
          { header: 'Order ID', key: 'orderId', width: 30 },
          { header: 'Date', key: 'date', width: 20 },
          { header: 'Final Amount', key: 'finalAmount', width: 15 },
          { header: 'Discount', key: 'discount', width: 15 },
          { header: 'Coupon Discount', key: 'coupon', width: 15 }
        ];
  
        orders.forEach(order => {
          sheet.addRow({
            orderId: order.orderId,
            date: order.createdAt.toDateString(),
            finalAmount: order.finalAmount,
            discount: order.discount,
            coupon: order.coupon ? `${order.coupon.discount}%` : 'N/A'
          });
        });
  
        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader('Content-Disposition', 'attachment; filename=sales-report.xlsx');
  
        await workbook.xlsx.write(res);
        res.end();
      } else if (format === 'pdf') {
        const doc = new PDFDocument();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=sales-report.pdf');
  
        doc.pipe(res);
        doc.fontSize(16).text('Sales Report', { align: 'center' });
        doc.moveDown();
  
        orders.forEach(order => {
          doc.fontSize(12).text(`Order ID: ${order.orderId}`);
          doc.text(`Date: ${order.createdAt.toDateString()}`);
          doc.text(`Final Amount: ₹${order.finalAmount}`);
          doc.text(`Discount: ₹${order.discount}`);
          doc.text(`Coupon: ${order.coupon ? order.coupon.code : 'N/A'}`);
          doc.moveDown();
        });
  
        doc.end();
      }
    } catch (error) {
      console.error("Error generating report:", error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  };



module.exports ={loaddashboard,downloadSalesReport};