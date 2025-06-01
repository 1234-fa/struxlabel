const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Brand = require("../../models/brandSchema");
const User = require("../../models/userSchema");
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');
const Wallet = require('../../models/walletSchema');
const Coupon = require('../../models/coupenSchema');
const mongoose = require('mongoose');
const moment = require('moment');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

async function getSalesData(filterType, selectedYear, selectedMonth) {
  let matchStage = {};
  let groupStage = {};
  let labels = [];

  switch (filterType) {
    case 'yearly':
      // Match orders from the last 5 years
      const fiveYearsAgo = new Date().getFullYear() - 4;
      matchStage = {
        createdOn: { 
          $gte: new Date(`${fiveYearsAgo}-01-01`),
          $lte: new Date(`${selectedYear}-12-31T23:59:59.999Z`) 
        },
        status: { $nin: ['cancelled', 'return approved', 'returned'] }
      };
      
      groupStage = {
        _id: { $year: "$createdOn" },
        totalSales: { $sum: "$finalAmount" },
        orderCount: { $sum: 1 }
      };
      
      // Generate labels for the last 5 years
      for (let year = fiveYearsAgo; year <= selectedYear; year++) {
        labels.push(year.toString());
      }
      break;
      
    case 'monthly':
      // Match orders from the selected year
      matchStage = {
        createdOn: { 
          $gte: new Date(`${selectedYear}-01-01`),
          $lte: new Date(`${selectedYear}-12-31T23:59:59.999Z`) 
        },
        status: { $nin: ['cancelled', 'return approved', 'returned'] }
      };
      
      groupStage = {
        _id: { $month: "$createdOn" },
        totalSales: { $sum: "$finalAmount" },
        orderCount: { $sum: 1 }
      };
      
      // Generate labels for all months
      labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      break;
      
    case 'daily':
      // Get the number of days in the selected month
      const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
      
      // Match orders from the selected month of the selected year
      matchStage = {
        createdOn: { 
          $gte: new Date(`${selectedYear}-${selectedMonth.toString().padStart(2, '0')}-01`),
          $lte: new Date(`${selectedYear}-${selectedMonth.toString().padStart(2, '0')}-${daysInMonth}T23:59:59.999Z`) 
        },
        status: { $nin: ['cancelled', 'return approved', 'returned'] }
      };
      
      groupStage = {
        _id: { $dayOfMonth: "$createdOn" },
        totalSales: { $sum: "$finalAmount" },
        orderCount: { $sum: 1 }
      };
      
      // Generate labels for all days in the month
      for (let i = 1; i <= daysInMonth; i++) {
        labels.push(i.toString());
      }
      break;
      
    default:
      throw new Error('Invalid filter type');
  }

  const salesData = await Order.aggregate([
    { $match: matchStage },
    { $group: groupStage },
    { $sort: { '_id': 1 } }
  ]);

  // Format the data for Chart.js
  const formattedData = {
    labels,
    salesData: Array(labels.length).fill(0),
    orderCounts: Array(labels.length).fill(0)
  };

  // Map the aggregated data to the appropriate indices
  salesData.forEach(item => {
    let index;
    if (filterType === 'yearly') {
      index = labels.indexOf(item._id.toString());
    } else if (filterType === 'monthly') {
      // Convert month number (1-12) to array index (0-11)
      index = item._id - 1;
    } else if (filterType === 'daily') {
      // Convert day number (1-31) to array index (0-30)
      index = item._id - 1;
    }
    
    if (index >= 0) {
      formattedData.salesData[index] = item.totalSales;
      formattedData.orderCounts[index] = item.orderCount;
    }
  });

  return formattedData;
}

async function getBestSellingProducts() {
  return Order.aggregate([
    // Only include orders that were not cancelled or returned
    { $match: { status: { $nin: ['cancelled', 'return approved', 'returned'] } } },
    // Unwind to get individual order items
    { $unwind: '$orderedItems' },
    // Group by product and sum quantities
    { $group: {
      _id: '$orderedItems.product',
      totalQuantity: { $sum: '$orderedItems.quantity' },
      totalRevenue: { $sum: { $multiply: ['$orderedItems.price', '$orderedItems.quantity'] } }
    }},
    // Sort by quantity sold in descending order
    { $sort: { totalQuantity: -1 } },
    // Limit to top 10
    { $limit: 10 },
    // Lookup product details
    { $lookup: {
      from: 'products',
      localField: '_id',
      foreignField: '_id',
      as: 'productDetails'
    }},
    // Unwind the product details array
    { $unwind: '$productDetails' },
    // Project only the fields we need
    { $project: {
      _id: 1,
      productName: '$productDetails.productName',
      productImages: { $arrayElemAt: ['$productDetails.productImages', 0] },
      totalQuantity: 1,
      totalRevenue: 1
    }}
  ]);
}

