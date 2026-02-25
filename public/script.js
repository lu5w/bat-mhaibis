'use strict';

// ── Socket ─────────────────────────────────────────────────────────────────
const socket = io();

let myId          = null;
let myRoomCode    = null;
let isHost        = false;
let currentRoom   = null;
let currentLang   = 'ar';
let audioUnlocked = false;

// ── Audio System ───────────────────────────────────────────────────────────
const audioCtx   = { ctx: null };
const soundCache = {};

function getAudioCtx() {
  if (!audioCtx.ctx) audioCtx.ctx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx.ctx;
}

async function loadSound(name) {
  if (soundCache[name]) return soundCache[name];
  try {
    const ctx = getAudioCtx();
    const res = await fetch(`/sounds/${name}.mp3`);
    const buf = await res.arrayBuffer();
    soundCache[name] = await ctx.decodeAudioData(buf);
    return soundCache[name];
  } catch(e) { console.warn('Audio load failed:', name, e); return null; }
}

function playSound(name, delayMs = 0) {
  if (!audioUnlocked) return;
  setTimeout(() => {
    loadSound(name).then(buf => {
      if (!buf) return;
      try {
        const ctx = getAudioCtx();
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(0);
      } catch(e) { console.warn('Audio play failed:', name, e); }
    });
  }, delayMs);
}

async function unlockAudio() {
  try {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') await ctx.resume();
    ['tak','jeeba','raj3','bat','win'].forEach(n => loadSound(n));
    audioUnlocked = true;
  } catch(e) { console.warn('Audio unlock failed', e); }
}

document.getElementById('au-btn').addEventListener('click', async () => {
  await unlockAudio();
  const overlay = document.getElementById('audio-unlock');
  overlay.classList.add('gone');
  setTimeout(() => overlay.style.display = 'none', 500);
});

