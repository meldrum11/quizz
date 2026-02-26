const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// ── Questions ──────────────────────────────────────────────────────────────────
const ALL_QUESTIONS = [
  // Multiple-choice
  {
    type: 'multiple',
    question: 'What is the capital of France?',
    options: ['London', 'Berlin', 'Paris', 'Madrid'],
    answer: 'Paris',
    timeLimit: 20,
  },
  {
    type: 'multiple',
    question: 'Which planet is closest to the Sun?',
    options: ['Venus', 'Earth', 'Mars', 'Mercury'],
    answer: 'Mercury',
    timeLimit: 20,
  },
  {
    type: 'multiple',
    question: 'Who painted the Mona Lisa?',
    options: ['Michelangelo', 'Raphael', 'Leonardo da Vinci', 'Picasso'],
    answer: 'Leonardo da Vinci',
    timeLimit: 20,
  },
  {
    type: 'multiple',
    question: 'What is 7 × 8?',
    options: ['48', '52', '56', '64'],
    answer: '56',
    timeLimit: 15,
  },
  {
    type: 'multiple',
    question: 'Which country won the 2022 FIFA World Cup?',
    options: ['France', 'Argentina', 'Brazil', 'Germany'],
    answer: 'Argentina',
    timeLimit: 20,
  },
  {
    type: 'multiple',
    question: 'What is the largest ocean on Earth?',
    options: ['Atlantic', 'Indian', 'Arctic', 'Pacific'],
    answer: 'Pacific',
    timeLimit: 15,
  },
  {
    type: 'multiple',
    question: 'How many sides does a hexagon have?',
    options: ['5', '6', '7', '8'],
    answer: '6',
    timeLimit: 15,
  },
  {
    type: 'multiple',
    question: "Which element has the chemical symbol 'Au'?",
    options: ['Silver', 'Gold', 'Copper', 'Aluminum'],
    answer: 'Gold',
    timeLimit: 20,
  },
  {
    type: 'multiple',
    question: 'How many players are on a standard soccer team?',
    options: ['9', '10', '11', '12'],
    answer: '11',
    timeLimit: 15,
  },
  {
    type: 'multiple',
    question: 'What is the hardest natural substance on Earth?',
    options: ['Iron', 'Quartz', 'Diamond', 'Titanium'],
    answer: 'Diamond',
    timeLimit: 20,
  },
  // Open-ended
  {
    type: 'open',
    question: 'What is the largest planet in our solar system?',
    answer: 'Jupiter',
    timeLimit: 25,
  },
  {
    type: 'open',
    question: 'In what year did World War II end?',
    answer: '1945',
    timeLimit: 20,
  },
  {
    type: 'open',
    question: 'What is the chemical symbol for water?',
    answer: 'H2O',
    alternatives: ['h2o'],
    timeLimit: 20,
  },
  {
    type: 'open',
    question: 'Who wrote "Romeo and Juliet"?',
    answer: 'Shakespeare',
    alternatives: ['william shakespeare'],
    timeLimit: 25,
  },
  {
    type: 'open',
    question: 'What is the square root of 144?',
    answer: '12',
    timeLimit: 20,
  },
  {
    type: 'open',
    question: 'What is the fastest land animal?',
    answer: 'Cheetah',
    timeLimit: 25,
  },
  {
    type: 'open',
    question: 'In which country is the Eiffel Tower located?',
    answer: 'France',
    timeLimit: 20,
  },
  {
    type: 'open',
    question: 'How many bones are in the adult human body?',
    answer: '206',
    timeLimit: 25,
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────────
function randomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function checkAnswer(submitted, question) {
  const norm = submitted.trim().toLowerCase();
  if (norm === question.answer.trim().toLowerCase()) return true;
  if (question.alternatives) {
    return question.alternatives.some(a => a.trim().toLowerCase() === norm);
  }
  return false;
}

// ── Room helpers ───────────────────────────────────────────────────────────────
const rooms = new Map();

function playerRoom(socketId) {
  for (const room of rooms.values()) {
    if (room.players.some(p => p.id === socketId)) return room;
  }
  return null;
}

// ── Game logic ─────────────────────────────────────────────────────────────────
function sendQuestion(room) {
  room.currentQuestion++;

  if (room.currentQuestion >= room.questions.length) {
    endGame(room);
    return;
  }

  const q = room.questions[room.currentQuestion];
  room.state = 'question';
  room.answers = {};
  room.timeRemaining = q.timeLimit;

  const payload = {
    type: q.type,
    question: q.question,
    timeLimit: q.timeLimit,
    questionNumber: room.currentQuestion + 1,
    total: room.questions.length,
    playerCount: room.players.length,
  };
  if (q.type === 'multiple') payload.options = q.options;

  io.to(room.code).emit('question', payload);

  room.timerInterval = setInterval(() => {
    room.timeRemaining--;
    io.to(room.code).emit('time_update', { time: room.timeRemaining });
    if (room.timeRemaining <= 0) {
      clearInterval(room.timerInterval);
      revealResults(room);
    }
  }, 1000);
}

function revealResults(room) {
  if (room.state !== 'question') return; // guard against double-call
  room.state = 'reveal';
  clearInterval(room.timerInterval);

  const q = room.questions[room.currentQuestion];
  const playerResults = room.players
    .map(p => ({
      name: p.name,
      answer: room.answers[p.id]?.answer ?? null,
      isCorrect: room.answers[p.id]?.isCorrect ?? false,
      points: room.answers[p.id]?.points ?? 0,
      totalScore: p.score,
    }))
    .sort((a, b) => b.totalScore - a.totalScore);

  io.to(room.code).emit('question_results', {
    correctAnswer: q.answer,
    players: playerResults,
  });

  const isLast = room.currentQuestion >= room.questions.length - 1;
  setTimeout(() => {
    if (!rooms.has(room.code)) return;
    if (isLast) {
      endGame(room);
    } else {
      sendQuestion(room);
    }
  }, 6000);
}

function endGame(room) {
  if (room.state === 'finished') return;
  room.state = 'finished';
  clearInterval(room.timerInterval);

  const scores = [...room.players]
    .sort((a, b) => b.score - a.score)
    .map((p, i) => ({ rank: i + 1, name: p.name, score: p.score }));

  io.to(room.code).emit('game_over', { scores });
  setTimeout(() => rooms.delete(room.code), 15 * 60 * 1000);
}

// ── Socket.io ──────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  socket.on('create_room', ({ name }) => {
    if (!name?.trim()) return;

    let code;
    do { code = randomCode(); } while (rooms.has(code));

    const room = {
      code,
      host: socket.id,
      players: [{ id: socket.id, name: name.trim(), score: 0 }],
      state: 'lobby',
      currentQuestion: -1,
      questions: shuffle(ALL_QUESTIONS).slice(0, 10),
      answers: {},
      timerInterval: null,
      timeRemaining: 0,
    };
    rooms.set(code, room);
    socket.join(code);
    socket.emit('room_created', { code, players: room.players, hostId: room.host });
  });

  socket.on('join_room', ({ name, code }) => {
    if (!name?.trim() || !code?.trim()) return;
    const room = rooms.get(code.trim().toUpperCase());

    if (!room) { socket.emit('error', { message: 'Room not found.' }); return; }
    if (room.state !== 'lobby') { socket.emit('error', { message: 'Game already in progress.' }); return; }
    if (room.players.some(p => p.name.toLowerCase() === name.trim().toLowerCase())) {
      socket.emit('error', { message: 'That name is already taken in this room.' });
      return;
    }
    if (room.players.length >= 8) { socket.emit('error', { message: 'Room is full (max 8 players).' }); return; }

    room.players.push({ id: socket.id, name: name.trim(), score: 0 });
    socket.join(room.code);
    io.to(room.code).emit('player_joined', { players: room.players, hostId: room.host });
    socket.emit('room_joined', { code: room.code, players: room.players, hostId: room.host });
  });

  socket.on('start_game', () => {
    const room = playerRoom(socket.id);
    if (!room || room.host !== socket.id || room.state !== 'lobby') return;

    room.state = 'starting';
    io.to(room.code).emit('game_started');
    setTimeout(() => sendQuestion(room), 2000);
  });

  socket.on('submit_answer', ({ answer }) => {
    const room = playerRoom(socket.id);
    if (!room || room.state !== 'question') return;
    if (room.answers[socket.id] !== undefined) return;

    const q = room.questions[room.currentQuestion];
    const isCorrect = checkAnswer(answer, q);
    const timeBonus = Math.round((room.timeRemaining / q.timeLimit) * 100);
    const points = isCorrect ? (100 + timeBonus) : 0;

    room.answers[socket.id] = { answer, isCorrect, points };
    const player = room.players.find(p => p.id === socket.id);
    if (player && isCorrect) player.score += points;

    socket.emit('answer_received', { isCorrect, points });

    const answered = Object.keys(room.answers).length;
    io.to(room.code).emit('answer_count', { answered, total: room.players.length });

    if (answered >= room.players.length) {
      clearInterval(room.timerInterval);
      revealResults(room);
    }
  });

  socket.on('disconnect', () => {
    const room = playerRoom(socket.id);
    if (!room) return;

    room.players = room.players.filter(p => p.id !== socket.id);

    if (room.players.length === 0) {
      clearInterval(room.timerInterval);
      rooms.delete(room.code);
      return;
    }

    if (room.host === socket.id) {
      room.host = room.players[0].id;
      io.to(room.code).emit('host_changed', { hostId: room.host });
    }

    io.to(room.code).emit('player_left', { players: room.players, hostId: room.host });

    // Reveal early if all remaining players answered
    if (room.state === 'question') {
      const answered = Object.keys(room.answers).filter(id =>
        room.players.some(p => p.id === id)
      ).length;
      if (answered >= room.players.length) {
        clearInterval(room.timerInterval);
        revealResults(room);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
