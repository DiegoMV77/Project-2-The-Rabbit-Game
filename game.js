const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const distanceEl = document.getElementById("distance");
const speedEl = document.getElementById("speed");
const timeEl = document.getElementById("time");
const bestTimeEl = document.getElementById("best-time");
const messageEl = document.getElementById("message");
const restartBtn = document.getElementById("restart");
const pauseBtn = document.getElementById("pause");

const GROUND_Y = 340;
const GRAVITY = 2200;
const JUMP_VELOCITY = -705;
const BASE_SPEED = 250;
const MAX_SPEED = 690;
const CARROT_GOAL = 10000;
const BEST_TIME_STORAGE_KEY = "rabbit-run-best-time";
const JUMP_BUFFER_SECONDS = 0.1;
const INVINCIBILITY_DURATION = 7.0;
const POWER_UP_SPAWN_CHANCE = 0.008;

const state = {
  rabbit: {
    x: 150,
    y: GROUND_Y - 46,
    w: 44,
    h: 46,
    vy: 0,
    grounded: true,
    frame: 0
  },
  distance: 0,
  elapsedTime: 0,
  bestTime: 0,
  worldSpeed: BASE_SPEED,
  speedMultiplier: 1,
  rocks: [],
  birds: [],
  powerUps: [],
  mountainOffset: 0,
  cloudOffset: 0,
  paused: false,
  lastMessageBeforePause: "",
  invincibilityTimer: 0,
  gameOver: false,
  win: false,
  started: false,
  lastTime: 0,
  rockSpawnTimer: 0,
  nextRockSpawn: 1,
  birdSpawnTimer: 0,
  nextBirdSpawn: 3,
  carrotX: CARROT_GOAL,
  jumpBufferTimer: 0
};

function resetGame() {
  state.rabbit.y = GROUND_Y - state.rabbit.h;
  state.rabbit.vy = 0;
  state.rabbit.grounded = true;
  state.rabbit.frame = 0;

  state.distance = 0;
  state.elapsedTime = 0;
  state.worldSpeed = BASE_SPEED;
  state.speedMultiplier = 1;
  state.rocks = [];
  state.birds = [];
  state.powerUps = [];
  state.mountainOffset = 0;
  state.cloudOffset = 0;
  state.paused = false;
  state.lastMessageBeforePause = "";
  state.invincibilityTimer = 0;
  state.gameOver = false;
  state.win = false;
  state.started = false;
  state.lastTime = 0;
  state.rockSpawnTimer = 0;
  state.nextRockSpawn = randomRange(0.75, 1.35);
  state.birdSpawnTimer = 0;
  state.nextBirdSpawn = randomRange(4, 7);
  state.carrotX = CARROT_GOAL;
  state.jumpBufferTimer = 0;

  distanceEl.textContent = "0";
  speedEl.textContent = "1.0";
  timeEl.textContent = "0.00";
  bestTimeEl.textContent = state.bestTime.toFixed(2);
  messageEl.textContent = "Press SPACE or LEFT CLICK to jump.";
  restartBtn.hidden = true;
  refreshPauseButton();
}

function loadBestTime() {
  const saved = Number.parseFloat(localStorage.getItem(BEST_TIME_STORAGE_KEY) || "0");
  state.bestTime = Number.isFinite(saved) && saved > 0 ? saved : 0;
}

function saveBestTime() {
  localStorage.setItem(BEST_TIME_STORAGE_KEY, state.bestTime.toFixed(2));
}

function finalizeRunTime() {
  if (state.elapsedTime > state.bestTime) {
    state.bestTime = state.elapsedTime;
    saveBestTime();
  }
}

function refreshPauseButton() {
  pauseBtn.textContent = state.paused ? ">" : "||";
  pauseBtn.classList.toggle("is-paused", state.paused);
  pauseBtn.title = state.paused ? "Resume (P)" : "Pause (P)";
  pauseBtn.setAttribute("aria-label", state.paused ? "Resume game" : "Pause game");
}

