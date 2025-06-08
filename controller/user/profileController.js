const User=require('../../models/userSchema');
const Address=require('../../models/addressSchema');
const nodemailer=require('nodemailer');
const {StatusCode} = require('../../config/statuscode');
const bcrypt=require('bcrypt');
const env=require('dotenv').config();
const session=require('express-session');
const passport = require('passport');


function generateOtp(){
    const digits="1234567890";
    let otp="";
    for(let i=0;i<6;i++){
        otp+=digits[Math.floor(Math.random()*10)];
    }
    return otp;
}

const sendVerificationEmail= async (email,otp)=>{
    try {
        const transporter=nodemailer.createTransport({
            service:"gmail",
            port:587,
            secure:false,
            requireTLS:true,
            auth:{
                user:process.env.NODEMAILER_EMAIL,
                pass:process.env.NODEMAILER_PASSWORD
            }
        })

        const mailOptions ={
            from:process.env.NODEMAILER_EMAIL,
            to:email,
            subject:"your otp for password reset",
            text:`Your OTP is ${otp}`,
            html:`<b><h4>your otp ${otp}<br></h4></b>`
        }
        const info=await transporter.sendMail(mailOptions);
        console.log("Email send",info.messageId);
        return true;

    } catch (error) {
        console.log("Error sending email", error);
        return false;
    }
}

const securePassword = async (password)=>{
  try {
    const passwordHash = await bcrypt.hash(password,10);
    return passwordHash;
  } catch (error) {
    
  }
}

const getForgotPassPage = async (req,res)=>{
    try {
        res.render('forgot-password',{message:""});
    } catch (error) {
        res.redirect('/pageNotFound');
    }
}

const forgotEmailValid = async(req,res)=>{
    try {
        const {email}=req.body;
        const findUser =  await User.findOne({email:email});
        if(findUser){
            const otp=generateOtp();
            const emailSent=await sendVerificationEmail(email,otp);
            if(emailSent){
                req.session.userOtp=otp;
                req.session.email=email;
                res.render("forgotpass-otp");
                console.log("OTP :",otp);
            }else{
                res.render('forgot-password',{
                message:"Failed to send otp ,please try again"
            });
            }
        }else{
            res.render('forgot-password',{
                message:"user with this email does not exist"
            });
        }
    } catch (error) {
        res.redirect('/pageNotFound');
    }
}

const verifyForgotpassOtp = async (req, res) => {
    try {
        const enteredOtp = req.body.otp;
        console.log("Received OTP:", enteredOtp);
        console.log("Session OTP:", req.session.userOtp);
        console.log("OTP types:", typeof enteredOtp, typeof req.session.userOtp);
        
        // Convert both to strings for comparison
        if (String(enteredOtp) === String(req.session.userOtp)) {
            res.json({ success: true, redirectUrl: "/reset-password-forgot" });
        } else {
            res.json({ success: false, message: "OTP not matching" });
        }
    } catch (error) {
        console.error("OTP verification error:", error);
        res.status(StatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: "Server error. Please try again." });
    }
};

const getResetPassforgot=async (req,res)=>{
    try {
        res.render('reset-forgot-password');
    } catch (error) {
        res.redirect('/pageNotFound');
    }
}

const getResetPassPage=async (req,res)=>{
    try {
        res.render('reset-password');
    } catch (error) {
        res.redirect('/pageNotFound');
    }
}

const resetPasswordforgot = async (req,res)=>{
  try {
    const {newPass1,newPass2}=req.body;
    const email = req.session.email;
    if(newPass1 === newPass2){
      const passwordHash = await securePassword(newPass1);
      await User.updateOne({email:email},{$set:{password:passwordHash}})
      res.redirect('/login');
    }else{
      res.render('reset-forgot-password',{message:"passwords do not match"})
    }

  } catch (error) {
    res.redirect('/pageNotFound');
  }
}

