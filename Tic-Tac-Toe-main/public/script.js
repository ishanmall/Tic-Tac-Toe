let soundEnabled = true;
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function playTone(freq, duration = 0.12, type = "sine", vol = 0.12) {
  if (!soundEnabled) return;
  if (!audioCtx) audioCtx = new AudioCtx();
  if (audioCtx.state === "suspended") audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  gain.gain.setValueAtTime(vol, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

function playMoveSound(player) {
  if (player === "X") {
    playTone(520, 0.09, "triangle", 0.14);
    setTimeout(() => playTone(740, 0.12, "sine", 0.1), 45);
  } else {
    playTone(340, 0.09, "sawtooth", 0.09);
    setTimeout(() => playTone(260, 0.14, "triangle", 0.11), 50);
  }
}

function playWinSound() {
  [523, 659, 784, 1046].forEach((f, i) => {
    setTimeout(() => playTone(f, 0.22, "triangle", 0.14), i * 85);
  });
}

function playDrawSound() {
  playTone(300, 0.15, "sine", 0.1);
  setTimeout(() => playTone(240, 0.22, "sine", 0.1), 130);
}

/* ==================== BACKGROUND ==================== */
const bgCanvas = document.getElementById("bgCanvas");
const bgCtx = bgCanvas.getContext("2d");
let bgOrbs = [];
let gridOffset = 0;

function resizeBg() {
  bgCanvas.width = window.innerWidth;
  bgCanvas.height = window.innerHeight;
  bgOrbs = Array.from({ length: 36 }, () => ({
    x: Math.random() * bgCanvas.width,
    y: Math.random() * bgCanvas.height,
    r: 1.5 + Math.random() * 3.5,
    vy: -0.2 - Math.random() * 0.45,
    color: ["#00f5ff", "#ff2a85", "#ffc83c"][Math.floor(Math.random() * 3)],
    alpha: 0.15 + Math.random() * 0.35
  }));
}
window.addEventListener("resize", resizeBg);
resizeBg();

function drawBackground(dt) {
  const w = bgCanvas.width;
  const h = bgCanvas.height;
  bgCtx.clearRect(0, 0, w, h);

  const horizon = h * 0.62;
  gridOffset = (gridOffset + dt * 32) % 40;

  bgCtx.save();
  bgCtx.strokeStyle = "rgba(255, 42, 133, 0.16)";
  bgCtx.lineWidth = 1;

  for (let i = 0; i < 14; i++) {
    const t = (i * 40 + gridOffset) / (14 * 40);
    const y = horizon + Math.pow(t, 1.8) * (h - horizon);
    bgCtx.beginPath();
    bgCtx.moveTo(0, y);
    bgCtx.lineTo(w, y);
    bgCtx.stroke();
  }

  const vanishX = w / 2;
  for (let i = -10; i <= 10; i++) {
    bgCtx.beginPath();
    bgCtx.moveTo(vanishX + i * 28, horizon);
    bgCtx.lineTo(vanishX + i * 190, h);
    bgCtx.stroke();
  }
  bgCtx.restore();

  for (const orb of bgOrbs) {
    orb.y += orb.vy * dt * 60;
    if (orb.y < -10) {
      orb.y = h + 10;
      orb.x = Math.random() * w;
    }
    bgCtx.save();
    bgCtx.globalAlpha = orb.alpha;
    bgCtx.fillStyle = orb.color;
    bgCtx.shadowColor = orb.color;
    bgCtx.shadowBlur = 12;
    bgCtx.beginPath();
    bgCtx.arc(orb.x, orb.y, orb.r, 0, Math.PI * 2);
    bgCtx.fill();
    bgCtx.restore();
  }
}

/* ==================== GAME LOGIC ==================== */
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const SIZE = canvas.width;
const CELL = SIZE / 3;
const PAD = 10;

const NEON_CYAN = "#00f5ff";
const NEON_PINK = "#ff2a85";
const NEON_GOLD = "#ffc83c";

const WIN_COMBOS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
];

let vsAi = true;
let board = Array(9).fill("");
let animProgress = Array(9).fill(0);
let currentPlayer = "X";
let gameOver = false;
let winningCombo = null;
let winLineProgress = 0;
let aiTimer = 0;
let shake = 0;
let hoverIdx = -1;
let particles = [];
let scores = { X: 0, O: 0, D: 0 };

const statusEl = document.getElementById("statusText");
const scoreXEl = document.getElementById("scoreX");
const scoreDEl = document.getElementById("scoreD");
const scoreOEl = document.getElementById("scoreO");
const labelXEl = document.getElementById("labelX");
const labelOEl = document.getElementById("labelO");
const btnAi = document.getElementById("btnAi");
const btnLocal = document.getElementById("btnLocal");
const btnRestart = document.getElementById("btnRestart");
const btnSound = document.getElementById("btnSound");

function updateStatus(text, color = NEON_CYAN) {
  statusEl.textContent = text;
  statusEl.style.color = color;
  statusEl.style.textShadow = `0 0 12px ${color}`;
}

function updateScores() {
  scoreXEl.textContent = scores.X;
  scoreDEl.textContent = scores.D;
  scoreOEl.textContent = scores.O;
}

function cellRect(idx) {
  const r = Math.floor(idx / 3);
  const c = idx % 3;
  return {
    x: c * CELL + PAD,
    y: r * CELL + PAD,
    w: CELL - PAD * 2,
    h: CELL - PAD * 2,
    cx: c * CELL + CELL / 2,
    cy: r * CELL + CELL / 2
  };
}

function spawnBurst(x, y, color, count = 24, speedScale = 1) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = (1.5 + Math.random() * 5.2) * speedScale;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.4 + Math.random() * 0.5,
      maxLife: 0.9,
      size: 2 + Math.random() * 3.5,
      color
    });
  }
}

