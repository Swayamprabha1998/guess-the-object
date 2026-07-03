const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const QRCode = require('qrcode');
const os = require('os');
const dotenv = require('dotenv');
const { OpenAI } = require('openai');

// Load environment variables
dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Initialize OpenAI SDK if key is provided
let openai = null;
if (process.env.OPENAI_API_KEY) {
  console.log("OpenAI API Key found! AI mode active.");
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
} else {
  console.log("No OpenAI API Key found. Running in offline/fallback mode.");
}

// Serve static assets
app.use(express.static('public'));

// Local IP Address Helper for QR codes
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        // Match common Wi-Fi/Ethernet interface prefixes on Mac/Linux/Windows
        const lowerName = name.toLowerCase();
        if (lowerName.includes('en') || lowerName.includes('wlan') || lowerName.includes('eth') || lowerName.includes('wi-fi') || lowerName.includes('wireless')) {
          return iface.address;
        }
      }
    }
  }
  // Fallback to any non-internal IPv4
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

const LOCAL_IP = getLocalIpAddress();
console.log(`Local LAN IP for network devices: ${LOCAL_IP}`);

// Preset local objects for offline fallback
const FALLBACK_OBJECTS = [
  {
    word: "rocket",
    description: "A vehicle or device that obtains thrust from a rocket engine, used for space travel.",
    imageUrl: "https://images.unsplash.com/photo-1541185933-ef5d8ed016c2?w=400&q=80"
  },
  {
    word: "sneaker",
    description: "A soft shoe with a rubber sole worn for sports or casual wear.",
    imageUrl: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&q=80"
  },
  {
    word: "guitar",
    description: "A stringed musical instrument, typically with six strings, played by plucking or strumming.",
    imageUrl: "https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=400&q=80"
  },
  {
    word: "camera",
    description: "A device for recording visual images in the form of photographs or film.",
    imageUrl: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=400&q=80"
  },
  {
    word: "donut",
    description: "A small fried cake of sweetened dough, typically ring-shaped.",
    imageUrl: "https://images.unsplash.com/photo-1551024601-bec78aea704b?w=400&q=80"
  },
  {
    word: "backpack",
    description: "A bag with shoulder straps, carried on one's back.",
    imageUrl: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400&q=80"
  },
  {
    word: "headphones",
    description: "A pair of tiny speaker drivers worn on or around the head over a user's ears.",
    imageUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&q=80"
  },
  {
    word: "cactus",
    description: "A succulent plant with a thick fleshy stem which typically bears spines and no leaves.",
    imageUrl: "https://images.unsplash.com/photo-1459411552884-841db9b3cc2a?w=400&q=80"
  },
  {
    word: "robot",
    description: "A machine capable of carrying out a complex series of actions automatically.",
    imageUrl: "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=400&q=80"
  },
  {
    word: "coffee cup",
    description: "A container that coffee and espresso-based drinks are served in.",
    imageUrl: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=400&q=80"
  },
  {
    word: "pineapple",
    description: "A large juicy tropical fruit consisting of aromatic edible yellow flesh surrounded by a tough skin.",
    imageUrl: "https://images.unsplash.com/photo-1550258987-190a2d41a8ba?w=400&q=80"
  },
  {
    word: "laptop",
    description: "A computer that is portable and suitable for use while traveling.",
    imageUrl: "https://images.unsplash.com/photo-1496181130204-7552cc14ac1a?w=400&q=80"
  },
  {
    word: "pizza",
    description: "A dish of Italian origin consisting of a flat, round base of dough baked with toppings.",
    imageUrl: "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400&q=80"
  },
  {
    word: "diamond",
    description: "A precious stone consisting of a clear and colorless crystalline form of pure carbon.",
    imageUrl: "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=400&q=80"
  }
];

// In-memory room manager
const rooms = {};

// Clean text function
const cleanWord = w => w.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();

function getWordPattern(word) {
  return word.split('').map(char => /[a-zA-Z0-9]/.test(char) ? '_' : char).join(' ');
}

