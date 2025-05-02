const PDFDocument = require('pdfkit');
const path = require('path');

function generateInvoice(order, res) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });

  // Header with logo and company info
  try {
    doc.image(path.join(__dirname, '../img/logo.png'), 50, 45, { width: 50 });
  } catch (e) {}
  doc
    .font('Helvetica-Bold')
    .fontSize(22)
    .text('Lost And Found', 110, 57)
    .fontSize(10)
    .font('Helvetica')
    .fillColor('gray')
    .text('www.lostandfound.com', 200, 65, { align: 'right' })
    .fillColor('black')
    .moveDown();

  // Divider
  doc.moveTo(50, 100).lineTo(550, 100).stroke();

  // Invoice Meta
  const metaTop = 120;
  doc
    .font('Helvetica-Bold')
    .fontSize(12)
    .text('Invoice No.:', 50, metaTop)
    .text('Date:', 300, metaTop);

  doc
    .font('Helvetica')
    .text(`#${order._id}`, 150, metaTop)
    .text(order.date, 350, metaTop);

  // Bill To section
  const billTop = metaTop + 30;
  doc
    .font('Helvetica-Bold')
    .text('Bill To:', 50, billTop);

  doc
    .font('Helvetica')
    .text(order.customerName, 110, billTop)
    .text(order.address, 110, billTop + 15);

  // Dynamic table positioning
  const addressLines = order.address.split('\n').length;
  const tableTop = billTop + 30 + addressLines * 15;

  // Table Header
  doc
    .font('Helvetica-Bold')
    .fontSize(12)
    .fillColor('#444444')
    .text('Item',       50,  tableTop)
    .text('Qty',        340, tableTop, { width: 50, align: 'right' })
    .text('Price',      410, tableTop, { width: 70, align: 'right' })
    .text('Line Total', 490, tableTop, { width: 70, align: 'right' })
    .fillColor('black');


  // Divider under table header
  doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();

  // Table Rows
  let y = tableTop + 25;
  order.items.forEach(item => {
    doc
      .font('Helvetica')
      .fontSize(11)
      .text(item.name, 50, y, { width: 260 })
      .text(item.quantity, 340, y, { width: 50, align: 'right' })
      .text(`Rs.${item.price}`, 410, y, { width: 70, align: 'right' })
      .text(`Rs.${(item.price * item.quantity).toFixed(2)}`, 490, y, { width: 70, align: 'right' });
    y += 20;
  });

  // Grand Total
  doc
    .font('Helvetica-Bold')
    .fontSize(13)
    .fillColor('#000000')
    .text(`Total: Rs.${order.total.toFixed(2)}`, 0, y + 30, {
      align: 'right',
      width: 500
    });

  // Footer message
  doc
    .fontSize(10)
    .fillColor('gray')
    .text('Thank you for shopping with us!', 50, 760, {
      align: 'center',
      width: 500
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

module.exports = generateInvoice;