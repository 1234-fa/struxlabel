const User = require('../../models/userSchema');

const customerInfo = async (req, res) => {
    try {
        let search = req.query.search || ""; // Fix search retrieval
        let page = parseInt(req.query.page) || 1; // Ensure `page` is a number
        const limit = 10; // Number of users per page

        // Fetch users based on search and pagination
        const userData = await User.find({
            isAdmin: false,
            $or: [
                { name: { $regex: ".*" + search + ".*", $options: "i" } }, // Case-insensitive search
                { email: { $regex: ".*" + search + ".*", $options: "i" } },
            ],
        })
        .limit(limit)
        .skip((page - 1) * limit)
        .exec();

        // Count total customers for pagination
        const count = await User.countDocuments({
            isAdmin: false,
            $or: [
                { name: { $regex: ".*" + search + ".*", $options: "i" } },
                { email: { $regex: ".*" + search + ".*", $options: "i" } },
            ],
        });

        // Calculate total pages
        const totalPages = Math.ceil(count / limit);

        // Render the customers page with fetched data
        res.render('customers', { data: userData, totalPages, currentPage: page });

    } catch (error) {
        console.error("Error fetching customer data:", error);
        res.status(500).send("Internal Server Error");
    }
};

const customerBlocked=async (req,res)=>{
    try {
        let id=req.query.id;
        await User.updateOne({_id: id},{$set:{isBlocked:true}});
        res.redirect('/admin/users');
    } catch (error) {
        res.redirect('/errorpage');
    }
}

const cutomerunBlocked = async (req,res)=>{
    try {
        let id=req.query.id;
        await User.updateOne({_id:id},{$set:{isBlocked:false}});
        res.redirect('/admin/users');
    } catch (error) {
        res.redirect('/errorpage');
    }
}


module.exports = { customerInfo , customerBlocked ,cutomerunBlocked};