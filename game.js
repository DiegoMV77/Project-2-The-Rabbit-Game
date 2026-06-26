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
const GRAVITY = 2450;
const JUMP_VELOCITY = -705;
const BASE_SPEED = 250;
const MAX_SPEED = 690;
const CARROT_GOAL = 10000;
const BEST_TIME_STORAGE_KEY = "rabbit-run-best-time";
const JUMP_BUFFER_SECONDS = 0.1;
const INVINCIBILITY_DURATION = 7.0;
const INVINCIBILITY_SPEED_MULTIPLIER = 1.1;
const INVINCIBILITY_JUMP_MULTIPLIER = 1.1;
const DISTANCE_TO_PIXEL_SCALE = 10;
const POWER_UP_INTERVAL_METERS = 600;
const POWER_UP_RANDOM_OFFSET_MAX = 200;
const POWER_UP_RARITY_DISTANCE_SCALE = 5000;
const SPECIAL_ROCK_MIN_DISTANCE = 3000;
const SPECIAL_ROCK_MAX_DISTANCE = 10000;
const SPECIAL_ROCK_TEST_SPAWN_DISTANCE = 100;
const SPECIAL_ROCK_USE_TEST_SPAWN = true;
const SPECIAL_ROCK_CLEAR_WINDOW_BEFORE = 35;
const SPECIAL_ROCK_CLEAR_WINDOW_AFTER = 45;
const ROCK_POWER_MESSAGE = "Star rock power active: permanent invincibility + 5x speed";
const JUMP_SOUND_DURATION = 0.12;
const POWER_UP_NOTE_GAP = 0.045;
const HIT_SOUND_DURATION = 0.24;
const BGM_WINDOW_KEY = "__rabbitGameBgmAudioV2";
const BGM_FILE_PATH = "assets/background-theme-v2.wav";
const BGM_PLAYBACK_RATE = 1.0;

let bgmAudio = null;
let bgmStartPromise = null;

function runWhenAudioReady(context, onReady) {
  if (context.state === "suspended") {
    context
      .resume()
      .then(onReady)
      .catch(() => {
        // Ignore resume failures and keep gameplay uninterrupted.
      });
    return;
  }

  onReady();
}

let audioCtx = null;
let audioUnlocked = false;

function getBgmAudio() {
  if (bgmAudio) {
    return bgmAudio;
  }

  const existingGlobalAudio = window[BGM_WINDOW_KEY];
  if (existingGlobalAudio instanceof Audio) {
    bgmAudio = existingGlobalAudio;
    if (!bgmAudio.src.includes("assets/background-theme-v2.wav")) {
      bgmAudio.pause();
      bgmAudio.currentTime = 0;
      bgmAudio.src = BGM_FILE_PATH;
      bgmAudio.load();
    }
    bgmAudio.loop = true;
    bgmAudio.volume = 0.22;
    bgmAudio.playbackRate = BGM_PLAYBACK_RATE;
    return bgmAudio;
  }

  const audio = new Audio(BGM_FILE_PATH);
  audio.loop = true;
  audio.volume = 0.22;
  audio.playbackRate = BGM_PLAYBACK_RATE;
  audio.preload = "auto";
  window[BGM_WINDOW_KEY] = audio;
  bgmAudio = audio;
  return bgmAudio;
}

function startBackgroundMusic() {
  ensureAudioUnlocked();

  const audio = getBgmAudio();
  if (!audio || !audio.paused || bgmStartPromise) {
    return;
  }

  bgmStartPromise = audio
    .play()
    .catch(() => {
      // Keep gameplay running even if browser blocks autoplay.
    })
    .finally(() => {
      bgmStartPromise = null;
    });
}

function stopBackgroundMusic() {
  bgmStartPromise = null;
  if (!bgmAudio) {
    return;
  }

  bgmAudio.pause();
  bgmAudio.currentTime = 0;
}

function getAudioContext() {
  if (audioCtx) {
    return audioCtx;
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    return null;
  }

  audioCtx = new AudioContextClass();
  return audioCtx;
}

function ensureAudioUnlocked() {
  const context = getAudioContext();
  if (!context || audioUnlocked) {
    return;
  }

  if (context.state === "running") {
    audioUnlocked = true;
    return;
  }

  context
    .resume()
    .then(() => {
      audioUnlocked = true;
    })
    .catch(() => {
      // Ignore resume failures and keep gameplay uninterrupted.
    });
}

