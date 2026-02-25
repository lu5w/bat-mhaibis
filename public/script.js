'use strict';

// ── Socket ─────────────────────────────────────────────────────────────────
const socket = io({ reconnection: true, reconnectionDelay: 1000, reconnectionAttempts: 20 });

let myId             = null;
let myRoomCode       = null;
let isHost           = false;
let currentRoom      = null;
let currentLang      = 'ar';
let audioUnlocked    = false;
let flashTimeout     = null;
let lastRoundResultKey = null;

// ── Audio System (FIX 10 — safe HTML Audio approach) ──────────────────────
const audioElements = {};
const SOUNDS = ['tak','jeeba','raj3','bat','win','join'];

function initSounds() {
  SOUNDS.forEach(name => {
    try {
      const a = new Audio(`/sounds/${name}.mp3`);
      a.preload = 'auto';
      audioElements[name] = a;
    } catch(e) {}
  });
}
initSounds();

function playSound(name, delayMs) {
  if (!audioUnlocked) return;
  const ms = delayMs || 0;
  setTimeout(() => {
    try {
      const snd = audioElements[name];
      if (!snd) return;
      snd.pause();
      snd.currentTime = 0;
      const p = snd.play();
      if (p && typeof p.catch === 'function') p.catch(function(){});
    } catch(e) {}
  }, ms);
}

async function unlockAudio() {
  for (const name of SOUNDS) {
    try {
      const snd = audioElements[name];
      if (snd) { await snd.play(); snd.pause(); snd.currentTime = 0; }
    } catch(e) {}
  }
  audioUnlocked = true;
}

document.getElementById('au-btn').addEventListener('click', async () => {
  await unlockAudio();
  const overlay = document.getElementById('audio-unlock');
  overlay.classList.add('gone');
  setTimeout(function(){ overlay.style.display = 'none'; }, 500);
});

// ── Screen flash ───────────────────────────────────────────────────────────
function flashScreen(color) {
  if (flashTimeout) { clearTimeout(flashTimeout); document.body.style.outline = ''; }
  document.body.style.outline       = '8px solid ' + color;
  document.body.style.outlineOffset = '-8px';
  document.body.style.transition    = 'outline 0.3s';
  flashTimeout = setTimeout(function(){
    document.body.style.outline = '';
    flashTimeout = null;
  }, 2000);
}

