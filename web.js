let namelist = []; //이름 중복확인을 위해 서버 실행 시 db에서 유저 이름리스트를 가져온다
let socket_id = {};
let keyrooms = {};//방 인원수
let socketuser = {};//방에 있는 사람(토큰) 등록 백그라운드 작업을 위해
let socketusername = {}; //방에 있는 유저들 이름 userlist를 클라이언트에 주기 위해

require('dotenv').config({ path: '/home/hosting_users/ksiisk99/apps/ksiisk99_anyangstaxichat/secret.env' });
const { MONGO_URI, USERID, USERPASS, CHAT_PORT, MAIL_PORT, HOST,
M_CHAT,M_USER,M_REPORT,M_ROOM,M_USERNAME,F_KEY } = process.env;
const chat = require(M_CHAT);
const user = require(M_USER); //첫 등록시
const report = require(M_REPORT);
const room = require(M_ROOM);
const username = require(M_USERNAME);
const c_time=new Date().toLocaleString("ko-KR", {
    year: '2-digit',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    timeZone: 'Asia/Seoul'
});

const mongoose = require('mongoose');
mongoose.connect(MONGO_URI, {
    useNewUrlParser: true, useUnifiedTopology: true, useCreateIndex: true, useFindAndModify: false
}).then(() => {
    console.log(`------------------Mongodb connect-------------------`);
    username.find((err, res) => { //서버 처음 실행 시 이름 중복확인을 위해 db에서 이름목록을 가져온다.
        if (err) { }
        else {
            namelist = res;
        }
    }).lean().select({ "name": 1, "email": 1, "_id": 0 }
);

    user.find((err, res) => { //서버 재실행할 때 유저들 방 유지를 위해 db에서 token roomid name을 가져온다.
        if (err) { }
        else {
            for (let i = 0; i < res.length; i++) {
                if (!keyrooms[res[i].roomid]) {
                    keyrooms[res[i].roomid] = 0;
                    socketuser[res[i].roomid] = new Array();
                    socketusername[res[i].roomid] = new Array();
                }
                keyrooms[res[i].roomid]++;
                socketuser[res[i].roomid].push({ token: res[i].token, connect: 0 });
                socketusername[res[i].roomid].push(res[i].name);
            }
        }
    }).ne('roomid', null).select({ "_id": 0, "token": 1, "roomid": 1, "name": 1 }).lean();

}).catch(err => console.log(err));

const nodemailer = require('nodemailer');