// ── Language Strings ───────────────────────────────────────────────────────
const L = {
  ar: {
    game_title:          'بات محيبس',
    status_waiting:      'في انتظار اللاعبين...',
    status_coin_toss:    'رمي العملة لتحديد من يخبّي أولاً',
    status_coin_result:  (t) => `${t} يبدأ بإخفاء المحبس!`,
    status_hiding:       (h,s) => `${h} يخبّي — ${s} يبحث`,
    status_ring_hidden:  'المحبس مخبّي. قائد المخبّين — اضغط بات!',
    status_tayer_pick:   'قائد الباحثين: اختر الطاير',
    status_search:       (n) => `الطاير: ${n} — دوّر على المحبس!`,
    status_round_over:   'انتهت الجولة!',
    status_game_over:    'انتهت اللعبة!',
    you:                 '(أنت)',
    host_lbl:            'مضيف',
    leader_lbl:          'قائد',
    bat_title:           'المحبس مخبّي. قائد المخبّين — اضغط بات!',
    bat_wait:            'في انتظار قائد المخبّين...',
    tayer_title:         'قائد الباحثين: اختر الطاير',
    search_title:        '🔍 مرحلة البحث',
    ring_title:          (t) => `🔴 اختر حامل المحبس — ${t} يخبّي`,
    ring_wait:           'قائد المخبّين يختار مكان المحبس...',
    waiting_generic:     'في انتظار...',
    you_tayer:           '👆 أنت الطاير! اضغط طك أو جيبه على يد.',
    tayer_searching:     (n) => `الطاير: ${n} يبحث...`,
    ring_reveal:         (n,h) => `🔴 المحبس كان عند ${n} — اليد ${h==='left'?'اليسرى':'اليمنى'}`,
    win_round_winner:    'فزت 🎉',
    win_round_loser:     'خسرت 😔',
    reason_tak_ring:     'طك على يد المحبس!',
    reason_jeeba_ok:     'جيبة صحيحة! 🎯',
    reason_jeeba_wrong:  'جيبة غلط!',
    winner_game:         (t) => `🎉 ${t} فاز باللعبة!`,
    final_score:         (a,b) => `النتيجة النهائية — الأول: ${a} | الثاني: ${b}`,
    next_round_auto:     (n) => `الجولة القادمة خلال ${n} ثوان...`,
    select_tayer_btn:    'اختر طاير',
    left_hand:           'يسار ✊',
    right_hand:          '✊ يمين',
    tak_btn:             (e) => `${e} طك`,
    jeeba_btn:           'جيبه',
    left_lbl:            'يسار',
    right_lbl:           'يمين',
    err_name:            'أدخل اسمك',
    err_code:            'أدخل رمز الغرفة',
    err_not_found:       'الغرفة غير موجودة',
    err_started:         'اللعبة بدأت بالفعل',
    err_min:             'تحتاج لاعبَين على الأقل',
    err_teams:           'يجب أن يكون هناك لاعبون في كلا الفريقين',
    gameover_title:      '🏆 انتهت اللعبة 🏆',
    raja3:               'رجع!',
    lang_btn:            '🌐 English',
    coin_toss_btn:       '🪙 رمي العملة',
    coin_toss_wait:      'في انتظار المضيف لرمي العملة...',
    start_game_btn:      '▶ بدء اللعبة',
    waiting_start:       'في انتظار المضيف للبدء...',
    rename_team_ph:      'اسم الفريق...',
    rename_btn:          'تغيير',
    kick_btn:            'طرد',
    transfer_btn:        'نقل القيادة',
    round_lbl:           (n) => `الجولة ${n}`,
    max_rounds_lbl:      'عدد الجولات',
    countdown_lbl:       'ثواني بين الجولات',
    hide_timer_lbl:      'وقت الإخفاء (ثوانٍ، 0=بلا حد)',
    set_btn:             'حفظ',
    switch_team_a:       'انضمام للفريق الأول',
    switch_team_b:       'انضمام للفريق الثاني',
    hide_timer_label:    (n) => `وقت إخفاء المحبس: ${n}`,
  },
  en: {
    game_title:          'BAT MHAIBIS',
    status_waiting:      'Waiting for players...',
    status_coin_toss:    'Coin toss to decide who hides first',
    status_coin_result:  (t) => `${t} gets the ring first!`,
    status_hiding:       (h,s) => `${h} is HIDING — ${s} is SEARCHING`,
    status_ring_hidden:  'Ring hidden. Hiding leader — press BAT!',
    status_tayer_pick:   'Searching leader: Choose Tayer',
    status_search:       (n) => `Tayer: ${n} — Search for the ring!`,
    status_round_over:   'Round over!',
    status_game_over:    'Game Over!',
    you:                 '(you)',
    host_lbl:            'host',
    leader_lbl:          'leader',
    bat_title:           'Ring hidden. Hiding leader — press BAT!',
    bat_wait:            'Waiting for hiding leader...',
    tayer_title:         'Searching leader: Choose Tayer',
    search_title:        '🔍 Search Phase',
    ring_title:          (t) => `🔴 Select ring holder — ${t} is hiding`,
    ring_wait:           'Hiding leader is choosing...',
    waiting_generic:     'Waiting...',
    you_tayer:           '👆 You are the Tayer! Click TAK or JEEBA on a hand.',
    tayer_searching:     (n) => `Tayer: ${n} is searching...`,
    ring_reveal:         (n,h) => `🔴 Ring was with ${n} — ${h} hand`,
    win_round_winner:    'You Won! 🎉',
    win_round_loser:     'You Lost 😔',
    reason_tak_ring:     'TAK hit the ring hand!',
    reason_jeeba_ok:     'JEEBA correct! 🎯',
    reason_jeeba_wrong:  'JEEBA wrong!',
    winner_game:         (t) => `🎉 ${t} wins the game!`,
    final_score:         (a,b) => `Final Score — A: ${a} | B: ${b}`,
    next_round_auto:     (n) => `Next round in ${n}s...`,
    select_tayer_btn:    'Select Tayer',
    left_hand:           '✊ Left',
    right_hand:          'Right ✊',
    tak_btn:             (e) => `${e} TAK`,
    jeeba_btn:           'JEEBA',
    left_lbl:            'Left',
    right_lbl:           'Right',
    err_name:            'Enter your name',
    err_code:            'Enter a room code',
    err_not_found:       'Room not found',
    err_started:         'Game already started',
    err_min:             'Need at least 2 players',
    err_teams:           'Both teams must have players',
    gameover_title:      '🏆 GAME OVER 🏆',
    raja3:               'RAJA3!',
    lang_btn:            '🌐 عربي',
    coin_toss_btn:       '🪙 Coin Toss',
    coin_toss_wait:      'Waiting for host to toss coin...',
    start_game_btn:      '▶ Start Game',
    waiting_start:       'Waiting for host to start...',
    rename_team_ph:      'Team name...',
    rename_btn:          'Rename',
    kick_btn:            'Kick',
    transfer_btn:        'Make Host',
    round_lbl:           (n) => `Round ${n}`,
    max_rounds_lbl:      'Max Rounds',
    countdown_lbl:       'Seconds between rounds',
    hide_timer_lbl:      'Hide timer (secs, 0=unlimited)',
    set_btn:             'Save',
    switch_team_a:       'Join Team A',
    switch_team_b:       'Join Team B',
    hide_timer_label:    (n) => `Hide time remaining: ${n}`,
  }
};

