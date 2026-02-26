/* ── Bootstrap ────────────────────────────────────────────────────────────── */
const socket = io();

let myName = '';
let isHost = false;
let currentQ = null;        // current question data
let timerTotal = 0;         // original time limit for current question
let hasAnswered = false;
let selectedOptIndex = null;
let countdownInterval = null;

/* ── Utilities ────────────────────────────────────────────────────────────── */
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('s-' + id).classList.add('active');
}

function showError(msg) {
  const el = document.getElementById('home-error');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(showError._t);
  showError._t = setTimeout(() => el.classList.add('hidden'), 4000);
}

/* ── Lobby helpers ────────────────────────────────────────────────────────── */
function renderPlayers(players, hostId) {
  const list = document.getElementById('lob-players');
  list.innerHTML = players.map(p => `
    <div class="player-item">
      <div class="avatar">${esc(p.name[0].toUpperCase())}</div>
      <span class="player-name">${esc(p.name)}</span>
      ${p.id === hostId ? '<span class="host-badge">Host</span>' : ''}
    </div>
  `).join('');
}

/* ── Timer display ────────────────────────────────────────────────────────── */
function setTimer(time) {
  const fill = document.getElementById('timer-fill');
  const num  = document.getElementById('timer-num');
  const pct  = Math.max(0, (time / timerTotal) * 100);
  num.textContent = Math.max(0, time);
  fill.style.width = pct + '%';
  if (pct <= 30) fill.classList.add('warning');
  else fill.classList.remove('warning');
}

function initTimer(timeLimit) {
  timerTotal = timeLimit;
  const fill = document.getElementById('timer-fill');
  fill.style.width = '100%';
  fill.classList.remove('warning');
  document.getElementById('timer-num').textContent = timeLimit;
}

/* ── Home screen ──────────────────────────────────────────────────────────── */
document.getElementById('btn-create').addEventListener('click', () => {
  const name = document.getElementById('inp-name').value.trim();
  if (!name) { showError('Please enter your nickname first.'); return; }
  myName = name;
  socket.emit('create_room', { name });
});

document.getElementById('btn-join').addEventListener('click', () => {
  const name = document.getElementById('inp-name').value.trim();
  const code = document.getElementById('inp-code').value.trim().toUpperCase();
  if (!name) { showError('Please enter your nickname first.'); return; }
  if (!code) { showError('Please enter a room code.'); return; }
  myName = name;
  socket.emit('join_room', { name, code });
});

document.getElementById('inp-code').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-join').click();
});
document.getElementById('inp-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-create').click();
});

/* ── Lobby screen ─────────────────────────────────────────────────────────── */
document.getElementById('btn-start').addEventListener('click', () => {
  socket.emit('start_game');
});

/* ── Game screen ──────────────────────────────────────────────────────────── */
document.querySelectorAll('.opt').forEach(btn => {
  btn.addEventListener('click', () => {
    if (hasAnswered) return;
    const idx = parseInt(btn.dataset.i);
    selectedOptIndex = idx;

    // Mark selected
    document.querySelectorAll('.opt').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');

    // Disable all
    document.querySelectorAll('.opt').forEach(b => b.disabled = true);

    hasAnswered = true;
    socket.emit('submit_answer', { answer: btn.querySelector('.opt-txt').textContent });
  });
});

document.getElementById('btn-answer').addEventListener('click', submitOpenAnswer);
document.getElementById('inp-answer').addEventListener('keydown', e => {
  if (e.key === 'Enter') submitOpenAnswer();
});

function submitOpenAnswer() {
  if (hasAnswered) return;
  const answer = document.getElementById('inp-answer').value.trim();
  if (!answer) return;
  hasAnswered = true;

  // Hide input, show waiting
  document.getElementById('q-open').classList.add('hidden');
  document.getElementById('q-waiting').classList.remove('hidden');

  socket.emit('submit_answer', { answer });
}

/* ── Game over ────────────────────────────────────────────────────────────── */
document.getElementById('btn-home').addEventListener('click', () => {
  showScreen('home');
});

/* ── Socket events ────────────────────────────────────────────────────────── */
socket.on('room_created', ({ code, players, hostId }) => {
  isHost = true;
  document.getElementById('lob-code').textContent = code;
  renderPlayers(players, hostId);
  document.getElementById('btn-start').classList.remove('hidden');
  document.getElementById('lob-wait').classList.add('hidden');
  showScreen('lobby');
});

socket.on('room_joined', ({ code, players, hostId }) => {
  isHost = false;
  document.getElementById('lob-code').textContent = code;
  renderPlayers(players, hostId);
  document.getElementById('btn-start').classList.add('hidden');
  document.getElementById('lob-wait').classList.remove('hidden');
  showScreen('lobby');
});

socket.on('player_joined', ({ players, hostId }) => renderPlayers(players, hostId));
socket.on('player_left',   ({ players, hostId }) => renderPlayers(players, hostId));

socket.on('host_changed', ({ hostId }) => {
  if (hostId === socket.id) {
    isHost = true;
    document.getElementById('btn-start').classList.remove('hidden');
    document.getElementById('lob-wait').classList.add('hidden');
  }
});