async function getBestSellingCategories() {
  return Order.aggregate([
    // Only include orders that were not cancelled or returned
    { $match: { status: { $nin: ['cancelled', 'return approved', 'returned'] } } },
    // Unwind to get individual order items
    { $unwind: '$orderedItems' },
    // Lookup product details
    { $lookup: {
      from: 'products',
      localField: 'orderedItems.product',
      foreignField: '_id',
      as: 'productDetails'
    }},
    // Unwind the product details array
    { $unwind: '$productDetails' },
    // Group by category and sum quantities
    { $group: {
      _id: '$productDetails.category',
      totalQuantity: { $sum: '$orderedItems.quantity' },
      totalRevenue: { $sum: { $multiply: ['$orderedItems.price', '$orderedItems.quantity'] } }
    }},
    // Sort by quantity sold in descending order
    { $sort: { totalQuantity: -1 } },
    // Limit to top 10
    { $limit: 10 },
    // Lookup category details
    { $lookup: {
      from: 'categories',
      localField: '_id',
      foreignField: '_id',
      as: 'categoryDetails'
    }},
    // Unwind the category details array
    { $unwind: '$categoryDetails' },
    // Project only the fields we need
    { $project: {
      _id: 1,
      categoryName: '$categoryDetails.name',
      totalQuantity: 1,
      totalRevenue: 1
    }}
  ]);
}

async function getBestSellingBrands() {
  return Order.aggregate([
    // Only include orders that were not cancelled or returned
    { $match: { status: { $nin: ['cancelled', 'return approved', 'returned'] } } },
    // Unwind to get individual order items
    { $unwind: '$orderedItems' },
    // Lookup product details
    { $lookup: {
      from: 'products',
      localField: 'orderedItems.product',
      foreignField: '_id',
      as: 'productDetails'
    }},
    // Unwind the product details array
    { $unwind: '$productDetails' },
    // Group by brand and sum quantities
    { $group: {
      _id: '$productDetails.brand',
      totalQuantity: { $sum: '$orderedItems.quantity' },
      totalRevenue: { $sum: { $multiply: ['$orderedItems.price', '$orderedItems.quantity'] } }
    }},
    // Sort by quantity sold in descending order
    { $sort: { totalQuantity: -1 } },
    // Limit to top 10
    { $limit: 10 },
    // Project only the fields we need
    { $project: {
      _id: 0,
      brandName: '$_id',
      totalQuantity: 1,
      totalRevenue: 1
    }}
  ]);
}

async function getStatistics() {
  const currentDate = new Date();
  const startOfToday = new Date(currentDate.setHours(0, 0, 0, 0));
  const endOfToday = new Date(currentDate.setHours(23, 59, 59, 999));
  
  const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59, 999);
  
  // Get daily sales
  const dailySales = await Order.aggregate([
    { 
      $match: { 
        createdOn: { $gte: startOfToday, $lte: endOfToday },
        status: { $nin: ['cancelled', 'return approved', 'returned'] }
      } 
    },
    { 
      $group: { 
        _id: null, 
        totalSales: { $sum: '$finalAmount' },
        orderCount: { $sum: 1 }
      } 
    }
  ]);
  
  // Get monthly sales
  const monthlySales = await Order.aggregate([
    { 
      $match: { 
        createdOn: { $gte: startOfMonth, $lte: endOfMonth },
        status: { $nin: ['cancelled', 'return approved', 'returned'] }
      } 
    },
    { 
      $group: { 
        _id: null, 
        totalSales: { $sum: '$finalAmount' },
        orderCount: { $sum: 1 }
      } 
    }
  ]);
  
  // Get total product count
  const productCount = await Product.countDocuments();
  
  // Get low stock products (less than 10 items)
  const lowStockCount = await Product.countDocuments({ quantity: { $lt: 10 } });
  
  // Get pending orders count
  const pendingOrdersCount = await Order.countDocuments({ 
    status: { $in: ['processing', 'placed', 'shipped'] } 
  });
  
  return {
    dailySales: dailySales.length > 0 ? dailySales[0].totalSales : 0,
    dailyOrders: dailySales.length > 0 ? dailySales[0].orderCount : 0,
    monthlySales: monthlySales.length > 0 ? monthlySales[0].totalSales : 0,
    monthlyOrders: monthlySales.length > 0 ? monthlySales[0].orderCount : 0,
    productCount,
    lowStockCount,
    pendingOrdersCount
  };
}


