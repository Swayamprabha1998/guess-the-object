// Guess the Object - Host Client Script
const socket = io(window.location.origin, {
  transports: ['websocket', 'polling']
});

let roomCode = '';
let currentRound = 0;
let totalRounds = 5;
let timerVal = 30;
let timerMax = 30;
let timerInterval = null;

// Elements
const states = {
  lobby: document.getElementById('host-state-lobby'),
  active: document.getElementById('host-state-active'),
  gameover: document.getElementById('host-state-gameover')
};

const roundPill = document.getElementById('host-round-pill');
const qrBox = document.getElementById('host-qr-box');
const joinLink = document.getElementById('host-join-link');
const roomCodeDisplay = document.getElementById('host-room-code-display');
const lobbyPlayersContainer = document.getElementById('host-lobby-players-container');
const startGameBtn = document.getElementById('start-game-btn');

// Active Round Elements
const timerText = document.getElementById('host-timer-text');
const timerRing = document.getElementById('host-timer-ring');
const objectImage = document.getElementById('host-object-image');
const objectCanvas = document.getElementById('host-object-canvas');
const objectPlaceholder = document.getElementById('host-object-3d-placeholder');
const guessLane = document.getElementById('host-guess-lane');
const leaderboardList = document.getElementById('host-leaderboard-list');

// Reveal Overlay Elements
const revealOverlay = document.getElementById('host-round-reveal-box');
const revealTitle = document.getElementById('reveal-state-title');
const revealObjectName = document.getElementById('reveal-object-name');
const revealObjectDesc = document.getElementById('reveal-object-description');
const nextRoundBtn = document.getElementById('next-round-btn');

// GameOver / Results Elements
const podium1st = document.getElementById('podium-1st');
const podium2nd = document.getElementById('podium-2nd');
const podium3rd = document.getElementById('podium-3rd');
const awardsTableBody = document.getElementById('host-awards-table-body');
const restartGameBtn = document.getElementById('host-restart-btn');

// Helper to switch host view states
function showState(stateName) {
  Object.keys(states).forEach(key => {
    if (states[key]) {
      states[key].classList.remove('active');
    }
  });
  if (states[stateName]) {
    states[stateName].classList.add('active');
  }
}

// 1. Create Room on Connection
socket.on('connect', () => {
  console.log('Host connected. Creating room...');
  socket.emit('createRoom');
});