function playJumpSound() {
  const context = getAudioContext();
  if (!context) {
    return;
  }

  const triggerJumpSound = () => {
    const now = context.currentTime;
    const endTime = now + JUMP_SOUND_DURATION;

    const leadOsc = context.createOscillator();
    leadOsc.type = "square";
    leadOsc.frequency.setValueAtTime(880, now);
    leadOsc.frequency.exponentialRampToValueAtTime(300, endTime);

    const bodyOsc = context.createOscillator();
    bodyOsc.type = "triangle";
    bodyOsc.frequency.setValueAtTime(440, now);
    bodyOsc.frequency.exponentialRampToValueAtTime(180, endTime);

    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.28, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, endTime);

    leadOsc.connect(gain);
    bodyOsc.connect(gain);
    gain.connect(context.destination);

    leadOsc.start(now);
    bodyOsc.start(now);
    leadOsc.stop(endTime);
    bodyOsc.stop(endTime);
  };

  runWhenAudioReady(context, triggerJumpSound);
}

function playPowerUpSound() {
  const context = getAudioContext();
  if (!context) {
    return;
  }

  const triggerPowerUpSound = () => {
    const now = context.currentTime;
    // do - da - dee: medium note, lower note, short high note.
    const notes = [1046.5, 783.99, 1567.98];
    const durations = [0.13, 0.13, 0.2];

    for (let i = 0; i < notes.length; i++) {
      const previousDurations = durations.slice(0, i).reduce((sum, d) => sum + d, 0);
      const startTime = now + previousDurations + i * POWER_UP_NOTE_GAP;
      const endTime = startTime + durations[i];

      const leadOsc = context.createOscillator();
      leadOsc.type = "sawtooth";
      leadOsc.frequency.setValueAtTime(notes[i], startTime);
      leadOsc.frequency.exponentialRampToValueAtTime(notes[i] * 0.96, endTime);

      const bodyOsc = context.createOscillator();
      bodyOsc.type = "square";
      bodyOsc.frequency.setValueAtTime(notes[i] * 0.75, startTime);

      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(0.4, startTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, endTime);

      leadOsc.connect(gain);
      bodyOsc.connect(gain);
      gain.connect(context.destination);

      leadOsc.start(startTime);
      bodyOsc.start(startTime);
      leadOsc.stop(endTime);
      bodyOsc.stop(endTime);
    }
  };

  runWhenAudioReady(context, triggerPowerUpSound);
}

function playHitSound() {
  ensureAudioUnlocked();
  const context = getAudioContext();
  if (!context) {
    return;
  }

  const triggerHitSound = () => {
    const now = context.currentTime;
    const endTime = now + HIT_SOUND_DURATION;

    // Part 1: punchy collision impact.
    const impactOsc = context.createOscillator();
    impactOsc.type = "square";
    impactOsc.frequency.setValueAtTime(760, now);
    impactOsc.frequency.exponentialRampToValueAtTime(140, now + 0.08);

    const impactGain = context.createGain();
    impactGain.gain.setValueAtTime(0.0001, now);
    impactGain.gain.exponentialRampToValueAtTime(0.55, now + 0.006);
    impactGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.085);

    impactOsc.connect(impactGain);
    impactGain.connect(context.destination);

    // Part 2: quick chirp tail like an arcade fail cue.
    const tailStart = now + 0.09;
    const tailEnd = endTime;

    const tailOsc = context.createOscillator();
    tailOsc.type = "triangle";
    tailOsc.frequency.setValueAtTime(410, tailStart);
    tailOsc.frequency.exponentialRampToValueAtTime(220, tailEnd);

    const tailGain = context.createGain();
    tailGain.gain.setValueAtTime(0.0001, tailStart);
    tailGain.gain.exponentialRampToValueAtTime(0.35, tailStart + 0.012);
    tailGain.gain.exponentialRampToValueAtTime(0.0001, tailEnd);

    tailOsc.connect(tailGain);
    tailGain.connect(context.destination);

    impactOsc.start(now);
    impactOsc.stop(now + 0.09);

    tailOsc.start(tailStart);
    tailOsc.stop(tailEnd);
  };

  runWhenAudioReady(context, triggerHitSound);
}