function t(key, ...args) {
  const v = L[currentLang][key];
  return typeof v === 'function' ? v(...args) : (v ?? key);
}

function teamDisplayName(room, team) {
  if (!room || !room.teamNames || !team) return team || '';
  return room.teamNames[team] || team;
}

// ── Language Toggle ────────────────────────────────────────────────────────
function applyLang() {
  const html = document.documentElement;
  html.lang = currentLang;
  html.dir  = currentLang === 'ar' ? 'rtl' : 'ltr';

  document.querySelectorAll('[data-ar]').forEach(el => {
    el.textContent = el.getAttribute(`data-${currentLang}`);
  });
  document.querySelectorAll('[data-ph-ar]').forEach(el => {
    el.placeholder = el.getAttribute(`data-ph-${currentLang}`);
  });
  id('lang-toggle').textContent = t('lang_btn');

  // Update game title
  const titleEl = document.querySelector('.title-main');
  if (titleEl) titleEl.textContent = t('game_title');
  document.title = t('game_title');
  const auTitle = document.querySelector('.au-title');
  if (auTitle) auTitle.textContent = '🎵 ' + t('game_title');

  if (currentRoom) { updateScores(currentRoom); updateTeams(currentRoom); renderPhase(currentRoom); }
}

id('lang-toggle').addEventListener('click', () => {
  currentLang = currentLang === 'ar' ? 'en' : 'ar';
  applyLang();
});

// ── DOM Helpers ────────────────────────────────────────────────────────────
function id(i) { return document.getElementById(i); }

function showScreen(sid) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  id(sid).classList.add('active');
}
function showPhase(pid) {
  document.querySelectorAll('.phase-panel').forEach(p => p.classList.add('hidden'));
  id(pid).classList.remove('hidden');
}
function setStatus(msg) { id('status-text').textContent = msg; }
function setError(msg)  { id('lobby-error').textContent = msg; }

function myTeam()           { return currentRoom?.players[myId]?.team || null; }
function amLeader()         { return currentRoom?.players[myId]?.isLeader === true; }
function amHidingLeader()   { return amLeader() && myTeam() === currentRoom?.hidingTeam; }
function amSearchingLeader(){ return amLeader() && myTeam() === currentRoom?.searchingTeam; }

// ── Countdown ticker ──────────────────────────────────────────────────────
let countdownInterval = null;

function startCountdownTicker() {
  stopCountdownTicker();
  countdownInterval = setInterval(() => {
    if (!currentRoom || currentRoom.phase !== 'round_end' || !currentRoom.countdownEndsAt) return;
    const remaining = Math.max(0, Math.ceil((currentRoom.countdownEndsAt - Date.now()) / 1000));
    const el = id('countdown-text');
    if (el) el.textContent = t('next_round_auto', remaining);
    if (remaining <= 0) stopCountdownTicker();
  }, 250);
}

function stopCountdownTicker() {
  if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
}

// ── Hide timer ticker ─────────────────────────────────────────────────────
let hideTimerInterval = null;

function startHideTimerTicker() {
  stopHideTimerTicker();
  hideTimerInterval = setInterval(() => {
    if (!currentRoom || currentRoom.phase !== 'select_ring' || !currentRoom.hideTimerEndsAt) return;
    const remaining = Math.max(0, Math.ceil((currentRoom.hideTimerEndsAt - Date.now()) / 1000));
    const el = id('hide-timer-display');
    if (el) {
      el.textContent = t('hide_timer_label', remaining);
      el.classList.remove('hidden');
    }
    if (remaining <= 0) stopHideTimerTicker();
  }, 250);
}

function stopHideTimerTicker() {
  if (hideTimerInterval) { clearInterval(hideTimerInterval); hideTimerInterval = null; }
}

// ── Socket ID ──────────────────────────────────────────────────────────────
socket.on('connect', () => { myId = socket.id; });

