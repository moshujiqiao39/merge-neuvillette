const TIERS = [
  { name: "夏洛蒂", short: "夏洛", src: "assets/charlotte.jpg", radius: 19, score: 2, color: "#f2b6c6" },
  { name: "夏沃蕾", short: "夏沃", src: "assets/chevreuse.jpg", radius: 22, score: 4, color: "#d45d5d" },
  { name: "艾梅莉埃", short: "艾梅", src: "assets/emilie.jpg", radius: 26, score: 8, color: "#8fbf86" },
  { name: "希格雯", short: "希格", src: "assets/sigewinne.jpg", radius: 30, score: 16, color: "#7fd0e2" },
  { name: "爱可菲", short: "爱可", src: "assets/escoffier.jpg", radius: 35, score: 24, color: "#d5e6f6" },
  { name: "娜维娅", short: "娜维", src: "assets/navia.jpg", radius: 41, score: 36, color: "#e2b043" },
  { name: "克洛琳德", short: "克洛", src: "assets/clorinde.jpg", radius: 48, score: 50, color: "#7a68d8" },
  { name: "莱欧斯利", short: "莱欧", src: "assets/wriothesley.jpg", radius: 56, score: 68, color: "#5d7388" },
  { name: "芙宁娜", short: "芙宁", src: "assets/furina.jpg", radius: 66, score: 90, color: "#4c95ff" },
  { name: "那维莱特", short: "那维", src: "assets/neuvillette.jpg", radius: 77, score: 128, color: "#9fd0ff" },
];

const W = 420;
const H = 700;
const LEFT = 20;
const RIGHT = 400;
const BOTTOM = 676;
const DEAD_Y = 168;
const SPAWN_Y = 86;
const STEP = 1 / 120;
const BEST_KEY = "merge-neuvillette-best";
const SOUND_KEY = "merge-neuvillette-sound";

const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const nextFace = document.getElementById("next-face");
const startMask = document.getElementById("start");
const overMask = document.getElementById("over");
const overTitle = document.getElementById("over-title");
const overScore = document.getElementById("over-score");
const overDetail = document.getElementById("over-detail");
const soundBtn = document.getElementById("sound-btn");
const restartBtn = document.getElementById("restart-btn");
const chainEl = document.getElementById("chain");
const chainWrap = document.getElementById("chain-wrap");

const images = TIERS.map((tier) => {
  const img = new Image();
  img.src = tier.src;
  return img;
});

let fruits = [];
let particles = [];
let floaters = [];
let seq = 1;
let mode = "start";
let score = 0;
let best = loadNumber(BEST_KEY);
let maxTier = -1;
let currentTier = 0;
let nextTier = 0;
let aimX = W / 2;
let cooldown = 0;
let acc = 0;
let last = performance.now();
let flash = 0;
let shake = 0;
let restartArm = 0;
let audioOn = localStorageGet(SOUND_KEY) !== "0";
let audioCtx = null;
let pointerActive = false;
const held = new Set();

bestEl.textContent = String(best);
buildChain();
if (window.matchMedia("(min-width: 960px)").matches) chainWrap.open = true;
updateSoundLabel();
prepareRound(false);

document.getElementById("start-btn").addEventListener("click", () => {
  unlockAudio();
  startGame();
});
document.getElementById("again-btn").addEventListener("click", () => {
  unlockAudio();
  startGame();
});
restartBtn.addEventListener("click", () => {
  if (mode !== "play") {
    startGame();
    return;
  }
  if (restartArm <= 0) {
    restartArm = 2;
    restartBtn.textContent = "再点一次确认";
    return;
  }
  startGame();
});
soundBtn.addEventListener("click", () => {
  audioOn = !audioOn;
  localStorageSet(SOUND_KEY, audioOn ? "1" : "0");
  updateSoundLabel();
  if (audioOn) unlockAudio();
});

canvas.addEventListener("pointerdown", (event) => {
  pointerActive = true;
  setAim(event);
  canvas.setPointerCapture?.(event.pointerId);
});
canvas.addEventListener("pointermove", (event) => {
  if (event.pointerType === "mouse" || pointerActive) setAim(event);
});
canvas.addEventListener("pointerup", (event) => {
  if (!pointerActive) return;
  pointerActive = false;
  setAim(event);
  tryDrop();
});
canvas.addEventListener("pointercancel", () => {
  pointerActive = false;
});
canvas.addEventListener("contextmenu", (event) => event.preventDefault());