const resetPassword = async (req,res)=>{
  try {
    const {newPass1,newPass2}=req.body;
    const email = req.session.email;
    if(newPass1 === newPass2){
      const passwordHash = await securePassword(newPass1);
      await User.updateOne({email:email},{$set:{password:passwordHash}})
      res.redirect('/userProfile');
    }else{
      res.render('reset-password',{message:"passwords do not match"})
    }

  } catch (error) {
    res.redirect('/pageNotFound');
  }
}

const userProfile= async(req,res)=>{
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId);
        const addressData = await Address.findOne({userId:userId});
        res.render('profile',{user:userData,userAddress : addressData})
    } catch (error) {
        res.redirect('pageNotFound');
    }
}

const changeEmail = async (req,res)=>{
    try {
        res.render('change-email');
    } catch (error) {
        res.redirect('/pageNotFound');
    }
}

const changeEmailvalid = async (req, res) => {
    try {
      const { email } = req.body;
      const userExist = await User.findOne({ email });
  
      if (userExist) {
        const otp = generateOtp();
        const emailSent = await sendVerificationEmail(email, otp);
  
        if (emailSent) {
          req.session.userOtp = otp;
          req.session.userData = req.body;
          req.session.email;
          console.log(`email sent to ${email}`);
          console.log("otp:", otp);
          return res.render('change-email-otp'); 
        } else {
          return res.json("email error"); 
        }
      }
      return res.render('change-email', { message: "User with this email not exist" }); 
    } catch (error) {
      return res.redirect('/pageNotFound');
    }
  };


const verifyEmailOtp = async (req, res) => {
    try {
      const enteredOtp = req.body.otp;
      if (enteredOtp === req.session.userOtp) {
        req.session.userData = req.body.userData;
        res.render("new-email", {
          userData: req.session.userData,
        });
      } else {
        res.render("change-email-otp", {
          message: "OTP not matching",
          userData: req.session.userData,
        });
      }
    } catch (error) {
      res.redirect("pageNotFound");
    }
};
  


  const updateEmail = async (req, res) => {
    try {
        const newEmail = req.body.newEmail;
        const userId = req.session.user;

        const otp = generateOtp();  // generate otp
        const emailSent = await sendVerificationEmail(newEmail, otp); // send otp to new email

        if (emailSent) {
            // Save temporary info in session
            req.session.tempEmail = newEmail;
            req.session.emailOtp = otp;
            console.log("OTP stored in session:", otp);
            res.render('verify-new-otp'); // redirect to otp page
        } else {
            res.send("Failed to send verification email. Please try again.");
        }

    } catch (error) {
        console.log(error);
        res.redirect('/pageNotFound');
    }
};

const verifyNewEmailOtp = async (req, res) => {
  try {
      const enteredOtp = req.body.otp;
      const sessionOtp = req.session.emailOtp;
      const newEmail = req.session.tempEmail;
      const userId = req.session.user;

      if (enteredOtp === sessionOtp) {
          // OTP matched, update email
          await User.findByIdAndUpdate(userId, { email: newEmail });

          // Clear session values
          delete req.session.emailOtp;
          delete req.session.tempEmail;

          res.redirect('/userProfile');
      } else {
        res.render("verify-new-otp", {
          message: "OTP not matching",
          userData: req.session.userData,
        });
      }
  } catch (error) {
      console.log(error);
      res.redirect('/pageNotFound');
  }
};

const changePassword = async (req,res)=>{
    try {
        res.render('change-password');
    } catch (error) {
        
    }
}

const changePasswordvalid = async (req, res) => {
  try {
    const { email } = req.body;
    const userExist = await User.findOne({ email });

    if (userExist) {
      const otp = generateOtp();
      const emailSent = await sendVerificationEmail(email, otp);

      if (emailSent) {
        req.session.userOtp = otp;
        req.session.userData = req.body;
        req.session.email = email;
        console.log(`OTP: ${otp}`);
        return res.render('change-password-otp'); 
      } else {
        return res.json({ success: false, message: "Failed to send OTP, please try again" });
      }
    }

    return res.render('change-password', {
      message: "User with this email does not exist"
    });
  } catch (error) {
    console.log("error in change password validation", error);
    return next(error); 
  }
};