function getWinningCombo(b) {
  for (const combo of WIN_COMBOS) {
    const [a, c1, c2] = combo;
    if (b[a] && b[a] === b[c1] && b[a] === b[c2]) return combo;
  }
  return null;
}

function minimax(b, depth, isMax) {
  const combo = getWinningCombo(b);
  if (combo) return b[combo[0]] === "O" ? 10 - depth : depth - 10;
  if (!b.includes("")) return 0;

  if (isMax) {
    let best = -999;
    for (let i = 0; i < 9; i++) {
      if (b[i] === "") {
        b[i] = "O";
        best = Math.max(best, minimax(b, depth + 1, false));
        b[i] = "";
      }
    }
    return best;
  } else {
    let best = 999;
    for (let i = 0; i < 9; i++) {
      if (b[i] === "") {
        b[i] = "X";
        best = Math.min(best, minimax(b, depth + 1, true));
        b[i] = "";
      }
    }
    return best;
  }
}

function makeAiMove() {
  let bestScore = -999;
  let bestMove = -1;
  for (let i = 0; i < 9; i++) {
    if (board[i] === "") {
      board[i] = "O";
      const score = minimax(board, 0, false);
      board[i] = "";
      if (score > bestScore) {
        bestScore = score;
        bestMove = i;
      }
    }
  }
  if (bestMove !== -1) placeMark(bestMove, "O");
}

function placeMark(idx, player) {
  board[idx] = player;
  animProgress[idx] = 0.01;
  const rect = cellRect(idx);
  const color = player === "X" ? NEON_CYAN : NEON_PINK;

  spawnBurst(rect.cx, rect.cy, color, 22, 0.9);
  playMoveSound(player);
  shake = 5;

  const combo = getWinningCombo(board);
  if (combo) {
    gameOver = true;
    winningCombo = combo;
    scores[player]++;
    updateScores();
    shake = 13;
    playWinSound();
    combo.forEach(ci => {
      const cr = cellRect(ci);
      spawnBurst(cr.cx, cr.cy, NEON_GOLD, 28, 1.35);
    });
    updateStatus(vsAi && player === "O" ? "AI WINS // GAME OVER" : `PLAYER ${player} WINS!`, NEON_GOLD);
  } else if (!board.includes("")) {
    gameOver = true;
    scores.D++;
    updateScores();
    playDrawSound();
    updateStatus("STALEMATE // DRAW", NEON_GOLD);
  } else {
    currentPlayer = player === "X" ? "O" : "X";
    if (vsAi) {
      if (currentPlayer === "O") {
        updateStatus("AI CALCULATING...", NEON_PINK);
        aiTimer = 0.35;
      } else {
        updateStatus("YOUR TURN (X)", NEON_CYAN);
      }
    } else {
      updateStatus(`PLAYER ${currentPlayer}'S TURN`, currentPlayer === "X" ? NEON_CYAN : NEON_PINK);
    }
  }
}

function resetGame() {
  board = Array(9).fill("");
  animProgress = Array(9).fill(0);
  currentPlayer = "X";
  gameOver = false;
  winningCombo = null;
  winLineProgress = 0;
  aiTimer = 0;
  updateStatus(vsAi ? "YOUR TURN (X)" : "PLAYER X'S TURN", NEON_CYAN);
}

function setMode(aiMode) {
  vsAi = aiMode;
  btnAi.classList.toggle("active", vsAi);
  btnLocal.classList.toggle("active", !vsAi);
  labelXEl.textContent = vsAi ? "YOU (X)" : "P1 (X)";
  labelOEl.textContent = vsAi ? "AI (O)" : "P2 (O)";
  scores = { X: 0, O: 0, D: 0 };
  updateScores();
  resetGame();
}