window.addEventListener("keydown", (event) => {
  if ([" ", "Enter", "ArrowLeft", "ArrowRight"].includes(event.key)) event.preventDefault();
  held.add(event.key);
  if (event.repeat) return;
  if (event.key === " " || event.key === "Enter") {
    if (mode === "start" || mode === "over") startGame();
    else tryDrop();
  }
  if (event.key === "m" || event.key === "M") soundBtn.click();
});
window.addEventListener("keyup", (event) => held.delete(event.key));
window.addEventListener("blur", () => held.clear());

requestAnimationFrame(frame);

function startGame() {
  mode = "play";
  startMask.classList.add("hidden");
  overMask.classList.add("hidden");
  prepareRound(true);
  restartArm = 0;
  restartBtn.textContent = "重新开始";
}

function prepareRound(playing) {
  fruits = [];
  particles = [];
  floaters = [];
  score = 0;
  maxTier = -1;
  currentTier = rollTier();
  nextTier = rollTier();
  aimX = W / 2;
  cooldown = 0;
  flash = 0;
  shake = 0;
  if (playing) updateHud();
  else {
    scoreEl.textContent = "0";
    syncNext();
    markChain();
  }
}

function tryDrop() {
  if (mode !== "play" || cooldown > 0) return;
  const radius = TIERS[currentTier].radius;
  const x = clamp(aimX, LEFT + radius, RIGHT - radius);
  const fruit = makeFruit(x, SPAWN_Y, currentTier, true);
  fruit.vy = 20;
  fruits.push(fruit);
  tone(180 + currentTier * 18, 0.06, "triangle", 0.04);
  currentTier = nextTier;
  nextTier = rollTier();
  cooldown = 0.45;
  updateHud();
}

function makeFruit(x, y, tier, fullSize) {
  return {
    id: seq++,
    x,
    y,
    vx: 0,
    vy: 0,
    tier,
    r: TIERS[tier].radius,
    age: 0,
    alive: true,
    overTimer: 0,
    pop: fullSize ? 1 : 0,
  };
}

function rollTier() {
  const weights = [30, 25, 20, 15, 10];
  let ticket = Math.random() * weights.reduce((sum, weight) => sum + weight, 0);
  for (let i = 0; i < weights.length; i += 1) {
    ticket -= weights[i];
    if (ticket <= 0) return i;
  }
  return 0;
}

function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  if (mode === "play") {
    cooldown = Math.max(0, cooldown - dt);
    const speed = 460;
    if (held.has("ArrowLeft") || held.has("a") || held.has("A")) aimX -= speed * dt;
    if (held.has("ArrowRight") || held.has("d") || held.has("D")) aimX += speed * dt;
    clampAim();
    acc += dt;
    while (acc >= STEP && mode === "play") {
      physics(STEP);
      acc -= STEP;
    }
    if (restartArm > 0) {
      restartArm -= dt;
      if (restartArm <= 0) restartBtn.textContent = "重新开始";
    }
  }
  for (const fruit of fruits) {
    if (fruit.pop < 1) fruit.pop = Math.min(1, fruit.pop + dt / 0.16);
  }
  particles.forEach((particle) => {
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += 500 * dt;
  });
  particles = particles.filter((particle) => particle.life > 0);
  floaters.forEach((floater) => {
    floater.life -= dt;
    floater.y -= 28 * dt;
  });
  floaters = floaters.filter((floater) => floater.life > 0);
  flash = Math.max(0, flash - dt * 1.4);
  shake = Math.max(0, shake - dt * 18);
  draw();
  requestAnimationFrame(frame);
}

function physics(dt) {
  for (const fruit of fruits) {
    if (!fruit.alive) continue;
    fruit.vy += 2200 * dt;
    fruit.vx *= Math.exp(-0.3 * dt);
    fruit.x += fruit.vx * dt;
    fruit.y += fruit.vy * dt;
    fruit.age += dt;
    const speed = Math.hypot(fruit.vx, fruit.vy);
    if (speed > 1500) {
      fruit.vx = (fruit.vx / speed) * 1500;
      fruit.vy = (fruit.vy / speed) * 1500;
    }
  }
  for (let pass = 0; pass < 7; pass += 1) {
    for (const fruit of fruits) if (fruit.alive) resolveWalls(fruit);
    for (let i = 0; i < fruits.length; i += 1) {
      const a = fruits[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < fruits.length; j += 1) {
        const b = fruits[j];
        if (!b.alive) continue;
        resolvePair(a, b);
      }
    }
  }
  mergeContacts();
  fruits = fruits.filter((fruit) => fruit.alive);
  checkDanger(dt);
}

