const mongoose = require('mongoose');
const Wallet = require('../../models/walletSchema');
const User   = require('../../models/userSchema');

const getMyWallet = async (req, res) => {
  try {
    const userId = req.session.user._id;

    console.log('User ID:', userId); // Log userId

    // Fetch wallet transactions
    const wallets = await Wallet.find({ userId })
      .populate({
        path: 'orderId',
        select: 'orderId orderedItems totalPrice status paymentMethod'
      });

    // Aggregate total amount for the user
    const totalAmount = await Wallet.aggregate([
      // Match the status to 'Success' and filter for the specific userId
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

    // Log the aggregation result to see if any records match the condition
    console.log('Total Amount Aggregation Result:', totalAmount);

    let total = 0;
    if (totalAmount.length > 0) {
      total = totalAmount[0].total;
      console.log(`Total Amount for user: ₹${total}`);
    } else {
      console.log("No successful transactions found for the user.");
    }

    // Fetch user details
    const user = await User.findById(userId);

    // Render the wallet view
    res.render('wallet', {
      wallet: wallets || [],
      user: user,
      totalAmount: total  // Safely passing total value
    });

  } catch (error) {
    console.error('Error fetching wallet:', error);
    res.status(500).send('Internal Server Error');
  }
};

module.exports = { getMyWallet };