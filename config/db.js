const mongoose=require('mongoose');
const env=require('dotenv').config();

const connectDB= async ()=>{
    try{
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("DB connected");
        console.log("db url:",process.env.MONGODB_URI);
    }
    catch(error){
        console.log("DB connection error"+error.message);
        process.exit(1);
    }
}

module.exports =connectDB;