function resolveWalls(fruit) {
  if (fruit.x - fruit.r < LEFT) {
    fruit.x = LEFT + fruit.r;
    if (fruit.vx < 0) fruit.vx *= -0.12;
    fruit.vy *= 0.94;
  } else if (fruit.x + fruit.r > RIGHT) {
    fruit.x = RIGHT - fruit.r;
    if (fruit.vx > 0) fruit.vx *= -0.12;
    fruit.vy *= 0.94;
  }
  if (fruit.y + fruit.r > BOTTOM) {
    fruit.y = BOTTOM - fruit.r;
    if (fruit.vy > 0) fruit.vy *= -0.08;
    fruit.vx *= 0.84;
  }
  if (fruit.y - fruit.r < 4) {
    fruit.y = fruit.r + 4;
    if (fruit.vy < 0) fruit.vy = 0;
  }
}

function resolvePair(a, b) {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  let dist = Math.hypot(dx, dy);
  const minDist = a.r + b.r;
  if (dist === 0) {
    dx = 0.01;
    dy = 0;
    dist = 0.01;
  }
  if (dist >= minDist) return;
  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = minDist - dist;
  const m1 = a.r * a.r;
  const m2 = b.r * b.r;
  const inv1 = 1 / m1;
  const inv2 = 1 / m2;
  const inv = inv1 + inv2;
  const slop = 0.4;
  if (overlap > slop) {
    const push = overlap - slop;
    a.x -= nx * push * (m2 / (m1 + m2));
    a.y -= ny * push * (m2 / (m1 + m2));
    b.x += nx * push * (m1 / (m1 + m2));
    b.y += ny * push * (m1 / (m1 + m2));
  }
  const rvx = b.vx - a.vx;
  const rvy = b.vy - a.vy;
  const velN = rvx * nx + rvy * ny;
  if (velN >= 0) return;
  const impulse = (-(1 + 0.06) * velN) / inv;
  a.vx -= impulse * nx * inv1;
  a.vy -= impulse * ny * inv1;
  b.vx += impulse * nx * inv2;
  b.vy += impulse * ny * inv2;
  const tx = -ny;
  const ty = nx;
  const velT = rvx * tx + rvy * ty;
  let friction = -velT / inv;
  const maxFriction = 0.55 * impulse;
  friction = clamp(friction, -maxFriction, maxFriction);
  a.vx -= friction * tx * inv1;
  a.vy -= friction * ty * inv1;
  b.vx += friction * tx * inv2;
  b.vy += friction * ty * inv2;
}

function mergeContacts() {
  const hits = [];
  for (let i = 0; i < fruits.length; i += 1) {
    const a = fruits[i];
    if (!a.alive || a.tier >= TIERS.length - 1 || a.age < 0.08) continue;
    for (let j = i + 1; j < fruits.length; j += 1) {
      const b = fruits[j];
      if (!b.alive || b.tier !== a.tier || b.age < 0.08) continue;
      const dist = Math.hypot(b.x - a.x, b.y - a.y) || 0.0001;
      const minDist = a.r + b.r;
      if (dist <= minDist + 1.3) hits.push({ a, b, overlap: minDist - dist });
    }
  }
  hits.sort((p, q) => q.overlap - p.overlap);
  const used = new Set();
  for (const hit of hits) {
    if (used.has(hit.a.id) || used.has(hit.b.id)) continue;
    used.add(hit.a.id);
    used.add(hit.b.id);
    combine(hit.a, hit.b);
  }
}

function combine(a, b) {
  a.alive = false;
  b.alive = false;
  const tier = a.tier + 1;
  const child = makeFruit((a.x + b.x) / 2, (a.y + b.y) / 2, tier, false);
  child.x = clamp(child.x, LEFT + child.r, RIGHT - child.r);
  child.y = clamp(child.y, child.r + 4, BOTTOM - child.r);
  child.vx = (a.vx + b.vx) * 0.25;
  child.vy = Math.min(a.vy, b.vy, 0) * 0.2 - 70;
  fruits.push(child);
  score += TIERS[tier].score;
  maxTier = Math.max(maxTier, tier);
  if (score > best) {
    best = score;
    localStorageSet(BEST_KEY, String(best));
  }
  burst(child.x, child.y, TIERS[tier].color, tier === TIERS.length - 1 ? 28 : 14);
  floaters.push({
    x: child.x,
    y: child.y - child.r,
    text: `+${TIERS[tier].score}`,
    life: 0.8,
    max: 0.8,
  });
  if (tier === TIERS.length - 1) {
    flash = 1;
    shake = 8;
    chord();
  } else {
    tone(280 + tier * 42, 0.09, "sine", 0.05);
    if (tier >= 6) shake = 3 + tier * 0.4;
  }
  updateHud();
}