function getCellFromPointer(e) {
  const bounds = canvas.getBoundingClientRect();
  const scaleX = canvas.width / bounds.width;
  const scaleY = canvas.height / bounds.height;
  const x = (e.clientX - bounds.left) * scaleX;
  const y = (e.clientY - bounds.top) * scaleY;
  const col = Math.floor(x / CELL);
  const row = Math.floor(y / CELL);
  if (col < 0 || col > 2 || row < 0 || row > 2) return -1;
  return row * 3 + col;
}

canvas.addEventListener("mousemove", e => { hoverIdx = getCellFromPointer(e); });
canvas.addEventListener("mouseleave", () => { hoverIdx = -1; });
canvas.addEventListener("click", e => {
  if (gameOver || aiTimer > 0) return;
  const idx = getCellFromPointer(e);
  if (idx !== -1 && board[idx] === "") placeMark(idx, currentPlayer);
});

btnAi.addEventListener("click", () => setMode(true));
btnLocal.addEventListener("click", () => setMode(false));
btnRestart.addEventListener("click", resetGame);
btnSound.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  btnSound.textContent = soundEnabled ? "SFX: ON" : "SFX: OFF";
});

/* ==================== RENDERING ==================== */
function drawRoundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawNeonLine(x1, y1, x2, y2, color, width = 8) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 20;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  ctx.strokeStyle = "#ffffff";
  ctx.shadowBlur = 4;
  ctx.lineWidth = Math.max(2, width * 0.32);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

function drawNeonCircle(cx, cy, radius, progress, color, width = 8) {
  const start = -Math.PI / 2;
  const end = start + Math.PI * 2 * progress;
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 20;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, start, end);
  ctx.stroke();

  ctx.strokeStyle = "#ffffff";
  ctx.shadowBlur = 4;
  ctx.lineWidth = Math.max(2, width * 0.32);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, start, end);
  ctx.stroke();
  ctx.restore();
}

let lastTime = performance.now();

function loop(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  drawBackground(dt);

  for (let i = 0; i < 9; i++) {
    if (board[i] !== "" && animProgress[i] < 1) {
      animProgress[i] = Math.min(1, animProgress[i] + dt * 4.8);
    }
  }

  if (winningCombo && winLineProgress < 1) {
    winLineProgress = Math.min(1, winLineProgress + dt * 3.2);
  }

  if (shake > 0) shake = Math.max(0, shake - dt * 36);

  if (aiTimer > 0) {
    aiTimer -= dt;
    if (aiTimer <= 0 && !gameOver) makeAiMove();
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt * 60;
    p.y += p.vy * dt * 60;
    p.vx *= 0.95;
    p.vy *= 0.95;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }

  ctx.save();
  ctx.clearRect(0, 0, SIZE, SIZE);

  if (shake > 0) {
    ctx.translate((Math.random() - 0.5) * shake * 2, (Math.random() - 0.5) * shake * 2);
  }

  for (let i = 0; i < 9; i++) {
    const r = cellRect(i);
    const isHover = i === hoverIdx && board[i] === "" && !gameOver && aiTimer <= 0;

    drawRoundRect(r.x, r.y, r.w, r.h, 16);
    ctx.fillStyle = isHover ? "rgba(52, 34, 95, 0.92)" : "rgba(26, 17, 52, 0.85)";
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = isHover
      ? (currentPlayer === "X" ? NEON_CYAN : NEON_PINK)
      : "rgba(110, 75, 175, 0.4)";
    ctx.stroke();

    const mark = board[i];
    const prog = animProgress[i];
    if (mark === "X") {
      const pad = 28;
      const x1 = r.x + pad, y1 = r.y + pad;
      const x2 = r.x + r.w - pad, y2 = r.y + r.h - pad;

      const s1 = Math.min(1, prog * 2);
      drawNeonLine(x1, y1, x1 + (x2 - x1) * s1, y1 + (y2 - y1) * s1, NEON_CYAN, 8);

      if (prog > 0.5) {
        const s2 = (prog - 0.5) * 2;
        drawNeonLine(x2, y1, x2 + (x1 - x2) * s2, y1 + (y2 - y1) * s2, NEON_CYAN, 8);
      }
    } else if (mark === "O") {
      drawNeonCircle(r.cx, r.cy, r.w * 0.3, prog, NEON_PINK, 8);
    }
  }

  if (winningCombo) {
    const start = cellRect(winningCombo[0]);
    const end = cellRect(winningCombo[2]);
    const curX = start.cx + (end.cx - start.cx) * winLineProgress;
    const curY = start.cy + (end.cy - start.cy) * winLineProgress;
    drawNeonLine(start.cx, start.cy, curX, curY, NEON_GOLD, 10);
  }

  for (const p of particles) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);