function togglePause() {
  if (!state.started || state.gameOver || state.win) {
    return;
  }

  state.paused = !state.paused;

  if (state.paused) {
    state.lastMessageBeforePause = messageEl.textContent;
    messageEl.textContent = "Paused. Press P or click to resume.";
  } else {
    messageEl.textContent = state.lastMessageBeforePause || "Run for the giant carrot!";
    state.lastTime = performance.now();
  }

  refreshPauseButton();
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function jump() {
  if (state.paused || state.gameOver || state.win) {
    return;
  }
  if (!state.started) {
    state.started = true;
    messageEl.textContent = "Run for the giant carrot!";
  }
  if (state.rabbit.grounded) {
    state.rabbit.vy = JUMP_VELOCITY;
    state.rabbit.grounded = false;
    state.jumpBufferTimer = 0;
  }
}

function queueJump() {
  state.jumpBufferTimer = JUMP_BUFFER_SECONDS;
  jump();
}

function spawnRock() {
  const heights = [20, 28, 34, 42];
  const h = heights[Math.floor(Math.random() * heights.length)];
  const widthByHeight = {
    20: randomRange(54, 74),
    28: randomRange(60, 82),
    34: randomRange(68, 92),
    42: randomRange(76, 104)
  };
  const w = widthByHeight[h] ?? randomRange(56, 84);

  state.rocks.push({
    x: canvas.width + randomRange(0, 120),
    y: GROUND_Y - h,
    w,
    h
  });
}

function spawnBird() {
  const altitudes = [GROUND_Y - 120, GROUND_Y - 145, GROUND_Y - 172];
  const y = altitudes[Math.floor(Math.random() * altitudes.length)];

  state.birds.push({
    x: canvas.width + randomRange(0, 120),
    y,
    w: 36,
    h: 22,
    flap: 0
  });
}

function spawnPowerUp() {
  state.powerUps.push({
    x: canvas.width + randomRange(0, 120),
    y: GROUND_Y - 60,
    w: 22,
    h: 22
  });
}

function intersects(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

function getRockCollisionShape(rock) {
  const px = 2;
  const rows = Math.max(8, Math.floor(rock.h / px));
  const cols = Math.max(16, Math.floor(rock.w / px));
  const variant = Math.floor((rock.w + rock.h) % 3);

  const jagProfiles = [
    [2, 1, 2, 1, 0, 1, 2, 2, 3, 2, 1, 2],
    [1, 2, 1, 0, 1, 2, 2, 3, 2, 2, 1, 2],
    [2, 2, 1, 1, 0, 1, 2, 3, 2, 1, 2, 1]
  ];
  const profile = jagProfiles[variant];
  const rowBounds = [];

  for (let row = 0; row < rows; row++) {
    const t = row / Math.max(1, rows - 1);
    const domeInset = Math.round((1 - t) * cols * 0.22);
    const jag = profile[row % profile.length];
    const leftInset = Math.min(Math.floor(cols * 0.4), domeInset + jag);
    const rightInset = Math.min(Math.floor(cols * 0.4), domeInset + profile[(row + 4) % profile.length]);
    const rowWidth = Math.max(2, cols - leftInset - rightInset);

    rowBounds.push({
      y: rock.y + row * px,
      x: rock.x + leftInset * px,
      w: rowWidth * px,
      h: px
    });
  }

  return rowBounds;
}

function intersectsRock(rabbit, rock) {
  const rowBounds = getRockCollisionShape(rock);
  for (const row of rowBounds) {
    if (intersects(rabbit, row)) {
      return true;
    }
  }
  return false;
}

function update(dt) {
  if (!state.started || state.paused || state.gameOver || state.win) {
    return;
  }

  if (state.jumpBufferTimer > 0) {
    state.jumpBufferTimer = Math.max(0, state.jumpBufferTimer - dt);
  }

  if (state.invincibilityTimer > 0) {
    state.invincibilityTimer = Math.max(0, state.invincibilityTimer - dt);
  }

  state.elapsedTime += dt;
  state.speedMultiplier = Math.min(1 + state.distance / 1800, MAX_SPEED / BASE_SPEED);
  state.worldSpeed = BASE_SPEED * state.speedMultiplier;

  state.distance += state.worldSpeed * dt * 0.1;
  state.mountainOffset += state.worldSpeed * dt * 0.12;
  state.cloudOffset += state.worldSpeed * dt * 0.05;

  const rabbit = state.rabbit;
  rabbit.vy += GRAVITY * dt;
  rabbit.y += rabbit.vy * dt;

  if (rabbit.y >= GROUND_Y - rabbit.h) {
    rabbit.y = GROUND_Y - rabbit.h;
    rabbit.vy = 0;
    rabbit.grounded = true;

    // Buffered input lets near-ground presses execute immediately on landing.
    if (state.jumpBufferTimer > 0) {
      jump();
    }
  }

  state.rockSpawnTimer += dt;
  if (state.rockSpawnTimer >= state.nextRockSpawn) {
    state.rockSpawnTimer = 0;
    state.nextRockSpawn = randomRange(0.6, 1.5) * (1.12 - Math.min(state.distance / 6000, 0.2));
    spawnRock();
  }

  if (state.distance > 800) {
    state.birdSpawnTimer += dt;
    if (state.birdSpawnTimer >= state.nextBirdSpawn) {
      state.birdSpawnTimer = 0;
      state.nextBirdSpawn = randomRange(3.6, 7.2);
      if (Math.random() < 0.6) {
        spawnBird();
      }
    }
  }

  if (Math.random() < POWER_UP_SPAWN_CHANCE * dt) {
    spawnPowerUp();
  }

  for (const rock of state.rocks) {
    rock.x -= state.worldSpeed * dt;
  }

  for (const bird of state.birds) {
    bird.x -= state.worldSpeed * dt * 1.18;
    bird.flap += dt * 11;
  }

  for (const powerUp of state.powerUps) {
    powerUp.x -= state.worldSpeed * dt;
  }

  state.rocks = state.rocks.filter((rock) => rock.x + rock.w > -20);
  state.birds = state.birds.filter((bird) => bird.x + bird.w > -20);
  state.powerUps = state.powerUps.filter((pu) => pu.x + pu.w > -20);

  const rabbitHitbox = {
    x: rabbit.x + 7,
    y: rabbit.y + 6,
    w: rabbit.w - 12,
    h: rabbit.h - 10
  };

  for (const powerUp of state.powerUps) {
    const puHitbox = { x: powerUp.x + 2, y: powerUp.y + 2, w: powerUp.w - 4, h: powerUp.h - 4 };
    if (intersects(rabbitHitbox, puHitbox)) {
      state.invincibilityTimer = INVINCIBILITY_DURATION;
      messageEl.textContent = "Power up! Invincible for 7 seconds!";
      state.powerUps = state.powerUps.filter((pu) => pu !== powerUp);
    }
  }

  if (state.invincibilityTimer <= 0) {
    for (const rock of state.rocks) {
      if (intersectsRock(rabbitHitbox, rock)) {
        state.gameOver = true;
        finalizeRunTime();
        messageEl.textContent = `You crashed! Time: ${state.elapsedTime.toFixed(2)}s. Press Play Again.`;
        restartBtn.hidden = false;
        return;
      }
    }

    for (const bird of state.birds) {
      const birdHitbox = { x: bird.x + 3, y: bird.y + 5, w: bird.w - 6, h: bird.h - 8 };
      if (intersects(rabbitHitbox, birdHitbox)) {
        state.gameOver = true;
        finalizeRunTime();
        messageEl.textContent = `A bird got you! Time: ${state.elapsedTime.toFixed(2)}s. Press Play Again.`;
        restartBtn.hidden = false;
        return;
      }
    }
  }

  if (state.distance >= CARROT_GOAL) {
    state.win = true;
    finalizeRunTime();
    messageEl.textContent = `You reached the giant carrot in ${state.elapsedTime.toFixed(2)}s!`;
    restartBtn.hidden = false;
  }
}

function drawPixelRect(x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function drawBackground() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const cloudShift = state.cloudOffset % canvas.width;
  for (let i = -1; i < 3; i++) {
    const baseX = i * 350 - cloudShift;
    drawCloud(baseX + 140, 70, 1);
    drawCloud(baseX + 300, 110, 0.8);
  }

  const mountainShift = state.mountainOffset % canvas.width;
  for (let i = -1; i < 3; i++) {
    const x = i * 380 - mountainShift;
    drawMountain(x + 80, 180, 150, "#9ec5dc", "#e7f5ff");
    drawMountain(x + 250, 185, 170, "#8cb6d3", "#deeffb");
  }

  drawPixelRect(0, GROUND_Y, canvas.width, canvas.height - GROUND_Y, "#f7fcff");

  for (let i = 0; i < canvas.width; i += 18) {
    const bump = ((i / 18) % 2) * 2;
    drawPixelRect(i, GROUND_Y + bump, 10, 2, "#d8e9f7");
  }

  drawPixelRect(0, GROUND_Y - 5, canvas.width, 5, "#d3e7f4");
}

function drawCloud(x, y, scale) {
  const w = 42 * scale;
  const h = 16 * scale;
  drawPixelRect(x, y, w, h, "#ffffff");
  drawPixelRect(x - 8 * scale, y + 4 * scale, w * 0.32, h * 0.65, "#ffffff");
  drawPixelRect(x + w - 3 * scale, y + 6 * scale, w * 0.26, h * 0.55, "#ffffff");
  drawPixelRect(x + 5 * scale, y + h, w * 0.86, 3 * scale, "#e9f6ff");
}

function drawMountain(x, baseY, width, color, snowColor) {
  const peakX = x + width / 2;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, baseY);
  ctx.lineTo(peakX, baseY - width * 0.55);
  ctx.lineTo(x + width, baseY);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = snowColor;
  ctx.beginPath();
  ctx.moveTo(peakX - 18, baseY - width * 0.38);
  ctx.lineTo(peakX, baseY - width * 0.55);
  ctx.lineTo(peakX + 18, baseY - width * 0.38);
  ctx.lineTo(peakX + 4, baseY - width * 0.36);
  ctx.lineTo(peakX - 5, baseY - width * 0.29);
  ctx.closePath();
  ctx.fill();
}

function drawRabbit() {
  const r = state.rabbit;
  const hopFrame = r.grounded ? Math.floor((performance.now() / 110) % 2) : 1;

  const rainbowColors = ["#ff0000", "#ff7f00", "#ffff00", "#00ff00", "#0000ff", "#4b0082", "#9400d3"];
  let bodyColor = "#f3f3f5";
  let innerColor = "#f6b8cf";

  if (state.invincibilityTimer > 0) {
    const rainbowIndex = Math.floor((performance.now() / 100) % rainbowColors.length);
    bodyColor = rainbowColors[rainbowIndex];
    innerColor = rainbowColors[(rainbowIndex + 3) % rainbowColors.length];
    
    const glowAlpha = 0.4;
    ctx.fillStyle = rainbowColors[rainbowIndex] + "66";
    ctx.beginPath();
    ctx.arc(r.x + r.w / 2, r.y + r.h / 2, 35, 0, Math.PI * 2);
    ctx.fill();
  }

  drawPixelRect(r.x + 9, r.y + 17, 24, 20, bodyColor);
  drawPixelRect(r.x + 30, r.y + 20, 12, 10, bodyColor);
  drawPixelRect(r.x + 36, r.y + 23, 6, 5, "#fff");
  drawPixelRect(r.x + 6, r.y + 4, 8, 20, bodyColor);
  drawPixelRect(r.x + 16, r.y + 2, 8, 22, bodyColor);
  drawPixelRect(r.x + 7, r.y + 4, 3, 14, innerColor);
  drawPixelRect(r.x + 17, r.y + 3, 3, 15, innerColor);

  drawPixelRect(r.x + 30, r.y + 22, 2, 2, "#232323");

  if (hopFrame === 0) {
    drawPixelRect(r.x + 10, r.y + 36, 9, 6, bodyColor);
    drawPixelRect(r.x + 21, r.y + 34, 9, 8, bodyColor);
  } else {
    drawPixelRect(r.x + 11, r.y + 34, 8, 8, bodyColor);
    drawPixelRect(r.x + 22, r.y + 36, 8, 6, bodyColor);
  }
}

function drawRock(rock) {
  const px = 2;
  const rows = Math.max(8, Math.floor(rock.h / px));
  const cols = Math.max(16, Math.floor(rock.w / px));
  const variant = Math.floor((rock.w + rock.h) % 3);

  const jagProfiles = [
    [2, 1, 2, 1, 0, 1, 2, 2, 3, 2, 1, 2],
    [1, 2, 1, 0, 1, 2, 2, 3, 2, 2, 1, 2],
    [2, 2, 1, 1, 0, 1, 2, 3, 2, 1, 2, 1]
  ];
  const profile = jagProfiles[variant];

  for (let row = 0; row < rows; row++) {
    const t = row / Math.max(1, rows - 1);
    const domeInset = Math.round((1 - t) * cols * 0.22);
    const jag = profile[row % profile.length];
    const leftInset = Math.min(Math.floor(cols * 0.4), domeInset + jag);
    const rightInset = Math.min(Math.floor(cols * 0.4), domeInset + profile[(row + 4) % profile.length]);
    const rowWidth = Math.max(2, cols - leftInset - rightInset);

    drawPixelRect(
      rock.x + leftInset * px,
      rock.y + row * px,
      rowWidth * px,
      px,
      "#777d86"
    );
  }

  drawPixelRect(rock.x + 8, rock.y + 4, Math.max(8, rock.w * 0.38), 3, "#a4acb8");
  drawPixelRect(rock.x + rock.w * 0.42, rock.y + Math.max(8, rock.h * 0.26), Math.max(6, rock.w * 0.16), 2, "#8d95a0");
  drawPixelRect(rock.x + 10, rock.y + Math.max(10, rock.h * 0.42), 4, 2, "#626a74");
  drawPixelRect(rock.x + rock.w - 16, rock.y + Math.max(14, rock.h * 0.52), 4, 6, "#626a74");
  drawPixelRect(rock.x + 6, rock.y + rock.h - 6, Math.max(7, rock.w * 0.26), 2, "#5a626d");
}

function drawBird(bird) {
  const wingUp = Math.sin(bird.flap) > 0;

  drawPixelRect(bird.x + 9, bird.y + 8, 16, 8, "#4c5460");
  drawPixelRect(bird.x + 24, bird.y + 10, 10, 6, "#4c5460");
  drawPixelRect(bird.x + 31, bird.y + 11, 4, 2, "#f3c28b");

  if (wingUp) {
    drawPixelRect(bird.x + 7, bird.y + 4, 10, 4, "#5f6774");
    drawPixelRect(bird.x + 17, bird.y + 3, 8, 4, "#5f6774");
  } else {
    drawPixelRect(bird.x + 7, bird.y + 14, 10, 4, "#5f6774");
    drawPixelRect(bird.x + 17, bird.y + 15, 8, 4, "#5f6774");
  }
}

function drawCarrot() {
  if (state.win) {
    return;
  }

  const x = state.carrotX;
  const y = GROUND_Y - 104;

  drawPixelRect(x + 10, y, 16, 10, "#55a55e");
  drawPixelRect(x + 4, y + 8, 12, 8, "#63b96f");
  drawPixelRect(x + 20, y + 8, 12, 8, "#63b96f");

  drawPixelRect(x + 10, y + 14, 16, 36, "#ff9528");
  drawPixelRect(x + 13, y + 22, 10, 4, "#ffb05b");
  drawPixelRect(x + 12, y + 30, 12, 4, "#ffb05b");
  drawPixelRect(x + 14, y + 38, 8, 4, "#ffb05b");
}

function drawPowerUp(powerUp) {
  const x = powerUp.x;
  const y = powerUp.y;
  const pulse = Math.sin(performance.now() / 150) * 2 + 3;
  
  ctx.fillStyle = "#ffdd00";
  ctx.beginPath();
  ctx.arc(x + powerUp.w / 2, y + powerUp.h / 2, 8 + pulse, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = "#ffa500";
  drawPixelRect(x + 5, y + 8, 4, 6, "#ffa500");
  drawPixelRect(x + 13, y + 8, 4, 6, "#ffa500");
  
  drawPixelRect(x + 6, y + 5, 10, 4, "#ffdd00");
  drawPixelRect(x + 8, y + 15, 6, 2, "#ffa500");
}

function drawHud() {
  distanceEl.textContent = Math.floor(state.distance).toString();
  speedEl.textContent = state.speedMultiplier.toFixed(1);
  timeEl.textContent = state.elapsedTime.toFixed(2);
  bestTimeEl.textContent = state.bestTime.toFixed(2);
}

function draw() {
  drawBackground();
  drawCarrot();

  for (const rock of state.rocks) {
    drawRock(rock);
  }

  for (const bird of state.birds) {
    drawBird(bird);
  }

  for (const powerUp of state.powerUps) {
    drawPowerUp(powerUp);
  }

  drawRabbit();

  if (!state.started) {
    drawPixelRect(370, 130, 230, 42, "#ffffffd9");
    ctx.fillStyle = "#203344";
    ctx.font = "14px 'Courier New', monospace";
    ctx.fillText("SPACE / LEFT CLICK", 404, 156);
  }

  if (state.gameOver) {
    drawPixelRect(350, 120, 260, 54, "#fff0f0f0");
    ctx.fillStyle = "#5c2d2d";
    ctx.font = "16px 'Courier New', monospace";
    ctx.fillText("GAME OVER", 430, 152);
  }

  if (state.paused) {
    drawPixelRect(418, 126, 230, 52, "#eef9fff0");
    ctx.fillStyle = "#274659";
    ctx.font = "16px 'Courier New', monospace";
    ctx.fillText("PAUSED", 500, 158);
  }

  if (state.win) {
    drawPixelRect(318, 118, 320, 58, "#f4fff0f3");
    ctx.fillStyle = "#244028";
    ctx.font = "15px 'Courier New', monospace";
    ctx.fillText("GIANT CARROT REACHED!", 346, 152);
  }

  drawHud();
}

function gameLoop(timestamp) {
  if (!state.lastTime) {
    state.lastTime = timestamp;
  }

  const dt = Math.min((timestamp - state.lastTime) / 1000, 0.033);
  state.lastTime = timestamp;

  update(dt);
  draw();

  requestAnimationFrame(gameLoop);
}

window.addEventListener("keydown", (event) => {
  if (event.code === "Space") {
    event.preventDefault();
    queueJump();
  }

  if (event.code === "KeyP") {
    event.preventDefault();
    togglePause();
  }
});

canvas.addEventListener("mousedown", (event) => {
  if (event.button === 0) {
    queueJump();
  }
});

restartBtn.addEventListener("click", () => {
  resetGame();
});

pauseBtn.addEventListener("click", () => {
  togglePause();
});

resetGame();
loadBestTime();
bestTimeEl.textContent = state.bestTime.toFixed(2);
requestAnimationFrame(gameLoop);
