'use strict';

const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

/* ===== FINAL RENDER FIX ===== */

global.rooms = global.rooms || {};
const rooms = global.rooms;

global.roomTimers = global.roomTimers || {};
const roomTimers = global.roomTimers;

/* ============================ */

function generateCode(){
 return Math.random().toString(36).substring(2,7).toUpperCase();
}

function broadcastRoom(code){
 if(!rooms[code]) return;
 io.to(code).emit('room_update',rooms[code]);
}

io.on('connection',(socket)=>{


/* CREATE ROOM */

socket.on('create_room',({name})=>{

const code=generateCode();

rooms[code]={

code,
host:socket.id,

players:{},

phase:'lobby',

scores:{A:0,B:0},

teamNames:{
A:'الفريق الأول',
B:'الفريق الثاني'
},

ringTeam:null,
hidingTeam:null,
searchingTeam:null,

ringOwner:null,
ringHand:null,

tayer:null,

hands:{},

roundNumber:0,

maxRounds:20

};

rooms[code].players[socket.id]={

id:socket.id,
name,
team:'A',
isLeader:true

};

socket.join(code);

socket.roomCode=code;

socket.emit('room_created',{code});

broadcastRoom(code);

});


/* JOIN ROOM */

socket.on('join_room',({name,code})=>{

const room=rooms[code];

if(!room){

socket.emit('error_msg','not_found');
return;

}

if(room.phase!=='lobby'){

socket.emit('error_msg','started');
return;

}

const players=Object.values(room.players);

const teamA=players.filter(p=>p.team==='A').length;
const teamB=players.filter(p=>p.team==='B').length;

const team=teamA<=teamB?'A':'B';

room.players[socket.id]={

id:socket.id,
name,
team,
isLeader:false

};

socket.join(code);

socket.roomCode=code;

socket.emit('room_joined',{code});

broadcastRoom(code);

});


/* START GAME */

socket.on('start_game',()=>{

const code=socket.roomCode;
const room=rooms[code];

if(!room) return;

if(socket.id!==room.host) return;

const players=Object.values(room.players);

if(players.length<2){

socket.emit('error_msg','min_players');
return;

}

room.phase='coin';

broadcastRoom(code);

});


/* COIN TOSS */

socket.on('coin_toss',()=>{

const code=socket.roomCode;
const room=rooms[code];

if(!room) return;

const winner=Math.random()<0.5?'A':'B';

room.ringTeam=winner;
room.hidingTeam=winner;
room.searchingTeam=winner==='A'?'B':'A';

room.phase='hide';

broadcastRoom(code);

});


/* HIDE RING */

socket.on('select_ring',({targetId,hand})=>{

const code=socket.roomCode;
const room=rooms[code];

if(!room) return;

room.ringOwner=targetId;
room.ringHand=hand;

room.phase='search';

broadcastRoom(code);

});


/* SELECT TAYER */

socket.on('select_tayer',({targetId})=>{

const code=socket.roomCode;
const room=rooms[code];

if(!room) return;

room.tayer=targetId;

broadcastRoom(code);

});


/* TAK */

socket.on('tak',({targetId,hand})=>{

const code=socket.roomCode;
const room=rooms[code];

if(!room) return;

if(targetId===room.ringOwner && hand===room.ringHand){

room.scores[room.hidingTeam]++;

room.phase='round_end';

room.ringTeam=room.hidingTeam;

}else{

broadcastRoom(code);

}

broadcastRoom(code);

});


/* JEEBA */

socket.on('jeeba',({targetId,hand})=>{

const code=socket.roomCode;
const room=rooms[code];

if(!room) return;

if(targetId===room.ringOwner && hand===room.ringHand){

room.scores[room.searchingTeam]++;

room.ringTeam=room.searchingTeam;

}else{

room.scores[room.hidingTeam]++;

room.ringTeam=room.hidingTeam;

}

room.phase='round_end';

broadcastRoom(code);

});


/* DISCONNECT */

socket.on('disconnect',()=>{

const code=socket.roomCode;
const room=rooms[code];

if(!room) return;

delete room.players[socket.id];

if(Object.keys(room.players).length===0){

delete rooms[code];

return;

}

broadcastRoom(code);

});


});


const PORT=process.env.PORT||3000;

server.listen(PORT,()=>{

console.log("بات محيبس يعمل على السيرفر");

});
