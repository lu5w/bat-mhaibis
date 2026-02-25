'use strict';

const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  pingTimeout:  60000,
  pingInterval: 25000,
});

app.use(express.static(path.join(__dirname, 'public')));

// ── CRITICAL: Global rooms survive Render restarts / module hot-reloads ────
global.rooms            = global.rooms            || {};
global.roomTimers       = global.roomTimers       || {};
global.disconnectTimers = global.disconnectTimers || {};
const rooms             = global.rooms;
const roomTimers        = global.roomTimers;

// ── Direct-URL /:code support ──────────────────────────────────────────────
app.get('/:code([A-Za-z0-9]{4,6})', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Helpers ────────────────────────────────────────────────────────────────
function generateCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

function clearRoomTimer(key) {
  if (roomTimers[key]) { clearTimeout(roomTimers[key]); delete roomTimers[key]; }
}

function isLeaderOfTeam(room, socketId, team) {
  const p = room.players[socketId];
  return p ? (p.team === team && p.isLeader === true) : false;
}

function reassignLeaders(room) {
  ['A','B'].forEach(team => {
    const hasLeader = Object.values(room.players).some(p => p.team === team && p.isLeader && !p.disconnected);
    if (!hasLeader) {
      const first = Object.values(room.players).find(p => p.team === team && !p.disconnected);
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

// ── Sanitized room view — ring hidden from searching team ──────────────────
function sanitizeRoom(room, viewerSocketId) {
  const viewer        = viewerSocketId ? room.players[viewerSocketId] : null;
  const viewerIsHiding = viewer && room.hidingTeam && viewer.team === room.hidingTeam;
  const hideRingInfo  = !viewerIsHiding && ['select_ring','bat','select_tayer','search'].includes(room.phase);

  const view = {
    code:            room.code,
    host:            room.host,
    phase:           room.phase,
    hidingTeam:      room.hidingTeam,
    searchingTeam:   room.searchingTeam,
    tayer:           room.tayer,
    ringTeam:        room.ringTeam,
    ringOwner:       hideRingInfo ? null : room.ringOwner,
    ringHand:        hideRingInfo ? null : room.ringHand,
    scores:          { ...room.scores },
    teamNames:       { ...room.teamNames },
    roundResult:     room.roundResult ? { ...room.roundResult } : null,
    winner:          room.winner,
    maxRounds:       room.maxRounds,
    roundNumber:     room.roundNumber,
    countdownSecs:   room.countdownSecs,
    hideTimerSecs:   room.hideTimerSecs,
    countdownEndsAt: room.countdownEndsAt,
    hideTimerEndsAt: room.hideTimerEndsAt,
    coinWinner:      room.coinWinner,
    players:         {},
    hands:           {},
  };

  Object.values(room.players).forEach(p => { view.players[p.id] = { ...p }; });

  // Hands: searching team sees only open hands (not ring location)
  Object.entries(room.hands).forEach(([pid, h]) => {
    if (viewerIsHiding) {
      view.hands[pid] = { ...h };
    } else {
      view.hands[pid] = {
        left:  h.left  === 'open' ? 'open' : 'closed',
        right: h.right === 'open' ? 'open' : 'closed',
      };
    }
  });

  return view;
}

function broadcastRoom(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  const socketsInRoom = io.sockets.adapter.rooms.get(roomCode) || new Set();
  socketsInRoom.forEach(sid => {
    io.to(sid).emit('room_update', sanitizeRoom(room, sid));
  });
}

// ── Server-side timers ─────────────────────────────────────────────────────
function scheduleNextRound(roomCode) {
  clearRoomTimer(roomCode + '_next');
  const room = rooms[roomCode];
  if (!room) return;
  const secs = room.countdownSecs != null ? room.countdownSecs : 3;
  room.countdownEndsAt = Date.now() + secs * 1000;
  broadcastRoom(roomCode);
  roomTimers[roomCode + '_next'] = setTimeout(() => {
    delete roomTimers[roomCode + '_next'];
    advanceNextRound(roomCode);
  }, secs * 1000);
}

function advanceNextRound(roomCode) {
  const room = rooms[roomCode];
  if (!room || room.phase !== 'round_end') return;
  const reachedMax   = room.maxRounds > 0 && room.roundNumber >= room.maxRounds;
  const reachedScore = room.scores.A >= 20 || room.scores.B >= 20;
  if (reachedScore || reachedMax) {
    room.phase           = 'game_over';
    room.winner          = room.scores.A >= room.scores.B ? 'A' : 'B';
    room.countdownEndsAt = null;
    broadcastRoom(roomCode);
    return;
  }
  room.hidingTeam      = room.ringTeam;
  room.searchingTeam   = room.ringTeam === 'A' ? 'B' : 'A';
  room.roundNumber++;
  room.phase           = 'select_ring';
  room.ringOwner       = null;
  room.ringHand        = null;
  room.roundResult     = null;
  room.tayer           = null;
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
  clearRoomTimer(roomCode + '_hide');
  const room = rooms[roomCode];
  if (!room || room.hideTimerSecs <= 0) return;
  roomTimers[roomCode + '_hide'] = setTimeout(() => {
    delete roomTimers[roomCode + '_hide'];
    const r = rooms[roomCode];
    if (!r || r.phase !== 'select_ring') return;
    const hp = Object.values(r.players).filter(p => p.team === r.hidingTeam && !p.disconnected);
    if (hp.length === 0) return;
    const rp      = hp[Math.floor(Math.random() * hp.length)];
    r.ringOwner   = rp.id;
    r.ringHand    = Math.random() < 0.5 ? 'left' : 'right';
    r.phase       = 'bat';
    r.hideTimerEndsAt = null;
    broadcastRoom(roomCode);
  }, room.hideTimerSecs * 1000);
}

function schedulePlayerRemoval(roomCode, socketId) {
  const key = `dc_${roomCode}_${socketId}`;
  clearRoomTimer(key);
  roomTimers[key] = setTimeout(() => {
    delete roomTimers[key];
    const room = rooms[roomCode];
    if (!room) return;
    const p = room.players[socketId];
    if (!p || !p.disconnected) return;
    const wasLeader = p.isLeader;
    const wasTeam   = p.team;
    delete room.players[socketId];
    if (Object.keys(room.players).length === 0) {
      clearRoomTimer(roomCode + '_next');
      clearRoomTimer(roomCode + '_hide');
      clearRoomTimer(roomCode + '_coin');
      delete rooms[roomCode];
      return;
    }
    if (room.host === socketId) {
      const next = Object.values(room.players).find(pl => !pl.disconnected);
      if (next) room.host = next.id;
    }
    if (wasLeader) {
      const nl = Object.values(room.players).find(p2 => p2.team === wasTeam && !p2.disconnected);
      if (nl) nl.isLeader = true;
    }
    if (room.hands[socketId]) delete room.hands[socketId];
    broadcastRoom(roomCode);
  }, 60000); // 60 second grace period
}

// ── Socket events ──────────────────────────────────────────────────────────
io.on('connection', (socket) => {

  // RECONNECT / REJOIN
  socket.on('try_rejoin', ({ name, roomCode, oldSocketId }) => {
    const room = rooms[roomCode];
    if (!room) { socket.emit('rejoin_failed'); return; }
    // Try old socket id first
    let oldPlayer = room.players[oldSocketId];
    // Fallback: match by name if socket id rotated
    if (!oldPlayer) {
      oldPlayer = Object.values(room.players).find(p => p.name === name && p.disconnected);
    }
    if (oldPlayer && oldPlayer.disconnected) {
      const oldId = oldPlayer.id;
      clearRoomTimer(`dc_${roomCode}_${oldId}`);
      const restored = { ...oldPlayer, id: socket.id, disconnected: false };
      delete room.players[oldId];
      room.players[socket.id] = restored;
      if (room.host      === oldId) room.host      = socket.id;
      if (room.tayer     === oldId) room.tayer     = socket.id;
      if (room.ringOwner === oldId) room.ringOwner = socket.id;
      if (room.hands[oldId]) { room.hands[socket.id] = room.hands[oldId]; delete room.hands[oldId]; }
      socket.join(roomCode);
      socket.roomCode = roomCode;
      socket.emit('rejoin_ok', { code: roomCode });
      broadcastRoom(roomCode);
    } else {
      socket.emit('rejoin_failed');
    }
  });

  // CREATE ROOM
  socket.on('create_room', ({ name }) => {
    const code = generateCode();
    rooms[code] = {
      code,
      host:            socket.id,
      players:         {},
      phase:           'lobby',
      hidingTeam:      null,
      searchingTeam:   null,
      tayer:           null,
      hands:           {},
      ringOwner:       null,
      ringHand:        null,
      scores:          { A: 0, B: 0 },
      teamNames:       { A: 'الفريق الأول', B: 'الفريق الثاني' },
      roundResult:     null,
      winner:          null,
      ringTeam:        null,
      maxRounds:       0,
      roundNumber:     0,
      countdownSecs:   3,
      hideTimerSecs:   0,
      countdownEndsAt: null,
      hideTimerEndsAt: null,
      coinWinner:      null,
    };
    rooms[code].players[socket.id] = { id: socket.id, name, team: 'A', isLeader: true, disconnected: false };
    socket.join(code);
    socket.roomCode = code;
    socket.emit('room_created', { code });
    broadcastRoom(code);
  });

  // JOIN ROOM
  socket.on('join_room', ({ name, code }) => {
    const room = rooms[code];
    if (!room)                  { socket.emit('error_msg', 'not_found'); return; }
    if (room.phase !== 'lobby') { socket.emit('error_msg', 'started');   return; }
    const all    = Object.values(room.players);
    const countA = all.filter(p => p.team === 'A').length;
    const countB = all.filter(p => p.team === 'B').length;
    const team   = countA <= countB ? 'A' : 'B';
    const isLeader = (team === 'A' ? countA : countB) === 0;
    room.players[socket.id] = { id: socket.id, name, team, isLeader, disconnected: false };
    socket.join(code);
    socket.roomCode = code;
    socket.emit('room_joined', { code });
    // Notify others so they can play join.mp3
    socket.to(code).emit('player_joined', { name });
    broadcastRoom(code);
  });

  // SWITCH TEAM
  socket.on('switch_team', ({ team }) => {
    const code = socket.roomCode; const room = rooms[code];
    if (!room || room.phase !== 'lobby') return;
    const p = room.players[socket.id]; if (!p || p.team === team) return;
    const wasLeader = p.isLeader; const oldTeam = p.team;
    if (wasLeader) {
      p.isLeader = false;
      const nl = Object.values(room.players).find(x => x.id !== socket.id && x.team === oldTeam && !x.disconnected);
      if (nl) nl.isLeader = true;
    }
    p.team = team;
    const hasLeaderNew = Object.values(room.players).some(x => x.id !== socket.id && x.team === team && x.isLeader);
    p.isLeader = !hasLeaderNew;
    broadcastRoom(code);
  });

  // RENAME TEAM
  socket.on('rename_team', ({ team, newName }) => {
    const code = socket.roomCode; const room = rooms[code];
    if (!room || room.phase !== 'lobby' || !isLeaderOfTeam(room, socket.id, team)) return;
    if (!newName || !newName.trim()) return;
    room.teamNames[team] = newName.trim().substring(0, 20);
    broadcastRoom(code);
  });

  // SET SETTINGS (host only, lobby only)
  socket.on('set_settings', ({ maxRounds, countdownSecs, hideTimerSecs }) => {
    const code = socket.roomCode; const room = rooms[code];
    if (!room || socket.id !== room.host || room.phase !== 'lobby') return;
    if (maxRounds     != null) room.maxRounds     = Math.max(0,  parseInt(maxRounds)     || 0);
    if (countdownSecs != null) room.countdownSecs = Math.max(1,  parseInt(countdownSecs) || 3);
    if (hideTimerSecs != null) room.hideTimerSecs = Math.max(0,  parseInt(hideTimerSecs) || 0);
    broadcastRoom(code);
  });

  // KICK PLAYER
  socket.on('kick_player', ({ targetId }) => {
    const code = socket.roomCode; const room = rooms[code];
    if (!room || socket.id !== room.host || targetId === socket.id) return;
    const target = room.players[targetId]; if (!target) return;
    if (target.isLeader) {
      const nl = Object.values(room.players).find(p => p.id !== targetId && p.team === target.team);
      if (nl) nl.isLeader = true;
    }
    delete room.players[targetId];
    clearRoomTimer(`dc_${code}_${targetId}`);
    io.sockets.sockets.get(targetId)?.emit('kicked');
    broadcastRoom(code);
  });

  // TRANSFER HOST
  socket.on('transfer_host', ({ targetId }) => {
    const code = socket.roomCode; const room = rooms[code];
    if (!room || socket.id !== room.host || !room.players[targetId]) return;
    room.host = targetId;
    broadcastRoom(code);
  });

  // PLAY AGAIN
  socket.on('play_again', () => {
    const code = socket.roomCode; const room = rooms[code];
    if (!room || socket.id !== room.host || room.phase !== 'game_over') return;
    clearRoomTimer(code + '_next'); clearRoomTimer(code + '_hide'); clearRoomTimer(code + '_coin');
    room.phase           = 'lobby';
    room.hidingTeam      = null;
    room.searchingTeam   = null;
    room.tayer           = null;
    room.hands           = {};
    room.ringOwner       = null;
    room.ringHand        = null;
    room.scores          = { A: 0, B: 0 };
    room.roundResult     = null;
    room.winner          = null;
    room.ringTeam        = null;
    room.roundNumber     = 0;
    room.countdownEndsAt = null;
    room.hideTimerEndsAt = null;
    room.coinWinner      = null;
    broadcastRoom(code);
  });

  // START GAME
  socket.on('start_game', () => {
    const code = socket.roomCode; const room = rooms[code];
    if (!room || socket.id !== room.host) return;
    const players = Object.values(room.players).filter(p => !p.disconnected);
    if (players.length < 2)                                               { socket.emit('error_msg', 'min_players');     return; }
    if (!players.some(p=>p.team==='A') || !players.some(p=>p.team==='B')){ socket.emit('error_msg', 'need_both_teams'); return; }
    reassignLeaders(room);
    room.phase           = 'coin_toss';
    room.ringOwner       = null;
    room.ringHand        = null;
    room.roundResult     = null;
    room.tayer           = null;
    room.winner          = null;
    room.ringTeam        = null;
    room.hidingTeam      = null;
    room.searchingTeam   = null;
    room.roundNumber     = 0;
    room.scores          = { A: 0, B: 0 };
    room.countdownEndsAt = null;
    room.hideTimerEndsAt = null;
    broadcastRoom(code);
  });

  // COIN TOSS
  socket.on('coin_toss', () => {
    const code = socket.roomCode; const room = rooms[code];
    if (!room || socket.id !== room.host || room.phase !== 'coin_toss') return;
    const winner        = Math.random() < 0.5 ? 'A' : 'B';
    room.ringTeam       = winner;
    room.hidingTeam     = winner;
    room.searchingTeam  = winner === 'A' ? 'B' : 'A';
    room.phase          = 'coin_result';
    room.coinWinner     = winner;
    broadcastRoom(code);
    clearRoomTimer(code + '_coin');
    roomTimers[code + '_coin'] = setTimeout(() => {
      delete roomTimers[code + '_coin'];
      const r = rooms[code]; if (!r || r.phase !== 'coin_result') return;
      r.roundNumber++;
      r.phase = 'select_ring';
      if (r.hideTimerSecs > 0) { r.hideTimerEndsAt = Date.now() + r.hideTimerSecs * 1000; scheduleHideTimeout(code); }
      else { r.hideTimerEndsAt = null; }
      initHands(r);
      broadcastRoom(code);
    }, 2500);
  });

  // SELECT RING (hiding team leader only)
  socket.on('select_ring', ({ targetId, hand }) => {
    const code = socket.roomCode; const room = rooms[code];
    if (!room || room.phase !== 'select_ring' || !isLeaderOfTeam(room, socket.id, room.hidingTeam)) return;
    const target = room.players[targetId];
    if (!target || target.team !== room.hidingTeam) return;
    clearRoomTimer(code + '_hide');
    room.hideTimerEndsAt = null;
    room.ringOwner       = targetId;
    room.ringHand        = hand;
    room.phase           = 'bat';
    broadcastRoom(code);
  });

  // BAT (hiding team leader only)
  socket.on('bat', () => {
    const code = socket.roomCode; const room = rooms[code];
    if (!room || room.phase !== 'bat' || !isLeaderOfTeam(room, socket.id, room.hidingTeam)) return;
    room.phase = 'select_tayer';
    broadcastRoom(code);
  });

  // SELECT TAYER (searching team leader only)
  socket.on('select_tayer', ({ targetId }) => {
    const code = socket.roomCode; const room = rooms[code];
    if (!room || room.phase !== 'select_tayer' || !isLeaderOfTeam(room, socket.id, room.searchingTeam)) return;
    const target = room.players[targetId];
    if (!target || target.team !== room.searchingTeam) return;
    room.tayer = targetId;
    room.phase = 'search';
    broadcastRoom(code);
  });

  // TAK
  socket.on('tak', ({ targetId, hand }) => {
    const code = socket.roomCode; const room = rooms[code];
    if (!room || room.phase !== 'search' || socket.id !== room.tayer) return;
    const target = room.players[targetId];
    if (!target || target.team !== room.hidingTeam) return;
    if (!room.hands[targetId] || room.hands[targetId][hand] === 'open') return;
    if (targetId === room.ringOwner && hand === room.ringHand) {
      room.hands[targetId][hand] = 'open';
      room.phase       = 'round_end';
      room.roundResult = { winner: room.hidingTeam, reason: 'tak_ring', ringOwner: room.ringOwner, ringHand: room.ringHand };
      room.scores[room.hidingTeam]++;
      room.ringTeam    = room.hidingTeam;
      broadcastRoom(code);
      scheduleNextRound(code);
    } else {
      room.hands[targetId][hand] = 'open';
      broadcastRoom(code);
    }
  });

  // JEEBA
  socket.on('jeeba', ({ targetId, hand }) => {
    const code = socket.roomCode; const room = rooms[code];
    if (!room || room.phase !== 'search' || socket.id !== room.tayer) return;
    const target = room.players[targetId];
    if (!target || target.team !== room.hidingTeam || !room.hands[targetId]) return;
    if (room.hands[room.ringOwner]) room.hands[room.ringOwner][room.ringHand] = 'open';
    if (targetId === room.ringOwner && hand === room.ringHand) {
      room.phase       = 'round_end';
      room.roundResult = { winner: room.searchingTeam, reason: 'jeeba_correct', ringOwner: room.ringOwner, ringHand: room.ringHand };
      room.scores[room.searchingTeam]++;
      room.ringTeam    = room.searchingTeam;
    } else {
      room.phase       = 'round_end';
      room.roundResult = { winner: room.hidingTeam, reason: 'jeeba_wrong', ringOwner: room.ringOwner, ringHand: room.ringHand };
      room.scores[room.hidingTeam]++;
      room.ringTeam    = room.hidingTeam;
    }
    broadcastRoom(code);
    scheduleNextRound(code);
  });

  // DISCONNECT
  socket.on('disconnect', () => {
    const code = socket.roomCode; const room = rooms[code];
    if (!room) return;
    const p = room.players[socket.id];
    if (p) {
      p.disconnected = true;
      schedulePlayerRemoval(code, socket.id);
    }
    if (room.host === socket.id) {
      const next = Object.values(room.players).find(pl => !pl.disconnected);
      if (next) room.host = next.id;
    }
    broadcastRoom(code);
  });
});

server.listen(process.env.PORT || 3000, () => {
  console.log('بات محيبس — يعمل على المنفذ ' + (process.env.PORT || 3000));
});
