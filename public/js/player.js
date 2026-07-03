// Guess the Object - Player Client Script
let socket = null;
let roomCode = '';
let playerName = '';
let playerAvatar = '🦊';
let predictedScore = 50;
let currentScore = 0;
let currentRound = 0;

// Elements
const states = {
  connect: document.getElementById('state-connect'),
  join: document.getElementById('state-join'),
  predict: document.getElementById('state-predict'),
  waiting: document.getElementById('state-waiting'),
  guessing: document.getElementById('state-guessing'),
  reveal: document.getElementById('state-round-reveal'),
  gameover: document.getElementById('state-game-over')
};

// Inputs
const roomCodeInput = document.getElementById('room-code-input');
const nameInput = document.getElementById('player-name-input');
const avatarGrid = document.getElementById('avatar-grid');
const guessInput = document.getElementById('guess-input');
const guessForm = document.getElementById('guess-form');

// Buttons
const connectBtn = document.getElementById('connect-btn');
const scanQrBtn = document.getElementById('scan-qr-btn');
const cancelScanBtn = document.getElementById('cancel-scan-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const sendGuessBtn = document.getElementById('send-guess-btn');

// Dynamic Display Badges
const serverBadge = document.getElementById('server-connected-badge');
const serverDisplay = document.getElementById('server-url-display');
const waitingAvatar = document.getElementById('me-waiting-avatar');
const waitingName = document.getElementById('me-waiting-name');
const guessingAvatar = document.getElementById('me-guessing-avatar');
const guessingName = document.getElementById('me-guessing-name');
const guessingScore = document.getElementById('me-guessing-score');
const guessingRoundTitle = document.getElementById('guessing-round-title');
const lastGuessFeedback = document.getElementById('last-guess-feedback');
const lastGuessText = document.getElementById('last-guess-text');
const lastGuessScore = document.getElementById('last-guess-score');
const correctGuessCard = document.getElementById('correct-guess-card');
const correctScoreDisplay = document.getElementById('correct-score-display');
const guessFormContainer = document.getElementById('guess-form-container');
const roundScoreVal = document.getElementById('round-score-val');
const hintDesc = document.getElementById('hint-description');
const hintBlanks = document.getElementById('hint-blanks');
const roundScoreFeedback = document.getElementById('round-score-feedback');
const revealRoundTitle = document.getElementById('reveal-round-title');
const revealCorrectName = document.getElementById('reveal-correct-name');
const finalScoreVal = document.getElementById('final-score-val');
const finalRankVal = document.getElementById('final-rank-val');

// QR Scanning variables
let qrStream = null;
let scanning = false;

// Player stage elements
const playerObjectImage = document.getElementById('player-object-image');
const playerObjectCanvas = document.getElementById('player-object-canvas');
const playerStageWrap = document.getElementById('player-stage-wrap');
const playerTimerRing = document.getElementById('player-timer-ring');
const playerTimerTextEl = document.getElementById('player-timer-text');
const playerObject3d = document.getElementById('player-object-3d');

// Player image pixelation state
let playerTimerVal = 30;
let playerTimerMax = 30;
let playerTimerInterval = null;

function updatePlayerTimerUI() {
  // Update timer text
  const min = Math.floor(playerTimerVal / 60);
  const sec = playerTimerVal % 60;
  if (playerTimerTextEl) {
    playerTimerTextEl.textContent = `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  }

  // Update conic ring (same logic as host)
  if (playerTimerRing) {
    const progressRatio = playerTimerVal / playerTimerMax;
    const deg = progressRatio * 360;
    if (playerTimerVal > 0) {
      playerTimerRing.style.background = `conic-gradient(var(--coral) 0deg, var(--yellow) ${deg}deg, rgba(124, 92, 252, 0.12) ${deg}deg 360deg)`;
    } else {
      playerTimerRing.style.background = `rgba(124, 92, 252, 0.12)`;
    }
  }

  drawPlayerPixelatedImage();
}

function drawPlayerPixelatedImage() {
  if (!playerObjectImage || !playerObjectCanvas) return;
  if (!playerObjectImage.complete || playerObjectImage.naturalWidth === 0) return;

  const canvas = playerObjectCanvas;
  const img = playerObjectImage;
  const ctx = canvas.getContext('2d');

  // Full-quality reveal (same as host)
  if (playerTimerVal === 0) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return;
  }

  // Quadratic pixelation ease (same as host)
  const elapsedRatio = (playerTimerMax - playerTimerVal) / playerTimerMax;
  const minRes = 6;
  const maxRes = 150;
  const currentRes = Math.max(1, Math.floor(minRes + (maxRes - minRes) * Math.pow(elapsedRatio, 2)));

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = currentRes;
  tempCanvas.height = currentRes;
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.imageSmoothingEnabled = false;
  tempCtx.drawImage(img, 0, 0, currentRes, currentRes);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.mozImageSmoothingEnabled = false;
  ctx.webkitImageSmoothingEnabled = false;
  ctx.drawImage(tempCanvas, 0, 0, currentRes, currentRes, 0, 0, canvas.width, canvas.height);
}

// Initialize View Setup
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

// Auto-detect running mode
const urlParams = new URLSearchParams(window.location.search);
const isDemoMode = urlParams.get('mode') === 'demo';
const urlRoom = urlParams.get('room');

// If room code is in the URL (scanned from QR), pre-fill it!
if (urlRoom) {
  roomCodeInput.value = urlRoom.toUpperCase();
}

// Connect automatically if running on server, or show connect screen if in app
if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' && window.location.protocol.startsWith('http')) {
  // We are on a web page, connect to current origin
  initSocket(window.location.origin);
  showState('join');
} else {
  // Local host or native app wrapper. Connect to current window.location or prompt for connection
  initSocket(window.location.origin);
  showState('join');
}

function initSocket(url) {
  if (socket) {
    socket.disconnect();
  }

  socket = io(url, {
    transports: ['websocket', 'polling']
  });

  serverDisplay.textContent = url.replace(/^https?:\/\//, '');
  serverBadge.style.display = 'block';

  // Socket listeners
  socket.on('connect', () => {
    console.log('Connected to server:', url);
  });

  socket.on('connect_error', (err) => {
    console.error('Connection error:', err);
    showState('connect');
  });

  socket.on('error', (message) => {
    alert('Error: ' + message);
  });

  socket.on('roomJoined', (data) => {
    roomCode = data.roomCode;
    playerName = data.playerName;
    playerAvatar = data.avatar;
    
    // Setup player waiting UI
    waitingName.textContent = `${playerName} is in`;
    waitingAvatar.textContent = playerAvatar;
    guessingName.textContent = playerName;
    guessingAvatar.textContent = playerAvatar;
    
    // Progress directly to Waiting room state
    showState('waiting');
  });

  socket.on('gameStarted', () => {
    document.getElementById('waiting-status-text').textContent = 'Game is starting...';
  });

  socket.on('gameRestarted', () => {
    // Reset player scores and rounds
    currentScore = 0;
    currentRound = 0;
    
    // Reset waiting room text
    document.getElementById('waiting-status-text').textContent = 'waiting for game to start...';
    
    // Move player directly to waiting screen for the new game
    showState('waiting');
    
    console.log('Game restarted by host. Returned to waiting lobby.');
  });

  socket.on('startRound', (data) => {
    currentRound = data.roundIndex;
    guessingRoundTitle.textContent = `Round ${currentRound} / ${data.totalRounds}`;
    guessingScore.textContent = `Score: ${currentScore}%`;

    // Update clue hints
    if (hintDesc) hintDesc.textContent = data.description || 'Waiting for clue...';
    if (hintBlanks) hintBlanks.textContent = data.wordPattern || '';

    // Reset guess inputs
    guessInput.value = '';
    guessInput.disabled = false;
    if (sendGuessBtn) sendGuessBtn.disabled = false;

    guessFormContainer.style.display = 'block';
    lastGuessFeedback.style.display = 'none';
    correctGuessCard.style.display = 'none';

    // Setup player mini stage
    playerTimerMax = data.duration || 30;
    playerTimerVal = data.duration || 30;
    if (playerTimerInterval) clearInterval(playerTimerInterval);

    // Show stage, reset to 3D spinner while image loads
    playerStageWrap.style.display = 'flex';
    if (playerObject3d) playerObject3d.style.display = 'block';
    if (playerObjectCanvas) playerObjectCanvas.style.display = 'none';
    updatePlayerTimerUI();

    // Start timer immediately (synced with host, not gated on image load)
    playerTimerInterval = setInterval(() => {
      playerTimerVal--;
      if (playerTimerVal <= 0) {
        playerTimerVal = 0;
        clearInterval(playerTimerInterval);
      }
      updatePlayerTimerUI();
    }, 1000);

    // Load image — swap 3D spinner for canvas when ready
    if (data.imageUrl && playerObjectImage) {
      playerObjectImage.src = data.imageUrl;
      playerObjectImage.onload = () => {
        if (playerObject3d) playerObject3d.style.display = 'none';
        if (playerObjectCanvas) {
          playerObjectCanvas.style.display = 'block';
          drawPlayerPixelatedImage();
        }
      };
    }

    showState('guessing');
  });

  socket.on('guessResult', (data) => {
    if (data.correct) {
      // Hide input form
      guessFormContainer.style.display = 'none';
      
      // Show correct guess card with points earned
      correctScoreDisplay.textContent = `+${data.score}%`;
      correctGuessCard.style.display = 'block';
      
      // Clear input
      guessInput.value = '';
    } else {
      // Show inline feedback for wrong guess
      lastGuessText.textContent = `"${data.guess}"`;
      
      // Show descriptive feedback
      let scoreText = `${data.score}% similarity`;
      if (data.score > 70) scoreText = 'Very close! (' + scoreText + ')';
      else if (data.score > 40) scoreText = 'On the right track! (' + scoreText + ')';
      else scoreText = 'Incorrect (' + scoreText + ')';
      
      lastGuessScore.textContent = scoreText;
      lastGuessFeedback.style.display = 'block';
      
      // Re-enable guess form for next input
      guessInput.disabled = false;
      if (sendGuessBtn) sendGuessBtn.disabled = false;
      guessInput.value = '';
      guessInput.focus();
    }
  });

  socket.on('roundReveal', (data) => {
    // Stop player timer, show full-quality image
    if (playerTimerInterval) clearInterval(playerTimerInterval);
    playerTimerVal = 0;
    updatePlayerTimerUI();
    if (playerObjectCanvas && playerObjectImage && playerObjectImage.complete && playerObjectImage.naturalWidth > 0) {
      if (playerObject3d) playerObject3d.style.display = 'none';
      if (playerObjectCanvas) playerObjectCanvas.style.display = 'block';
      drawPlayerPixelatedImage();
    }

    revealRoundTitle.textContent = `Round ${currentRound} Reveal`;
    revealCorrectName.textContent = `Target object was: ${data.objectName.toUpperCase()}`;
    
    // Get score of this specific player for this round
    const me = data.players.find(p => p.id === socket.id);
    if (me) {
      currentScore = me.score;
      const roundScore = me.lastRoundScore !== undefined ? me.lastRoundScore : 0;
      roundScoreVal.textContent = `${roundScore}%`;
      
      if (roundScore >= 90) {
        roundScoreFeedback.textContent = 'Spectacular! Outstanding guess!';
      } else if (roundScore >= 70) {
        roundScoreFeedback.textContent = 'Awesome! Very close!';
      } else if (roundScore >= 50) {
        roundScoreFeedback.textContent = 'Nice job! Solid guess!';
      } else if (roundScore >= 20) {
        roundScoreFeedback.textContent = 'Decent try, closer next time!';
      } else {
        roundScoreFeedback.textContent = 'Oops! Not quite right.';
      }
    }
    
    showState('reveal');
  });

  socket.on('gameOver', (data) => {
    const me = data.players.find(p => p.id === socket.id);
    if (me) {
      finalScoreVal.textContent = `${me.score.toFixed(1)}%`;
      
      // Find rank
      const sorted = [...data.players].sort((a,b) => b.score - a.score);
      const rankIndex = sorted.findIndex(p => p.id === socket.id);
      const rank = rankIndex + 1;
      
      let rankText = `Rank: #${rank} / ${data.players.length}`;
      if (rank === 1) rankText = '🏆 Winner! Highest Overall Score!';
      else if (rank === 2) rankText = '🥈 Runner-up (2nd Highest Overall)!';
      
      finalRankVal.textContent = rankText;
    }
    showState('gameover');
  });

  socket.on('disconnect', () => {
    console.log('Disconnected from server');
  });
}

