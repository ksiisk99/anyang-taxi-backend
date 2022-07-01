const mongoose=require('mongoose');

const user=mongoose.Schema({
    token:String,
    roomid:String,
    password:{
        type:String,
        select:false
    },
    email:{
        type:String,
        unique:true
    },
    name:{
        type:String,
        unique:true
    },
    date:String,
    create:Number,
    autologin:Number,
    salt:String,
    last:String
},{
    versionKey:false
});

module.exports=mongoose.model("user",user);
//자동으로 컬렉션도 만들어짐