const express = require('express');
const app = express();
const server = app.listen(CHAT_PORT, () => {
    console.log(`CHAT_SERVER ${c_time}`);
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const admin = require("firebase-admin");
const serviceAccount = require(F_KEY).f_key;
const fcm = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const socketio = require('socket.io')(server);//채팅서버
const io = socketio.listen(server);
const crypto = require('crypto');
const uuid4 = require('uuid4');

io.on('connection', function (socket) {

    socket.on('enter', function (data) { //매칭된 사람 방 입장시키기

        if (data.total !== 0 && data.roomcreate === 1 && keyrooms[data.id] === undefined) { //생성 된 방에 들어가는 경우
            io.to(socket.id).emit('cant_enter', 1); //방이 갑자기 삭제된 경우
        } else if (keyrooms[data.id] >= data.total && data.total !== 0) {
            io.to(socket.id).emit('cant_enter', 2);//방 정원이 꽉찰 경우
        } else {
            if (!keyrooms[data.id]) {
                keyrooms[data.id] = 0;
                socketuser[data.id] = new Array();
                socketusername[data.id] = new Array();
            }

            if (data.create === 0) {
                user.findOneAndUpdate({ token: data.token }, { roomid: data.id, create: 0, last:data.cdate }).lean()
                    .catch(err => { console.log(err); });
            } else {
                user.findOneAndUpdate({ token: data.token }, { roomid: data.id, create: 1,last:data.cdate }, (err, res) => {
                    if (err) {console.error(err); }
                    else { }
                }).lean();
            }


            let back_tokens = socketuser[data.id].reduce((prev, cur) => {
                if (cur.connect === 0) prev.push(cur.token);
                return prev;
            }, []);
            if (back_tokens.length > 0) {
                io.to(data.id).emit('user_enter', { name: data.name });
                enter_msg = {
                    data: {
                        enter: 'can',
                        name: data.name
                    },
                    tokens: back_tokens,
                    android: {
                        priority: 'high',
                        ttl: 86400,
                        //delay_while_idel:false
                    }
                }
                //fcm으로 백그라운드 유저한테도 입장 소식을 보내자..
                fcm.messaging().sendMulticast(enter_msg)
                    .then((response) => {
                        if (response.failureCount > 0) {
                            const failedTokens = [];
                            response.responses.forEach((resp, idx) => {
                                if (!resp.success) {
                                    failedTokens.push(registrationTokens[idx]);
                                }
                            });
                            console.log('List of tokens that caused failures: ' + failedTokens);
                        }
                        socketuser[data.id].push({ token: data.token, connect: 1 });//객체안에 배열(fcm통신을 위해)
                        socketusername[data.id].push(data.name);//방 유저들 이름
                        keyrooms[data.id]++;//방인원수
                        socket_id[socket.id] = { token: data.token, roomid: data.id };


                        //유저리스트를 본인 제외 채팅방유저들에게 전송한다.
                        socket.join(data.id);
                        //사용자 본인은 유저리스트를 전송 받는다.
                        io.to(socket.id).emit('user_list', Object.assign({}, socketusername[data.id]));
                    });
            } else {
                socketuser[data.id].push({ token: data.token, connect: 1 });//객체안에 배열(fcm통신을 위해)
                socketusername[data.id].push(data.name);//방 유저들 이름
                keyrooms[data.id]++;//방인원수
                socket_id[socket.id] = { token: data.token, roomid: data.id };
               

                //유저리스트를 본인 제외 채팅방유저들에게 전송한다.
                io.to(data.id).emit('user_enter', { name: data.name });
                socket.join(data.id);
                //사용자 본인은 유저리스트를 전송 받는다.
                io.to(socket.id).emit('user_list', Object.assign({}, socketusername[data.id]));
            }

        }
    });

    socket.on('keepenter', function (data) {
     
        socket.join(data.id);
        socket_id[socket.id] = { token: data.token, roomid: data.id };
        socketuser[data.id][socketuser[data.id].findIndex(e => { if (e.token == data.token) return true; })].connect = 1;
        io.to(socket.id).emit('canmessageexit',1);
    });

    socket.on('message', function (data) {

        if (keyrooms[data.id] === undefined) {
            io.to(socket.id).emit('garbage', { gar: 'bye' });
        } else {
            

            msg = {
                room: data.id,
                name: data.name,
                msg: data.message,
                token: data.token,
                date: data.date
            };
            new chat(msg).save();

            //포그라운드 상태에선 소켓연결된 유저에게 채팅보내기
            res_msg = {
                title: data.name,
                body: data.message,
                name: data.name,
                message: data.message
            };
            //io.to(data.id).emit('message', res_msg);
            socket.broadcast.to(data.id).emit('message',res_msg);

            //백그라운드 유저에게 보내기
            let back_tokens = socketuser[data.id].reduce((prev, cur) => {
                if (cur.connect === 0) prev.push(cur.token);
                return prev;
            }, []);
            if (back_tokens.length > 0) {

                fcm_msg = {
                    data: {
                        title: data.name,
                        body: data.message,
                        name: data.name,
                        message: data.message
                    },
                    tokens: back_tokens,
                    android: {
                        priority: 'high',
                        ttl: 86400,
                        //delay_while_idel:false
                    }
                };

                fcm.messaging().sendMulticast(fcm_msg)
                    .then((response) => {
                        if (response.failureCount > 0) {
                            const failedTokens = [];
                            response.responses.forEach((resp, idx) => {
                                if (!resp.success) {
                                    failedTokens.push(registrationTokens[idx]);
                                }
                            });
                            console.log('List of tokens that caused failures: ' + failedTokens);
                        }
                    });
            }
            

        }
    });

    socket.on('exit', function (data) {//나가기 버튼 눌렀을떄
        user.updateOne({ token: data.token }, { roomid: null, create: 0 }, (err, res) => {
            //나가는 것이 완벽하면 success로 보낸다.
        }); //비동기신호를 기다리면 앱이 ㅈㄴ 느려질 것이다 몽구스 비동기실행은 에러가 없을테니 그냥 패스하자
        io.to(socket.id).emit('onSuccessExit', 1);

        keyrooms[data.id]--;//방 인원수 줄이기
        //방 유저들의 token값 배열들을 본인 token을 제거한다. 이것은 아직 오류
        //socketusername도 본인 name을 제거해야한다.

        delete socket_id[socket.id];
        socket.leave(data.id);
        io.to(data.id).emit('user_exit', { name: data.name });
        socketuser[data.id].splice(socketuser[data.id].findIndex((e) => { if (e.token === data.token) return true }), 1);
        
        //fcm으로 백그라운드 유저한테도 퇴장 소식을 보내자..
        let back_tokens = socketuser[data.id].reduce((prev, cur) => {
            if (cur.connect === 0) prev.push(cur.token);
            return prev;
        }, []);
        if (back_tokens.length > 0) {
            exit_msg = {
                data: {
                    exit: 'can',
                    name: data.name
                },
                tokens: back_tokens,
                android: {
                    priority: 'high',
                    ttl: 86400,
                    //delay_while_idel:false
                }
            }

            fcm.messaging().sendMulticast(exit_msg)
                .then((response) => {
                    if (response.failureCount > 0) {
                        const failedTokens = [];
                        response.responses.forEach((resp, idx) => {
                            if (!resp.success) {
                                failedTokens.push(registrationTokens[idx]);
                            }
                        });
                        console.log('List of tokens that caused failures: ' + failedTokens);
                    }
                });
        }


        socketusername[data.id].splice(socketusername[data.id].indexOf(data.name), 1);

        if (keyrooms[data.id] === 0) {
            if (data.create === 1) { //실시간 매칭방이 아닐 경우
                room.deleteOne({ roomid: data.id }, (err, del) => {
                    if (err) { }
                    else { }
                });
            }
            delete keyrooms[data.id];
            delete socketuser[data.id];
            delete socketusername[data.id];
        }

    });

    socket.on('report', function (data) { //사용자 신고
        new report({
            reporter: data.reporter,
            name: data.name,
            time: data.time,
            content: data.content,
            room: data.room
        }).save()
            .then(() => {
                io.to(socket.id).emit('success_report', 1)

            })
            .catch(() => { io.to(socket.id).emit('success_report', 0) });
    });

    socket.on('disconnect', function () { // 앱을 껐을 때
        if (socket_id[socket.id] != undefined) {
            socket.leave(socket_id[socket.id].roomid);
            if (socketuser[socket_id[socket.id].roomid] != undefined) {
                socketuser[socket_id[socket.id].roomid][socketuser[socket_id[socket.id].roomid].findIndex(e => { if (e.token === socket_id[socket.id].token) return true; })].connect = 0;
                delete socket_id[socket.id]; //소켓아이디는 연결과 해제를 통해 계속 바뀐다. 그래서 값도 계속 바꿔야 한다.
            }
        }
    });
});


app.post('/roomlist', (req, res) => {
    const nDA = new Date().toLocaleString("ko-KR", {
        year: '2-digit',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        hour12: false,
        minute: '2-digit',
        timeZone: 'Asia/Seoul'
    });

    let tim2 = nDA.charAt(1);
    if (nDA.charAt(5) === '월' && nDA.charAt(9) === '일') {
        tim2 += '0' + nDA.charAt(4) + nDA.charAt(7) + nDA.charAt(8);
        if (nDA.charAt(11) === '2' && nDA.charAt(12) === '4') { tim2 += '0' + '0'; }
        else { tim2 += nDA.charAt(11) + nDA.charAt(12); }
        tim2 += nDA.charAt(14) + nDA.charAt(15);
    } else if (nDA.charAt(5) === '월' && nDA.charAt(8) === '일') {
        tim2 += '0' + nDA.charAt(4) + '0' + nDA.charAt(7);
        if (nDA.charAt(10) === '2' && nDA.charAt(11) === '4') { tim2 += '0' + '0'; }
        else { tim2 += nDA.charAt(10) + nDA.charAt(11); }
        tim2 += nDA.charAt(13) + nDA.charAt(14);
    } else if (nDA.charAt(6) === '월' && nDA.charAt(10) === '일') {
        tim2 += nDA.charAt(4) + nDA.charAt(5) + nDA.charAt(8) + nDA.charAt(9);
        if (nDA.charAt(12) === '2' && nDA.charAt(13) === '4') { tim2 += '0' + '0'; }
        else { tim2 += nDA.charAt(12) + nDA.charAt(13); }
        tim2 += nDA.charAt(15) + nDA.charAt(16);
    } else if (nDA.charAt(6) === '월' && nDA.charAt(9) === '일') {
        tim2 += nDA.charAt(4) + nDA.charAt(5) + '0' + nDA.charAt(8);
        if (nDA.charAt(11) === '2' && nDA.charAt(12) === '4') { tim2 += '0' + '0'; }
        else { tim2 += nDA.charAt(11) + nDA.charAt(12); }
        tim2 += nDA.charAt(14) + nDA.charAt(15);
    }

    room.deleteMany((err, res3) => {
        if (err) {
            console.log('roomlist-> roomdeleteMany err');
        } else {

            room.find((err, res2) => {//모든 방들을 조회한다.
                if (err) {
                    console.log('roomlist-> roomfind err');
                } else {
                    for (let i = 0; i < res2.length; i++) {
                        res2[i]['participant'] = keyrooms[res2[i].roomid];
                    }
                }

                res.json(res2);
            });
        }
    }).where('time').lte(tim2);


});

app.post('/create_room/', (req, res) => { //방 생성
    let room_id = uuid4();
    new room({
        time: req.body.time,
        roomid: room_id,
        total: req.body.total,
        title: req.body.title
    }).save().then(() => {
        res.json({
            roomid: room_id,
            create: 1
        });
    });
});

app.post('/overlap/', (req, res) => {//이름 중복 확인 중복이면 0이상, 아니면 -1
    res.json({ check: namelist.findIndex(obj => obj.name === req.query.name) });
});

app.post('/cert/', (req, res) => { //인증번호 받기
    if (namelist.findIndex(obj => obj.email === req.query.email) >= 0) {
        res.json({ cert: 'false' }); //등록된 아이디일 경우 0이상 아니면 -1
    } else {
        const random_cert = Math.random().toString().substr(2, 6);
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            host: HOST,
            port: MAIL_PORT,
            secure: false,
            auth: {
                user: USERID,
                pass: USERPASS
            }
        });

        const mailOptions = {
            from: `"안양택시" <${USERID}>`,
            to: req.query.email + '@gs.anyang.ac.kr',
            subject: '회원가입을 위한 인증번호를 입력해주세요.',
            text: random_cert
        };

        transporter.sendMail(mailOptions, (err, info) => {
            if (err) {
                res.json({ cert: 'false' });
            }
            else {
                let k=crypto.createHash('sha256').update(random_cert).digest('hex');
                k=k.split('');
                tmp=k[0];
                k[0]=k[1];
                k[1]=tmp;
                res.json({ cert: k.join('') });
            }
            
            transporter.close();

        });
    }
});