// Avatar Grid Selection
avatarGrid.addEventListener('click', (e) => {
  const option = e.target.closest('.avatar-opt');
  if (!option) return;

  // Remove selection from all
  document.querySelectorAll('.avatar-opt').forEach(opt => {
    opt.classList.remove('selected');
    const badge = opt.querySelector('.check-badge');
    if (badge) badge.remove();
  });

  // Select current
  option.classList.add('selected');
  playerAvatar = option.dataset.avatar;
  
  const checkBadge = document.createElement('div');
  checkBadge.className = 'check-badge';
  checkBadge.textContent = '✓';
  option.appendChild(checkBadge);
});

// Select Panda by default
const pandaOpt = document.querySelector('.avatar-opt[data-avatar="🐼"]');
if (pandaOpt) pandaOpt.click();

// Join room click
joinRoomBtn.addEventListener('click', () => {
  const code = roomCodeInput.value.trim().toUpperCase();
  const name = nameInput.value.trim();

  if (!code) {
    alert('Please enter a Room Code');
    return;
  }
  if (!name) {
    alert('Please enter your name');
    return;
  }

  if (!socket) {
    initSocket(window.location.origin);
  }

  socket.emit('joinRoom', {
    roomCode: code,
    playerName: name,
    avatar: playerAvatar
  });
});



