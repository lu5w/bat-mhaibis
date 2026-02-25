'use strict';

const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// ===== FIX RENDER ROOMS RESET =====

global.rooms = global.rooms || {};
const rooms = global.rooms;

global.roomTimers = global.roomTimers || {};
const roomTimers = global.roomTimers;

// ================================

function generateCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

function broadcastRoom(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  io.to(roomCode).emit('room_update', room);
}

function clearRoomTimer(roomCode) {
  if (roomTimers[roomCode]) {
    clearTimeout(roomTimers[roomCode]);
    delete roomTimers[roomCode];
  }
}

function isLeaderOfTeam(room, socketId, team) {
  const p = room.players[socketId];
  if (!p) return false;
  return p.team === team && p.isLeader === true;
}

function reassignLeaders(room) {
  ['A','B'].forEach(team => {
    const hasLeader = Object.values(room.players).some(p => p.team === team && p.isLeader);
    if (!hasLeader) {
      const first = Object.values(room.players).find(p => p.team === team);
      if (first) first.isLeader = true;
    }
  });
}

function initHands(room) {
  room.hands = {};
  Object.values(room.players).forEach(p => {
    if (p.team === room.hidingTeam) {
      room.hands[p.id] = { left: 'closed', right: 'closed' };
    }
  });
}

// Auto-advance: after round_end, wait countdownSecs then start next round
function scheduleNextRound(roomCode) {
  clearRoomTimer(roomCode);
  const room = rooms[roomCode];
  if (!room) return;

  const secs = room.countdownSecs != null ? room.countdownSecs : 3;
  room.countdownEndsAt = Date.now() + secs * 1000;
  broadcastRoom(roomCode);

  roomTimers[roomCode] = setTimeout(() => {
    delete roomTimers[roomCode];
    advanceNextRound(roomCode);
  }, secs * 1000);
}

function advanceNextRound(roomCode) {
  const room = rooms[roomCode];
  if (!room || room.phase !== 'round_end') return;

  const reachedMax   = room.maxRounds > 0 && room.roundNumber >= room.maxRounds;
  const reachedScore = room.scores.A >= 20 || room.scores.B >= 20;

  if (reachedScore || reachedMax) {
    room.phase  = 'game_over';
    room.winner = room.scores.A >= room.scores.B ? 'A' : 'B';
    room.countdownEndsAt = null;
    broadcastRoom(roomCode);
    return;
  }

  room.hidingTeam    = room.ringTeam;
  room.searchingTeam = room.ringTeam === 'A' ? 'B' : 'A';
  room.roundNumber++;
  room.phase         = 'select_ring';
  room.ringOwner     = null;
  room.ringHand      = null;
  room.roundResult   = null;
  room.tayer         = null;
  room.countdownEndsAt = null;

  if (room.hideTimerSecs > 0) {
    room.hideTimerEndsAt = Date.now() + room.hideTimerSecs * 1000;
    scheduleHideTimeout(roomCode);
  } else {
    room.hideTimerEndsAt = null;
  }

  initHands(room);
  broadcastRoom(roomCode);
}

function scheduleHideTimeout(roomCode) {
  const room = rooms[roomCode];
  if (!room || room.hideTimerSecs <= 0) return;
  clearRoomTimer(roomCode + '_hide');

  roomTimers[roomCode + '_hide'] = setTimeout(() => {
    delete roomTimers[roomCode + '_hide'];
    const r = rooms[roomCode];
    if (!r || r.phase !== 'select_ring') return;

    const hidingPlayers = Object.values(r.players).filter(p => p.team === r.hidingTeam);
    if (hidingPlayers.length === 0) return;

    const rndPlayer = hidingPlayers[Math.floor(Math.random() * hidingPlayers.length)];
    const rndHand   = Math.random() < 0.5 ? 'left' : 'right';

    r.ringOwner = rndPlayer.id;
    r.ringHand  = rndHand;
    r.phase     = 'bat';
    r.hideTimerEndsAt = null;

    broadcastRoom(roomCode);

  }, room.hideTimerSecs * 1000);
}

io.on('connection', (socket) => {

  socket.on('create_room', ({ name }) => {

    const code = generateCode();

    rooms[code] = {
      code,
      host: socket.id,
      players: {},
      phase: 'lobby',
      hidingTeam: null,
      searchingTeam: null,
      tayer: null,
      hands: {},
      ringOwner: null,
      ringHand: null,
      scores: { A: 0, B: 0 },
      teamNames: { A: 'الفريق الأول', B: 'الفريق الثاني' },
      roundResult: null,
      winner: null,
      ringTeam: null,
      maxRounds: 0,
      roundNumber: 0,
      countdownSecs: 3,
      hideTimerSecs: 0,
      countdownEndsAt: null,
      hideTimerEndsAt: null,
      coinWinner: null,
    };

    rooms[code].players[socket.id] = {
      id: socket.id,
      name,
      team: 'A',
      isLeader: true
    };

    socket.join(code);
    socket.roomCode = code;

    socket.emit('room_created', { code });

    broadcastRoom(code);

  });


  socket.on('join_room', ({ name, code }) => {

    const room = rooms[code];

    if (!room) {
      socket.emit('error_msg', 'not_found');
      return;
    }

    if (room.phase !== 'lobby') {
      socket.emit('error_msg', 'started');
      return;
    }

    const all = Object.values(room.players);

    const countA = all.filter(p=>p.team==='A').length;
    const countB = all.filter(p=>p.team==='B').length;

    const team = countA <= countB ? 'A' : 'B';

    const isLeader = (team==='A'?countA:countB)===0;

    room.players[socket.id] = {
      id: socket.id,
      name,
      team,
      isLeader
    };

    socket.join(code);
    socket.roomCode = code;

    socket.emit('room_joined',{code});

    broadcastRoom(code);

  });


  socket.on('disconnect', () => {

    const code = socket.roomCode;

    const room = rooms[code];

    if(!room) return;

    delete room.players[socket.id];

    if(Object.keys(room.players).length===0){

      delete rooms[code];

      return;

    }

    broadcastRoom(code);

  });

});


const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {

  console.log("بات محيبس يعمل على السيرفر");

});