socket.on('game_started', () => {
  showScreen('game');
});

socket.on('question', (data) => {
  currentQ = data;
  hasAnswered = false;
  selectedOptIndex = null;

  // HUD
  document.getElementById('hud-counter').textContent = `Q ${data.questionNumber}/${data.total}`;
  document.getElementById('hud-answers').textContent = `0/${data.playerCount}`;

  // Badge
  const badge = document.getElementById('q-badge');
  badge.textContent = data.type === 'multiple' ? 'Multiple Choice' : 'Open Answer';
  badge.className = `badge ${data.type}`;

  // Question text
  document.getElementById('q-text').textContent = data.question;

  // Reset waiting state
  const waiting = document.getElementById('q-waiting');
  waiting.classList.add('hidden');
  const checkIcon = document.getElementById('q-check');
  checkIcon.textContent = '…';
  checkIcon.className = 'check-icon';
  document.getElementById('q-wait-msg').innerHTML = 'Answer submitted!<br><span class="muted">Waiting for others…</span>';

  if (data.type === 'multiple') {
    // Show options, hide open input
    document.getElementById('q-options').classList.remove('hidden');
    document.getElementById('q-open').classList.add('hidden');

    const btns = document.querySelectorAll('.opt');
    data.options.forEach((opt, i) => {
      btns[i].querySelector('.opt-txt').textContent = opt;
      btns[i].disabled = false;
      btns[i].className = 'opt';
    });
  } else {
    // Show open input, hide options
    document.getElementById('q-options').classList.add('hidden');
    document.getElementById('q-open').classList.remove('hidden');
    document.getElementById('inp-answer').value = '';
    setTimeout(() => document.getElementById('inp-answer').focus(), 100);
  }

  initTimer(data.timeLimit);
  showScreen('game');
});

socket.on('time_update', ({ time }) => {
  setTimer(time);
});

socket.on('answer_count', ({ answered, total }) => {
  document.getElementById('hud-answers').textContent = `${answered}/${total}`;
});

socket.on('answer_received', ({ isCorrect, points }) => {
  const checkIcon = document.getElementById('q-check');

  if (currentQ && currentQ.type === 'multiple') {
    // Color selected option
    if (selectedOptIndex !== null) {
      const btn = document.querySelector(`.opt[data-i="${selectedOptIndex}"]`);
      if (btn) {
        btn.classList.remove('selected');
        btn.classList.add(isCorrect ? 'correct' : 'wrong');
      }
    }
    // Show waiting below options
    const waiting = document.getElementById('q-waiting');
    checkIcon.textContent = isCorrect ? '✓' : '✗';
    checkIcon.className = `check-icon ${isCorrect ? 'correct' : 'wrong'}`;
    document.getElementById('q-wait-msg').innerHTML = isCorrect
      ? `<strong>+${points} points!</strong><br><span class="muted">Waiting for others…</span>`
      : `<span style="color:var(--red)">Incorrect.</span><br><span class="muted">Waiting for others…</span>`;
    waiting.classList.remove('hidden');
  } else {
    // Open answer — update the already-shown waiting state
    checkIcon.textContent = isCorrect ? '✓' : '✗';
    checkIcon.className = `check-icon ${isCorrect ? 'correct' : 'wrong'}`;
    document.getElementById('q-wait-msg').innerHTML = isCorrect
      ? `<strong>+${points} points!</strong><br><span class="muted">Waiting for others…</span>`
      : `<span style="color:var(--red)">Incorrect.</span><br><span class="muted">Waiting for others…</span>`;
  }
});

socket.on('question_results', ({ correctAnswer, players }) => {
  document.getElementById('res-answer').textContent = correctAnswer;

  const list = document.getElementById('res-list');
  list.innerHTML = players.map((p, i) => `
    <div class="res-item ${p.isCorrect ? 'correct' : 'wrong'}">
      <span class="res-rank">${i + 1}</span>
      <div class="avatar" style="width:28px;height:28px;font-size:.75rem">${esc(p.name[0].toUpperCase())}</div>
      <span class="res-name">${esc(p.name)}</span>
      <span class="res-their-answer">${p.answer ? esc(p.answer) : '—'}</span>
      <span class="res-pts">
        ${p.isCorrect ? `+${p.points}` : '—'}<br>
        <span class="res-total">${p.totalScore} total</span>
      </span>
    </div>
  `).join('');

  // Countdown
  let secs = 6;
  document.getElementById('res-countdown').textContent = secs;
  clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    secs--;
    document.getElementById('res-countdown').textContent = Math.max(0, secs);
    if (secs <= 0) clearInterval(countdownInterval);
  }, 1000);

  showScreen('results');
});

socket.on('game_over', ({ scores }) => {
  const medals = ['🥇', '🥈', '🥉'];
  const container = document.getElementById('over-scores');
  container.innerHTML = scores.map((s, i) => `
    <div class="over-item rank-${i + 1}">
      <span class="over-rank">${medals[i] || (i + 1)}</span>
      <span class="over-name">${esc(s.name)}</span>
      <span class="over-score">${s.score} pts</span>
    </div>
  `).join('');
  showScreen('over');
});

socket.on('error', ({ message }) => {
  showError(message);
});
