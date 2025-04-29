const { request } = require('../../app');
const Cart = require('../../models/cartSchema');
const Product = require('../../models/productSchema');
const User = require('../../models/userSchema');
const Wishlist  = require('../../models/wishlistSchema')


const getWishlist = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const user = await User.findById(userId);
        const wishlistDoc = await Wishlist.findOne({ userId }).populate({
            path: 'products.productId',
            populate: { path: 'category' }
        });

        const wishlistProducts = wishlistDoc
            ? wishlistDoc.products
                  .map(p => p.productId)
                  .filter(product => product !== null)
            : [];

        res.render('wishlist', {
            user,
            wishlist: wishlistProducts
        });
    } catch (error) {
        console.log("Error in wishlist:", error);
        res.redirect('/pageNotFound');
    }
};

const addToWishlist = async (req, res) => {
    try {
        const productId = req.query.id;
        const userId = req.session.user._id;

        if (!userId) {
            console.error('User not logged in.');
            return res.redirect('/login');
        }

        let wishlist = await Wishlist.findOne({ userId });

        if (!wishlist) {
            wishlist = new Wishlist({
                userId,
                products: [{ productId }]
            });
        } else {
            const isAlreadyInWishlist = wishlist.products.some(item =>
                item.productId.toString() === productId
            );

            if (isAlreadyInWishlist) {
                return res.redirect('/wishlist');
            }

            wishlist.products.push({ productId });
        }

        await wishlist.save();
        res.redirect('/wishlist');
    } catch (error) {
        console.error("Error adding to wishlist:", error.message);
        res.status(500).send("Internal Server Error");
    }
};



const removeFromWishlist = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const productId = req.query.id;

        await Wishlist.updateOne(
            { userId },
            { $pull: { products: { productId: productId } } }
        );

        res.redirect('/wishlist');
    } catch (err) {
        console.log("Error removing from wishlist:", err);
        res.status(500).send('Internal Server Error');
    }
};


module.exports={getWishlist,addToWishlist,removeFromWishlist}