const verifychangepassOtp = async (req, res) => {
  try {
    const { otp } = req.body;

    if (otp === req.session.userOtp) {
      return res.redirect('/reset-password');
    } else {
      return res.render('change-password-otp', {
        message: "OTP not matching"
      });
    }
  } catch (error) {
    return res.status(StatusCode.INTERNAL_SERVER_ERROR).render('change-password-otp', {
      message: "An error occurred. Please try again later."
    });
  }
};


const getAddress = async (req, res) => {
  try {
    const userId = req.session.user._id; 
    const userAddress = await Address.findOne({ userId });

    const addresses = userAddress ? userAddress.address : [];

    res.render('address', { addresses });
  } catch (error) {
    console.error("Error fetching address:", error);
    res.redirect('/pageNotFound');
  }
};

const addAddress =  async (req,res)=>{
  try {
    const user = req.session.user;
    res.render('add-address'),{user:user}; 
  } catch (error) {
    console.log(error);
    res.redirect('/pageNotFound');
  }
}

const postAddAddress = async (req, res) => {
  try {
    const userId = req.session.user;
    console.log("Session user:", userId); 

    if (!userId) {
      return res.redirect("/login"); 
    }

    const userData = await User.findOne({ _id: userId });

    if (!userData) {
      console.log("User not found");
      return res.redirect("/login");
    }

    const { addressType, name, city, landMark, state, pincode, phone, altphone } = req.body;

    let userAddress = await Address.findOne({ userId: userData._id });

    if (!userAddress) {
      const newAddress = new Address({
        userId: userData._id,
        address: [{ addressType, name, city, landMark, state, pincode, phone, altphone }]
      });
      await newAddress.save();
    } else {
      userAddress.address.push({ addressType, name, city, landMark, state, pincode, phone, altphone });
      await userAddress.save();
    }

    res.redirect("/address");
  } catch (error) {
    console.error("Error while adding address:", error);
    res.redirect("/pageNotFound");
  }
};

const addAddressOrder = async (req, res) => {
    try {
        console.log("Request body:", req.body); 
        console.log("Content-Type:", req.headers['content-type']); 
        
        const userId = req.session.user;
        console.log("Session user:", userId);
        
        if (!userId) {
            return res.json({ success: false, message: "Please login first" });
        }
        
        const userData = await User.findOne({ _id: userId });
        if (!userData) {
            console.log("User not found");
            return res.json({ success: false, message: "User not found" });
        }
        
        const { addressType, name, city, landMark, state, pincode, phone, altphone } = req.body;
        
        // Validate that required fields are present
        if (!addressType || !name || !city || !landMark || !state || !pincode || !phone) {
            return res.json({ 
                success: false, 
                message: "All required fields must be filled" 
            });
        }
        
        let userAddress = await Address.findOne({ userId: userData._id });
        let newAddressData; // Define this variable properly
        
        if (!userAddress) {
            const newAddress = new Address({
                userId: userData._id,
                address: [{ addressType, name, city, landMark, state, pincode, phone, altphone }]
            });
            const savedAddress = await newAddress.save();
            newAddressData = savedAddress.address[0]; // Get the newly added address
        } else {
            const newAddr = { addressType, name, city, landMark, state, pincode, phone, altphone };
            userAddress.address.push(newAddr);
            const savedAddress = await userAddress.save();
            newAddressData = savedAddress.address[savedAddress.address.length - 1]; // Get the last added address
        }
        
        res.json({
            success: true,
            message: "Address added successfully",
            newAddress: newAddressData
        });
        
    } catch (error) {
        console.error("Error while adding address:", error);
        res.json({ success: false, message: "An error occurred while adding the address" });
    }
}

const { ObjectId } = require('mongoose').Types;

