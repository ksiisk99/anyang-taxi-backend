const mongoose=require('mongoose');

const username=mongoose.Schema({
    name:String,
    email:String
},{
    versionKey:false
});

module.exports=mongoose.model("username",username);
//자동으로 컬렉션도 만들어짐
