// Game state
const gameState = {
    playerScore: 0,
    aiScore: 0,
    currentRound: 0,
    totalRounds: 5,
    isCounting: false,
    countdown: 0,
    playerMove: null,
    aiMove: null,
    model: null,
    isModelLoaded: false,
    gameActive: false
};

// DOM elements
const video = document.getElementById('player-camera');
const overlay = document.getElementById('player-overlay');
const overlayCtx = overlay.getContext('2d');
const countdownEl = document.getElementById('countdown');
const countdownContainer = document.getElementById('countdown-container');
const resultEl = document.getElementById('result-display');
const gameOverEl = document.getElementById('game-over');
const playerScoreEl = document.getElementById('player-score');
const aiScoreEl = document.getElementById('ai-score');
const roundsDisplayEl = document.getElementById('rounds-display');
const totalRoundsEl = document.getElementById('total-rounds');
const startBtn = document.getElementById('start-btn');
const rematchBtn = document.getElementById('rematch-btn');
const roundsSelect = document.getElementById('rounds-select');
const slotItems = document.querySelectorAll('.slot-item');
const playerArea = document.querySelector('.player-area');
const aiArea = document.querySelector('.ai-area');

// Hand landmark connections
const HAND_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], 
    [6, 7], [7, 8], [0, 9], [9, 10], [10, 11], [11, 12], 
    [0, 13], [13, 14], [14, 15], [15, 16], [0, 17], 
    [17, 18], [18, 19], [19, 20], [5, 9], [9, 13], [13, 17]
];

// Initialize game
async function init() {
    try {
        // Set up camera
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480, facingMode: "user" }
        });
        video.srcObject = stream;
        
        await new Promise((resolve) => {
            video.onloadedmetadata = () => {
                overlay.width = video.videoWidth;
                overlay.height = video.videoHeight;
                resolve();
            };
        });
        
        // Load handpose model
        gameState.model = await handpose.load();
        gameState.isModelLoaded = true;
        startBtn.disabled = false;
        startBtn.textContent = "START GAME";
        
        // Start detection loop
        detectHands();
    } catch (err) {
        console.error("Initialization error:", err);
        resultEl.textContent = "Error initializing camera/model - Please refresh";
        startBtn.textContent = "ERROR - REFRESH";
    }
}

// Main detection loop
async function detectHands() {
    if (!gameState.isModelLoaded || !gameState.gameActive) {
        requestAnimationFrame(detectHands);
        return;
    }
    
    try {
        const predictions = await gameState.model.estimateHands(video);
        overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
        
        if (predictions.length > 0) {
            const landmarks = predictions[0].landmarks;
            drawHand(landmarks);
            
            // During countdown phase, detect the move
            if (gameState.isCounting && gameState.countdown === 0 && !gameState.playerMove) {
                gameState.playerMove = classifyGesture(landmarks);
            }
        }
    } catch (err) {
        console.error("Detection error:", err);
    }
    
    requestAnimationFrame(detectHands);
}

// Draw hand landmarks
function drawHand(landmarks) {
    overlayCtx.strokeStyle = '#00FF00';
    overlayCtx.lineWidth = 2;
    
    HAND_CONNECTIONS.forEach(([start, end]) => {
        overlayCtx.beginPath();
        overlayCtx.moveTo(landmarks[start][0], landmarks[start][1]);
        overlayCtx.lineTo(landmarks[end][0], landmarks[end][1]);
        overlayCtx.stroke();
    });
    
    overlayCtx.fillStyle = '#FF0000';
    landmarks.forEach(landmark => {
        overlayCtx.beginPath();
        overlayCtx.arc(landmark[0], landmark[1], 4, 0, 2 * Math.PI);
        overlayCtx.fill();
    });
}

// Classify hand gesture
function classifyGesture(landmarks) {
    const fingerTips = [4, 8, 12, 16, 20];
    const fingerJoints = [2, 5, 9, 13, 17];
    
    const isExtended = (tipIdx, jointIdx) => {
        const tip = landmarks[tipIdx];
        const joint = landmarks[jointIdx];
        const wrist = landmarks[0];
        const wristToJoint = Math.hypot(wrist[0]-joint[0], wrist[1]-joint[1]);
        const jointToTip = Math.hypot(joint[0]-tip[0], joint[1]-tip[1]);
        return jointToTip > wristToJoint * 0.8;
    };
    
    const extended = fingerTips.map((tip, i) => isExtended(tip, fingerJoints[i]));
    const thumbExtended = extended[0];
    const extendedFingers = extended.slice(1).filter(Boolean).length;
    
    if (extendedFingers === 0 && !thumbExtended) return 'rock';
    if (extendedFingers >= 4) return 'paper';
    if (extendedFingers === 2 && !thumbExtended && extended[1] && extended[2]) return 'scissors';
    
    return null;
}

// Start game
function startGame() {
    if (gameState.isCounting) return;
    
    gameState.totalRounds = parseInt(roundsSelect.value);
    totalRoundsEl.textContent = gameState.totalRounds;
    gameState.gameActive = true;
    gameState.playerScore = 0;
    gameState.aiScore = 0;
    gameState.currentRound = 0;
    playerScoreEl.textContent = '0';
    aiScoreEl.textContent = '0';
    roundsDisplayEl.textContent = '0';
    resultEl.textContent = '';
    gameOverEl.style.display = 'none';
    startBtn.disabled = true;
    rematchBtn.style.display = 'none';
    roundsSelect.disabled = true;
    
    startRound();
}

