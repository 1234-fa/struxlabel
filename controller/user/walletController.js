const mongoose = require('mongoose');
const Wallet = require('../../models/walletSchema');
const User   = require('../../models/userSchema');
const {StatusCode} = require('../../config/statuscode');


const getMyWallet = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;

    // Fetch paginated wallet transactions
    const wallets = await Wallet.find({ userId })
      .populate({
        path: 'orderId',
        select: 'orderId orderedItems totalPrice status paymentMethod'
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Count total number of transactions
    const totalTransactions = await Wallet.countDocuments({ userId });
    const totalPages = Math.ceil(totalTransactions / limit);

    // Aggregate total amount for the user
    const totalAmountResult = await Wallet.aggregate([
      { 
        $match: { 
          status: 'success', 
          userId: new mongoose.Types.ObjectId(userId) 
        } 
      },
      {
        $group: {
          _id: "$userId", 
          total: {
            $sum: {
              $cond: {
                if: { $eq: ["$entryType", "CREDIT"] },  
                then: "$amount",  
                else: { $multiply: [-1, "$amount"] }
              }
            }
          }
        }
      }
    ]);

    let total = 0;
    if (totalAmountResult.length > 0) {
      total = totalAmountResult[0].total;
    }

    const user = await User.findById(userId);

    res.render('wallet', {
      wallet: wallets || [],
      user: user,
      totalAmount: total,
      currentPage: page,
      totalPages: totalPages
    });

  } catch (error) {
    console.error('Error fetching wallet:', error);
    res.status(StatusCode.INTERNAL_SERVER_ERROR).send('Internal Server Error');
  }
};

module.exports = { getMyWallet };