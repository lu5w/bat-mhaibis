'use strict';

const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

global.rooms = global.rooms || {};
const rooms = global.rooms;

global.roomTimers = global.roomTimers || {};
const roomTimers = global.roomTimers;
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

  // Auto-start hide timer if configured
  if (room.hideTimerSecs > 0) {
    room.hideTimerEndsAt = Date.now() + room.hideTimerSecs * 1000;
    scheduleHideTimeout(roomCode);
  } else {
    room.hideTimerEndsAt = null;
  }

  initHands(room);
  broadcastRoom(roomCode);
}

// Auto-advance hide phase if hiding timer expires without ring placed
function scheduleHideTimeout(roomCode) {
  const room = rooms[roomCode];
  if (!room || room.hideTimerSecs <= 0) return;
  clearRoomTimer(roomCode + '_hide');

  roomTimers[roomCode + '_hide'] = setTimeout(() => {
    delete roomTimers[roomCode + '_hide'];
    const r = rooms[roomCode];
    if (!r || r.phase !== 'select_ring') return;
    // Pick random ring placement if leader hasn't chosen
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

  // ── Create Room ────────────────────────────────────────────────────────────
  socket.on('create_room', ({ name }) => {
    const code = generateCode();
    rooms[code] = {
      code,
      host:             socket.id,
      players:          {},
      phase:            'lobby',
      hidingTeam:       null,
      searchingTeam:    null,
      tayer:            null,
      hands:            {},
      ringOwner:        null,
      ringHand:         null,
      scores:           { A: 0, B: 0 },
      teamNames:        { A: 'الفريق الأول', B: 'الفريق الثاني' },
      roundResult:      null,
      winner:           null,
      ringTeam:         null,
      maxRounds:        0,
      roundNumber:      0,
      countdownSecs:    3,      // auto next-round countdown
      hideTimerSecs:    0,      // 0 = no hide timer
      countdownEndsAt:  null,
      hideTimerEndsAt:  null,
      coinWinner:       null,
    };
    rooms[code].players[socket.id] = { id: socket.id, name, team: 'A', isLeader: true };
    socket.join(code);
    socket.roomCode = code;
    socket.emit('room_created', { code });
    broadcastRoom(code);
  });

  // ── Join Room ──────────────────────────────────────────────────────────────
  socket.on('join_room', ({ name, code }) => {
    const room = rooms[code];
    if (!room)                  { socket.emit('error_msg', 'not_found'); return; }
    if (room.phase !== 'lobby') { socket.emit('error_msg', 'started');   return; }

    const all    = Object.values(room.players);
    const countA = all.filter(p => p.team === 'A').length;
    const countB = all.filter(p => p.team === 'B').length;
    const team   = countA <= countB ? 'A' : 'B';
    const isLeader = (team === 'A' ? countA : countB) === 0;

    room.players[socket.id] = { id: socket.id, name, team, isLeader };
    socket.join(code);
    socket.roomCode = code;
    socket.emit('room_joined', { code });
    broadcastRoom(code);
  });

  // ── Switch Team (lobby only) ───────────────────────────────────────────────
  socket.on('switch_team', ({ team }) => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || room.phase !== 'lobby') return;
    const p = room.players[socket.id];
    if (!p || p.team === team) return;

    const wasLeader = p.isLeader;
    const oldTeam   = p.team;

    // Remove leader role from old team if needed, reassign
    if (wasLeader) {
      p.isLeader = false;
      const newLeaderOld = Object.values(room.players).find(x => x.id !== socket.id && x.team === oldTeam);
      if (newLeaderOld) newLeaderOld.isLeader = true;
    }

    p.team = team;

    // Become leader of new team if no leader there
    const hasLeaderNew = Object.values(room.players).some(x => x.id !== socket.id && x.team === team && x.isLeader);
    if (!hasLeaderNew) p.isLeader = true;
    else p.isLeader = false;

    broadcastRoom(code);
  });

  // ── Rename Team ────────────────────────────────────────────────────────────
  socket.on('rename_team', ({ team, newName }) => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || room.phase !== 'lobby') return;
    if (!isLeaderOfTeam(room, socket.id, team)) return;
    if (!newName || !newName.trim()) return;
    room.teamNames[team] = newName.trim().substring(0, 20);
    broadcastRoom(code);
  });

  // ── Host Settings ──────────────────────────────────────────────────────────
  socket.on('set_settings', ({ maxRounds, countdownSecs, hideTimerSecs }) => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || socket.id !== room.host || room.phase !== 'lobby') return;
    if (maxRounds     != null) room.maxRounds     = Math.max(0, parseInt(maxRounds)     || 0);
    if (countdownSecs != null) room.countdownSecs = Math.max(1, parseInt(countdownSecs) || 3);
    if (hideTimerSecs != null) room.hideTimerSecs = Math.max(0, parseInt(hideTimerSecs) || 0);
    broadcastRoom(code);
  });

  // ── Kick Player ────────────────────────────────────────────────────────────
  socket.on('kick_player', ({ targetId }) => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || socket.id !== room.host || targetId === socket.id) return;
    const target = room.players[targetId];
    if (!target) return;
    if (target.isLeader) {
      const nl = Object.values(room.players).find(p => p.id !== targetId && p.team === target.team);
      if (nl) nl.isLeader = true;
    }
    delete room.players[targetId];
    io.sockets.sockets.get(targetId)?.emit('kicked');
    broadcastRoom(code);
  });

  // ── Transfer Host ──────────────────────────────────────────────────────────
  socket.on('transfer_host', ({ targetId }) => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || socket.id !== room.host || !room.players[targetId]) return;
    room.host = targetId;
    broadcastRoom(code);
  });

  // ── Start Game ─────────────────────────────────────────────────────────────
  socket.on('start_game', () => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || socket.id !== room.host) return;

    const players = Object.values(room.players);
    if (players.length < 2)                            { socket.emit('error_msg', 'min_players');     return; }
    if (!players.some(p=>p.team==='A') || !players.some(p=>p.team==='B')) { socket.emit('error_msg', 'need_both_teams'); return; }

    reassignLeaders(room);

    room.phase         = 'coin_toss';
    room.ringOwner     = null;
    room.ringHand      = null;
    room.roundResult   = null;
    room.tayer         = null;
    room.winner        = null;
    room.ringTeam      = null;
    room.hidingTeam    = null;
    room.searchingTeam = null;
    room.roundNumber   = 0;
    room.scores        = { A: 0, B: 0 };
    room.countdownEndsAt = null;
    room.hideTimerEndsAt = null;

    broadcastRoom(code);
  });

  // ── Coin Toss ──────────────────────────────────────────────────────────────
  socket.on('coin_toss', () => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || socket.id !== room.host || room.phase !== 'coin_toss') return;

    const winner        = Math.random() < 0.5 ? 'A' : 'B';
    room.ringTeam       = winner;
    room.hidingTeam     = winner;
    room.searchingTeam  = winner === 'A' ? 'B' : 'A';
    room.phase          = 'coin_result';
    room.coinWinner     = winner;
    broadcastRoom(code);

    // Auto-proceed after 2.5 seconds
    clearRoomTimer(code + '_coin');
    roomTimers[code + '_coin'] = setTimeout(() => {
      delete roomTimers[code + '_coin'];
      const r = rooms[code];
      if (!r || r.phase !== 'coin_result') return;
      r.roundNumber++;
      r.phase = 'select_ring';
      if (r.hideTimerSecs > 0) {
        r.hideTimerEndsAt = Date.now() + r.hideTimerSecs * 1000;
        scheduleHideTimeout(code);
      } else {
        r.hideTimerEndsAt = null;
      }
      initHands(r);
      broadcastRoom(code);
    }, 2500);
  });

  // ── Select Ring ────────────────────────────────────────────────────────────
  socket.on('select_ring', ({ targetId, hand }) => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || room.phase !== 'select_ring') return;
    if (!isLeaderOfTeam(room, socket.id, room.hidingTeam)) return;
    const target = room.players[targetId];
    if (!target || target.team !== room.hidingTeam) return;

    // Cancel hide timer
    clearRoomTimer(code + '_hide');
    room.hideTimerEndsAt = null;

    room.ringOwner = targetId;
    room.ringHand  = hand;
    room.phase     = 'bat';
    broadcastRoom(code);
  });

  // ── BAT ───────────────────────────────────────────────────────────────────
  socket.on('bat', () => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || room.phase !== 'bat') return;
    if (!isLeaderOfTeam(room, socket.id, room.hidingTeam)) return;
    room.phase = 'select_tayer';
    broadcastRoom(code);
  });

  // ── Select Tayer ──────────────────────────────────────────────────────────
  socket.on('select_tayer', ({ targetId }) => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || room.phase !== 'select_tayer') return;
    if (!isLeaderOfTeam(room, socket.id, room.searchingTeam)) return;
    const target = room.players[targetId];
    if (!target || target.team !== room.searchingTeam) return;
    room.tayer = targetId;
    room.phase = 'search';
    broadcastRoom(code);
  });

  // ── TAK ───────────────────────────────────────────────────────────────────
  socket.on('tak', ({ targetId, hand }) => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || room.phase !== 'search' || socket.id !== room.tayer) return;
    const target = room.players[targetId];
    if (!target || target.team !== room.hidingTeam) return;
    if (!room.hands[targetId] || room.hands[targetId][hand] === 'open') return;

    if (targetId === room.ringOwner && hand === room.ringHand) {
      room.hands[targetId][hand] = 'open';
      room.phase     = 'round_end';
      room.roundResult = { winner: room.hidingTeam, reason: 'tak_ring', ringOwner: room.ringOwner, ringHand: room.ringHand };
      room.scores[room.hidingTeam]++;
      room.ringTeam  = room.hidingTeam;
      broadcastRoom(code);
      scheduleNextRound(code);
    } else {
      room.hands[targetId][hand] = 'open';
      broadcastRoom(code);
    }
  });

  // ── JEEBA ─────────────────────────────────────────────────────────────────
  socket.on('jeeba', ({ targetId, hand }) => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || room.phase !== 'search' || socket.id !== room.tayer) return;
    const target = room.players[targetId];
    if (!target || target.team !== room.hidingTeam) return;
    if (!room.hands[targetId]) return;

    if (room.hands[room.ringOwner]) room.hands[room.ringOwner][room.ringHand] = 'open';

    if (targetId === room.ringOwner && hand === room.ringHand) {
      room.phase     = 'round_end';
      room.roundResult = { winner: room.searchingTeam, reason: 'jeeba_correct', ringOwner: room.ringOwner, ringHand: room.ringHand };
      room.scores[room.searchingTeam]++;
      room.ringTeam  = room.searchingTeam;
    } else {
      room.phase     = 'round_end';
      room.roundResult = { winner: room.hidingTeam, reason: 'jeeba_wrong', ringOwner: room.ringOwner, ringHand: room.ringHand };
      room.scores[room.hidingTeam]++;
      room.ringTeam  = room.hidingTeam;
    }

    broadcastRoom(code);
    scheduleNextRound(code);
  });

  // ── Disconnect ─────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room) return;

    const leaving    = room.players[socket.id];
    const wasLeader  = leaving?.isLeader;
    const wasTeam    = leaving?.team;

    delete room.players[socket.id];

    if (Object.keys(room.players).length === 0) {
      clearRoomTimer(code);
      clearRoomTimer(code + '_hide');
      clearRoomTimer(code + '_coin');
      delete rooms[code];
      return;
    }

    if (room.host === socket.id) room.host = Object.keys(room.players)[0];

    if (wasLeader && wasTeam) {
      const nl = Object.values(room.players).find(p => p.team === wasTeam);
      if (nl) nl.isLeader = true;
    }

    broadcastRoom(code);
  });
});

server.listen(3000, () => {
  console.log('بات محيبس — يعمل على http://localhost:3000');
});
