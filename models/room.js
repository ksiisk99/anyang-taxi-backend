const mongoose=require('mongoose');

const room=mongoose.Schema({
    time:Number,
    roomid:String,
    total:Number,
    title:String,
    participant:Number
},{
    versionKey:false
});


module.exports=mongoose.model("room",room);
//자동으로 컬렉션도 만들어짐