const loaddashboard = async (req,res)=>{
  try {
    // Default to current year if no filter is provided
    const filterType = req.query.filterType || 'yearly';
    const currentYear = new Date().getFullYear();
    const selectedYear = parseInt(req.query.year) || currentYear;
    const selectedMonth = parseInt(req.query.month) || new Date().getMonth() + 1;

    // Get sales and revenue data based on filter
    const salesData = await getSalesData(filterType, selectedYear, selectedMonth);
    
    // Get top 10 best selling products
    const bestSellingProducts = await getBestSellingProducts();
    
    // Get top 10 best selling categories
    const bestSellingCategories = await getBestSellingCategories();
    
    // Get top 10 best selling brands
    const bestSellingBrands = await getBestSellingBrands();
    
    // Get summary statistics
    const statistics = await getStatistics();

    res.render('dashboard', {
      salesData,
      bestSellingProducts,
      bestSellingCategories,
      bestSellingBrands,
      statistics,
      filterType,
      selectedYear,
      selectedMonth,
      currentYear
    });
  } catch (error) {
    console.error('Dashboard Error:', error);
    res.status(StatusCode.INTERNAL_SERVER_ERROR).render('admin/error', { 
      error: 'Failed to load dashboard data' 
    });
  }
}

const getLedger = async (req, res) => {
  try {
    const startDate = req.query.startDate ? new Date(req.query.startDate) : new Date(new Date().setDate(1)); // Default to first day of current month
    const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date(); // Default to today
    
    // Set end date to end of day
    endDate.setHours(23, 59, 59, 999);
    
    const ledgerEntries = await Order.find({
      createdOn: { $gte: startDate, $lte: endDate }
    })
    .sort({ createdOn: 1 })
    .populate('user', 'name email')
    .lean();
    
    // Calculate summary totals
    const summary = {
      totalSales: ledgerEntries.reduce((sum, order) => sum + (order.finalAmount || 0), 0),
      totalOrders: ledgerEntries.length,
      totalRefunds: ledgerEntries.reduce((sum, order) => sum + (order.refundAmount || 0), 0),
      netRevenue: ledgerEntries.reduce((sum, order) => sum + (order.finalAmount || 0) - (order.refundAmount || 0), 0)
    };
    
    res.render('ledger', {
      ledgerEntries,
      summary,
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0]
    });
  } catch (error) {
    console.error('Ledger Error:', error);
    res.status(StatusCode.INTERNAL_SERVER_ERROR).render('admin/error', { 
      error: 'Failed to generate ledger' 
    });
  }
};

