const mongoose=require('mongoose');
const {Schema}=mongoose;
const {v4:uuidv4, stringify}=require('uuid');
const { schema } = require('./userSchema');

const orderSchema=new Schema({
orderId:{
    type:String,
    default:()=>uuidv4(),
    unique:true
},
orderedItems:[{
    product:{
        type:Schema.Types.ObjectId,
        ref:'Product',
        required:true
    },
    quantity:{
        type:Number,
        required:true
    },
    price:{
        type:Number,
        default:0
    }
}],
totalPrice:{
    type:Number,
    default:0
},
discoind:{
    type:Number,
    default:0
},
finalamount:{
    type:Number,
    default:0
},
address:{
    type:Schema.Types.ObjectId,
    ref:'User',
    required:true
},
invoideDate:{
    type:Date
},
status:{
    type:String,
    require:true,
    enum:['pending','peocessing','shipped','deliverd','cancled','Return Request','Returned']
},
createdOn:{
    type:Date,
    default:Date.now,
    required:true
},
coupenApplied:{
    type:Boolean,
    default:true
}
})


module.exports=mongoose.model('Order',orderSchema)