// ── Language Strings ───────────────────────────────────────────────────────
const L = {
  ar: {
    game_title:         'بات محيبس',
    status_waiting:     'في انتظار اللاعبين...',
    status_coin_toss:   'رمي العملة لتحديد من يخبّي أولاً',
    status_coin_result: function(t){ return t + ' يبدأ بإخفاء المحبس!'; },
    status_hiding:      function(h,s){ return h + ' يخبّي — ' + s + ' يبحث'; },
    status_ring_hidden: 'المحبس مخبّي. قائد المخبّين — اضغط بات!',
    status_tayer_pick:  'قائد الباحثين: اختر الطاير',
    status_search:      function(n){ return 'الطاير: ' + n + ' — دوّر على المحبس!'; },
    status_round_over:  'انتهت الجولة!',
    status_game_over:   'انتهت اللعبة!',
    connecting:         'جارٍ الاتصال بالسيرفر...',
    you:                '(أنت)',
    host_lbl:           'مضيف',
    leader_lbl:         'قائد',
    disconnected_lbl:   '(غائب)',
    bat_title:          'المحبس مخبّي. قائد المخبّين — اضغط بات!',
    bat_wait:           'في انتظار قائد المخبّين...',
    tayer_title:        'قائد الباحثين: اختر الطاير',
    search_title:       '🔍 مرحلة البحث',
    ring_title:         function(t){ return '🔴 اختر حامل المحبس — ' + t + ' يخبّي'; },
    ring_wait:          'قائد المخبّين يختار مكان المحبس...',
    waiting_generic:    'في انتظار...',
    waiting_host_start: 'بانتظار بدء اللعبة من الهوست',
    you_tayer:          '👆 أنت الطاير! اضغط طك أو جيبه على يد.',
    tayer_searching:    function(n){ return 'الطاير: ' + n + ' يبحث...'; },
    ring_reveal_lbl:    'المحبس كان عند:',
    hand_lbl:           'اليد:',
    hand_left:          'يسار',
    hand_right:         'يمين',
    win_round_winner:   'فزت الجولة 🎉',
    win_round_loser:    'خسرت الجولة 😔',
    reason_tak_ring:    'طك على يد المحبس!',
    reason_jeeba_ok:    'جيبة صحيحة! 🎯',
    reason_jeeba_wrong: 'جيبة غلط!',
    winner_game:        function(t){ return '🎉 ' + t + ' فاز باللعبة!'; },
    final_score:        function(a,b){ return 'النتيجة النهائية — الأول: ' + a + ' | الثاني: ' + b; },
    next_round_auto:    function(n){ return 'الجولة القادمة خلال ' + n + ' ثوان...'; },
    select_tayer_btn:   'اختر طاير',
    left_hand:          '✊ يسار',
    right_hand:         'يمين ✊',
    tak_btn:            '✊ طك',
    jeeba_btn:          'جيبه',
    left_lbl:           'يسار',
    right_lbl:          'يمين',
    err_name:           'أدخل اسمك',
    err_code:           'أدخل رمز الغرفة',
    err_not_found:      'الغرفة غير موجودة',
    err_started:        'اللعبة بدأت بالفعل',
    err_min:            'تحتاج لاعبَين على الأقل',
    err_teams:          'يجب أن يكون هناك لاعبون في كلا الفريقين',
    gameover_title:     '🏆 انتهت اللعبة 🏆',
    lang_btn:           '🌐 English',
    coin_toss_btn:      '🪙 رمي العملة',
    coin_toss_wait:     'في انتظار المضيف لرمي العملة...',
    start_game_btn:     '▶ بدء اللعبة',
    rename_team_ph:     'اسم الفريق...',
    rename_btn:         'تغيير',
    kick_btn:           'طرد',
    transfer_btn:       'نقل القيادة',
    max_rounds_lbl:     'عدد الجولات',
    countdown_lbl:      'ثواني بين الجولات',
    hide_timer_lbl:     'وقت الإخفاء (ثوانٍ، 0=بلا حد)',
    set_btn:            'حفظ',
    switch_team_a:      'انضمام للفريق الأول',
    switch_team_b:      'انضمام للفريق الثاني',
    hide_timer_label:   function(n){ return 'وقت إخفاء المحبس: ' + n; },
    player_count:       function(n){ return 'عدد اللاعبين: ' + n; },
    play_again_btn:     'العب مرة اخرى',
    ring_hiding_hint:   function(n,h){ return '💍 المحبس عند: ' + n + ' — ' + (h==='left'?'اليسرى':'اليمنى'); },
  },
  en: {
    game_title:         'BAT MHAIBIS',
    status_waiting:     'Waiting for players...',
    status_coin_toss:   'Coin toss to decide who hides first',
    status_coin_result: function(t){ return t + ' gets the ring first!'; },
    status_hiding:      function(h,s){ return h + ' is HIDING — ' + s + ' is SEARCHING'; },
    status_ring_hidden: 'Ring hidden. Hiding leader — press BAT!',
    status_tayer_pick:  'Searching leader: Choose Tayer',
    status_search:      function(n){ return 'Tayer: ' + n + ' — Search for the ring!'; },
    status_round_over:  'Round over!',
    status_game_over:   'Game Over!',
    connecting:         'Connecting to server...',
    you:                '(you)',
    host_lbl:           'host',
    leader_lbl:         'leader',
    disconnected_lbl:   '(away)',
    bat_title:          'Ring hidden. Hiding leader — press BAT!',
    bat_wait:           'Waiting for hiding leader...',
    tayer_title:        'Searching leader: Choose Tayer',
    search_title:       '🔍 Search Phase',
    ring_title:         function(t){ return '🔴 Select ring holder — ' + t + ' is hiding'; },
    ring_wait:          'Hiding leader is choosing...',
    waiting_generic:    'Waiting...',
    waiting_host_start: 'Waiting for host to start the game',
    you_tayer:          '👆 You are the Tayer! Click TAK or JEEBA on a hand.',
    tayer_searching:    function(n){ return 'Tayer: ' + n + ' is searching...'; },
    ring_reveal_lbl:    'Ring was at:',
    hand_lbl:           'Hand:',
    hand_left:          'Left',
    hand_right:         'Right',
    win_round_winner:   'You Won! 🎉',
    win_round_loser:    'You Lost 😔',
    reason_tak_ring:    'TAK hit the ring hand!',
    reason_jeeba_ok:    'JEEBA correct! 🎯',
    reason_jeeba_wrong: 'JEEBA wrong!',
    winner_game:        function(t){ return '🎉 ' + t + ' wins the game!'; },
    final_score:        function(a,b){ return 'Final Score — A: ' + a + ' | B: ' + b; },
    next_round_auto:    function(n){ return 'Next round in ' + n + 's...'; },
    select_tayer_btn:   'Select Tayer',
    left_hand:          '✊ Left',
    right_hand:         'Right ✊',
    tak_btn:            '✊ TAK',
    jeeba_btn:          'JEEBA',
    left_lbl:           'Left',
    right_lbl:          'Right',
    err_name:           'Enter your name',
    err_code:           'Enter a room code',
    err_not_found:      'Room not found',
    err_started:        'Game already started',
    err_min:            'Need at least 2 players',
    err_teams:          'Both teams must have players',
    gameover_title:     '🏆 GAME OVER 🏆',
    lang_btn:           '🌐 عربي',
    coin_toss_btn:      '🪙 Coin Toss',
    coin_toss_wait:     'Waiting for host to toss coin...',
    start_game_btn:     '▶ Start Game',
    rename_team_ph:     'Team name...',
    rename_btn:         'Rename',
    kick_btn:           'Kick',
    transfer_btn:       'Make Host',
    max_rounds_lbl:     'Max Rounds',
    countdown_lbl:      'Seconds between rounds',
    hide_timer_lbl:     'Hide timer (secs, 0=unlimited)',
    set_btn:            'Save',
    switch_team_a:      'Join Team A',
    switch_team_b:      'Join Team B',
    hide_timer_label:   function(n){ return 'Hide time remaining: ' + n; },
    player_count:       function(n){ return 'Players: ' + n; },
    play_again_btn:     'Play Again',
    ring_hiding_hint:   function(n,h){ return '💍 Ring at: ' + n + ' — ' + (h==='left'?'Left':'Right'); },
  }
};