function updateBackgroundMusic(dt) {
  startBackgroundMusic();
}

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
  permanentInvincibility: false,
  specialSpeedMultiplier: 1,
  gameOver: false,
  win: false,
  started: false,
  lastTime: 0,
  rockSpawnTimer: 0,
  nextRockSpawn: 1,
  birdSpawnTimer: 0,
  nextBirdSpawn: 3,
  jumpBufferTimer: 0,
  nextPowerUpDistance: randomRange(0, POWER_UP_RANDOM_OFFSET_MAX),
  specialRockSpawned: false,
  specialRockCollected: false,
  specialRockSpawnDistance: SPECIAL_ROCK_USE_TEST_SPAWN
    ? SPECIAL_ROCK_TEST_SPAWN_DISTANCE
    : randomRange(SPECIAL_ROCK_MIN_DISTANCE, SPECIAL_ROCK_MAX_DISTANCE)
};

function resetGame() {
  stopBackgroundMusic();
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
  state.permanentInvincibility = false;
  state.specialSpeedMultiplier = 1;
  state.gameOver = false;
  state.win = false;
  state.started = false;
  state.lastTime = 0;
  state.rockSpawnTimer = 0;
  state.nextRockSpawn = randomRange(0.75, 1.35);
  state.birdSpawnTimer = 0;
  state.nextBirdSpawn = randomRange(4, 7);
  state.jumpBufferTimer = 0;
  state.nextPowerUpDistance = randomRange(0, POWER_UP_RANDOM_OFFSET_MAX);
  state.specialRockSpawned = false;
  state.specialRockCollected = false;
  state.specialRockSpawnDistance = SPECIAL_ROCK_USE_TEST_SPAWN
    ? SPECIAL_ROCK_TEST_SPAWN_DISTANCE
    : randomRange(SPECIAL_ROCK_MIN_DISTANCE, SPECIAL_ROCK_MAX_DISTANCE);

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
    ensureAudioUnlocked();
    startBackgroundMusic();
  }
  if (state.rabbit.grounded) {
    const jumpVelocity =
      state.invincibilityTimer > 0
        ? JUMP_VELOCITY * INVINCIBILITY_JUMP_MULTIPLIER
        : JUMP_VELOCITY;
    state.rabbit.vy = jumpVelocity;
    state.rabbit.grounded = false;
    state.jumpBufferTimer = 0;
    playJumpSound();
  }
}

function queueJump() {
  ensureAudioUnlocked();
  startBackgroundMusic();
  state.jumpBufferTimer = JUMP_BUFFER_SECONDS;
  jump();
}

function spawnRock() {
  const heights = [20, 28, 34, 42];
  const h = heights[Math.floor(Math.random() * heights.length)];
  const levelProgress = Math.min(state.distance / 7000, 1);
  const hardModeProgress = Math.min(Math.max((state.distance - 300) / 6700, 0), 1);
  const earlySpacingBonus = state.distance < 300 ? (1 - state.distance / 300) * 80 : 0;
  const widthScale = 0.94 - levelProgress * 0.06;
  const widthByHeight = {
    20: randomRange(54, 74) * widthScale,
    28: randomRange(60, 82) * widthScale,
    34: randomRange(68, 92) * widthScale,
    42: randomRange(76, 104) * widthScale
  };
  const w = widthByHeight[h] ?? randomRange(56, 84) * widthScale;
  const spawnOffsetMax = 160 + earlySpacingBonus - hardModeProgress * 30;

  // Keep rocks from spawning directly on top of golden carrots.
  for (let attempt = 0; attempt < 8; attempt++) {
    const rock = {
      x: canvas.width + randomRange(0, spawnOffsetMax),
      y: GROUND_Y - h,
      w,
      h
    };

    let overlapsPowerUp = false;
    for (const powerUp of state.powerUps) {
      if (intersects(rock, powerUp)) {
        overlapsPowerUp = true;
        break;
      }
    }

    if (!overlapsPowerUp) {
      state.rocks.push(rock);
      return;
    }
  }
}