app.post('/signup/', (req, res) => {
    const arr = getTime(req.body.date, req.body.password);
    const rand = Math.random().toString(36).substr(2, 6);
    const p = crypto.createHash('sha256').update(arr.join('') + rand).digest('base64');

    new user({
        token: req.body.token,
        roomid: null,
        email: req.body.email,
        password: p,
        name: req.body.name,
        date: req.body.date,
        create: 0,
        autologin: 1,
        salt: rand,
        last:req.body.date
    }).save((err, res2) => {
        if (err) { res.json({ success: 0 }); }
        else if (res2 != undefined) {
            new username({
                name: req.body.name,
                email: req.body.email
            }).save()
                .then(() => {
                  
                    res.json({ success: 1 });
                    namelist.push({ name: req.body.name, email: req.body.email });
                    
                });
        } else {
            res.json({ success: 0 });
        }
    });

});

app.post('/login/', (req, res) => {
    user.findOne({ email: req.body.email }, (err, salt_res) => {
        if (err) { }
        else if (salt_res !== null) {
            const arr = getTime(req.body.date, req.body.password);
            const p = crypto.createHash('sha256').update(arr.join('') + salt_res.salt).digest('base64');
            user.findOneAndUpdate({ email: req.body.email, password: p }, { autologin: 1 }, (err, res2) => {
                if (err) { }
                else if (res2 !== null) {
                    if (res2 === null) { //일치하는 계정이 없을 경우
                        res.json(null);
                    } else if (res2.autologin === 1) { //다른 기기에서 로그인일 경우
                        if (res2.roomid !== null) { //채팅방 접속 상태에서 정지당하거나 강제 앱 삭제or 데이터 삭제할 경우 방이 그대로 남아 있는 상태라서 방을 나가줘야 한다.
                            
                            keyrooms[res2.roomid]--;//방 인원수 줄이기
                            
                            if (keyrooms[res2.roomid] === 0) {
                                if (res2.create === 1) { //실시간 매칭방이 아닐 경우
                                    room.deleteOne({ roomid: res2.roomid }, (err, del) => {
                                        if (err) {console.log('login-> roomdeleteOne err'); }
                                        else { }
                                    }).lean();

                                }
                                delete keyrooms[res2.roomid];
                                delete socketuser[res2.roomid];
                                delete socketusername[res2.roomid];
                            } else {
                                socketuser[res2.roomid].splice(socketuser[res2.roomid].findIndex((e) => { if (e.token === res2.token) return true }), 1);

                                let back_tokens = socketuser[res2.roomid].reduce((prev, cur) => {
                                    if (cur.connect === 0) prev.push(cur.token);
                                    return prev;
                                }, []);
                                if (back_tokens.length > 0) {
                                    exit_msg = {
                                        data: {
                                            exit: 1,
                                            name: res2.name
                                        },
                                        tokens: back_tokens,
                                        android: {
                                            priority: 'high',
                                            ttl: 86400,
                                            //delay_while_idel:false
                                        }
                                    }

                                    fcm.messaging().sendMulticast(exit_msg)
                                        .then((response) => {
                                            if (response.failureCount > 0) {
                                                const failedTokens = [];
                                                response.responses.forEach((resp, idx) => {
                                                    if (!resp.success) {
                                                        failedTokens.push(registrationTokens[idx]);
                                                    }
                                                });
                                                console.log('List of tokens that caused failures: ' + failedTokens);
                                            }
                                        });
                                }

                                socketusername[res2.roomid].splice(socketusername[res2.roomid].indexOf(res2.name), 1);
                                io.to(res2.roomid).emit('user_exit', { name: res2.name });
                            }
                        }
                        fcm.messaging().send({ data: { logout: 'can' }, token: res2.token })//다른 기기 강제로그아웃 시키기
                            .then((response) => {
                                
                            }).catch((error) => {
                                console.log('이중로그인 실패', error);
                            });

                        user.updateOne({ token: res2.token }, { roomid: null, create: 0 }, (err, res3) => {
                            if (err) { }
                            else {
                                res.json({
                                    token: res2.token,
                                    roomid: null,
                                    name: res2.name,
                                    date: res2.date,
                                    create: res2.create
                                });
                            }
                        }).lean();
                    } else {
                        if (res2.roomid !== null) { //방 입장 상태에서 정지당한 유저가 재 로그인 시
                            reportCheck(res2.date,req.body.date,req.body.email);
                            keyrooms[res2.roomid]--;//방 인원수 줄이기
                        
                            if (keyrooms[res2.roomid] === 0) {
                                if (res2.create === 1) { //실시간 매칭방이 아닐 경우
                                    room.deleteOne({ roomid: res2.roomid }, (err, del) => {
                                        if (err) {console.error(err); }
                                        else { }
                                    });
                                }
                                delete keyrooms[res2.roomid];
                                delete socketuser[res2.roomid];
                                delete socketusername[res2.roomid];
                            } else {
                                socketuser[res2.roomid].splice(socketuser[res2.roomid].findIndex((e) => { if (e.token === res2.token) return true }), 1);

                                let back_tokens = socketuser[res2.roomid].reduce((prev, cur) => {
                                    if (cur.connect === 0) prev.push(cur.token);
                                    return prev;
                                }, []);
                                if (back_tokens.length > 0) {
                                    exit_msg = {
                                        data: {
                                            exit: 1,
                                            name: res2.name
                                        },
                                        tokens: back_tokens,
                                        android: {
                                            priority: 'high',
                                            ttl: 86400,
                                            //delay_while_idel:false
                                        }
                                    }

                                    fcm.messaging().sendMulticast(exit_msg)
                                        .then((response) => {
                                            if (response.failureCount > 0) {
                                                const failedTokens = [];
                                                response.responses.forEach((resp, idx) => {
                                                    if (!resp.success) {
                                                        failedTokens.push(registrationTokens[idx]);
                                                    }
                                                });
                                                console.log('List of tokens that caused failures: ' + failedTokens);
                                            }
                                        });
                                }

                                socketusername[res2.roomid].splice(socketusername[res2.roomid].indexOf(res2.name), 1);
                                io.to(res2.roomid).emit('user_exit', { name: res2.name });

                                res.json({
                                    token: res2.token,
                                    roomid: null,
                                    name: res2.name,
                                    date: res2.date,
                                    create: res2.create
                                });
                            }
                        } else {
                            reportCheck(res2.date,req.body.date,req.body.email);
                            res.json({
                                token: res2.token,
                                roomid: null, //정지 당한 유저가 아니면 방은 null로 줘도 상관이 없다
                                name: res2.name,
                                date: res2.date,
                                create: res2.create
                            });
                        }
                        //방에 입장한 상태에서 정지상태라면 방도 나가야한다
                    }
                } else { res.json(null); }
            });
        } else { res.json(null); }
    }).lean().select({ "_id": 0, "salt": 1 });
});

