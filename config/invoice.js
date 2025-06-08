const PDFDocument = require('pdfkit');
const path = require('path');

async function generateInvoice(order, res) {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    
    try {
        doc.image(path.join(__dirname, '../img/logo.png'), 40, 35, { width: 40 });
    } catch (e) {}
    
    doc
        .font('Helvetica-Bold')
        .fontSize(16)
        .text('STRUX LABEL', 90, 45)
        .fontSize(8)
        .font('Helvetica')
        .fillColor('gray')
        .text('www.struxlabel.com', 200, 52, { align: 'right' })
        .fillColor('black');
    
    // Divider
    doc.moveTo(40, 75).lineTo(555, 75).stroke();
    
    const metaTop = 90;
    doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .text('Invoice No.:', 40, metaTop)
        .text('Date:', 40, metaTop + 15)
        .text('Order Status:', 280, metaTop)
        .text('Payment Method:', 280, metaTop + 15);
    
    doc
        .font('Helvetica')
        .fontSize(9)
        .text(`#${order._id}`, 120, metaTop)
        .text(order.date, 120, metaTop + 15)
        .text(order.status.toUpperCase(), 380, metaTop)
        .text(order.paymentMethod, 380, metaTop + 15);
    
    const billTop = metaTop + 50;
    doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .text('Bill To:', 40, billTop);
        
    let addressY = billTop + 18;
    doc
        .font('Helvetica')
        .fontSize(9)
        .text(order.customerName, 40, addressY);
    
    const fullAddress = order.address || '';
    const addressLines = fullAddress.split('\n').filter(line => line.trim());
    
    addressY += 15;
    addressLines.forEach((line, index) => {
        doc.text(line.trim(), 40, addressY, { width: 300 });
        addressY += 12;
    });
    
    let currentY = addressY + 40;
    
    // Payment verification box for Razorpay - Proper positioning
    if (order.paymentMethod === 'Razorpay') {
        const boxHeight = 60;
        
        doc
            .rect(40, currentY, 515, boxHeight)
            .stroke('#e0e0e0');
        
        doc
            .font('Helvetica-Bold')
            .fontSize(10)
            .fillColor('#1976d2')
            .text('PAYMENT VERIFICATION', 50, currentY + 10);
        
        const paymentStatusColor = order.paymentStatus === 'Paid' ? '#4caf50' : '#f44336';
        doc
            .font('Helvetica-Bold')
            .fontSize(9)
            .fillColor('black')
            .text('Status:', 50, currentY + 25)
            .fillColor(paymentStatusColor)
            .text(order.paymentStatus || 'Pending', 100, currentY + 25)
            .fillColor('black')
            .text('Order ID:', 250, currentY + 25)
            .font('Helvetica')
            .fontSize(8)
            .text(order.razorpayOrderId || order._id, 300, currentY + 25);
            
        if (order.razorpayPaymentId) {
            doc
                .font('Helvetica-Bold')
                .fontSize(9)
                .text('Payment ID:', 50, currentY + 40)
                .font('Helvetica')
                .fontSize(8)
                .text(order.razorpayPaymentId, 120, currentY + 40);
        }
        
        currentY += boxHeight + 20;
    }
    
    
    // Table positioning with proper spacing
    const tableTop = currentY + 10;
    
    // Table Header with better alignment
    doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor('#444444')
        .text('Product Name', 40, tableTop)
        .text('Qty', 280, tableTop, { width: 30, align: 'center' })
        .text('Price', 320, tableTop, { width: 50, align: 'right' })
        .text('Total', 380, tableTop, { width: 50, align: 'right' })
        .text('Status', 440, tableTop, { width: 60, align: 'center' })
        .text('Refund', 510, tableTop, { width: 50, align: 'right' })
        .fillColor('black');
    
    // Divider under table header
    doc.moveTo(40, tableTop + 15).lineTo(555, tableTop + 15).stroke();
    
    // Calculate refunds and totals
    const calculations = await calculateRefundsAndTotals(order);
    
    // Table Rows with proper spacing - Show all invoiceable items
    let y = tableTop + 25;
    const invoiceableStatuses = [
        'confirmed', 'processing', 'shipped', 'shipping', 'in transit', 
        'out for delivery', 'delivered', 'return approved', 'cancelled', 'returned'
    ];
    
    order.items.forEach(item => {
        if (invoiceableStatuses.includes(item.status.toLowerCase())) {
            const lineTotal = item.price * item.quantity;
            const refundAmount = calculations.itemRefunds[item._id] || 0;
            const statusColor = getStatusColor(item.status);
            
            doc
                .font('Helvetica')
                .fontSize(8)
                .fillColor('black')
                .text(item.name, 40, y, { width: 230 })
                .text(item.quantity.toString(), 280, y, { width: 30, align: 'center' })
                .text(`₹${item.price}`, 320, y, { width: 50, align: 'right' })
                .text(`₹${lineTotal.toFixed(2)}`, 380, y, { width: 50, align: 'right' })
                .fillColor(statusColor)
                .text(item.status.toUpperCase(), 440, y, { width: 60, align: 'center' })
                .fillColor(refundAmount > 0 ? '#d32f2f' : 'black')
                .text(refundAmount > 0 ? `₹${refundAmount.toFixed(2)}` : '-', 510, y, { width: 50, align: 'right' });
            y += 18;
        }
    });
    
    // Summary section with proper alignment
    y += 15;
    doc.moveTo(350, y).lineTo(555, y).stroke();
    y += 15;
    
    // Subtotal
    doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('black')
        .text('Subtotal:', 350, y)
        .text(`₹${calculations.subtotal.toFixed(2)}`, 480, y, { width: 70, align: 'right' });
    y += 15;
    
    // Delivery Charge
    if (order.deliveryCharge > 0) {
        doc
            .text('Delivery Charge:', 350, y)
            .text(`₹${order.deliveryCharge.toFixed(2)}`, 480, y, { width: 70, align: 'right' });
        y += 15;
    }
    
    // Coupon Discount
    if (calculations.applicableCouponDiscount > 0) {
        doc
            .fillColor('#4caf50')
            .text('Coupon Discount:', 350, y)
            .text(`-₹${calculations.applicableCouponDiscount.toFixed(2)}`, 480, y, { width: 70, align: 'right' });
        y += 15;
    }
    
    // Total Refund
    if (calculations.totalRefund > 0) {
        doc
            .fillColor('#d32f2f')
            .text('Total Refund:', 350, y)
            .text(`-₹${calculations.totalRefund.toFixed(2)}`, 480, y, { width: 70, align: 'right' });
        y += 15;
    }
    
    // Final Amount with proper emphasis
    doc.moveTo(350, y).lineTo(555, y).stroke();
    y += 15;
    
    doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor('#000000')
        .text('Final Amount:', 350, y)
        .text(`₹${calculations.finalAmount.toFixed(2)}`, 480, y, { width: 70, align: 'right' });
    
    // Order status information for shipping/processing orders
    y += 30;
    const inProgressStatuses = ['confirmed', 'processing', 'shipped', 'shipping', 'in transit', 'out for delivery'];
    const hasInProgressItems = order.items.some(item => inProgressStatuses.includes(item.status.toLowerCase()));
    
    if (hasInProgressItems) {
        doc
            .font('Helvetica-Bold')
            .fontSize(9)
            .fillColor('#1976d2')
            .text('Order Information:', 40, y);
        y += 15;
        
        doc
            .font('Helvetica')
            .fontSize(8)
            .fillColor('black')
            .text('• Your order is currently being processed/shipped', 40, y, { width: 500 });
        y += 12;
        
        doc
            .text('• Final refund calculations will be updated upon delivery/completion', 40, y, { width: 500 });
        y += 12;
        
        doc
            .text('• This invoice reflects your payment confirmation and current order status', 40, y, { width: 500 });
        y += 20;
    }
    
    // Additional notes section with proper spacing
    if (calculations.totalRefund > 0) {
        doc
            .font('Helvetica-Bold')
            .fontSize(9)
            .fillColor('#d32f2f')
            .text('Refund Information:', 40, y);
        y += 15;
        
        doc
            .font('Helvetica')
            .fontSize(8)
            .fillColor('black')
            .text('• Refund amounts are calculated based on remaining valid items and coupon eligibility', 40, y, { width: 500 });
        y += 12;
        
        doc
            .text('• Refunds will be processed to your original payment method within 5-7 business days', 40, y, { width: 500 });
        y += 20;
    }
    
    // Footer message - Position at bottom with proper spacing
    const footerY = 750;
    
    if (order.paymentMethod === 'Razorpay') {
        doc
            .fontSize(8)
            .fillColor('#666666')
            .text('Payment processed securely through Razorpay Gateway', 40, footerY, {
                align: 'center',
                width: 515
            });
        
        if (order.paymentStatus === 'Paid') {
            doc
                .fillColor('#4caf50')
                .text('✓ Payment Verified & Confirmed', 40, footerY + 12, {
                    align: 'center',
                    width: 515
                });
        }
    }
    
    doc
        .fontSize(8)
        .fillColor('gray')
        .text('Thank you for shopping with us!', 40, footerY + 25, {
            align: 'center',
            width: 515
        })
        .text('For any queries, contact us at support@struxlabel.com', 40, footerY + 37, {
            align: 'center',
            width: 515
        });
    
    // Send PDF
    res.setHeader(
        'Content-Disposition',
        `attachment; filename=invoice-${order._id}.pdf`
    );
    res.setHeader('Content-Type', 'application/pdf');
    doc.pipe(res);
    doc.end();
}