// ── Lobby ──────────────────────────────────────────────────────────────────
id('btn-create').addEventListener('click', () => {
  const name = id('player-name').value.trim();
  if (!name) { setError(t('err_name')); return; }
  setError('');
  socket.emit('create_room', { name });
});

id('btn-join').addEventListener('click', () => {
  const name = id('player-name').value.trim();
  const code = id('room-code-input').value.trim().toUpperCase();
  if (!name) { setError(t('err_name')); return; }
  if (!code) { setError(t('err_code')); return; }
  setError('');
  socket.emit('join_room', { name, code });
});

socket.on('room_created', ({ code }) => {
  myRoomCode = code;
  isHost     = true;
  id('display-code').textContent = code;
  showScreen('screen-waiting');
});

socket.on('room_joined', ({ code }) => {
  myRoomCode = code;
  id('display-code').textContent = code;
  showScreen('screen-waiting');
});

socket.on('kicked', () => {
  stopCountdownTicker();
  stopHideTimerTicker();
  currentRoom = null;
  showScreen('screen-lobby');
  setError('تم طردك من الغرفة');
});

const errMap = {
  not_found:       () => t('err_not_found'),
  started:         () => t('err_started'),
  min_players:     () => t('err_min'),
  need_both_teams: () => t('err_teams'),
};
socket.on('error_msg', key => setError((errMap[key] || (() => key))()));