// Load dashboard
const loadsalesreport = async (req, res) => {
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
  
      res.render('salesReport', {
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
      res.status(StatusCode.INTERNAL_SERVER_ERROR).send("Error generating sales report");
    }
  };


  const downloadSalesReport = async (req, res) => {
  try {
    const { format, startDate, endDate } = req.body;

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(StatusCode.BAD_REQUEST).json({ error: 'Invalid start or end date' });
    }

    const query = {
      createdAt: {
        $gte: start,
        $lte: end
      }
    };

    const orders = await Order.find(query).populate('coupon');

    // Calculate summary statistics
    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, order) => sum + order.finalAmount, 0);
    const totalDiscount = orders.reduce((sum, order) => sum + order.discount, 0);
    const totalCouponDiscount = orders.reduce((sum, order) => {
      return sum + (order.coupon ? (order.finalAmount * order.coupon.discount / 100) : 0);
    }, 0);
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Payment method statistics
    const paymentMethodStats = orders.reduce((stats, order) => {
      const method = order.paymentMethod || 'Unknown';
      stats[method] = (stats[method] || 0) + 1;
      return stats;
    }, {});

    if (format === 'excel') {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Sales Report');

      // Add summary section
      sheet.addRow(['SALES REPORT SUMMARY']);
      sheet.addRow([]);
      sheet.addRow(['Report Period:', `${start.toDateString()} to ${end.toDateString()}`]);
      sheet.addRow(['Total Orders:', totalOrders]);
      sheet.addRow(['Total Revenue:', `Rs.${totalRevenue.toFixed(2)}`]);
      sheet.addRow(['Total Discount:', `Rs.${totalDiscount.toFixed(2)}`]);
      sheet.addRow(['Total Coupon Discount:', `Rs.${totalCouponDiscount.toFixed(2)}`]);
      sheet.addRow(['Average Order Value:', `Rs.${averageOrderValue.toFixed(2)}`]);
      sheet.addRow([]);
      
      // Payment method breakdown
      sheet.addRow(['Payment Method Breakdown:']);
      Object.entries(paymentMethodStats).forEach(([method, count]) => {
        sheet.addRow([`${method}:`, count]);
      });
      sheet.addRow([]);
      sheet.addRow([]);

      // Style the summary section
      sheet.getCell('A1').font = { bold: true, size: 14 };
      sheet.getCell('A3').font = { bold: true };
      sheet.getCell('A4').font = { bold: true };
      sheet.getCell('A5').font = { bold: true };
      sheet.getCell('A6').font = { bold: true };
      sheet.getCell('A7').font = { bold: true };
      sheet.getCell('A8').font = { bold: true };
      sheet.getCell('A10').font = { bold: true };

      // Add table headers
      const headerRow = sheet.addRow([]);
      sheet.columns = [
        { header: 'Order ID', key: 'orderId', width: 25 },
        { header: 'Date', key: 'date', width: 20 },
        { header: 'Final Amount', key: 'finalAmount', width: 15 },
        { header: 'Discount', key: 'discount', width: 15 },
        { header: 'Coupon Discount', key: 'coupon', width: 18 },
        { header: 'Payment Method', key: 'paymentMethod', width: 20 }
      ];

      // Add data rows
      orders.forEach(order => {
        sheet.addRow({
          orderId: order.orderId,
          date: order.createdAt.toDateString(),
          finalAmount: `Rs.${order.finalAmount}`,
          discount: `Rs.${order.discount}`,
          coupon: order.coupon ? `${order.coupon.discount}%` : 'N/A',
          paymentMethod: order.paymentMethod || 'Unknown'
        });
      });

      // Style the data table headers
      const dataStartRow = sheet.rowCount - orders.length;
      const headerRowNum = dataStartRow;
      for (let col = 1; col <= 6; col++) {
        const cell = sheet.getCell(headerRowNum, col);
        cell.font = { bold: true };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE0E0E0' }
        };
      }

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', 'attachment; filename=sales-report.xlsx');

      await workbook.xlsx.write(res);
      res.end();

    } else if (format === 'pdf') {
      const doc = new PDFDocument({ 
        margin: 50, 
        size: 'A4',
        font: 'Helvetica'
      });
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=sales-report.pdf');
      doc.pipe(res);
      
      // Title
      doc.fontSize(24).text('Sales Report', { align: 'center' });
      doc.moveDown(1);
      
      // Summary Section
      doc.fontSize(16).font('Helvetica-Bold').text('Summary', { align: 'left' });
      doc.moveDown(0.5);
      
      doc.fontSize(11).font('Helvetica');
      doc.text(`Report Period: ${start.toDateString()} to ${end.toDateString()}`);
      doc.text(`Total Orders: ${totalOrders}`);
      doc.text(`Total Revenue: Rs.${totalRevenue.toFixed(2)}`);
      doc.text(`Total Discount: Rs.${totalDiscount.toFixed(2)}`);
      doc.text(`Total Coupon Discount: Rs.${totalCouponDiscount.toFixed(2)}`);
      doc.text(`Average Order Value: Rs.${averageOrderValue.toFixed(2)}`);
      doc.moveDown(0.5);
      
      // Payment Method Breakdown
      doc.font('Helvetica-Bold').text('Payment Method Breakdown:');
      doc.font('Helvetica');
      Object.entries(paymentMethodStats).forEach(([method, count]) => {
        doc.text(`${method}: ${count} orders`);
      });
      
      doc.moveDown(1);
      
      // Calculate table width for 6 columns
      const pageWidth = doc.page.width - 2 * doc.page.margins.left;
      
      // Adjusted column widths for 6 columns
      const colWidths = [
        pageWidth * 0.20, // Order ID (20%)
        pageWidth * 0.15, // Date (15%)
        pageWidth * 0.15, // Final Amount (15%)
        pageWidth * 0.15, // Discount (15%)
        pageWidth * 0.15, // Coupon (15%)
        pageWidth * 0.20  // Payment Method (20%)
      ];
      
      // Table settings
      const startX = doc.page.margins.left;
      let startY = doc.y;
      const rowHeight = 30;
      
      // Draw headers
      let x = startX;
      doc.font('Helvetica-Bold').fontSize(10);
      
      ['Order ID', 'Date', 'Final Amount', 'Discount', 'Coupon', 'Payment Method'].forEach((header, i) => {
        // Draw cell border
        doc.rect(x, startY, colWidths[i], rowHeight).stroke();
        
        // Draw header text
        const textX = x + 5;
        const textY = startY + 10;
        const align = (i >= 2 && i <= 4) ? 'right' : 'left'; // Right align amount columns
        
        if (align === 'right') {
          doc.text(header, textX, textY, {
            width: colWidths[i] - 10,
            align: 'right'
          });
        } else {
          doc.text(header, textX, textY, {
            width: colWidths[i] - 10,
            align: 'left'
          });
        }
        
        x += colWidths[i];
      });
      
      // Move to data rows
      startY += rowHeight;
      doc.font('Helvetica').fontSize(9);
      
      // Function to add a new page if needed
      function checkNewPage() {
        if (startY + rowHeight > doc.page.height - doc.page.margins.bottom) {
          doc.addPage();
          startY = doc.page.margins.top;
          
          // Redraw headers on new page
          x = startX;
          doc.font('Helvetica-Bold').fontSize(10);
          
          ['Order ID', 'Date', 'Final Amount', 'Discount', 'Coupon', 'Payment Method'].forEach((header, i) => {
            doc.rect(x, startY, colWidths[i], rowHeight).stroke();
            
            const textX = x + 5;
            const textY = startY + 10;
            const align = (i >= 2 && i <= 4) ? 'right' : 'left';
            
            if (align === 'right') {
              doc.text(header, textX, textY, {
                width: colWidths[i] - 10,
                align: 'right'
              });
            } else {
              doc.text(header, textX, textY, {
                width: colWidths[i] - 10,
                align: 'left'
              });
            }
            
            x += colWidths[i];
          });
          
          startY += rowHeight;
          doc.font('Helvetica').fontSize(9);
        }
      }
      
      // Draw data rows
      orders.forEach(order => {
        checkNewPage();
        
        x = startX;
        const rowData = [
          order.orderId,
          order.createdAt.toDateString(),
          `Rs.${order.finalAmount}`,
          `Rs.${order.discount}`,
          order.coupon ? `${order.coupon.discount}%` : 'N/A',
          order.paymentMethod || 'Unknown'
        ];
        
        rowData.forEach((cell, i) => {
          // Draw cell border
          doc.rect(x, startY, colWidths[i], rowHeight).stroke();
          
          // Draw cell text
          const textX = x + 5;
          const textY = startY + 10;
          const align = (i >= 2 && i <= 4) ? 'right' : 'left'; // Right align amount columns
          
          if (align === 'right') {
            doc.text(cell, textX, textY, {
              width: colWidths[i] - 10,
              align: 'right'
            });
          } else {
            doc.text(cell, textX, textY, {
              width: colWidths[i] - 10,
              align: 'left'
            });
          }
          
          x += colWidths[i];
        });
        
        startY += rowHeight;
      });
      
      doc.end();
    }
    
  } catch (error) {
    console.error("Error generating report:", error);
    res.status(StatusCode.INTERNAL_SERVER_ERROR).json({ error: 'Internal Server Error' });
  }
};


module.exports ={loadsalesreport,downloadSalesReport,loaddashboard,getLedger};