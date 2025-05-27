const Order = require('../../models/orderSchema');
const generateInvoice = require('../../config/invoice');
const {StatusCode} = require('../../config/statuscode');


const downloadInvoice = async (req, res) => {
  try {
    const { orderId } = req.params;

    // 1) Fetch order, populate user and ordered products
    const order = await Order.findById(orderId)
      .populate('user', 'name')
      .populate('orderedItems.product', 'productName');

    if (!order) {
      return res.status(StatusCode.NOT_FOUND).send('Order not found');
    }

    // 2) Ensure order status is eligible for invoice
    const allowed = ['order confirmed', 'order shipped', 'delivered'];
    if (!allowed.includes(order.status.toLowerCase())) {
      return res
        .status(StatusCode.FORBIDDEN)
        .send('Invoice only available once order is confirmed.');
    }

    // 3) Use embedded address fields directly
    const addrDetail = order.address;

    if (!addrDetail || !addrDetail.name) {
      return res.status(StatusCode.BAD_REQUEST).send('No address information found in this order.');
    }

    // 4) Format address
    const formattedAddress = [
      addrDetail.name,
      addrDetail.city,
      addrDetail.state,
      addrDetail.pincode,
      addrDetail.landMark ? `Landmark: ${addrDetail.landMark}` : '',
      `Phone: ${addrDetail.phone}`,
      addrDetail.altphone ? `Alt Phone: ${addrDetail.altphone}` : ''
    ].filter(Boolean).join('\n');

    // 5) Prepare formatted order data
    const formattedOrder = {
      _id: order.orderId,
      customerName: order.user.name,
      address: formattedAddress,
      date: order.createdAt.toLocaleDateString(),
      items: order.orderedItems.map(i => ({
        name: i.product.productName,
        quantity: i.quantity,
        price: i.price
      })),
      total: order.finalAmount
    };

    // 6) Generate invoice PDF
    generateInvoice(formattedOrder, res);

  } catch (err) {
    console.error('Error generating invoice:', err);
    res.status(StatusCode.INTERNAL_SERVER_ERROR).send('Internal Server Error');
  }
};

module.exports = { downloadInvoice };