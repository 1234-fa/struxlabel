const User = require('../../models/userSchema');
const {StatusCode} = require('../../config/statuscode');


const customerInfo = async (req, res) => {
    try {
        let search = req.query.search || ""; 
        let page = parseInt(req.query.page) || 1; 
        const limit = 10; 

        const userData = await User.find({
            isAdmin: false,
            $or: [
                { name: { $regex: ".*" + search + ".*", $options: "i" } }, 
                { email: { $regex: ".*" + search + ".*", $options: "i" } },
            ],
        })
        .limit(limit)
        .skip((page - 1) * limit)
        .exec();

        const count = await User.countDocuments({
            isAdmin: false,
            $or: [
                { name: { $regex: ".*" + search + ".*", $options: "i" } },
                { email: { $regex: ".*" + search + ".*", $options: "i" } },
            ],
        });

        const totalPages = Math.ceil(count / limit);

        res.render('customers', { data: userData, totalPages, currentPage: page });

    } catch (error) {
        console.error("Error fetching customer data:", error);
        res.status(StatusCode.INTERNAL_SERVER_ERROR).send("Internal Server Error");
    }
};

const customerBlocked=async (req,res)=>{
    try {
        let id=req.query.id;
        await User.updateOne({_id: id},{$set:{isBlocked:true}});
        res.redirect('/admin/users');
    } catch (error) {
        res.redirect('/pageerror');
    }
}

const cutomerunBlocked = async (req,res)=>{
    try {
        let id=req.query.id;
        await User.updateOne({_id:id},{$set:{isBlocked:false}});
        res.redirect('/admin/users');
    } catch (error) {
        res.redirect('/pageerror');
    }
}


module.exports = { customerInfo , customerBlocked ,cutomerunBlocked};