// Levenshtein Distance for Spelling Fail-safes
function levenshteinDistance(s, t) {
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  const arr = [];
  for (let i = 0; i <= t.length; i++) {
    arr[i] = [i];
  }
  for (let j = 0; j <= s.length; j++) {
    arr[0][j] = j;
  }
  for (let i = 1; i <= t.length; i++) {
    for (let j = 1; j <= s.length; j++) {
      arr[i][j] = t[i - 1] === s[j - 1] 
        ? arr[i - 1][j - 1] 
        : Math.min(arr[i - 1][j - 1] + 1, arr[i][j - 1] + 1, arr[i - 1][j] + 1);
    }
  }
  return arr[t.length][s.length];
}

// Local grading algorithm for offline compatibility
function gradeGuessLocally(targetWord, playerGuess) {
  const t = cleanWord(targetWord);
  const g = cleanWord(playerGuess);
  
  if (t === g) return 100;
  
  // Exact substring checks
  if (t.includes(g) || g.includes(t)) {
    const ratio = Math.min(t.length, g.length) / Math.max(t.length, g.length);
    // Score based on how close the substring length is (between 50% and 90%)
    return Math.floor(50 + ratio * 40);
  }
  
  // Spell mistake tolerance (Levenshtein distance)
  const distance = levenshteinDistance(t, g);
  const maxLen = Math.max(t.length, g.length);
  const similarity = (maxLen - distance) / maxLen;
  
  if (similarity > 0.7) {
    return Math.floor(similarity * 100);
  }
  
  return 0;
}