function checkDanger(dt) {
  for (const fruit of fruits) {
    if (!fruit.alive) continue;
    const above = fruit.y - fruit.r < DEAD_Y;
    const settled = Math.abs(fruit.vy) < 48 && Math.abs(fruit.vx) < 48;
    if (above && settled && fruit.age > 0.75) fruit.overTimer += dt;
    else fruit.overTimer = Math.max(0, fruit.overTimer - dt * 0.6);
    if (fruit.overTimer > 1.15) {
      endGame();
      return;
    }
  }
}

function endGame() {
  mode = "over";
  const record = score >= best && score > 0;
  overTitle.textContent = maxTier === TIERS.length - 1 ? "合成到最大了" : "审判结束";
  overScore.textContent = String(score);
  overDetail.textContent = record ? "新的最高纪录。" : "";
  overMask.classList.remove("hidden");
  tone(140, 0.22, "sawtooth", 0.03);
}

function draw() {
  fitCanvas();
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#16344d");
  bg.addColorStop(1, "#09131d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "rgba(4, 12, 22, 0.45)";
  roundRect(12, DEAD_Y - 8, W - 24, H - DEAD_Y - 6, 26);
  ctx.fill();

  const danger = fruits.reduce((max, fruit) => Math.max(max, fruit.overTimer / 1.15), 0);
  ctx.save();
  ctx.beginPath();
  ctx.rect(LEFT, 0, RIGHT - LEFT, BOTTOM);
  ctx.clip();
  for (const fruit of fruits) drawShadow(fruit);
  for (const fruit of fruits) drawFruit(fruit, 1);
  for (const particle of particles) {
    ctx.globalAlpha = Math.max(0, particle.life / particle.max);
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  ctx.strokeStyle = "rgba(230, 210, 162, 0.9)";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(12, DEAD_Y - 8);
  ctx.lineTo(12, H - 28);
  ctx.quadraticCurveTo(12, H - 12, 28, H - 12);
  ctx.lineTo(W - 28, H - 12);
  ctx.quadraticCurveTo(W - 12, H - 12, W - 12, H - 28);
  ctx.lineTo(W - 12, DEAD_Y - 8);
  ctx.stroke();

  ctx.setLineDash([8, 8]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = danger > 0 ? `rgba(255, 110, 110, ${0.55 + Math.sin(performance.now() / 120) * 0.35})` : "rgba(255, 214, 214, 0.8)";
  ctx.beginPath();
  ctx.moveTo(LEFT + 6, DEAD_Y);
  ctx.lineTo(RIGHT - 6, DEAD_Y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = danger > 0 ? "#ffd0d0" : "rgba(255, 236, 236, 0.85)";
  ctx.font = "12px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("警戒线", LEFT + 8, DEAD_Y - 12);

  if (danger > 0) {
    ctx.fillStyle = `rgba(180, 30, 40, ${danger * 0.22})`;
    ctx.fillRect(0, 0, W, H);
  }

  if (mode === "play") drawPreview();

  ctx.textAlign = "center";
  ctx.font = "bold 16px sans-serif";
  for (const floater of floaters) {
    ctx.globalAlpha = Math.max(0, floater.life / floater.max);
    ctx.fillStyle = "#fff6df";
    ctx.fillText(floater.text, floater.x, floater.y);
  }
  ctx.globalAlpha = 1;

  if (flash > 0) {
    ctx.fillStyle = `rgba(230, 210, 162, ${flash * 0.33})`;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

function drawPreview() {
  const tier = TIERS[currentTier];
  const x = clamp(aimX, LEFT + tier.radius, RIGHT - tier.radius);
  ctx.save();
  ctx.strokeStyle = "rgba(230, 210, 162, 0.28)";
  ctx.setLineDash([3, 8]);
  ctx.beginPath();
  ctx.moveTo(x, SPAWN_Y);
  ctx.lineTo(x, BOTTOM - 10);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = cooldown > 0 ? 0.35 : 0.92;
  drawFruit({ x, y: SPAWN_Y, r: tier.radius, tier: currentTier, pop: 1 }, 1);
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawShadow(fruit) {
  ctx.save();
  ctx.translate(fruit.x + 2, fruit.y + fruit.r * 0.72);
  ctx.scale(1, 0.28);
  ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
  ctx.beginPath();
  ctx.arc(0, 0, fruit.r * 0.92, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawFruit(fruit) {
  const scale = fruit.pop >= 1 ? 1 : popScale(fruit.pop);
  ctx.save();
  ctx.translate(fruit.x, fruit.y);
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.arc(0, 0, fruit.r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.save();
  ctx.clip();
  const image = images[fruit.tier];
  if (image.complete && image.naturalWidth) {
    ctx.drawImage(image, -fruit.r, -fruit.r, fruit.r * 2, fruit.r * 2);
  } else {
    ctx.fillStyle = TIERS[fruit.tier].color;
    ctx.fill();
  }
  ctx.restore();
  ctx.lineWidth = Math.max(2, fruit.r * 0.055);
  ctx.strokeStyle = "rgba(255, 244, 220, 0.92)";
  ctx.stroke();
  ctx.restore();
}

function popScale(t) {
  const c = 1.35;
  const eased = 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
  return 0.55 + 0.45 * clamp(eased, 0, 1.06);
}

function burst(x, y, color, count) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 40 + Math.random() * 180;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 40,
      life: 0.35 + Math.random() * 0.3,
      max: 0.65,
      color,
      r: 1.5 + Math.random() * 2.5,
    });
  }
}

function fitCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  ctx.setTransform(width / W, 0, 0, height / H, 0, 0);
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function buildChain() {
  chainEl.replaceChildren();
  TIERS.forEach((tier, index) => {
    const item = document.createElement("div");
    item.className = "chain-item";
    item.dataset.tier = String(index);
    const face = document.createElement("div");
    face.className = "face";
    mountFace(face, index);
    item.append(face);
    chainEl.appendChild(item);
  });
}

function mountFace(slot, tierIndex) {
  const tier = TIERS[tierIndex];
  const badge = document.createElement("span");
  badge.className = "badge";
  badge.style.background = tier.color;
  slot.replaceChildren(badge);
  const img = new Image();
  img.alt = tier.name;
  img.onload = () => {
    if (!img.naturalWidth) return;
    img.className = "portrait";
    slot.replaceChildren(img);
  };
  img.src = tier.src;
}

function markChain() {
  chainEl.querySelectorAll(".chain-item").forEach((item) => {
    item.classList.toggle("on", Number(item.dataset.tier) <= maxTier);
  });
}

function updateHud() {
  scoreEl.textContent = String(score);
  bestEl.textContent = String(best);
  syncNext();
  markChain();
}

function syncNext() {
  mountFace(nextFace, nextTier);
}

function setAim(event) {
  const rect = canvas.getBoundingClientRect();
  aimX = ((event.clientX - rect.left) / rect.width) * W;
  clampAim();
}

function clampAim() {
  const radius = TIERS[currentTier].radius;
  aimX = clamp(aimX, LEFT + radius, RIGHT - radius);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function updateSoundLabel() {
  soundBtn.textContent = audioOn ? "声音：开" : "声音：关";
}

function unlockAudio() {
  if (!audioOn) return;
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch (error) {
    audioCtx = null;
  }
}

function tone(freq, dur, type, gain) {
  if (!audioOn || !audioCtx) return;
  const osc = audioCtx.createOscillator();
  const amp = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  amp.gain.setValueAtTime(gain, audioCtx.currentTime);
  amp.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
  osc.connect(amp);
  amp.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + dur);
}

function chord() {
  tone(523, 0.18, "sine", 0.05);
  setTimeout(() => tone(659, 0.18, "sine", 0.05), 90);
  setTimeout(() => tone(784, 0.28, "sine", 0.05), 180);
}

function loadNumber(key) {
  const value = Number(localStorageGet(key));
  return Number.isFinite(value) ? value : 0;
}

function localStorageGet(key) {
  try { return localStorage.getItem(key); } catch (error) { return null; }
}

function localStorageSet(key, value) {
  try { localStorage.setItem(key, value); } catch (error) { /* 隐私模式可能禁止写入 */ }
}