app.post('/changeToken/', (req, res) => {
    user.updateOne({ token: req.body.prevtoken }, { token: req.body.token }, (err, res2) => {
        if (err) { }
        else {
            if (res2.nModified === 0) { //일치한 수정된 문서 수(=nModified)
                res.json({ success: 0 });
            } else if (res2.nModified === 1) {
                res.json({ success: 1 });
            }
        }
    }).lean();
});

app.post('/logout/', (req, res) => {
    
    user.updateOne({ name: req.query.name }, { autologin: 0 }, (err, res2) => {
        if (err) { }
        else {
          
            if (res2.nModified === 0) { //일치한 수정된 문서 수(=nModified)
                res.json({ success: 0 });
            } else if (res2.nModified === 1) {
                res.json({ success: 1 });
            }
        }
    }).lean();
});

app.post('/withdrawal/', (req, res) => {
    user.findOne({name:req.query.name},(err,res4)=>{
        if(err){}
        else{
            const p=req.query.password+res4.salt;
            user.deleteOne({ name: req.query.name, password:crypto.createHash('sha256').update(p).digest('base64') }, (err, res2) => {
                if (err) { }
                else {
                    if (res2.n === 0) { //수행된 문서 수
                        res.json({ success: 0 });
                    } else if (res2.n === 1) {
                        username.deleteOne({ name: req.query.name }, (err, res3) => {
                        
                            if (res3.n === 1) { //유저가 지워졌는데 유저네임이 안지워진다? 말이 안된다.
                                namelist.splice(namelist.findIndex(obj => obj.name === req.query.name), 1);
                                res.json({ success: 1 });
                            
                            }
                        }).lean();

                    }
                }
            }).lean();
        }
    }).lean().select({"_id":0, "salt":1});
});



function getTime(tim, p) {
    const arr = p.split('');
    for (let i = 2; i >= 0; i--) {
        tmp = arr[tim[i]];
        arr[tim[i]] = arr[tim[5 - i]];
        arr[tim[5 - i]] = tmp;
    }
    return arr;
}

function reportCheck(date,current,email_id){
    if(current<date){
        user.updateOne({email:email_id},{autologin:0},(err,res)=>{
            if(err){}
            else{}
        }).lean();
    }
}