// ── Room Update ────────────────────────────────────────────────────────────
socket.on('room_update', (room) => {
  currentRoom = room;
  isHost      = room.host === myId;

  if (room.phase === 'round_end' && room.countdownEndsAt) {
    startCountdownTicker();
  } else {
    stopCountdownTicker();
  }

  if (room.phase === 'select_ring' && room.hideTimerEndsAt) {
    startHideTimerTicker();
  } else {
    stopHideTimerTicker();
    const htel = id('hide-timer-display');
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
  const teamLabels = document.querySelectorAll('.score-team');
  if (teamLabels[0]) teamLabels[0].textContent = room.teamNames?.A || 'الفريق الأول';
  if (teamLabels[1]) teamLabels[1].textContent = room.teamNames?.B || 'الفريق الثاني';
}

// ── Team Panels ────────────────────────────────────────────────────────────
function updateTeams(room) {
  const listA = id('team-a-list');
  const listB = id('team-b-list');
  listA.innerHTML = '';
  listB.innerHTML = '';

  const teamALabel = document.querySelector('.team-a-label');
  const teamBLabel = document.querySelector('.team-b-label');
  if (teamALabel) teamALabel.textContent = room.teamNames?.A || 'الفريق الأول';
  if (teamBLabel) teamBLabel.textContent = room.teamNames?.B || 'الفريق الثاني';

  const sortedPlayers = Object.values(room.players).sort((a,b) => {
    if (a.isLeader && !b.isLeader) return -1;
    if (!a.isLeader && b.isLeader) return 1;
    return 0;
  });

  sortedPlayers.forEach(p => {
    const div = document.createElement('div');
    div.className = 'player-item';
    if (p.id === room.host)  div.classList.add('is-host');
    if (p.id === room.tayer) div.classList.add('is-tayer');
    if (p.isLeader)          div.classList.add('is-leader');
    if (room.phase !== 'lobby' && room.hidingTeam) {
      div.classList.add(p.team === room.hidingTeam ? 'is-hiding' : 'is-searching');
    }

    let label = p.name;
    if (p.id === myId)      label += ' ' + t('you');
    if (p.isLeader)         label += ' [' + t('leader_lbl') + ']';
    if (p.id === room.host) label += ' 👑';
    if (room.phase !== 'lobby' && room.ringTeam === p.team && p.isLeader) label += ' 💍';

    div.textContent = label;

    if (isHost && room.phase === 'lobby' && p.id !== myId) {
      const controls = document.createElement('div');
      controls.className = 'player-controls';

      const kickBtn = document.createElement('button');
      kickBtn.className = 'btn-player-ctrl btn-kick';
      kickBtn.textContent = t('kick_btn');
      kickBtn.addEventListener('click', e => { e.stopPropagation(); socket.emit('kick_player', { targetId: p.id }); });

      const txBtn = document.createElement('button');
      txBtn.className = 'btn-player-ctrl btn-transfer';
      txBtn.textContent = t('transfer_btn');
      txBtn.addEventListener('click', e => { e.stopPropagation(); socket.emit('transfer_host', { targetId: p.id }); });

      controls.appendChild(kickBtn);
      controls.appendChild(txBtn);
      div.appendChild(controls);
    }

    (p.team === 'A' ? listA : listB).appendChild(div);
  });

  if (room.phase === 'lobby') {
    // Team switch buttons for current player
    const myP = room.players[myId];
    if (myP) {
      ['A','B'].forEach(team => {
        if (myP.team !== team) {
          const list = team === 'A' ? listA : listB;
          const switchBtn = document.createElement('button');
          switchBtn.className = 'btn btn-secondary btn-switch-team';
          switchBtn.textContent = team === 'A' ? t('switch_team_a') : t('switch_team_b');
          switchBtn.style.marginTop = '8px';
          switchBtn.style.fontSize = '13px';
          switchBtn.style.padding = '8px 14px';
          switchBtn.addEventListener('click', () => socket.emit('switch_team', { team }));
          list.appendChild(switchBtn);
        }
      });
    }

    // Rename for own team leader
    ['A','B'].forEach(team => {
      if (myP && myP.team === team && myP.isLeader) {
        const list = team === 'A' ? listA : listB;
        const renameRow = document.createElement('div');
        renameRow.className = 'rename-row';
        const inp = document.createElement('input');
        inp.type = 'text'; inp.className = 'rename-input';
        inp.placeholder = t('rename_team_ph'); inp.maxLength = 20;
        inp.value = room.teamNames?.[team] || '';
        const btn = document.createElement('button');
        btn.className = 'btn-rename'; btn.textContent = t('rename_btn');
        btn.addEventListener('click', () => { const n = inp.value.trim(); if (n) socket.emit('rename_team', { team, newName: n }); });
        renameRow.appendChild(inp); renameRow.appendChild(btn);
        list.appendChild(renameRow);
      }
    });

    // Host settings
    if (isHost) {
      const settingsRow = document.createElement('div');
      settingsRow.className = 'host-settings-row';
      settingsRow.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:8px;width:100%">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span class="settings-lbl">${t('max_rounds_lbl')}</span>
            <input type="number" id="set-max-rounds" class="rounds-input" min="0" max="99" value="${room.maxRounds || 0}"/>
            <span class="settings-lbl">${t('countdown_lbl')}</span>
            <input type="number" id="set-countdown" class="rounds-input" min="1" max="30" value="${room.countdownSecs ?? 3}"/>
            <span class="settings-lbl">${t('hide_timer_lbl')}</span>
            <input type="number" id="set-hide-timer" class="rounds-input" min="0" max="120" value="${room.hideTimerSecs ?? 0}"/>
            <button class="btn-set-rounds" id="btn-save-settings">${t('set_btn')}</button>
          </div>
        </div>
      `;
      listA.appendChild(settingsRow);
      setTimeout(() => {
        const btn = id('btn-save-settings');
        if (btn) btn.addEventListener('click', () => {
          socket.emit('set_settings', {
            maxRounds:     parseInt(id('set-max-rounds')?.value)  || 0,
            countdownSecs: parseInt(id('set-countdown')?.value)   || 3,
            hideTimerSecs: parseInt(id('set-hide-timer')?.value)  || 0,
          });
        });
      }, 0);
    }
  }
}

// ── Phase Renderer ─────────────────────────────────────────────────────────
function renderPhase(room) {
  const hn = teamDisplayName(room, room.hidingTeam);
  const sn = teamDisplayName(room, room.searchingTeam);

  switch (room.phase) {

    case 'lobby':
      showPhase('phase-lobby');
      setStatus(t('status_waiting'));
      id('btn-start').classList.toggle('hidden', !isHost);
      if (isHost) id('btn-start').textContent = t('start_game_btn');
      id('waiting-msg').classList.toggle('hidden', isHost);
      if (!isHost) id('waiting-msg').textContent = t('waiting_start');
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
      const wn = teamDisplayName(room, room.coinWinner);
      setStatus(t('status_coin_result', wn));
      id('coin-toss-title').textContent = `🪙 ${wn} — ${currentLang==='ar'?'يبدأ بالإخفاء!':'hides first!'}`;
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
      // Hide timer display
      const htel = id('hide-timer-display');
      if (htel) {
        if (room.hideTimerEndsAt) {
          const rem = Math.max(0, Math.ceil((room.hideTimerEndsAt - Date.now()) / 1000));
          htel.textContent = t('hide_timer_label', rem);
          htel.classList.remove('hidden');
        } else {
          htel.classList.add('hidden');
        }
      }
      if (amHidingLeader()) {
        renderRingSelector(room);
      } else {
        id('ring-selector').innerHTML = `<div class="waiting-msg">${t('ring_wait')}</div>`;
      }
      break;

    case 'bat':
      showPhase('phase-bat');
      setStatus(t('status_ring_hidden'));
      id('bat-phase-title').textContent = t('bat_title');
      id('btn-bat').classList.toggle('hidden', !amHidingLeader());
      id('bat-wait').classList.toggle('hidden', amHidingLeader());
      if (!amHidingLeader()) id('bat-wait').textContent = t('bat_wait');
      break;

    case 'select_tayer':
      showPhase('phase-select-tayer');
      setStatus(t('status_tayer_pick'));
      id('tayer-phase-title').textContent = t('tayer_title');
      if (amSearchingLeader()) renderTayerSelector(room);
      else id('tayer-selector').innerHTML = `<div class="waiting-msg">${t('waiting_generic')}</div>`;
      break;

    case 'search': {
      showPhase('phase-search');
      const tayer = room.players[room.tayer];
      setStatus(t('status_search', tayer ? tayer.name : '?'));
      id('search-phase-title').textContent = t('search_title');
      renderHandsGrid(room);
      break;
    }

    case 'round_end':
      showPhase('phase-round-end');
      setStatus(t('status_round_over'));
      id('raja3-text').textContent = t('raja3');
      renderRoundEnd(room);
      break;

    case 'game_over':
      showPhase('phase-game-over');
      setStatus(t('status_game_over'));
      id('gameover-title').textContent = t('gameover_title');
      id('winner-text').textContent    = t('winner_game', teamDisplayName(room, room.winner));
      id('final-score').textContent    = t('final_score', room.scores.A, room.scores.B);
      break;
  }
}

// ── Coin Toss Button ───────────────────────────────────────────────────────
id('btn-coin-toss').addEventListener('click', () => socket.emit('coin_toss'));
id('btn-proceed').addEventListener('click',   () => {}); // auto-proceeds now

// ── Start Game ─────────────────────────────────────────────────────────────
id('btn-start').addEventListener('click', () => socket.emit('start_game'));

// ── Ring Selector ──────────────────────────────────────────────────────────
function renderRingSelector(room) {
  const sel = id('ring-selector');
  sel.innerHTML = '';
  const hidingPlayers = Object.values(room.players).filter(p => p.team === room.hidingTeam);
  if (hidingPlayers.length === 0) { sel.innerHTML = `<div class="waiting-msg">لا يوجد لاعبون</div>`; return; }

  hidingPlayers.forEach(p => {
    const row = document.createElement('div');
    row.className = 'ring-row';
    const name = document.createElement('div');
    name.className = 'ring-row-name';
    name.textContent = p.name + (p.isLeader ? ' [' + t('leader_lbl') + ']' : '');
    const btns = document.createElement('div');
    btns.className = 'ring-row-btns';
    ['left','right'].forEach(hand => {
      const btn = document.createElement('button');
      btn.className = 'btn-hand';
      btn.textContent = hand === 'left' ? t('left_hand') : t('right_hand');
      if (room.ringOwner === p.id && room.ringHand === hand) btn.classList.add('ring-selected');
      btn.addEventListener('click', () => socket.emit('select_ring', { targetId: p.id, hand }));
      btns.appendChild(btn);
    });
    row.appendChild(name); row.appendChild(btns);
    sel.appendChild(row);
  });
}

// ── BAT Button ─────────────────────────────────────────────────────────────
id('btn-bat').addEventListener('click', () => { playSound('bat'); socket.emit('bat'); });

// ── Tayer Selector ─────────────────────────────────────────────────────────
function renderTayerSelector(room) {
  const sel = id('tayer-selector');
  sel.innerHTML = '';
  const searchPlayers = Object.values(room.players).filter(p => p.team === room.searchingTeam);
  searchPlayers.forEach(p => {
    const row = document.createElement('div');
    row.className = 'tayer-row';
    const name = document.createElement('div');
    name.className = 'tayer-row-name';
    name.textContent = p.name + (p.isLeader ? ' [' + t('leader_lbl') + ']' : '');
    const btn = document.createElement('button');
    btn.className = 'btn-select-tayer';
    btn.textContent = t('select_tayer_btn');
    btn.addEventListener('click', () => socket.emit('select_tayer', { targetId: p.id }));
    row.appendChild(name); row.appendChild(btn);
    sel.appendChild(row);
  });
}

// ── Hands Grid ─────────────────────────────────────────────────────────────
function renderHandsGrid(room) {
  const grid = id('hands-grid');
  grid.innerHTML = '';
  const isTayer = myId === room.tayer;
  const tayer   = room.players[room.tayer];
  id('tayer-info').textContent = isTayer ? t('you_tayer') : t('tayer_searching', tayer ? tayer.name : '?');
  const sw = id('search-wait');
  sw.textContent = t('waiting_generic');
  sw.classList.toggle('hidden', isTayer);

  const hidingPlayers = Object.values(room.players).filter(p => p.team === room.hidingTeam);
  hidingPlayers.forEach(p => {
    const handsData = room.hands[p.id] || { left:'closed', right:'closed' };
    const row = document.createElement('div');
    row.className = 'hands-row';
    const nameDiv = document.createElement('div');
    nameDiv.className = 'hands-row-name';
    nameDiv.textContent = p.name + (p.isLeader ? ' [' + t('leader_lbl') + ']' : '');
    row.appendChild(nameDiv);
    const handBtns = document.createElement('div');
    handBtns.className = 'hand-buttons';
    ['left','right'].forEach(hand => {
      const wrap = document.createElement('div');
      wrap.className = 'hand-btn-wrap';
      const lbl = document.createElement('span');
      lbl.textContent = hand === 'left' ? t('left_lbl') : t('right_lbl');
      wrap.appendChild(lbl);
      const isOpen = handsData[hand] === 'open';
      const emoji  = isOpen ? '✋' : '✊';
      if (isTayer && !isOpen) {
        const actionWrap = document.createElement('div');
        actionWrap.className = 'action-btns';
        const takBtn = document.createElement('button');
        takBtn.className = 'btn-tak';
        takBtn.textContent = t('tak_btn', emoji);
        takBtn.addEventListener('click', () => { playSound('tak'); socket.emit('tak', { targetId: p.id, hand }); });
        const jeebaBtn = document.createElement('button');
        jeebaBtn.className = 'btn-jeeba';
        jeebaBtn.textContent = t('jeeba_btn');
        jeebaBtn.addEventListener('click', () => { playSound('jeeba'); socket.emit('jeeba', { targetId: p.id, hand }); });
        actionWrap.appendChild(takBtn); actionWrap.appendChild(jeebaBtn);
        wrap.appendChild(actionWrap);
      } else {
        const disp = document.createElement('div');
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
let lastRoundResultKey = null;

function renderRoundEnd(room) {
  const res = room.roundResult;
  if (res) {
    // Determine if current player won or lost
    const myT = myTeam();
    const iWon = myT === res.winner;

    // Win/lose message for this player
    const personalMsg = iWon ? t('win_round_winner') : t('win_round_loser');

    const reasonText = {
      tak_ring:      t('reason_tak_ring'),
      jeeba_correct: t('reason_jeeba_ok'),
      jeeba_wrong:   t('reason_jeeba_wrong'),
    }[res.reason] || res.reason;

    id('round-result').textContent = personalMsg + ' — ' + reasonText;

    const owner = room.players[res.ringOwner];
    id('ring-reveal').textContent = owner ? t('ring_reveal', owner.name, res.ringHand) : '';

    // Countdown display
    const remaining = room.countdownEndsAt
      ? Math.max(0, Math.ceil((room.countdownEndsAt - Date.now()) / 1000))
      : (room.countdownSecs ?? 3);
    const cdEl = id('countdown-text');
    if (cdEl) cdEl.textContent = t('next_round_auto', remaining);

    // Sound — only once per result
    const resultKey = `${room.roundNumber}-${res.reason}`;
    if (resultKey !== lastRoundResultKey) {
      lastRoundResultKey = resultKey;
      if (res.reason === 'jeeba_correct') playSound('win', 1000);
      else playSound('raj3');
    }
  }

  // No manual next-round button — auto only
  id('btn-next-round').classList.add('hidden');
  id('next-wait').classList.remove('hidden');
  id('next-wait').textContent = '';
}

// ── Boot ───────────────────────────────────────────────────────────────────
applyLang();