function t(key) {
  var args = Array.prototype.slice.call(arguments, 1);
  var v = L[currentLang][key];
  if (typeof v === 'function') return v.apply(null, args);
  return v !== undefined ? v : key;
}

function teamDisplayName(room, team) {
  if (!room || !room.teamNames || !team) return team || '';
  return room.teamNames[team] || team;
}

// ── Language Toggle ────────────────────────────────────────────────────────
function applyLang() {
  var html = document.documentElement;
  html.lang = currentLang;
  html.dir  = currentLang === 'ar' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-ar]').forEach(function(el){
    el.textContent = el.getAttribute('data-' + currentLang);
  });
  document.querySelectorAll('[data-ph-ar]').forEach(function(el){
    el.placeholder = el.getAttribute('data-ph-' + currentLang);
  });
  id('lang-toggle').textContent = t('lang_btn');
  var titleEl = document.querySelector('.title-main');
  if (titleEl) titleEl.textContent = t('game_title');
  document.title = t('game_title');
  var auTitle = document.querySelector('.au-title');
  if (auTitle) auTitle.textContent = '🎵 ' + t('game_title');
  if (currentRoom) { updateScores(currentRoom); updateTeams(currentRoom); renderPhase(currentRoom); }
}

id('lang-toggle').addEventListener('click', function(){
  currentLang = currentLang === 'ar' ? 'en' : 'ar';
  applyLang();
});

// ── DOM helpers ────────────────────────────────────────────────────────────
function id(i) { return document.getElementById(i); }

function showScreen(sid) {
  document.querySelectorAll('.screen').forEach(function(s){ s.classList.remove('active'); });
  id(sid).classList.add('active');
}
function showPhase(pid) {
  document.querySelectorAll('.phase-panel').forEach(function(p){ p.classList.add('hidden'); });
  id(pid).classList.remove('hidden');
}
function setStatus(msg) { id('status-text').textContent = msg; }
function setError(msg)  { id('lobby-error').textContent = msg; }

function myTeam()           { return currentRoom && currentRoom.players[myId] ? currentRoom.players[myId].team : null; }
function amLeader()         { return !!(currentRoom && currentRoom.players[myId] && currentRoom.players[myId].isLeader); }
function amHidingLeader()   { return amLeader() && myTeam() === (currentRoom && currentRoom.hidingTeam); }
function amSearchingLeader(){ return amLeader() && myTeam() === (currentRoom && currentRoom.searchingTeam); }

// ── Countdown ticker ───────────────────────────────────────────────────────
var countdownInterval = null;
function startCountdownTicker() {
  stopCountdownTicker();
  countdownInterval = setInterval(function(){
    if (!currentRoom || currentRoom.phase !== 'round_end' || !currentRoom.countdownEndsAt) return;
    var remaining = Math.max(0, Math.ceil((currentRoom.countdownEndsAt - Date.now()) / 1000));
    var el = id('countdown-text');
    if (el) el.textContent = t('next_round_auto', remaining);
    if (remaining <= 0) stopCountdownTicker();
  }, 250);
}
function stopCountdownTicker() {
  if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
}

// ── Hide timer ticker ──────────────────────────────────────────────────────
var hideTimerInterval = null;
function startHideTimerTicker() {
  stopHideTimerTicker();
  hideTimerInterval = setInterval(function(){
    if (!currentRoom || currentRoom.phase !== 'select_ring' || !currentRoom.hideTimerEndsAt) return;
    var remaining = Math.max(0, Math.ceil((currentRoom.hideTimerEndsAt - Date.now()) / 1000));
    var el = id('hide-timer-display');
    if (el) { el.textContent = t('hide_timer_label', remaining); el.classList.remove('hidden'); }
    if (remaining <= 0) stopHideTimerTicker();
  }, 250);
}
function stopHideTimerTicker() {
  if (hideTimerInterval) { clearInterval(hideTimerInterval); hideTimerInterval = null; }
}

// ── LocalStorage session ───────────────────────────────────────────────────
function saveSession(name, roomCode, socketId) {
  try {
    if (name)     localStorage.setItem('bat_name',     name);
    if (roomCode) localStorage.setItem('bat_room',     roomCode);
    if (socketId) localStorage.setItem('bat_socketId', socketId);
  } catch(e) {}
}
function loadSession() {
  try {
    return {
      name:     localStorage.getItem('bat_name')     || '',
      roomCode: localStorage.getItem('bat_room')     || '',
      socketId: localStorage.getItem('bat_socketId') || '',
    };
  } catch(e) { return { name:'', roomCode:'', socketId:'' }; }
}
function clearSession() {
  try { localStorage.removeItem('bat_room'); localStorage.removeItem('bat_socketId'); } catch(e) {}
}