// Submit Guess Form
guessForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const guess = guessInput.value.trim();
  if (!guess || !socket) return;

  socket.emit('submitGuess', { guess: guess });
  
  // Disable input fields while evaluating
  guessInput.disabled = true;
  if (sendGuessBtn) sendGuessBtn.disabled = true;
});

// Connect Button Event (custom connection screen)
connectBtn.addEventListener('click', () => {
  let url = document.getElementById('connect-url-input').value.trim();
  if (!url) {
    alert('Please enter a server URL');
    return;
  }
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'http://' + url;
  }
  initSocket(url);
  showState('join');
});

// QR Code Camera Scanner Integration
scanQrBtn.addEventListener('click', () => {
  document.getElementById('scanner-view').style.display = 'block';
  scanQrBtn.style.display = 'none';
  startQrScanner();
});

cancelScanBtn.addEventListener('click', () => {
  stopQrScanner();
  document.getElementById('scanner-view').style.display = 'none';
  scanQrBtn.style.display = 'block';
});

function startQrScanner() {
  if (scanning) return;
  scanning = true;

  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    .then((stream) => {
      qrStream = stream;
      const video = document.getElementById('scanner-video');
      video.srcObject = stream;
      video.setAttribute('playsinline', true);
      video.play();
      requestAnimationFrame(scanTick);
    })
    .catch((err) => {
      console.error('Camera access denied:', err);
      alert('Could not access camera. Please enter URL manually.');
      stopQrScanner();
    });
}

