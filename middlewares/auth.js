const User= require('../models/userSchema')


const userAuth = (req, res, next) => {
    if (req.session.user) {
        User.findById(req.session.user._id)
            .then(user => {
                if (user && !user.isBlocked) {
                    next();
                } else {
                    req.session.destroy(); 
                    res.redirect('/login');
                }
            })
            .catch(error => {
                console.log("Error in user auth middleware:", error);
                res.status(500).send("Internal server error");
            });
    } else {
        res.redirect('/login');
    }
};

// const adminAuth=(req,res,next)=>{
//     User.findOne({isAdmin:true})
//     .then(data=>{
//         if(data){
//             next();
//         }else{
//             res.redirect('/admin/login')
//         }
//     })
//     .catch(error=>{
//         console.log("error in adminAuth MiddleWare");
//         res.status(500).send("Internal server Error");
//     })
// }

const adminAuth = async (req, res, next) => {
  try {
    const userId = req.session.admin;
    console.log("adminAuth checking session.admin:", req.session.admin);
    if (!userId) {
      return res.redirect('/admin/login');
    }

    const user = await User.findById(userId);

    if (user && user.isAdmin) {
      next(); // Admin confirmed
    } else {
      res.redirect('/admin/login');
    }
  } catch (error) {
    console.log("Error in adminAuth middleware:", error);
    res.redirect('/admin/pageerror');
  }
};

// const adminAuth = async (req, res, next) => {
//     try {
//       const userId = req.session.user; // or req.user, based on your setup
//       if (!userId) {
//         return res.redirect('/admin/login');
//       }
  
//       const user = await User.findById(userId);
//       if (user && user.isAdmin) {
//         next();
//       } else {
//         return res.redirect('/admin/login');
//       }
//     } catch (error) {
//       console.log("Error in adminAuth middleware:", error);
//       return res.status(500).send("Internal Server Error");
//     }
//   };


// const adminAuth = async (req, res, next) => {
//     try {
//         const userId = req.session.user; // Adjust this if your session key is different
//         if (!userId) {
//             return res.redirect('/admin/login');
//         }

//         const user = await User.findById(userId);

//         if (user && user.isAdmin) {
//             next();
//         } else {
//             return res.redirect('/admin/login');
//         }
//     } catch (error) {
//         console.log("Error in adminAuth middleware:", error);
//         res.status(500).send("Internal Server Error");
//     }
// };

module.exports={
    userAuth,adminAuth
}