// Updated calculation function to handle shipping/processing items
async function calculateRefundsAndTotals(order) {
    // Items that are delivered or in progress (confirmed, processing, shipped, etc.)
    const deliveredItems = order.items.filter(item => item.status.toLowerCase() === 'delivered');
    const inProgressItems = order.items.filter(item => 
        ['confirmed', 'processing', 'shipped', 'shipping', 'in transit', 'out for delivery'].includes(item.status.toLowerCase())
    );
    const validItems = [...deliveredItems, ...inProgressItems];
    
    // Items that are cancelled or returned
    const cancelledItems = order.items.filter(item => 
        ['cancelled', 'returned'].includes(item.status.toLowerCase())
    );
    const returnApprovedItems = order.items.filter(item => 
        item.status.toLowerCase() === 'return approved'
    );
    
    // Calculate valid items subtotal (delivered + in progress)
    const validSubtotal = validItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    // Check if remaining valid items still qualify for coupon
    let couponStillValid = false;
    if (order.coupon && order.coupon.price && validSubtotal > 0) {
        couponStillValid = validSubtotal >= order.coupon.price;
    }
    
    // Calculate refunds for each cancelled/returned/return approved item
    const itemRefunds = {};
    let totalRefund = 0;
    
    const refundableItems = [...cancelledItems, ...returnApprovedItems];
    
    for (const item of refundableItems) {
        const itemAmount = item.price * item.quantity;
        // Always refund original item price only
        const refundAmount = itemAmount;
        
        itemRefunds[item._id] = Math.round(refundAmount * 100) / 100;
        totalRefund += refundAmount;
    }
    
    // Calculate final amount for valid items (delivered + in progress)
    let finalAmount = validSubtotal;
    
    if (validSubtotal > 0) {
        // Add delivery charge
        finalAmount += order.deliveryCharge || 0;
        
        // Apply coupon discount only if still valid
        if (couponStillValid) {
            finalAmount -= order.discount || 0;
        }
    }
    
    // For display purposes - show all invoiceable items in subtotal
    const displaySubtotal = order.items
        .filter(item => [
            'confirmed', 'processing', 'shipped', 'shipping', 'in transit', 
            'out for delivery', 'delivered', 'return approved', 'cancelled', 'returned'
        ].includes(item.status.toLowerCase()))
        .reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    return {
        subtotal: displaySubtotal,
        totalRefund: Math.round(totalRefund * 100) / 100,
        finalAmount: Math.max(0, Math.round(finalAmount * 100) / 100),
        itemRefunds,
        couponStillValid,
        applicableCouponDiscount: couponStillValid ? (order.discount || 0) : 0
    };
}

function getStatusColor(status) {
    const statusColors = {
        'confirmed': '#2196f3',
        'processing': '#ff9800',
        'shipped': '#9c27b0',
        'shipping': '#9c27b0',
        'in transit': '#673ab7',
        'out for delivery': '#3f51b5',
        'delivered': '#4caf50',
        'return approved': '#ff9800',
        'cancelled': '#d32f2f',
        'returned': '#9c27b0'
    };
    return statusColors[status.toLowerCase()] || '#666666';
}

module.exports = generateInvoice;