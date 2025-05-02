const mongoose = require('mongoose');
const Wallet = require('../../models/walletSchema');
const User   = require('../../models/userSchema');


const getMyWallet = async (req, res) => {
    try {
      const userId = req.session.user._id;
  
      // Find all wallet transactions for the user
      const wallets = await Wallet.find({ userId })
        .populate({
          path: 'orderId',
          select: 'orderId orderedItems totalPrice status paymentMethod'
        });
  
      // Always fetch user details
      const user = await User.findById(userId);
  
      // Render the wallet view, pass the wallets array
      res.render('wallet', {
        wallet: wallets || [], // Pass an empty array if no wallets found
        user: user
      });
  
    } catch (error) {
      console.error('Error fetching wallet:', error);
      res.status(500).send('Internal Server Error');
    }
  };


module.exports = {getMyWallet};