const getEditAddress = async (req, res) => {
  try {
    const addressId = req.params.id; 
    const user = req.session.user;

    // Check if the addressId is a valid ObjectId
    if (!ObjectId.isValid(addressId)) {
      console.log("Invalid address ID format");
      return res.redirect("/pageNotFound");
    }

    // Find the user document that has this address in their address array
    const currAddress = await Address.findOne({
      "address._id": new ObjectId(addressId),
    });

    console.log("currAddress:", currAddress);

    if (!currAddress) {
      console.log("No user found with given address ID");
      return res.redirect("/pageNotFound");
    }

    // Find the actual address object inside the address array
    const addressData = currAddress.address.find((item) => {
      return item._id.toString() === addressId;
    });

    console.log("addressData:", addressData);

    if (!addressData) {
      console.log("Address ID not found inside address array");
      return res.redirect("/pageNotFound");
    }

    // Render the edit-address view
    res.render("edit-address", { address: addressData, user: user });

  } catch (error) {
    console.error("Error in getEditAddress:", error);
    res.redirect("/pageNotFound");
  }
};

const postEditAddress = async (req, res) => {
  try {
    const { id: addressItemId } = req.params; 

    const updatedData = {
      'address.$.addressType': req.body.addressType,
      'address.$.name': req.body.name,
      'address.$.city': req.body.city,
      'address.$.landMark': req.body.landMark,
      'address.$.state': req.body.state,
      'address.$.pincode': req.body.pincode,
      'address.$.phone': req.body.phone,
      'address.$.altphone': req.body.altphone,
    };

    await Address.updateOne(
      { 'address._id': addressItemId }, 
      { $set: updatedData }
    );

    res.redirect('/address');
  } catch (error) {
    console.error('Error updating address:', error);
    res.status(StatusCode.INTERNAL_SERVER_ERROR).send('Something went wrong');
  }
};

const deleteAddress = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      console.warn("Delete request missing address ID");
      return res.redirect("/pageNotFound");
    }

    const addressDoc = await Address.findOne({ "address._id": id });

    if (!addressDoc) {
      console.warn("Address not found");
      return res.status(StatusCode.NOT_FOUND).send("Address not found");
    }

    await Address.updateOne(
      { "address._id": id },
      {
        $pull: {
          address: { _id: id }
        }
      }
    );

    res.redirect("/address");
  } catch (error) {
    console.error("Error deleting address:", error);
    res.redirect("/pageNotFound");
  }
};


const uploadProfileImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(StatusCode.BAD_REQUEST).json({ success: false, message: 'No file uploaded' });
    }

    const userId = req.session.user?._id; 
    if (!userId) {
      return res.status(StatusCode.UNAUTHORIZED).json({ success: false, message: 'Unauthorized' });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { profileImage: '/uploads/profile/' + req.file.filename },  
      { new: true }
    );

    res.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error('Error uploading profile image:', error);
    res.status(StatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Server error' });
  }
};


const updateProfile = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const { name, phone } = req.body;

    const updatedUser = await User.findByIdAndUpdate(userId, {
      name,
      phone
    }, { new: true });

    req.session.user.name = updatedUser.name;
    req.session.user.phone = updatedUser.phone;

    res.redirect('/userprofile');
  } catch (err) {
    console.error('Error updating profile:', err);
    res.status(StatusCode.INTERNAL_SERVER_ERROR).send('Something went wrong.');
  }
};


module.exports ={getForgotPassPage,
    forgotEmailValid,
    verifyForgotpassOtp,
    getResetPassPage,
    getResetPassforgot,
    userProfile,
    changeEmail,
    changeEmailvalid,
    verifyEmailOtp,
    verifyNewEmailOtp,
    updateEmail ,
    changePassword,
    changePasswordvalid ,
    verifychangepassOtp ,
    resetPassword ,
    resetPasswordforgot,
    addAddress ,
    postAddAddress,
    getAddress,
    getEditAddress,
    postEditAddress,
    deleteAddress,
    addAddressOrder,
    updateProfile,
    uploadProfileImage};