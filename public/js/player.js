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

// ── Player stage (rotating image + timer ring) ──────────────────────────────
const playerStageWrap   = document.getElementById('player-stage-wrap');
const playerObjectImage = document.getElementById('player-object-image');
const playerObjectCanvas= document.getElementById('player-object-canvas');
const playerObject3d    = document.getElementById('player-object-3d');
const playerTimerRing   = document.getElementById('player-timer-ring');
const playerTimerTextEl = document.getElementById('player-timer-text');
let playerTimerVal = 30;
let playerTimerMax = 30;
let playerTimerInterval = null;
let playerRafId = null;
let playerRoundStartTime = null; // wall-clock time when this round began

function updatePlayerTimerUI() {
  const min = Math.floor(playerTimerVal / 60);
  const sec = playerTimerVal % 60;
  if (playerTimerTextEl) {
    playerTimerTextEl.textContent =
      `${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  }
  if (playerTimerRing) {
    const deg = (playerTimerVal / playerTimerMax) * 360;
    playerTimerRing.style.background = playerTimerVal > 0
      ? `conic-gradient(var(--coral) 0deg, var(--yellow) ${deg}deg, rgba(124,92,252,0.12) ${deg}deg 360deg)`
      : `rgba(124,92,252,0.12)`;
  }
  drawPlayerPixelatedImage();
}

function drawPlayerPixelatedImage() {
  if (!playerObjectImage || !playerObjectCanvas) return;
  if (!playerObjectImage.complete || playerObjectImage.naturalWidth === 0) return;
  const canvas = playerObjectCanvas;
  const ctx = canvas.getContext('2d');
  if (playerTimerVal === 0) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(playerObjectImage, 0, 0, canvas.width, canvas.height);
    return;
  }
  // Use wall-clock elapsed time so player stays pixel-perfectly in sync with host
  const elapsedMs = playerRoundStartTime ? Date.now() - playerRoundStartTime : 0;
  const elapsedRatio = Math.min(1, elapsedMs / (playerTimerMax * 1000));
  const currentRes = Math.max(1, Math.floor(6 + (150 - 6) * Math.pow(elapsedRatio, 2)));
  const tmp = document.createElement('canvas');
  tmp.width = tmp.height = currentRes;
  const tctx = tmp.getContext('2d');
  tctx.imageSmoothingEnabled = false;
  tctx.drawImage(playerObjectImage, 0, 0, currentRes, currentRes);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.mozImageSmoothingEnabled = false;
  ctx.webkitImageSmoothingEnabled = false;
  ctx.drawImage(tmp, 0, 0, currentRes, currentRes, 0, 0, canvas.width, canvas.height);
}
// ────────────────────────────────────────────────────────────────────────────


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
    transports: ['websocket'],   // skip HTTP polling — ngrok handles WS fine
    upgrade: false,
    reconnectionDelay: 500,
    reconnectionAttempts: 10
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

  // "Get Ready" countdown while round image generates
  let playerPrepInterval = null;
  let playerDotInterval = null;
  socket.on('roundPreparing', (data) => {
    showState('waiting');
    let secs = data.countdown || 5;
    const statusEl = document.getElementById('waiting-status-text');
    const titleEl  = document.getElementById('me-waiting-name');
    titleEl.textContent  = `Round ${data.roundIndex} of ${data.totalRounds}`;
    statusEl.textContent = `Starting in ${secs}...`;
    if (playerPrepInterval) clearInterval(playerPrepInterval);
    if (playerDotInterval) clearInterval(playerDotInterval);
    playerDotInterval = null;
    playerPrepInterval = setInterval(() => {
      secs--;
      if (secs <= 0) {
        clearInterval(playerPrepInterval);
        playerPrepInterval = null;
        // Countdown done — now waiting for image to generate
        let dots = 0;
        statusEl.textContent = `Generating image.`;
        playerDotInterval = setInterval(() => {
          dots = (dots + 1) % 4;
          statusEl.textContent = `Generating image${'.'.repeat(dots) || ''}`;
        }, 500);
      } else {
        statusEl.textContent = `Starting in ${secs}...`;
      }
    }, 1000);
  });

  socket.on('startRound', (data) => {
    if (playerPrepInterval) { clearInterval(playerPrepInterval); playerPrepInterval = null; }
    if (playerDotInterval) { clearInterval(playerDotInterval); playerDotInterval = null; }
    currentRound = data.roundIndex;
    guessingRoundTitle.textContent = `Round ${currentRound} / ${data.totalRounds}`;
    guessingScore.textContent = `Score: ${currentScore}%`;

    // Update clue hints + letter count
    if (hintDesc) hintDesc.textContent = data.description || 'Waiting for clue...';
    if (hintBlanks) hintBlanks.textContent = data.wordPattern || '';
    const letterCountEl = document.getElementById('hint-letter-count');
    if (letterCountEl) {
      const n = (data.wordPattern || '').split('').filter(c => c === '_').length;
      letterCountEl.textContent = n ? `${n} letter${n !== 1 ? 's' : ''}` : '';
    }

    // Reset guess inputs
    guessInput.value = '';
    guessInput.disabled = false;
    if (sendGuessBtn) sendGuessBtn.disabled = false;
    guessFormContainer.style.display = 'block';
    lastGuessFeedback.style.display = 'none';
    correctGuessCard.style.display = 'none';

    // ── Player stage ──
    playerTimerMax = data.duration || 30;
    playerTimerVal = data.duration || 30;
    playerRoundStartTime = Date.now(); // wall-clock start for pixel-sync
    if (playerTimerInterval) clearInterval(playerTimerInterval);
    if (playerStageWrap) playerStageWrap.style.display = 'flex';
    if (playerObject3d)    playerObject3d.style.display = 'block';
    if (playerObjectCanvas) playerObjectCanvas.style.display = 'none';
    updatePlayerTimerUI();
    // Start integer countdown for timer badge
    playerTimerInterval = setInterval(() => {
      playerTimerVal = Math.max(0, playerTimerVal - 1);
      if (playerTimerVal === 0) clearInterval(playerTimerInterval);
      updatePlayerTimerUI();
    }, 1000);
    // rAF loop for smooth continuous pixelation reveal (wall-clock based)
    if (playerRafId) cancelAnimationFrame(playerRafId);
    (function rafLoop() {
      if (playerTimerVal > 0) {
        drawPlayerPixelatedImage();
        playerRafId = requestAnimationFrame(rafLoop);
      }
    })();
    // Load image — proxied through server so it's same-origin, no CORS needed
    if (data.imageUrl && playerObjectImage) {
      playerObjectImage.removeAttribute('crossorigin');
      playerObjectImage.src = data.imageUrl;
      playerObjectImage.onload = () => {
        if (playerObject3d)     playerObject3d.style.display = 'none';
        if (playerObjectCanvas) { playerObjectCanvas.style.display = 'block'; drawPlayerPixelatedImage(); }
      };
      playerObjectImage.onerror = () => {
        console.warn('Player object image failed to load:', data.imageUrl);
      };
    }

    showState('guessing');
  });

  // AI image arrives mid-round — swap it in seamlessly
  socket.on('roundImageReady', (data) => {
    if (!playerObjectImage) return;
    playerObjectImage.src = data.imageUrl;
    playerObjectImage.onload = () => {
      if (playerObject3d)     playerObject3d.style.display = 'none';
      if (playerObjectCanvas) { playerObjectCanvas.style.display = 'block'; drawPlayerPixelatedImage(); }
    };
    playerObjectImage.onerror = () => console.warn('roundImageReady load failed:', data.imageUrl);
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
      // Update the already-visible "Checking…" feedback with real result
      lastGuessText.textContent = `"${data.guess}"`;

      let scoreText = `${data.score}% similarity`;
      if (data.score > 70) scoreText = 'Very close! (' + scoreText + ')';
      else if (data.score > 40) scoreText = 'On the right track! (' + scoreText + ')';
      else scoreText = 'Incorrect (' + scoreText + ')';

      lastGuessScore.textContent = scoreText;
      lastGuessScore.style.color = 'var(--coral)';
      lastGuessFeedback.style.display = 'block';

      // Re-enable for next guess
      guessInput.disabled = false;
      if (sendGuessBtn) sendGuessBtn.disabled = false;
      guessInput.focus();
    }
  });

  socket.on('roundReveal', (data) => {
    // Show full-quality image on reveal
    if (playerTimerInterval) clearInterval(playerTimerInterval);
    playerTimerVal = 0;
    updatePlayerTimerUI();
    if (playerObjectImage && playerObjectImage.complete && playerObjectImage.naturalWidth > 0) {
      if (playerObject3d)     playerObject3d.style.display = 'none';
      if (playerObjectCanvas) { playerObjectCanvas.style.display = 'block'; drawPlayerPixelatedImage(); }
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

// When keyboard opens on mobile, scroll just enough to keep the input visible.
// Uses the screen-wrapper's own scroll (not body), so the gradient never shifts.
if (guessInput) {
  guessInput.addEventListener('focus', () => {
    setTimeout(() => {
      guessInput.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 300);
  });
}


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

  // Show instant optimistic feedback — don't make user wait for AI grading
  lastGuessText.textContent = `"${guess}"`;
  lastGuessScore.textContent = 'Checking…';
  lastGuessScore.style.color = 'var(--ink-soft)';
  lastGuessFeedback.style.display = 'block';

  socket.emit('submitGuess', { guess });

  // Disable while evaluating
  guessInput.disabled = true;
  guessInput.value = '';
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