// ── Socket events ──────────────────────────────────────────────────────────
socket.on('connect', function(){
  myId = socket.id;

  // Show "connecting" loading message briefly
  var lobbyErr = id('lobby-error');
  if (lobbyErr && !lobbyErr.textContent) lobbyErr.textContent = t('connecting');
  setTimeout(function(){ if (lobbyErr && lobbyErr.textContent === t('connecting')) lobbyErr.textContent = ''; }, 2000);

  // Pre-fill URL room code (direct link support)
  var pathCode = window.location.pathname.replace(/\//g, '').toUpperCase();
  if (pathCode && /^[A-Z0-9]{4,6}$/.test(pathCode)) {
    var codeInp = id('room-code-input');
    if (codeInp && !codeInp.value) codeInp.value = pathCode;
  }

  // Try to rejoin previous session
  var sess = loadSession();
  if (sess.roomCode && sess.socketId && sess.name) {
    var nameInp = id('player-name');
    if (nameInp && !nameInp.value) nameInp.value = sess.name;
    socket.emit('try_rejoin', { name: sess.name, roomCode: sess.roomCode, oldSocketId: sess.socketId });
  }
});

socket.on('disconnect', function(){
  // Persist socket id for reconnect
  if (myRoomCode) {
    var sess = loadSession();
    saveSession(sess.name, myRoomCode, socket.id);
  }
});

socket.on('rejoin_ok', function(data){
  var code = data.code;
  myRoomCode = code;
  id('display-code').textContent = code;
  var sess = loadSession();
  saveSession(sess.name, code, socket.id);
  showScreen('screen-waiting');
});

socket.on('rejoin_failed', function(){
  clearSession();
  // Still pre-fill URL code if present
  var pathCode = window.location.pathname.replace(/\//g, '').toUpperCase();
  if (pathCode && /^[A-Z0-9]{4,6}$/.test(pathCode)) {
    var codeInp = id('room-code-input');
    if (codeInp) codeInp.value = pathCode;
  }
});

socket.on('room_created', function(data){
  var code = data.code;
  myRoomCode = code;
  isHost     = true;
  id('display-code').textContent = code;
  var nameVal = id('player-name') ? id('player-name').value : '';
  saveSession(nameVal, code, socket.id);
  history.replaceState(null, '', '/' + code);
  showScreen('screen-waiting');
});

socket.on('room_joined', function(data){
  var code = data.code;
  myRoomCode = code;
  id('display-code').textContent = code;
  var nameVal = id('player-name') ? id('player-name').value : '';
  saveSession(nameVal, code, socket.id);
  history.replaceState(null, '', '/' + code);
  showScreen('screen-waiting');
});

socket.on('player_joined', function(){
  playSound('join');
});

socket.on('kicked', function(){
  stopCountdownTicker(); stopHideTimerTicker();
  clearSession();
  history.replaceState(null, '', '/');
  currentRoom = null;
  showScreen('screen-lobby');
  setError('تم طردك من الغرفة');
});

var errMap = {
  not_found:       function(){ return t('err_not_found'); },
  started:         function(){ return t('err_started'); },
  min_players:     function(){ return t('err_min'); },
  need_both_teams: function(){ return t('err_teams'); },
};
socket.on('error_msg', function(key){
  setError((errMap[key] || function(){ return key; })());
});

// ── Room Update ────────────────────────────────────────────────────────────
socket.on('room_update', function(room){
  currentRoom = room;
  isHost      = room.host === myId;

  // Persist session
  var sess = loadSession();
  if (myRoomCode) {
    var pName = (room.players[myId] && room.players[myId].name) || sess.name;
    saveSession(pName, myRoomCode, socket.id);
  }

  if (room.phase === 'round_end' && room.countdownEndsAt) startCountdownTicker();
  else stopCountdownTicker();

  if (room.phase === 'select_ring' && room.hideTimerEndsAt) startHideTimerTicker();
  else {
    stopHideTimerTicker();
    var htel = id('hide-timer-display');
    if (htel) htel.classList.add('hidden');
  }

  updateScores(room);
  updateTeams(room);
  renderPhase(room);
});

// ── Scores ─────────────────────────────────────────────────────────────────
function updateScores(room) {
  id('score-a').textContent = room.scores.A;
  id('score-b').textContent = room.scores.B;
  var teamLabels = document.querySelectorAll('.score-team');
  if (teamLabels[0]) teamLabels[0].textContent = (room.teamNames && room.teamNames.A) || 'الفريق الأول';
  if (teamLabels[1]) teamLabels[1].textContent = (room.teamNames && room.teamNames.B) || 'الفريق الثاني';
}

// ── Team Panels ────────────────────────────────────────────────────────────
function updateTeams(room) {
  var listA = id('team-a-list');
  var listB = id('team-b-list');
  listA.innerHTML = ''; listB.innerHTML = '';

  var teamALabel = document.querySelector('.team-a-label');
  var teamBLabel = document.querySelector('.team-b-label');
  if (teamALabel) teamALabel.textContent = (room.teamNames && room.teamNames.A) || 'الفريق الأول';
  if (teamBLabel) teamBLabel.textContent = (room.teamNames && room.teamNames.B) || 'الفريق الثاني';

  var totalPlayers = Object.values(room.players).filter(function(p){ return !p.disconnected; }).length;
  var pcDiv = document.createElement('div');
  pcDiv.className = 'player-count-lbl';
  pcDiv.textContent = t('player_count', totalPlayers);
  listA.appendChild(pcDiv);

  var sortedPlayers = Object.values(room.players).sort(function(a,b){
    if (a.isLeader && !b.isLeader) return -1;
    if (!a.isLeader && b.isLeader) return 1;
    return 0;
  });

  sortedPlayers.forEach(function(p){
    var div = document.createElement('div');
    div.className = 'player-item';
    if (p.disconnected)     div.classList.add('is-disconnected');
    if (p.id === room.host) div.classList.add('is-host');
    if (p.id === room.tayer)div.classList.add('is-tayer');
    if (p.isLeader)         div.classList.add('is-leader');
    if (room.phase !== 'lobby' && room.hidingTeam) {
      div.classList.add(p.team === room.hidingTeam ? 'is-hiding' : 'is-searching');
    }

    var label = p.name;
    if (p.id === myId)      label += ' ' + t('you');
    if (p.isLeader)         label += ' [' + t('leader_lbl') + ']';
    if (p.id === room.host) label += ' 👑';
    if (p.disconnected)     label += ' ' + t('disconnected_lbl');
    if (room.phase !== 'lobby' && room.ringTeam === p.team && p.isLeader) label += ' 💍';
    div.textContent = label;

    if (isHost && room.phase === 'lobby' && p.id !== myId) {
      var controls = document.createElement('div');
      controls.className = 'player-controls';
      var kickBtn = document.createElement('button');
      kickBtn.className = 'btn-player-ctrl btn-kick';
      kickBtn.textContent = t('kick_btn');
      (function(pid){
        kickBtn.addEventListener('click', function(e){ e.stopPropagation(); socket.emit('kick_player', { targetId: pid }); });
      })(p.id);
      var txBtn = document.createElement('button');
      txBtn.className = 'btn-player-ctrl btn-transfer';
      txBtn.textContent = t('transfer_btn');
      (function(pid){
        txBtn.addEventListener('click', function(e){ e.stopPropagation(); socket.emit('transfer_host', { targetId: pid }); });
      })(p.id);
      controls.appendChild(kickBtn); controls.appendChild(txBtn);
      div.appendChild(controls);
    }
    (p.team === 'A' ? listA : listB).appendChild(div);
  });

  if (room.phase === 'lobby') {
    var myP = room.players[myId];
    if (myP) {
      ['A','B'].forEach(function(team){
        if (myP.team !== team) {
          var list = team === 'A' ? listA : listB;
          var switchBtn = document.createElement('button');
          switchBtn.className = 'btn btn-secondary btn-switch-team';
          switchBtn.textContent = team === 'A' ? t('switch_team_a') : t('switch_team_b');
          switchBtn.style.marginTop = '8px'; switchBtn.style.fontSize = '13px'; switchBtn.style.padding = '8px 14px';
          (function(tm){
            switchBtn.addEventListener('click', function(){ socket.emit('switch_team', { team: tm }); });
          })(team);
          list.appendChild(switchBtn);
        }
      });

      ['A','B'].forEach(function(team){
        if (myP.team === team && myP.isLeader) {
          var list = team === 'A' ? listA : listB;
          var renameRow = document.createElement('div');
          renameRow.className = 'rename-row';
          var inp = document.createElement('input');
          inp.type = 'text'; inp.className = 'rename-input';
          inp.placeholder = t('rename_team_ph'); inp.maxLength = 20;
          inp.value = (room.teamNames && room.teamNames[team]) || '';
          var btn = document.createElement('button');
          btn.className = 'btn-rename'; btn.textContent = t('rename_btn');
          (function(tm, input){
            btn.addEventListener('click', function(){ var n = input.value.trim(); if (n) socket.emit('rename_team', { team: tm, newName: n }); });
          })(team, inp);
          renameRow.appendChild(inp); renameRow.appendChild(btn);
          list.appendChild(renameRow);
        }
      });
    }

    if (isHost) {
      var settingsRow = document.createElement('div');
      settingsRow.className = 'host-settings-row';
      settingsRow.innerHTML =
        '<div style="display:flex;flex-direction:column;gap:8px;width:100%">' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
        '<span class="settings-lbl">' + t('max_rounds_lbl') + '</span>' +
        '<input type="number" id="set-max-rounds" class="rounds-input" min="0" max="99" value="' + (room.maxRounds || 0) + '"/>' +
        '<span class="settings-lbl">' + t('countdown_lbl') + '</span>' +
        '<input type="number" id="set-countdown" class="rounds-input" min="1" max="30" value="' + (room.countdownSecs != null ? room.countdownSecs : 3) + '"/>' +
        '<span class="settings-lbl">' + t('hide_timer_lbl') + '</span>' +
        '<input type="number" id="set-hide-timer" class="rounds-input" min="0" max="120" value="' + (room.hideTimerSecs != null ? room.hideTimerSecs : 0) + '"/>' +
        '<button class="btn-set-rounds" id="btn-save-settings">' + t('set_btn') + '</button>' +
        '</div></div>';
      listA.appendChild(settingsRow);
      setTimeout(function(){
        var btn = id('btn-save-settings');
        if (btn) btn.addEventListener('click', function(){
          socket.emit('set_settings', {
            maxRounds:     parseInt((id('set-max-rounds') || {}).value)  || 0,
            countdownSecs: parseInt((id('set-countdown')  || {}).value)  || 3,
            hideTimerSecs: parseInt((id('set-hide-timer') || {}).value)  || 0,
          });
        });
      }, 0);
    }
  }
}

// ── Phase Renderer ─────────────────────────────────────────────────────────
function renderPhase(room) {
  var hn = teamDisplayName(room, room.hidingTeam);
  var sn = teamDisplayName(room, room.searchingTeam);

  switch (room.phase) {

    case 'lobby':
      showPhase('phase-lobby');
      setStatus(t('status_waiting'));
      id('btn-start').classList.toggle('hidden', !isHost);
      if (isHost) id('btn-start').textContent = t('start_game_btn');
      id('waiting-msg').classList.toggle('hidden', isHost);
      if (!isHost) id('waiting-msg').textContent = t('waiting_host_start');
      break;

    case 'coin_toss':
      showPhase('phase-coin-toss');
      setStatus(t('status_coin_toss'));
      id('coin-toss-title').textContent = t('status_coin_toss');
      id('btn-coin-toss').classList.toggle('hidden', !isHost);
      if (isHost) id('btn-coin-toss').textContent = t('coin_toss_btn');
      id('btn-proceed').classList.add('hidden');
      id('coin-wait').classList.toggle('hidden', isHost);
      if (!isHost) id('coin-wait').textContent = t('coin_toss_wait');
      break;

    case 'coin_result': {
      showPhase('phase-coin-toss');
      var wn = teamDisplayName(room, room.coinWinner);
      setStatus(t('status_coin_result', wn));
      id('coin-toss-title').textContent = '🪙 ' + wn + ' — ' + (currentLang==='ar' ? 'يبدأ بالإخفاء!' : 'hides first!');
      id('btn-coin-toss').classList.add('hidden');
      id('btn-proceed').classList.add('hidden');
      id('coin-wait').classList.remove('hidden');
      id('coin-wait').textContent = currentLang==='ar' ? 'تبدأ اللعبة...' : 'Starting...';
      break;
    }

    case 'select_ring':
      showPhase('phase-select-ring');
      setStatus(t('status_hiding', hn, sn));
      id('ring-phase-title').textContent = t('ring_title', hn);
      {
        var htel = id('hide-timer-display');
        if (htel) {
          if (room.hideTimerEndsAt) {
            var rem = Math.max(0, Math.ceil((room.hideTimerEndsAt - Date.now()) / 1000));
            htel.textContent = t('hide_timer_label', rem);
            htel.classList.remove('hidden');
          } else { htel.classList.add('hidden'); }
        }
      }
      if (amHidingLeader()) renderRingSelector(room);
      else id('ring-selector').innerHTML = '<div class="waiting-msg">' + t('ring_wait') + '</div>';
      break;

    case 'bat':
      showPhase('phase-bat');
      setStatus(t('status_ring_hidden'));
      id('bat-phase-title').textContent = t('bat_title');
      id('btn-bat').classList.toggle('hidden', !amHidingLeader());
      id('bat-wait').classList.toggle('hidden', amHidingLeader());
      if (!amHidingLeader()) id('bat-wait').textContent = t('bat_wait');
      renderBatPhaseHint(room);
      break;

    case 'select_tayer':
      showPhase('phase-select-tayer');
      setStatus(t('status_tayer_pick'));
      id('tayer-phase-title').textContent = t('tayer_title');
      if (amSearchingLeader()) renderTayerSelector(room);
      else id('tayer-selector').innerHTML = '<div class="waiting-msg">' + t('waiting_generic') + '</div>';
      break;

    case 'search': {
      showPhase('phase-search');
      var tayer = room.players[room.tayer];
      setStatus(t('status_search', tayer ? tayer.name : '?'));
      id('search-phase-title').textContent = t('search_title');
      renderHandsGrid(room);
      break;
    }

    case 'round_end':
      showPhase('phase-round-end');
      setStatus(t('status_round_over'));
      // FIX 3: Clear old "رجع" text
      var raj3 = id('raja3-text');
      if (raj3) raj3.textContent = '';
      renderRoundEnd(room);
      break;

    case 'game_over':
      showPhase('phase-game-over');
      setStatus(t('status_game_over'));
      id('gameover-title').textContent = t('gameover_title');
      id('winner-text').textContent    = t('winner_game', teamDisplayName(room, room.winner));
      id('final-score').textContent    = t('final_score', room.scores.A, room.scores.B);
      {
        var paBtn = id('btn-play-again');
        if (!paBtn) {
          paBtn = document.createElement('button');
          paBtn.id = 'btn-play-again';
          paBtn.className = 'btn btn-gold';
          paBtn.style.marginTop = '18px';
          paBtn.addEventListener('click', function(){ socket.emit('play_again'); });
          id('phase-game-over').appendChild(paBtn);
        }
        paBtn.textContent = t('play_again_btn');
        paBtn.classList.toggle('hidden', !isHost);
      }
      break;
  }
}

// ── Bat phase ring hint (hiding team only) ─────────────────────────────────
function renderBatPhaseHint(room) {
  var myT = myTeam();
  if (myT !== room.hidingTeam) {
    var old = id('bat-ring-hint');
    if (old) old.remove();
    return;
  }
  var owner = room.ringOwner ? room.players[room.ringOwner] : null;
  if (!owner || !room.ringHand) return;
  var hintEl = id('bat-ring-hint');
  if (!hintEl) {
    hintEl = document.createElement('div');
    hintEl.id = 'bat-ring-hint';
    hintEl.className = 'ring-hint-box';
    id('phase-bat').appendChild(hintEl);
  }
  hintEl.textContent = t('ring_hiding_hint', owner.name, room.ringHand);
}

// ── Coin Toss ──────────────────────────────────────────────────────────────
id('btn-coin-toss').addEventListener('click', function(){ socket.emit('coin_toss'); });
id('btn-proceed').addEventListener('click',   function(){});

// ── Start Game ─────────────────────────────────────────────────────────────
id('btn-start').addEventListener('click', function(){
  var nameInp = id('player-name');
  if (nameInp && nameInp.value) saveSession(nameInp.value.trim(), myRoomCode || '', socket.id);
  socket.emit('start_game');
});

// ── Lobby create / join ────────────────────────────────────────────────────
id('btn-create').addEventListener('click', function(){
  var name = id('player-name').value.trim();
  if (!name) { setError(t('err_name')); return; }
  setError('');
  saveSession(name, '', socket.id);
  socket.emit('create_room', { name });
});

id('btn-join').addEventListener('click', function(){
  var name = id('player-name').value.trim();
  var code = id('room-code-input').value.trim().toUpperCase();
  if (!name) { setError(t('err_name')); return; }
  if (!code) { setError(t('err_code')); return; }
  setError('');
  saveSession(name, code, socket.id);
  socket.emit('join_room', { name, code });
});

// ── Ring Selector ──────────────────────────────────────────────────────────
function renderRingSelector(room) {
  var sel = id('ring-selector'); sel.innerHTML = '';
  var hidingPlayers = Object.values(room.players).filter(function(p){ return p.team === room.hidingTeam && !p.disconnected; });
  if (hidingPlayers.length === 0) { sel.innerHTML = '<div class="waiting-msg">لا يوجد لاعبون</div>'; return; }
  hidingPlayers.forEach(function(p){
    var row = document.createElement('div'); row.className = 'ring-row';
    var name = document.createElement('div'); name.className = 'ring-row-name';
    name.textContent = p.name + (p.isLeader ? ' [' + t('leader_lbl') + ']' : '');
    var btns = document.createElement('div'); btns.className = 'ring-row-btns';
    // FIX 5: left hand first, right hand second
    ['left','right'].forEach(function(hand){
      var btn = document.createElement('button'); btn.className = 'btn-hand';
      btn.textContent = hand === 'left' ? t('left_hand') : t('right_hand');
      if (room.ringOwner === p.id && room.ringHand === hand) btn.classList.add('ring-selected');
      (function(pid, h){
        btn.addEventListener('click', function(){ socket.emit('select_ring', { targetId: pid, hand: h }); });
      })(p.id, hand);
      btns.appendChild(btn);
    });
    row.appendChild(name); row.appendChild(btns); sel.appendChild(row);
  });
}

// ── BAT Button ─────────────────────────────────────────────────────────────
id('btn-bat').addEventListener('click', function(){ playSound('bat'); socket.emit('bat'); });

// ── Tayer Selector ─────────────────────────────────────────────────────────
function renderTayerSelector(room) {
  var sel = id('tayer-selector'); sel.innerHTML = '';
  var searchPlayers = Object.values(room.players).filter(function(p){ return p.team === room.searchingTeam && !p.disconnected; });
  searchPlayers.forEach(function(p){
    var row = document.createElement('div'); row.className = 'tayer-row';
    var name = document.createElement('div'); name.className = 'tayer-row-name';
    name.textContent = p.name + (p.isLeader ? ' [' + t('leader_lbl') + ']' : '');
    var btn = document.createElement('button'); btn.className = 'btn-select-tayer';
    btn.textContent = t('select_tayer_btn');
    (function(pid){
      btn.addEventListener('click', function(){ socket.emit('select_tayer', { targetId: pid }); });
    })(p.id);
    row.appendChild(name); row.appendChild(btn); sel.appendChild(row);
  });
}

// ── Hands Grid ─────────────────────────────────────────────────────────────
function renderHandsGrid(room) {
  var grid = id('hands-grid'); grid.innerHTML = '';
  var isTayer = myId === room.tayer;
  var tayer   = room.players[room.tayer];
  id('tayer-info').textContent = isTayer ? t('you_tayer') : t('tayer_searching', tayer ? tayer.name : '?');
  var sw = id('search-wait');
  sw.textContent = t('waiting_generic');
  sw.classList.toggle('hidden', isTayer);

  // Hiding team members see ring hint during search
  var myT = myTeam();
  var existingHint = id('search-ring-hint');
  if (myT === room.hidingTeam && room.ringOwner && room.ringHand) {
    var hOwner = room.players[room.ringOwner];
    if (hOwner) {
      var hint = existingHint;
      if (!hint) {
        hint = document.createElement('div');
        hint.id = 'search-ring-hint';
        hint.className = 'ring-hint-box';
        grid.before ? grid.before(hint) : grid.parentNode.insertBefore(hint, grid);
      }
      hint.textContent = t('ring_hiding_hint', hOwner.name, room.ringHand);
    }
  } else {
    if (existingHint) existingHint.remove();
  }

  var hidingPlayers = Object.values(room.players).filter(function(p){ return p.team === room.hidingTeam; });
  hidingPlayers.forEach(function(p){
    var handsData = room.hands[p.id] || { left:'closed', right:'closed' };
    var row = document.createElement('div'); row.className = 'hands-row';
    var nameDiv = document.createElement('div'); nameDiv.className = 'hands-row-name';
    nameDiv.textContent = p.name + (p.isLeader ? ' [' + t('leader_lbl') + ']' : '');
    row.appendChild(nameDiv);
    var handBtns = document.createElement('div'); handBtns.className = 'hand-buttons';

    // FIX 5: left hand on left, right hand on right
    ['left','right'].forEach(function(hand){
      var wrap = document.createElement('div'); wrap.className = 'hand-btn-wrap';
      var lbl = document.createElement('span');
      lbl.textContent = hand === 'left' ? t('left_lbl') : t('right_lbl');
      wrap.appendChild(lbl);
      var isOpen = handsData[hand] === 'open';
      var emoji  = isOpen ? '✋' : '✊';

      if (isTayer && !isOpen) {
        var actionWrap = document.createElement('div'); actionWrap.className = 'action-btns';
        var takBtn = document.createElement('button'); takBtn.className = 'btn-tak';
        takBtn.textContent = t('tak_btn');
        (function(pid, h){
          takBtn.addEventListener('click', function(){ playSound('tak'); socket.emit('tak', { targetId: pid, hand: h }); });
        })(p.id, hand);
        var jeebaBtn = document.createElement('button'); jeebaBtn.className = 'btn-jeeba';
        jeebaBtn.textContent = t('jeeba_btn');
        (function(pid, h){
          jeebaBtn.addEventListener('click', function(){ playSound('jeeba'); socket.emit('jeeba', { targetId: pid, hand: h }); });
        })(p.id, hand);
        actionWrap.appendChild(takBtn); actionWrap.appendChild(jeebaBtn);
        wrap.appendChild(actionWrap);
      } else {
        var disp = document.createElement('div');
        disp.className = 'hand-display' + (isOpen ? ' open-hand' : '');
        disp.textContent = emoji;
        wrap.appendChild(disp);
      }
      handBtns.appendChild(wrap);
    });
    row.appendChild(handBtns);
    grid.appendChild(row);
  });
}

// ── Round End ──────────────────────────────────────────────────────────────
function renderRoundEnd(room) {
  var res = room.roundResult;
  if (!res) return;

  var myT  = myTeam();
  var iWon = myT === res.winner;

  // FIX 3: فزت الجولة / خسرت الجولة (no "رجع")
  var resultEl = id('round-result');
  resultEl.textContent  = iWon ? t('win_round_winner') : t('win_round_loser');
  resultEl.style.color      = iWon ? '#2ed573' : '#ff3e55';
  resultEl.style.fontSize   = '28px';
  resultEl.style.fontWeight = '900';

  var reasonText = {
    tak_ring:      t('reason_tak_ring'),
    jeeba_correct: t('reason_jeeba_ok'),
    jeeba_wrong:   t('reason_jeeba_wrong'),
  }[res.reason] || res.reason;

  // NEW FEATURE 3: Ring reveal details
  var owner    = room.players[res.ringOwner];
  var revealEl = id('ring-reveal');
  if (owner) {
    var handName = res.ringHand === 'left' ? t('hand_left') : t('hand_right');
    revealEl.innerHTML =
      '<div class="ring-reveal-block">' +
        '<div class="ring-reveal-lbl">' + t('ring_reveal_lbl') + '</div>' +
        '<div class="ring-reveal-name">' + owner.name + '</div>' +
        '<div class="ring-reveal-lbl">' + t('hand_lbl') + '</div>' +
        '<div class="ring-reveal-hand">' + handName + '</div>' +
        '<div class="ring-reveal-reason">' + reasonText + '</div>' +
      '</div>';
  } else {
    revealEl.textContent = reasonText;
  }

  // Countdown display
  var remaining = room.countdownEndsAt
    ? Math.max(0, Math.ceil((room.countdownEndsAt - Date.now()) / 1000))
    : (room.countdownSecs != null ? room.countdownSecs : 3);
  var cdEl = id('countdown-text');
  if (cdEl) cdEl.textContent = t('next_round_auto', remaining);

  // Sound + flash — only once per result
  var resultKey = room.roundNumber + '-' + res.reason;
  if (resultKey !== lastRoundResultKey) {
    lastRoundResultKey = resultKey;
    if (res.reason === 'jeeba_correct') {
      playSound('win', 1000);
    } else {
      playSound('raj3');
    }
    // FIX 8 & 9: Flash screen
    if (iWon) flashScreen('#2ed573'); // green for winner
    else      flashScreen('#ff3e55'); // red for loser
  }

  id('btn-next-round').classList.add('hidden');
  id('next-wait').classList.remove('hidden');
  id('next-wait').textContent = '';
}

// ── Boot ───────────────────────────────────────────────────────────────────
// NEW FEATURE 4: Loading message
(function(){
  var lobbyErr = id('lobby-error');
  if (lobbyErr) {
    lobbyErr.textContent = t('connecting');
    setTimeout(function(){ if (lobbyErr.textContent === t('connecting')) lobbyErr.textContent = ''; }, 2000);
  }

  // NEW FEATURE 6: Direct URL room code pre-fill
  var pathCode = window.location.pathname.replace(/\//g, '').toUpperCase();
  if (pathCode && /^[A-Z0-9]{4,6}$/.test(pathCode)) {
    var codeInp = id('room-code-input');
    if (codeInp) codeInp.value = pathCode;
  }
})();

applyLang();
