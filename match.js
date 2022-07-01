require('dotenv').config({ path: '/home/hosting_users/ksiisk99/apps/ksiisk99_anyangstaxichat2/secret.env' });
const {MATCH_PORT} = process.env;

const express=require('express');

const c_time=new Date().toLocaleString("ko-KR", {
    year: '2-digit',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    timeZone: 'Asia/Seoul'
});

const app=express();
const server=app.listen(MATCH_PORT,()=>{
    console.log(`match server ${c_time}`);
});
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
const socketio=require('socket.io')(server);
const io=socketio.listen(server);

const uuid4 = require('uuid4');
let queue = [];

io.on('connection',socket=>{
    queue.push(socket.id);
    setTimeout(() => {
        if (queue.length >= 4) { //사용자가 4명이상일 경우
            const randomId = uuid4();//방id랜덤으로 주기
            for (let i = 0; i < 4; i++) {
                io.to(queue[0]).emit('matching', randomId);
                queue.shift();
            }
        } else if (queue.length >= 2) {
            const randomId = uuid4();
            const size = queue.length;
            for (let i = 0; i < size; i++) {
                io.to(queue[0]).emit('matching', randomId);
                queue.shift();
            }
        } else {
            queue.shift();
            io.to(socket.id).emit('matching', 'false');
        }
    }, 6500);

    socket.on('disconnect', function () {
        queue.splice(queue.indexOf(socket.id), 1);
    });
});

app.post('/version',(req,res)=>{
    res.json({version:5});
});