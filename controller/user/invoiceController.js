const Order = require('../../models/orderSchema');
const generateInvoice = require('../../config/invoice');
const { StatusCode } = require('../../config/statuscode');

const downloadInvoice = async (req, res) => {
    try {
        const { orderId } = req.params;
        
        //  Fetch order with all necessary populated fields
        const order = await Order.findById(orderId)
            .populate('user', 'name')
            .populate('orderedItems.product', 'productName')
            .populate('coupon', 'code discountPercentage discountAmount');
        
        if (!order) {
            return res.status(StatusCode.NOT_FOUND).send('Order not found');
        }
        
        //  Check if payment method allows invoice generation
        const allowedPaymentMethods = ['razorpay', 'cash_on_delivery'];
        if (!allowedPaymentMethods.includes(order.paymentMethod.toLowerCase())) {
            return res
                .status(StatusCode.FORBIDDEN)
                .send('Invoice is only available for Razorpay and Cash on Delivery payments.');
        }
        
        //  Check payment status - this is the main requirement
        if (!order.paymentStatus || order.paymentStatus.toLowerCase() !== 'paid') {
            return res
                .status(StatusCode.FORBIDDEN)
                .send('Invoice is only available for orders with successful payments.');
        }
        
        //  Check if order has valid statuses for invoice generation
        const validOrderStatuses = [
            'confirmed',
            'processing', 
            'shipped',
            'shipping',
            'in transit',
            'out for delivery',
            'delivered',
            'partially delivered',
            'return requested',
            'return approved',
            'partially returned',
            'cancelled',  // For partial cancellations where some items are delivered
            'completed'
        ];
        
        const hasValidItems = order.orderedItems.some(item => {
            const validItemStatuses = [
                'confirmed',
                'processing',
                'shipped', 
                'shipping',
                'in transit',
                'out for delivery',
                'delivered',
                'return approved',
                'cancelled',
                'returned'
            ];
            return validItemStatuses.includes(item.status.toLowerCase());
        });
        
        if (!validOrderStatuses.includes(order.status.toLowerCase()) && !hasValidItems) {
            return res
                .status(StatusCode.FORBIDDEN)
                .send('Invoice is not available for orders in pending status.');
        }
        
        //  Use embedded address fields directly
        const addrDetail = order.address;
        if (!addrDetail || !addrDetail.name) {
            return res.status(StatusCode.BAD_REQUEST).send('No address information found in this order.');
        }
        
        //  Format address
        const formattedAddress = [
            addrDetail.name,
            addrDetail.city,
            addrDetail.state,
            addrDetail.pincode,
            addrDetail.landMark ? `Landmark: ${addrDetail.landMark}` : '',
            `Phone: ${addrDetail.phone}`,
            addrDetail.altphone ? `Alt Phone: ${addrDetail.altphone}` : ''
        ].filter(Boolean).join('\n');
        
        //  Format payment method for display
        const formatPaymentMethod = (method) => {
            const methodMap = {
                'credit_card': 'Credit Card',
                'paypal': 'PayPal',
                'razorpay': 'Razorpay',
                'cash_on_delivery': 'Cash on Delivery'
            };
            return methodMap[method] || method;
        };
        
        //  Prepare coupon information with price threshold
        const couponInfo = order.coupon ? {
            code: order.coupon.code,
            discount: order.coupon.discountPercentage || order.coupon.discountAmount,
            price: order.coupon.minimumPurchaseAmount || order.coupon.price || 0
        } : null;
        
        //  Format order status
        const formatOrderStatus = (status) => {
            return status.split(' ').map(word =>
                word.charAt(0).toUpperCase() + word.slice(1)
            ).join(' ');
        };
        
        //  Prepare formatted order data - include invoiceable items
        const formattedOrder = {
            _id: order.orderId,
            customerName: order.user.name,
            address: formattedAddress,
            date: order.createdAt.toLocaleDateString('en-GB', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            }),
            paymentMethod: formatPaymentMethod(order.paymentMethod),
            paymentStatus: order.paymentStatus,
            razorpayOrderId: order.razorpayOrderId,
            razorpayPaymentId: order.razorpayPaymentId,
            status: formatOrderStatus(order.status),
            coupon: couponInfo,
            // Include all invoiceable items (paid items)
            items: order.orderedItems.map(i => ({
                _id: i._id,
                name: i.product.productName,
                quantity: i.quantity,
                price: i.price,
                status: i.status,
                variant: i.variant ? i.variant.size : null
            })),
            discount: order.discount || 0,
            deliveryCharge: order.deliveryCharge || 0,
            totalPrice: order.totalPrice,
            finalAmount: order.finalAmount-order.refundAmount,
            refundAmount: order.refundAmount || 0
        };
        
        //  Generate invoice PDF
        await generateInvoice(formattedOrder, res);
        
    } catch (err) {
        console.error('Error generating invoice:', err);
        res.status(StatusCode.INTERNAL_SERVER_ERROR).send('Internal Server Error');
    }
};

module.exports = { downloadInvoice };