function stopQrScanner() {
  scanning = false;
  if (qrStream) {
    qrStream.getTracks().forEach(track => track.stop());
    qrStream = null;
  }
  document.getElementById('scanner-view').style.display = 'none';
  scanQrBtn.style.display = 'block';
}

function scanTick() {
  if (!scanning) return;

  const video = document.getElementById('scanner-video');
  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // Call jsQR library decoding
    if (typeof jsQR !== 'undefined') {
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert',
      });

      if (code) {
        console.log('QR Code detected:', code.data);
        stopQrScanner();
        
        // QR Code content should be the full URL, e.g. http://192.168.1.100:3000/?room=7F2K
        try {
          const url = new URL(code.data);
          const room = url.searchParams.get('room');
          if (room) {
            roomCodeInput.value = room.toUpperCase();
          }
          
          // Connect to the base origin of the URL
          const connectionOrigin = url.origin;
          initSocket(connectionOrigin);
          showState('join');
        } catch (e) {
          // If not a valid URL, treat as just the room code or raw string
          if (code.data.length === 4) {
            roomCodeInput.value = code.data.toUpperCase();
          } else {
            alert('Scanned text: ' + code.data);
          }
        }
        return;
      }
    }
  }
  requestAnimationFrame(scanTick);
}

// Receive room codes from parent window when in demo view iframe mode
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'AUTO_FILL_ROOM') {
    roomCodeInput.value = event.data.roomCode.toUpperCase();
    nameInput.value = 'Priya'; // Default test name
    
    // Connect to server
    if (event.data.serverUrl) {
      initSocket(event.data.serverUrl);
    }
    
    // Simulate auto-selection
    const pOpt = document.querySelector('.avatar-opt[data-avatar="🐼"]');
    if (pOpt) pOpt.click();
    
    console.log('Auto-filled room code from demo manager:', event.data.roomCode);
  }
});