// Start a new round
function startRound() {
    if (gameState.currentRound >= gameState.totalRounds || 
        gameState.playerScore > gameState.totalRounds/2 || 
        gameState.aiScore > gameState.totalRounds/2) {
        endGame();
        return;
    }
    
    gameState.currentRound++;
    roundsDisplayEl.textContent = gameState.currentRound;
    gameState.isCounting = true;
    gameState.countdown = 3;
    gameState.playerMove = null;
    gameState.aiMove = null;
    resultEl.textContent = '';
    
    // Reset slot machine
    slotItems.forEach(item => {
        item.style.opacity = '0';
        item.style.transform = 'translateY(-100px)';
    });
    
    // Show countdown
    countdownEl.style.opacity = '1';
    
    // Start countdown
    const timer = setInterval(() => {
        gameState.countdown--;
        countdownEl.textContent = gameState.countdown > 0 ? gameState.countdown : "GO!";
        
        if (gameState.countdown <= 0) {
            clearInterval(timer);
            
            // Generate AI move
            gameState.aiMove = ['rock', 'paper', 'scissors'][Math.floor(Math.random() * 3)];
            animateSlotMachine(gameState.aiMove);
            
            // Check result after animations
            setTimeout(() => {
                finishRound();
                gameState.isCounting = false;
                countdownEl.style.opacity = '0';
                
                // Start next round automatically
                setTimeout(startRound, 2000);
            }, 2000);
        }
    }, 1000);
}

// Animate the AI slot machine
function animateSlotMachine(finalMove) {
    const moves = ['rock', 'paper', 'scissors'];
    const spinDuration = 1500;
    const startTime = performance.now();
    
    function spin(timestamp) {
        const progress = (timestamp - startTime) / spinDuration;
        
        if (progress < 1) {
            const randomMove = moves[Math.floor(Math.random() * 3)];
            showSlotItem(randomMove);
            requestAnimationFrame(spin);
        } else {
            showSlotItem(finalMove);
        }
    }
    
    requestAnimationFrame(spin);
}

function showSlotItem(move) {
    slotItems.forEach(item => {
        item.style.opacity = '0';
        item.style.transform = 'translateY(-100px)';
    });
    
    const activeItem = document.querySelector(`.slot-item[data-value="${move}"]`);
    activeItem.style.opacity = '1';
    activeItem.style.transform = 'translateY(0)';
}

// Finish the current round
function finishRound() {
    if (!gameState.playerMove) {
        resultEl.textContent = "MOVE NOT DETECTED! TRY AGAIN!";
        return;
    }
    
    const winner = determineWinner(gameState.playerMove, gameState.aiMove);
    
    if (winner === 'player') {
        gameState.playerScore++;
        resultEl.textContent = `YOU WIN! ${gameState.playerMove.toUpperCase()} beats ${gameState.aiMove.toUpperCase()}`;
        createConfetti(playerArea);
    } else if (winner === 'ai') {
        gameState.aiScore++;
        resultEl.textContent = `AI WINS! ${gameState.aiMove.toUpperCase()} beats ${gameState.playerMove.toUpperCase()}`;
        createConfetti(aiArea);
    } else {
        resultEl.textContent = `DRAW! Both played ${gameState.playerMove.toUpperCase()}`;
    }
    
    playerScoreEl.textContent = gameState.playerScore;
    aiScoreEl.textContent = gameState.aiScore;
}

// Determine round winner
function determineWinner(playerMove, aiMove) {
    if (playerMove === aiMove) return 'draw';
    const rules = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
    return rules[playerMove] === aiMove ? 'player' : 'ai';
}

// End the game
function endGame() {
    gameState.gameActive = false;
    startBtn.style.display = 'none';
    rematchBtn.style.display = 'block';
    roundsSelect.disabled = false;
    
    if (gameState.playerScore > gameState.aiScore) {
        gameOverEl.textContent = `YOU WIN THE GAME ${gameState.playerScore}-${gameState.aiScore}!`;
        createConfetti(playerArea, 500);
    } else if (gameState.aiScore > gameState.playerScore) {
        gameOverEl.textContent = `AI WINS THE GAME ${gameState.aiScore}-${gameState.playerScore}!`;
        createConfetti(aiArea, 500);
    } else {
        gameOverEl.textContent = `IT'S A TIE! ${gameState.playerScore}-${gameState.aiScore}`;
    }
    
    gameOverEl.style.display = 'block';
}

// Create confetti effect
function createConfetti(container, amount = 150) {
    const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'];
    
    for (let i = 0; i < amount; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.left = Math.random() * 100 + '%';
        confetti.style.top = -10 + 'px';
        confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.width = Math.random() * 10 + 5 + 'px';
        confetti.style.height = Math.random() * 10 + 5 + 'px';
        confetti.style.transform = `rotate(${Math.random() * 360}deg)`;
        
        container.appendChild(confetti);
        
        const animationDuration = Math.random() * 3 + 2;
        
        confetti.animate([
            { top: '-10px', opacity: 1 },
            { top: '100%', opacity: 0 }
        ], {
            duration: animationDuration * 1000,
            easing: 'cubic-bezier(0.1, 0.8, 0.9, 1)'
        });
        
        setTimeout(() => confetti.remove(), animationDuration * 1000);
    }
}

// Event listeners
startBtn.addEventListener('click', startGame);
rematchBtn.addEventListener('click', startGame);

// Initialize the game
init();