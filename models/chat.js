const mongoose=require('mongoose');

const chat=mongoose.Schema({
    room:String,
    token:String,
    name:String,
    msg:String,
    date:String
},{
    versionKey:false
});

module.exports=mongoose.model("chat",chat);
//자동으로 컬렉션도 만들어짐
