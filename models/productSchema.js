const mongoose=require('mongoose')
const {Schema}=mongoose;

const productSchema= new Schema({
    productName:{
        type:String,
        required:true
    },
    desctiption:{
        type:String,
        required:true
    },
    brand:{
        type:String,
        required:true
    },
    category:{
        type:String,
        required:true
    },
    regularPrice:{
        type:Number,
        required:true
    },
    salePrice:{
        type:Number,
        required:true
    },
    productOffer:{
        type:Number,
        default:0
    },
    quantity:{
        type:Number,
        required:true
    },
    color:{
        type:String,
        required:true
    },
    productImgae:{
        type:[String],
        required:true
    },
    isbloack:{
        type:Boolean,
        default:false
    },
    status:{
        type:String,
        enum:["Available","Out of Stock","Discound"],
        required:true,
        default:"Available"
    },
},{timestamps:true})

module.exports=mongoose.model('Product',productSchema)