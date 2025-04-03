const mongoose=require('mongoose');
const {Schema}=mongoose

const cartSchema=new Schema({
    userId:{
        type:Schema.Types.ObjectId,
        ref:'User',
        required:true
    },
    tems:[{
        productId:{
            type:Schema.Types.ObjectId,
            ref:'Product',
            require:true,
        },
        quantity:{
            type:Number,
            default:0
        },
        totalPrice:{
            type:Number,
            default:0
        },
        status:{
            type:String,
            default:'placed'
        },
        cancellationReason:{
            type:String,
            default:'none'
        }
    }]
})


module.exports=mongoose.model('Cart',cartSchema)