// AI Smart Guess Grader
async function gradeGuessAI(targetWord, playerGuess) {
  if (!openai) return gradeGuessLocally(targetWord, playerGuess);
  
  try {
    const prompt = `The target object is '${targetWord}'. The player guessed '${playerGuess}'. Grade this guess on a scale of 0 to 100 based on semantic similarity.
    Rules:
    - If they guessed the exact object or a direct synonym (e.g. 'sneaker' and 'shoe', or 'sofa' and 'couch'), give 100.
    - If it's a completely unrelated object, give 0.
    - If they guessed a very close related concept (e.g. 'spaceship' for 'rocket', or 'acoustic guitar' for 'guitar'), give a high score (80-95).
    - Give partial credit (20-70) if it shares significant attributes or class.
    Return ONLY a single integer score between 0 and 100. Do not include any punctuation or extra text.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 5
    });
    
    const scoreText = response.choices[0].message.content.trim();
    const score = parseInt(scoreText);
    return isNaN(score) ? gradeGuessLocally(targetWord, playerGuess) : Math.min(100, Math.max(0, score));
  } catch (error) {
    console.error("AI Grading failed, falling back to local grading:", error);
    return gradeGuessLocally(targetWord, playerGuess);
  }
}

// Generate random object
async function getNextRoundObject(usedWords = []) {
  // If OpenAI is available, generate a unique random object name & description
  if (openai) {
    try {
      const avoidPrompt = usedWords.length > 0 ? `Do NOT generate any of these objects: ${usedWords.join(', ')}.` : '';
      const prompt = `Generate a single interesting, recognizable common physical object (e.g., 'alarm clock', 'origami crane', 'electric guitar', 'sneaker', 'hourglass'). ${avoidPrompt}
      Return ONLY a JSON object in this format:
      {
        "word": "object name in 1-3 words",
        "description": "A 1-sentence interesting description of this object"
      }`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.8
      });

      const data = JSON.parse(response.choices[0].message.content.trim());
      
      // Call DALL-E to generate image
      console.log(`Generating AI image for word: "${data.word}"`);
      const imageGen = await openai.images.generate({
        model: "dall-e-3",
        prompt: `A 3D clay model of a ${data.word}, cute and minimal, isolated, centered on a dark deep-indigo solid background, studio lighting, smooth clay textures, rich pastel colors, highly detailed 3D render`,
        n: 1,
        size: "1024x1024",
        quality: "standard"
      });
      
      const imageUrl = imageGen.data[0].url;
      console.log(`AI Image URL generated: ${imageUrl}`);
      
      return {
        word: data.word,
        description: data.description,
        imageUrl: imageUrl
      };
    } catch (err) {
      console.error("AI Object generation failed, falling back to local presets:", err);
    }
  }

  // Fallback: Pick a random item from preset list that wasn't used yet
  const available = FALLBACK_OBJECTS.filter(o => !usedWords.includes(o.word));
  const pool = available.length > 0 ? available : FALLBACK_OBJECTS;
  const picked = pool[Math.floor(Math.random() * pool.length)];
  return { ...picked };
}

// Socket Connection handling
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);
  
  // HOST: Create Room
  socket.on('createRoom', async () => {
    let roomCode = '';
    do {
      roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
    } while (rooms[roomCode]);
    
    // Define join URL with host LAN IP
    const joinUrl = `http://${LOCAL_IP}:${PORT}/?room=${roomCode}`;
    
    // Generate QR Code data URL using node qrcode
    let qrCodeDataUrl = '';
    try {
      qrCodeDataUrl = await QRCode.toDataURL(joinUrl);
    } catch (err) {
      console.error('Failed to generate QR Code:', err);
    }
    
    rooms[roomCode] = {
      roomCode,
      hostSocketId: socket.id,
      players: [],
      state: 'LOBBY',
      currentRound: 0,
      totalRounds: 5,
      roundDuration: 30, // 30 seconds
      usedWords: [],
      targetObject: null
    };
    
    socket.join(roomCode);
    
    socket.emit('roomCreated', {
      roomCode,
      joinUrl,
      qrCodeDataUrl
    });
    console.log(`Room created: ${roomCode}`);
  });
  
  // PLAYER: Join Room
  socket.on('joinRoom', (data) => {
    const code = data.roomCode.toUpperCase();
    const name = data.playerName.trim();
    const avatar = data.avatar;
    
    const room = rooms[code];
    if (!room) {
      socket.emit('error', 'Room not found. Make sure the code is correct!');
      return;
    }
    
    if (room.state !== 'LOBBY') {
      socket.emit('error', 'Game has already started in this room!');
      return;
    }
    
    // Prevent duplicate name in same room
    if (room.players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      socket.emit('error', 'Name already taken in this room. Please choose another!');
      return;
    }
    
    const newPlayer = {
      id: socket.id,
      name,
      avatar,
      prediction: 50, // default
      score: 0, // overall score
      lastRoundScore: 0,
      guesses: []
    };
    
    room.players.push(newPlayer);
    socket.join(code);
    
    socket.emit('roomJoined', {
      roomCode: code,
      playerName: name,
      avatar
    });
    
    // Notify the host screen of player list updates
    io.to(room.hostSocketId).emit('playerJoined', room.players.map(p => ({
      name: p.name,
      avatar: p.avatar
    })));
    
    console.log(`Player ${name} (${avatar}) joined room ${code}`);
  });
  
  
  
  // HOST: Start Game
  socket.on('startGame', () => {
    // Find room hosted by this socket
    let room = null;
    for (const code of Object.keys(rooms)) {
      if (rooms[code].hostSocketId === socket.id) {
        room = rooms[code];
        break;
      }
    }
    
    if (room && room.state === 'LOBBY' && room.players.length > 0) {
      room.state = 'ACTIVE';
      io.to(room.roomCode).emit('gameStarted');
      console.log(`Game started in room: ${room.roomCode}`);
      
      // Auto trigger first round
      startNewRound(room);
    }
  });
  
  // PLAYER: Submit Guess
  socket.on('submitGuess', async (data) => {
    const guess = data.guess.trim();
    if (!guess) return;
    
    let room = null;
    let player = null;
    
    for (const code of Object.keys(rooms)) {
      const p = rooms[code].players.find(pl => pl.id === socket.id);
      if (p) {
        room = rooms[code];
        player = p;
        break;
      }
    }
    
    if (room && player && room.state === 'GUESSING') {
      // If player already guessed correctly, reject further entries
      if (player.guessedCorrectly) {
        return;
      }
      
      console.log(`Player ${player.name} guessed: "${guess}" in Room ${room.roomCode}`);
      
      // 2. Grade guess
      const targetWord = room.targetObject.word;
      const score = await gradeGuessAI(targetWord, guess);
      
      // Save this guess
      player.guesses.push({ guess, score });
      
      if (score === 100) {
        // Correct Guess! Calculate time bonus score (between 80 and 100)
        player.guessedCorrectly = true;
        const timeLeft = room.timeLeft !== undefined ? room.timeLeft : 15;
        const duration = room.roundDuration || 30;
        
        // Linear interpolation from 80 (0s left) to 100 (full time left)
        const finalScore = 80 + Math.floor((timeLeft / duration) * 20);
        player.lastRoundScore = finalScore;
        
        console.log(`Player ${player.name} guessed CORRECTLY! Earned ${finalScore}% (Time left: ${timeLeft}s)`);
        
        // Notify player immediately
        socket.emit('guessResult', { correct: true, score: finalScore, guess: guess });
        
        // Notify host screen to float a special correct guess bubble
        io.to(room.hostSocketId).emit('playerCorrect', {
          playerName: player.name,
          avatar: player.avatar,
          score: finalScore,
          guess: guess
        });
        
        // Update leaderboard on Host screen immediately
        const sortedPlayers = [...room.players].sort((a, b) => b.score - a.score);
        io.to(room.hostSocketId).emit('updateLeaderboard', sortedPlayers);
        
        // Check if ALL active players have guessed correctly
        if (room.players.every(p => p.guessedCorrectly)) {
          console.log(`All players guessed correctly! Ending round early.`);
          if (room.timerInterval) {
            clearInterval(room.timerInterval);
          }
          revealRound(room);
        }
      } else {
        // Incorrect or partially correct guess. Cap partial score at 75% max
        const partialScore = Math.floor(score * 0.75);
        if (partialScore > player.lastRoundScore) {
          player.lastRoundScore = partialScore;
        }
        
        console.log(`Graded partial guess "${guess}" for ${player.name}: ${partialScore}% (raw score: ${score})`);
        
        // Notify player of score
        socket.emit('guessResult', { correct: false, score: partialScore, guess: guess });
        
        // Float guess on host screen
        io.to(room.hostSocketId).emit('newGuess', {
          playerName: player.name,
          avatar: player.avatar,
          guess: guess
        });
      }
    }
  });
  
  // HOST: Next Round / Show Leaderboard
  socket.on('nextRound', () => {
    let room = null;
    for (const code of Object.keys(rooms)) {
      if (rooms[code].hostSocketId === socket.id) {
        room = rooms[code];
        break;
      }
    }
    
    if (room) {
      if (room.state === 'REVEAL') {
        if (room.currentRound < room.totalRounds) {
          startNewRound(room);
        } else {
          // Game Over!
          room.state = 'GAMEOVER';
          io.to(room.roomCode).emit('gameOver', { players: room.players });
          console.log(`Game Over in Room ${room.roomCode}`);
        }
      }
    }
  });
  
  // HOST: Restart Game
  socket.on('restartGame', () => {
    let room = null;
    for (const code of Object.keys(rooms)) {
      if (rooms[code].hostSocketId === socket.id) {
        room = rooms[code];
        break;
      }
    }
    
    if (room) {
      console.log(`Host requested restart for Room: ${room.roomCode}`);
      
      // Clear active timers
      if (room.timerInterval) {
        clearInterval(room.timerInterval);
      }
      
      // Reset room metadata
      room.state = 'LOBBY';
      room.currentRound = 0;
      room.usedWords = [];
      room.targetObject = null;
      
      // Reset players scores and state flags
      room.players.forEach(p => {
        p.score = 0;
        p.lastRoundScore = 0;
        p.guesses = [];
        p.guessedCorrectly = false;
      });
      
      // Broadcast restart to all participants
      io.to(room.roomCode).emit('gameRestarted', room.players);
      console.log(`Game restarted in Room ${room.roomCode}. All players reset.`);
    }
  });
  
  // Disconnect handler
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    
    // Check if player disconnected
    for (const code of Object.keys(rooms)) {
      const room = rooms[code];
      const pIdx = room.players.findIndex(pl => pl.id === socket.id);
      if (pIdx !== -1) {
        const p = room.players[pIdx];
        room.players.splice(pIdx, 1);
        console.log(`Player ${p.name} disconnected from room ${code}`);
        
        // Notify host
        io.to(room.hostSocketId).emit('playerJoined', room.players.map(pl => ({
          name: pl.name,
          avatar: pl.avatar
        })));
        break;
      }
      
      // Check if host disconnected
      if (room.hostSocketId === socket.id) {
        console.log(`Host disconnected from room ${code}. Room destroyed.`);
        io.to(code).emit('error', 'Host disconnected. Room closed.');
        delete rooms[code];
        break;
      }
    }
  });
});

