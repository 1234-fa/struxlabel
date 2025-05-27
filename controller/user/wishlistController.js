const { request } = require('../../app');
const Cart = require('../../models/cartSchema');
const Product = require('../../models/productSchema');
const User = require('../../models/userSchema');
const Wishlist  = require('../../models/wishlistSchema')
const {StatusCode} = require('../../config/statuscode');



const getWishlist = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const page = parseInt(req.query.page) || 1;
        const limit = 3;
        const skip = (page - 1) * limit;

        const user = await User.findById(userId);

        const wishlistDoc = await Wishlist.findOne({ userId }).populate({
            path: 'products.productId',
            populate: { path: 'category' }
        });

        if (!wishlistDoc) {
            return res.render('wishlist', {
                user,
                wishlist: [],
                totalPages: 0,
                currentPage: 1
            });
        }

        const validProducts = wishlistDoc.products.filter(p => p.productId);

        const totalCount = validProducts.length;
        const totalPages = Math.ceil(totalCount / limit);

        const wishlistProducts = validProducts
            .slice(skip, skip + limit)
            .map(p => p.productId);

        res.render('wishlist', {
            user,
            wishlist: wishlistProducts,
            totalPages,
            currentPage: page
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
        res.status(StatusCode.INTERNAL_SERVER_ERROR).send("Internal Server Error");
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
        res.status().send('Internal Server Error');
    }
};


module.exports={getWishlist,addToWishlist,removeFromWishlist}