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


/**
 * Draw a table in the PDF document
 * @param {PDFDocument} doc - The PDF document
 * @param {Object} tableData - The table object with headers, widths and rows
 */
function drawTable(doc, tableData) {
    const { headers, widths, rows } = tableData;
    const columnCount = headers.length;
    
    // Table settings
    const startX = doc.page.margins.left;
    const startY = doc.y + 20;
    const rowHeight = 40;
    const textPaddingLeft = 15;
    const textPaddingTop = 15;
    
    let currentY = startY;
    let currentPage = 1;
    
    // Calculate total width
    const totalWidth = widths.reduce((sum, width) => sum + width, 0);
    
    // Function to draw cell borders and text
    function drawTableCell(text, x, y, width, height, isHeader = false, alignment = 'left') {
      // Draw cell border
      doc.rect(x, y, width, height).stroke();
      
      // Set text formatting
      if (isHeader) {
        doc.font('Helvetica-Bold').fontSize(12);
      } else {
        doc.font('Helvetica').fontSize(11);
      }
      
      // Calculate text position and draw text
      let textX = x + textPaddingLeft;
      const textY = y + textPaddingTop;
      
      // Handle right alignment for amount columns
      if (alignment === 'right') {
        doc.text(text, textX, textY, {
          width: width - textPaddingLeft * 2,
          align: 'right'
        });
      } else {
        doc.text(text, textX, textY);
      }
    }
    
    // Function to check and add new page if needed
    function checkAndAddNewPage() {
      if (currentY + rowHeight > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        currentPage++;
        currentY = doc.page.margins.top;
        
        // Draw header row in new page
        drawTableHeaders();
      }
    }
    
    // Function to draw header row
    function drawTableHeaders() {
      let xPos = startX;
      
      headers.forEach((header, i) => {
        const isAmountColumn = i >= 2; // Final Amount, Discount, and Coupon columns
        drawTableCell(header, xPos, currentY, widths[i], rowHeight, true, isAmountColumn ? 'right' : 'left');
        xPos += widths[i];
      });
      
      currentY += rowHeight;
    }
    
    // Draw table headers
    drawTableHeaders();
    
    // Draw table rows
    rows.forEach(row => {
      checkAndAddNewPage();
      
      let xPos = startX;
      row.forEach((cell, i) => {
        const isAmountColumn = i >= 2; // Final Amount, Discount, and Coupon columns
        drawTableCell(cell, xPos, currentY, widths[i], rowHeight, false, isAmountColumn ? 'right' : 'left');
        xPos += widths[i];
      });
      
      currentY += rowHeight;
    });
    
    return currentY; // Return the final Y position
  }


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
        const doc = new PDFDocument({ 
          margin: 50, 
          size: 'A4',
          font: 'Helvetica' // Explicitly set font
        });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=sales-report.pdf');
        doc.pipe(res);
        
        // Title
        doc.fontSize(24).text('Sales Report', { align: 'center' });
        doc.moveDown(2);
        
        // Calculate table width
        const pageWidth = doc.page.width - 2 * doc.page.margins.left;
        
        // Table layout
        const colWidths = [
          pageWidth * 0.25, // Order ID (25%)
          pageWidth * 0.2,  // Date (20%)
          pageWidth * 0.18, // Final Amount (18%)
          pageWidth * 0.18, // Discount (18%)
          pageWidth * 0.19  // Coupon (19%)
        ];
        
        // Table settings
        const startX = doc.page.margins.left;
        let startY = doc.y;
        const rowHeight = 35;
        
        // Draw headers
        let x = startX;
        doc.font('Helvetica-Bold').fontSize(12);
        
        ['Order ID', 'Date', 'Final Amount', 'Discount', 'Coupon'].forEach((header, i) => {
          // Draw cell border
          doc.rect(x, startY, colWidths[i], rowHeight).stroke();
          
          // Draw header text
          const textX = x + 10;
          const textY = startY + 12;
          const align = i >= 2 ? 'right' : 'left'; // Right align amount columns
          
          if (align === 'right') {
            doc.text(header, textX, textY, {
              width: colWidths[i] - 20,
              align: 'right'
            });
          } else {
            doc.text(header, textX, textY);
          }
          
          x += colWidths[i];
        });
        
        // Move to data rows
        startY += rowHeight;
        doc.font('Helvetica').fontSize(11);
        
        // Function to add a new page if needed
        function checkNewPage() {
          if (startY + rowHeight > doc.page.height - doc.page.margins.bottom) {
            doc.addPage();
            startY = doc.page.margins.top;
            
            // Redraw headers on new page
            x = startX;
            doc.font('Helvetica-Bold').fontSize(12);
            
            ['Order ID', 'Date', 'Final Amount', 'Discount', 'Coupon'].forEach((header, i) => {
              doc.rect(x, startY, colWidths[i], rowHeight).stroke();
              
              const textX = x + 10;
              const textY = startY + 12;
              const align = i >= 2 ? 'right' : 'left';
              
              if (align === 'right') {
                doc.text(header, textX, textY, {
                  width: colWidths[i] - 20,
                  align: 'right'
                });
              } else {
                doc.text(header, textX, textY);
              }
              
              x += colWidths[i];
            });
            
            startY += rowHeight;
            doc.font('Helvetica').fontSize(11);
          }
        }
        
        // Draw data rows
        orders.forEach(order => {
          checkNewPage();
          
          x = startX;
          const rowData = [
            order.orderId,
            order.createdAt.toDateString(),
            `Rs.${order.finalAmount}`, // Using "Rs." instead of ₹ symbol
            `Rs.${order.discount}`,    // Using "Rs." instead of ₹ symbol
            order.coupon ? order.coupon.code : 'N/A'
          ];
          
          rowData.forEach((cell, i) => {
            // Draw cell border
            doc.rect(x, startY, colWidths[i], rowHeight).stroke();
            
            // Draw cell text
            const textX = x + 10;
            const textY = startY + 12;
            const align = i >= 2 ? 'right' : 'left'; // Right align amount columns
            
            if (align === 'right') {
              doc.text(cell, textX, textY, {
                width: colWidths[i] - 20,
                align: 'right'
              });
            } else {
              doc.text(cell, textX, textY);
            }
            
            x += colWidths[i];
          });
          
          startY += rowHeight;
        });
        
        doc.end();
      }
      
    } catch (error) {
      console.error("Error generating report:", error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  };


module.exports ={loaddashboard,downloadSalesReport};