// Helper: Start New Round
async function startNewRound(room) {
  room.state = 'GUESSING';
  room.currentRound++;
  
  // Reset round scores and flags for players
  room.players.forEach(p => {
    p.lastRoundScore = 0;
    p.guessedCorrectly = false;
    p.guesses = [];
  });
  
  // Pick next object
  console.log(`Preparing Round ${room.currentRound} object...`);
  const nextObject = await getNextRoundObject(room.usedWords);
  room.targetObject = nextObject;
  room.usedWords.push(nextObject.word);
  
  console.log(`Round ${room.currentRound} Target: "${nextObject.word}"`);
  
  // Broadcast to all room sockets to start round
  io.to(room.roomCode).emit('startRound', {
    roundIndex: room.currentRound,
    totalRounds: room.totalRounds,
    duration: room.roundDuration,
    imageUrl: nextObject.imageUrl,
    description: nextObject.description,
    wordPattern: getWordPattern(nextObject.word)
  });
  
  // Start server-side countdown timer on the room object
  room.timeLeft = room.roundDuration;
  
  if (room.timerInterval) {
    clearInterval(room.timerInterval);
  }
  
  room.timerInterval = setInterval(() => {
    room.timeLeft--;
    if (room.timeLeft <= 0) {
      clearInterval(room.timerInterval);
      revealRound(room);
    }
  }, 1000);
}