function spawnSpecialRock() {
  const h = 20;
  const w = 58;
  const x = canvas.width - 120;

  const specialRock = {
    x,
    y: GROUND_Y - h,
    w,
    h,
    special: true
  };

  // Keep nearby terrain clear so the test spawn is easy to spot.
  state.rocks = state.rocks.filter(
    (rock) => rock.special || rock.x + rock.w < x - 70 || rock.x > x + w + 70
  );

  state.rocks.push(specialRock);
  state.specialRockSpawned = true;
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
  const powerUpY = GROUND_Y - 22;

  // Try several x positions to keep power-ups on clear ground.
  for (let attempt = 0; attempt < 8; attempt++) {
    const powerUp = {
      x: canvas.width + randomRange(0, 120),
      y: powerUpY,
      w: 22,
      h: 22
    };

    let overlapsRock = false;
    for (const rock of state.rocks) {
      if (intersects(powerUp, rock)) {
        overlapsRock = true;
        break;
      }
    }

    if (!overlapsRock) {
      state.powerUps.push(powerUp);
      return;
    }
  }
}

function scheduleNextPowerUpDistance() {
  const rarityMultiplier = 1 + state.distance / POWER_UP_RARITY_DISTANCE_SCALE;
  const interval = POWER_UP_INTERVAL_METERS * rarityMultiplier;
  const randomOffset = POWER_UP_RANDOM_OFFSET_MAX * rarityMultiplier;
  state.nextPowerUpDistance += interval + randomRange(0, randomOffset);
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
    const rowX = rock.x + leftInset * px;
    const rowY = rock.y + row * px;
    const maxRowWidth = Math.max(0, rock.w - leftInset * px);
    const maxRowHeight = Math.max(0, rock.h - row * px);
    const clampedRowWidth = Math.min(rowWidth * px, maxRowWidth);
    const clampedRowHeight = Math.min(px, maxRowHeight);

    if (clampedRowWidth <= 0 || clampedRowHeight <= 0) {
      continue;
    }

    rowBounds.push({
      x: rowX,
      y: rowY,
      w: clampedRowWidth,
      h: clampedRowHeight
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
    stopBackgroundMusic();
    return;
  }

  updateBackgroundMusic(dt);

  if (state.jumpBufferTimer > 0) {
    state.jumpBufferTimer = Math.max(0, state.jumpBufferTimer - dt);
  }

  if (state.permanentInvincibility) {
    messageEl.textContent = ROCK_POWER_MESSAGE;
  } else if (state.invincibilityTimer > 0) {
    state.invincibilityTimer = Math.max(0, state.invincibilityTimer - dt);
    messageEl.textContent = `Power up! Invincible - ${Math.ceil(state.invincibilityTimer)}s left`;
  }

  state.elapsedTime += dt;
  state.speedMultiplier = Math.min(1 + state.distance / 1800, MAX_SPEED / BASE_SPEED);
  
  if (state.invincibilityTimer > 0) {
    state.speedMultiplier *= INVINCIBILITY_SPEED_MULTIPLIER;
  }
  
  state.worldSpeed = BASE_SPEED * state.speedMultiplier * state.specialSpeedMultiplier;

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
    const inSpecialRockWindow =
      !state.specialRockCollected &&
      state.distance >= state.specialRockSpawnDistance - SPECIAL_ROCK_CLEAR_WINDOW_BEFORE &&
      state.distance <= state.specialRockSpawnDistance + SPECIAL_ROCK_CLEAR_WINDOW_AFTER;

    if (inSpecialRockWindow) {
      state.nextRockSpawn = randomRange(0.95, 1.45);
    } else {
    const easyStartProgress = Math.min(state.distance / 300, 1);
    const hardModeProgress = Math.min(Math.max((state.distance - 300) / 6700, 0), 1);
    const levelProgress = Math.min(state.distance / CARROT_GOAL, 1);
    const earlySpacingScale = 1.25 - easyStartProgress * 0.25;
    const harderSpacingScale = 1 - hardModeProgress * 0.34;
    const lateGameDensityScale = 1 - levelProgress * 0.38;
    state.nextRockSpawn =
      randomRange(0.74, 1.45) * earlySpacingScale * harderSpacingScale * lateGameDensityScale;
    spawnRock();

    // Spawn extra rocks more often later in the run to ramp challenge.
    const bonusRockChance = Math.max(0, (state.distance - 2600) / 7400) * 0.52;
    if (Math.random() < bonusRockChance) {
      spawnRock();
      if (Math.random() < bonusRockChance * 0.35) {
        spawnRock();
      }
    }
    }
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

  while (state.distance >= state.nextPowerUpDistance) {
    spawnPowerUp();
    scheduleNextPowerUpDistance();
  }

  if (!state.specialRockSpawned && state.distance >= state.specialRockSpawnDistance) {
    spawnSpecialRock();
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
      playPowerUpSound();
      if (state.permanentInvincibility) {
        state.invincibilityTimer = 0;
        messageEl.textContent = ROCK_POWER_MESSAGE;
      } else {
        state.invincibilityTimer = INVINCIBILITY_DURATION;
        messageEl.textContent = `Power up! Invincible - ${Math.ceil(state.invincibilityTimer)}s left`;
      }
      state.powerUps = state.powerUps.filter((pu) => pu !== powerUp);
    }
  }

  for (let i = 0; i < state.rocks.length; i++) {
    const rock = state.rocks[i];
    if (!rock.special) {
      continue;
    }

    if (intersectsRock(rabbitHitbox, rock)) {
      state.permanentInvincibility = true;
      state.specialSpeedMultiplier = 5;
      state.invincibilityTimer = 0;
      state.specialRockCollected = true;
      state.rocks.splice(i, 1);
      playPowerUpSound();
      messageEl.textContent = ROCK_POWER_MESSAGE;
      break;
    }
  }

  if (state.invincibilityTimer <= 0 && !state.permanentInvincibility) {
    for (const rock of state.rocks) {
      if (intersectsRock(rabbitHitbox, rock)) {
        playHitSound();
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
        playHitSound();
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
  const mountainTile = 520;
  let mountainX = -mountainTile - ((mountainShift * 0.55) % mountainTile);
  while (mountainX < canvas.width + mountainTile) {
    drawMountain(mountainX + 30, 296, 240, "#a8c6dc", "#f4fbff");
    drawMountain(mountainX + 250, 300, 270, "#9bbcd5", "#eaf7ff");
    mountainX += mountainTile;
  }

  const farHillTile = 520;
  let farHillX = -farHillTile - (mountainShift % farHillTile);
  while (farHillX < canvas.width + farHillTile) {
    drawSnowHill(farHillX, 320, 560, 112, "#dcecf9", "#f3faff");
    farHillX += farHillTile;
  }

  const nearHillTile = 460;
  let nearHillX = -nearHillTile - ((mountainShift * 1.35) % nearHillTile);
  while (nearHillX < canvas.width + nearHillTile) {
    drawSnowHill(nearHillX, 336, 500, 82, "#cfe3f3", "#e9f5ff");
    nearHillX += nearHillTile;
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

function drawSnowHill(x, baseY, width, height, hillColor, snowColor) {
  const peakX = x + width * 0.52;

  ctx.fillStyle = hillColor;
  ctx.beginPath();
  ctx.moveTo(x, baseY);
  ctx.quadraticCurveTo(x + width * 0.22, baseY - height * 0.85, peakX, baseY - height);
  ctx.quadraticCurveTo(x + width * 0.8, baseY - height * 0.78, x + width, baseY);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = snowColor;
  ctx.beginPath();
  ctx.moveTo(x + width * 0.16, baseY - height * 0.52);
  ctx.quadraticCurveTo(x + width * 0.3, baseY - height * 0.9, peakX, baseY - height);
  ctx.quadraticCurveTo(x + width * 0.66, baseY - height * 0.86, x + width * 0.84, baseY - height * 0.46);
  ctx.lineTo(x + width * 0.68, baseY - height * 0.3);
  ctx.quadraticCurveTo(peakX, baseY - height * 0.65, x + width * 0.28, baseY - height * 0.28);
  ctx.closePath();
  ctx.fill();
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

  const goldCycleColors = ["#ffd700", "#ffed4e", "#ffa500", "#ff8c00", "#ff7f00", "#ffb347"];
  let bodyColor = "#f3f3f5";
  let innerColor = "#f6b8cf";

  if (state.invincibilityTimer > 0) {
    let cycleSpeed = 100;
    
    // Flicker faster in the last 3 seconds
    if (state.invincibilityTimer <= 3) {
      cycleSpeed = 100 * (state.invincibilityTimer / 3);
    }
    
    const colorIndex = Math.floor((performance.now() / cycleSpeed) % goldCycleColors.length);
    bodyColor = goldCycleColors[colorIndex];
    innerColor = goldCycleColors[(colorIndex + 2) % goldCycleColors.length];
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
  const rowBounds = getRockCollisionShape(rock);

  for (const row of rowBounds) {
    drawPixelRect(row.x, row.y, row.w, row.h, "#777d86");
  }

  drawPixelRect(rock.x + 8, rock.y + 4, Math.max(8, rock.w * 0.38), 3, "#a4acb8");
  drawPixelRect(rock.x + rock.w * 0.42, rock.y + Math.max(8, rock.h * 0.26), Math.max(6, rock.w * 0.16), 2, "#8d95a0");
  drawPixelRect(rock.x + 10, rock.y + Math.max(10, rock.h * 0.42), 4, 2, "#626a74");
  drawPixelRect(rock.x + rock.w - 16, rock.y + Math.max(14, rock.h * 0.52), 4, 6, "#626a74");
  drawPixelRect(rock.x + 6, rock.y + rock.h - 6, Math.max(7, rock.w * 0.26), 2, "#5a626d");

  if (rock.special) {
    const starX = rock.x + rock.w * 0.5 - 4;
    const starY = rock.y + 3;
    drawPixelRect(starX + 3, starY, 2, 1, "#f2f5fa");
    drawPixelRect(starX + 2, starY + 1, 4, 1, "#dfe4ec");
    drawPixelRect(starX, starY + 2, 8, 1, "#cdd3dc");
    drawPixelRect(starX + 1, starY + 3, 6, 1, "#dfe4ec");
    drawPixelRect(starX + 2, starY + 4, 4, 1, "#edf1f7");
    drawPixelRect(starX + 3, starY + 5, 2, 1, "#f2f5fa");
  }
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
  const remainingDistance = CARROT_GOAL - state.distance;
  let x = state.rabbit.x + remainingDistance * DISTANCE_TO_PIXEL_SCALE;

  // Keep the finish carrot on-screen once the player reaches it.
  if (state.win) {
    x = Math.min(canvas.width - 240, Math.max(120, x));
  }

  if (x < -220 || x > canvas.width + 220) {
    return;
  }

  const scale = 3.1;
  const y = GROUND_Y - 52 * scale;

  drawPixelRect(x + 10 * scale, y, 16 * scale, 10 * scale, "#55a55e");
  drawPixelRect(x + 4 * scale, y + 8 * scale, 12 * scale, 8 * scale, "#63b96f");
  drawPixelRect(x + 20 * scale, y + 8 * scale, 12 * scale, 8 * scale, "#63b96f");

  drawPixelRect(x + 10 * scale, y + 14 * scale, 16 * scale, 36 * scale, "#f28a1f");
  drawPixelRect(x + 13 * scale, y + 22 * scale, 10 * scale, 4 * scale, "#ffb05b");
  drawPixelRect(x + 12 * scale, y + 30 * scale, 12 * scale, 4 * scale, "#ffb05b");
  drawPixelRect(x + 14 * scale, y + 38 * scale, 8 * scale, 4 * scale, "#ffb05b");
}

function drawPowerUp(powerUp) {
  const x = powerUp.x;
  const y = powerUp.y;
  const pulse = Math.sin(performance.now() / 150) * 0.5;
  const offsetY = pulse * 2;
  
  // Golden carrot leaves (green)
  drawPixelRect(x + 7, y + offsetY, 8, 4, "#55a55e");
  drawPixelRect(x + 5, y + 2 + offsetY, 4, 4, "#63b96f");
  drawPixelRect(x + 13, y + 2 + offsetY, 4, 4, "#63b96f");
  
  // Golden carrot body
  drawPixelRect(x + 8, y + 6 + offsetY, 6, 10, "#ffd700");
  drawPixelRect(x + 9, y + 10 + offsetY, 4, 2, "#ffed4e");
}

function drawHud() {
  distanceEl.textContent = Math.floor(state.distance).toString();
  speedEl.textContent = (state.speedMultiplier * state.specialSpeedMultiplier).toFixed(1);
  timeEl.textContent = state.elapsedTime.toFixed(2);
  bestTimeEl.textContent = state.bestTime.toFixed(2);
}

function draw() {
  drawBackground();

  for (const rock of state.rocks) {
    drawRock(rock);
  }

  for (const bird of state.birds) {
    drawBird(bird);
  }

  for (const powerUp of state.powerUps) {
    drawPowerUp(powerUp);
  }

  // Draw finish marker above obstacles so it stays visible.
  drawCarrot();

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
    ensureAudioUnlocked();
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