socket.on('roomCreated', (data) => {
  roomCode = data.roomCode;
  
  // Set Room Info
  roomCodeDisplay.textContent = `ROOM: ${roomCode}`;
  
  // Clean URL for display
  const displayUrl = data.joinUrl.replace(/^https?:\/\//, '');
  joinLink.textContent = displayUrl;
  
  // Render base64 QR Code received from server
  qrBox.innerHTML = `<img src="${data.qrCodeDataUrl}" alt="Join QR Code" style="width: 100%; height: 100%; object-fit: contain;">`;
  
  console.log(`Room created successfully: ${roomCode}`);
  
  // Inform parent demo manager if running in iframe
  window.parent.postMessage({
    type: 'ROOM_CREATED',
    roomCode: roomCode,
    serverUrl: window.location.origin
  }, '*');
});

// Update Lobby Players
socket.on('playerJoined', (players) => {
  lobbyPlayersContainer.innerHTML = '';
  
  players.forEach(p => {
    const chip = document.createElement('div');
    chip.className = 'lobby-player-chip glass';
    chip.innerHTML = `<span class="lobby-player-avatar">${p.avatar}</span> ${p.name}`;
    lobbyPlayersContainer.appendChild(chip);
  });
  
  // Show Start button if there's at least one player
  if (players.length > 0) {
    startGameBtn.style.display = 'block';
  } else {
    startGameBtn.style.display = 'none';
  }
});

// Start Game
startGameBtn.addEventListener('click', () => {
  socket.emit('startGame');
});

socket.on('gameStarted', () => {
  showState('active');
});

// Restart Game
restartGameBtn.addEventListener('click', () => {
  console.log('Requesting game restart...');
  socket.emit('restartGame');
});

socket.on('gameRestarted', (players) => {
  currentRound = 0;
  timerVal = 30;
  
  // Hide reveal modal overlay
  revealOverlay.style.display = 'none';
  
  // Reset pill text
  roundPill.textContent = 'Lobby';
  
  // Return to Lobby
  showState('lobby');
  
  // Re-render lobby players
  lobbyPlayersContainer.innerHTML = '';
  players.forEach(p => {
    const chip = document.createElement('div');
    chip.className = 'lobby-player-chip glass';
    chip.innerHTML = `<span class="lobby-player-avatar">${p.avatar}</span> ${p.name}`;
    lobbyPlayersContainer.appendChild(chip);
  });
  
  if (players.length > 0) {
    startGameBtn.style.display = 'block';
  } else {
    startGameBtn.style.display = 'none';
  }
  
  console.log('Game successfully restarted.');
});

// Start Round handler
socket.on('startRound', (data) => {
  currentRound = data.roundIndex;
  totalRounds = data.totalRounds;
  roundPill.textContent = `Round ${currentRound} / ${totalRounds}`;
  
  // Hide Reveal Box
  revealOverlay.style.display = 'none';
  
  // Reset Timer
  timerMax = data.duration;
  timerVal = data.duration;
  updateTimerUI();
  
  // Prepare Object Images/Loaders
  objectImage.style.display = 'none';
  objectCanvas.style.display = 'none';
  objectPlaceholder.style.display = 'block';
  
  // Set object image source
  objectImage.src = data.imageUrl || '';
  objectImage.onload = () => {
    // Hide spinning facet loader, reveal canvas
    objectPlaceholder.style.display = 'none';
    objectCanvas.style.display = 'block';
    
    // Draw initial pixelated image
    drawPixelatedImage();
  };
  
  // Clear Floating Guess Lane
  guessLane.innerHTML = '';
  
  // Active State View
  showState('active');
  
  // Start countdown local interval
  startLocalTimer();
});

// Timer countdown logic
function startLocalTimer() {
  if (timerInterval) clearInterval(timerInterval);
  
  timerInterval = setInterval(() => {
    timerVal--;
    if (timerVal <= 0) {
      timerVal = 0;
      clearInterval(timerInterval);
    }
    updateTimerUI();
  }, 1000);
}

function updateTimerUI() {
  // Update Text
  const min = Math.floor(timerVal / 60);
  const sec = timerVal % 60;
  timerText.textContent = `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  
  // Update Conic Gradient Progress Ring
  const progressRatio = timerVal / timerMax;
  const deg = progressRatio * 360;
  
  if (timerVal > 0) {
    timerRing.style.background = `conic-gradient(var(--coral) 0deg, var(--yellow) ${deg}deg, rgba(124, 92, 252, 0.12) ${deg}deg 360deg)`;
  } else {
    timerRing.style.background = `rgba(124, 92, 252, 0.12)`;
  }

  // Draw pixelated image based on timer progress
  drawPixelatedImage();
}

function drawPixelatedImage() {
  const img = objectImage;
  const canvas = objectCanvas;
  if (!img.complete || img.naturalWidth === 0) return;
  
  const ctx = canvas.getContext('2d');
  
  // Check if round is revealed
  const isRevealed = (timerVal === 0 || revealOverlay.style.display === 'flex');
  
  if (isRevealed) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return;
  }
  
  // Scale resolution from 6x6 blocks to 150x150 blocks
  // Quadratic ease-in: detail resolution builds up faster near the end
  const elapsedRatio = (timerMax - timerVal) / timerMax; // 0 to 1
  const minRes = 6;
  const maxRes = 150;
  const currentRes = Math.max(1, Math.floor(minRes + (maxRes - minRes) * Math.pow(elapsedRatio, 2)));
  
  // Offscreen canvas for pixelation scaling
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = currentRes;
  tempCanvas.height = currentRes;
  const tempCtx = tempCanvas.getContext('2d');
  
  // Draw downscaled image without smoothing
  tempCtx.imageSmoothingEnabled = false;
  tempCtx.drawImage(img, 0, 0, currentRes, currentRes);
  
  // Scale it up back onto the display canvas (smoothing disabled)
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.mozImageSmoothingEnabled = false;
  ctx.webkitImageSmoothingEnabled = false;
  ctx.drawImage(tempCanvas, 0, 0, currentRes, currentRes, 0, 0, canvas.width, canvas.height);
}

// Receive and float guesses
socket.on('newGuess', (data) => {
  const bubble = document.createElement('div');
  
  // Choose random color theme
  const themes = ['theme-violet', 'theme-coral', 'theme-mint', 'theme-yellow'];
  const randomTheme = themes[Math.floor(Math.random() * themes.length)];
  
  // Position horizontally randomly between 2% and 80%
  const randomLeft = Math.floor(Math.random() * 78) + 2;
  
  // Assign classes and style
  bubble.className = `bubble ${randomTheme}`;
  bubble.style.left = `${randomLeft}%`;
  bubble.style.animationDelay = '0s'; // Launch instantly
  
  bubble.innerHTML = `
    <div class="bubble-avatar">${data.avatar}</div>
    <div class="bubble-text">
      <span class="bubble-name">${data.playerName}</span>
      <span class="bubble-guess">${data.guess}</span>
    </div>
  `;
  
  guessLane.appendChild(bubble);
  
  // Remove from DOM after float animation completes (7s)
  setTimeout(() => {
    bubble.remove();
  }, 7000);
});

// Receive correct guesses and float a special green bubble
socket.on('playerCorrect', (data) => {
  const bubble = document.createElement('div');
  const randomLeft = Math.floor(Math.random() * 70) + 5;
  
  bubble.className = 'bubble';
  bubble.style.left = `${randomLeft}%`;
  bubble.style.background = 'linear-gradient(135deg, #10b981, #059669)';
  bubble.style.boxShadow = '0 0 20px rgba(16, 185, 129, 0.5)';
  bubble.style.border = '2px solid rgba(255, 255, 255, 0.7)';
  bubble.style.zIndex = '10';
  
  bubble.innerHTML = `
    <div class="bubble-avatar" style="background: rgba(255,255,255,0.3);">${data.avatar}</div>
    <div class="bubble-text">
      <span class="bubble-name" style="color: #fff; font-weight: 800;">${data.playerName}</span>
      <span class="bubble-guess" style="color: #fff; font-weight: 800;">Guessed Correctly! (+${data.score}%)</span>
    </div>
  `;
  
  guessLane.appendChild(bubble);
  
  setTimeout(() => {
    bubble.remove();
  }, 7000);
});

// Update Leaderboard List
socket.on('updateLeaderboard', (players) => {
  leaderboardList.innerHTML = '';
  
  // Render top 3 or all players
  players.slice(0, 3).forEach((p, idx) => {
    const row = document.createElement('div');
    row.className = 'lb-row';
    
    const medals = ['🥇', '🥈', '🥉'];
    const medal = medals[idx] || `${idx + 1}`;
    
    // Choose progress bar background color based on index
    const barColors = ['var(--coral)', 'var(--violet)', 'var(--mint)'];
    const barColor = barColors[idx] || 'var(--ink-soft)';
    
    // Avatar gradient based on avatar emoji
    let avatarGrad = 'linear-gradient(135deg, var(--yellow), var(--coral))';
    if (idx === 1) avatarGrad = 'linear-gradient(135deg, var(--violet), var(--mint))';
    else if (idx === 2) avatarGrad = 'linear-gradient(135deg, var(--mint), var(--yellow))';
    
    row.innerHTML = `
      <span class="lb-rank">${medal}</span>
      <div class="lb-avatar" style="background: ${avatarGrad};">${p.avatar}</div>
      <span class="lb-name">${p.name}</span>
      <div class="lb-bar-track">
        <div class="lb-bar-fill" style="width: ${p.score}%; background: ${barColor};"></div>
      </div>
      <span class="lb-score">${Math.round(p.score)}%</span>
    `;
    
    leaderboardList.appendChild(row);
  });
});

// Round Reveal Overlay
socket.on('roundReveal', (data) => {
  clearInterval(timerInterval);
  
  // Display revealed object info
  revealObjectName.textContent = data.objectName.toUpperCase();
  revealObjectDesc.textContent = data.description || 'A secret object revealed!';
  
  // Show full resolution image on the canvas
  drawPixelatedImage();
  
  // Update state label text
  const lastRound = currentRound === totalRounds;
  nextRoundBtn.textContent = lastRound ? 'Show Final Standings' : 'Next Round';
  revealTitle.textContent = lastRound ? 'Game Completed!' : 'Round Complete!';
  
  // Display the overlay
  revealOverlay.style.display = 'flex';
});

// Next round trigger
nextRoundBtn.addEventListener('click', () => {
  socket.emit('nextRound');
});

// Game Over View
socket.on('gameOver', (data) => {
  showState('gameover');
  roundPill.textContent = 'Results';
  
  // Sort players by score
  const sorted = [...data.players].sort((a, b) => b.score - a.score);
  
  // 1. Render podium (1st, 2nd, 3rd)
  if (sorted[0]) {
    setPodiumData(podium1st, sorted[0], '🥇');
  }
  if (sorted[1]) {
    setPodiumData(podium2nd, sorted[1], '🥈');
  } else {
    podium2nd.style.visibility = 'hidden';
  }
  if (sorted[2]) {
    setPodiumData(podium3rd, sorted[2], '🥉');
  } else {
    podium3rd.style.visibility = 'hidden';
  }

  // 2. Resolve Awards based on Rules (Podium vouchers)
  // - 1st Place Overall: ₹2,000 Voucher
  // - 2nd Place Overall: ₹500 Voucher
  // - 3rd Place Overall: ₹500 Voucher
  
  // Render Results Table
  awardsTableBody.innerHTML = '';
  
  sorted.forEach((p, idx) => {
    let awardBadge = '-';
    let isWinnerRow = false;
    
    if (idx === 0) {
      awardBadge = '🏆 ₹2,000 (1st Place)';
      isWinnerRow = true;
    } else if (idx === 1) {
      awardBadge = '🥈 ₹500 (2nd Place)';
      isWinnerRow = true;
    } else if (idx === 2) {
      awardBadge = '🥉 ₹500 (3rd Place)';
      isWinnerRow = true;
    }
    
    const row = document.createElement('tr');
    if (isWinnerRow) {
      row.className = 'winner-highlight';
    }
    
    row.innerHTML = `
      <td><strong>${idx + 1}</strong></td>
      <td>${p.avatar} ${p.name}</td>
      <td>${Math.round(p.score)}%</td>
      <td><strong>${awardBadge}</strong></td>
    `;
    
    awardsTableBody.appendChild(row);
  });
});

function setPodiumData(element, player, medal) {
  element.style.visibility = 'visible';
  element.querySelector('.podium-avatar').textContent = player.avatar;
  element.querySelector('.podium-name').textContent = player.name;
  
  // Adjust avatar gradient dynamically based on standing
  const av = element.querySelector('.podium-avatar');
  if (medal === '🥇') av.style.background = 'linear-gradient(135deg, var(--yellow), #e6ad1c)';
  else if (medal === '🥈') av.style.background = 'linear-gradient(135deg, #d3d3d3, #a9a9a9)';
  else if (medal === '🥉') av.style.background = 'linear-gradient(135deg, #cd7f32, #b87333)';
}