// Helper: Reveal Round
function revealRound(room) {
  if (room.state !== 'GUESSING') return;
  room.state = 'REVEAL';
  
  // Clear any active countdown timers
  if (room.timerInterval) {
    clearInterval(room.timerInterval);
  }
  
  // 1. Calculate overall score updates
  // Cumulative score updates: average of all round scores
  room.players.forEach(p => {
    // Cumulative score = (previous overall * (round - 1) + lastRoundScore) / round
    p.score = ((p.score * (room.currentRound - 1)) + p.lastRoundScore) / room.currentRound;
  });
  
  // 2. Broadcast reveal event
  io.to(room.roomCode).emit('roundReveal', {
    objectName: room.targetObject.word,
    description: room.targetObject.description,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      score: p.score,
      lastRoundScore: p.lastRoundScore
    }))
  });
  
  // 3. Broadcast updated leaderboard
  const sortedPlayers = [...room.players].sort((a, b) => b.score - a.score);
  io.to(room.hostSocketId).emit('updateLeaderboard', sortedPlayers);
  
  console.log(`Revealed round ${room.currentRound} in room ${room.roomCode}. Object: ${room.targetObject.word}`);
}

// Start Server
server.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`Guess the Object Game Server started!`);
  console.log(`Local Access: http://localhost:${PORT}`);
  console.log(`Network LAN Access: http://${LOCAL_IP}:${PORT}`);
  console.log(`Demo/Split View: http://${LOCAL_IP}:${PORT}/demo.html`);
  console.log(`========================================`);
});
