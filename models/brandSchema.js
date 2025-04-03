const mongoose=require('mongoose')
const {Schema}=mongoose;

const brandSchema=new Schema({
    brandName:{
        type:String,
        required:true
    },
    brandImage:{
        type:[String],
        required:true
    },
    isBlocked:{
        type:Boolean,
        default:false
    },
    createdAt:{
        type:Date,
        default:Date.now
    }
})

module.exports=mongoose.model('brand',brandSchema)