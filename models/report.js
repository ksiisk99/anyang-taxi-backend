const mongoose=require('mongoose');

const report=mongoose.Schema({
    reporter:String, //신고자
    name:String,  //피의자
    time:String,  //채팅시간
    content:String, //신고내용
    room:String  //방id
},{
    versionKey:false
});

module.exports=mongoose.model("report",report);
//자동으로 컬렉션도 만들어짐
