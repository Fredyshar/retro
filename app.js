const canvas = document.getElementById('wheel');
const ctx = canvas.getContext('2d');
const removeBtn = document.getElementById('removeCurrent');
const resultSpan = document.getElementById('result');
const spinAudioInput = document.getElementById('spinAudio');
const endAudioInput = document.getElementById('endAudio');
const newSegmentInput = document.getElementById('newSegment');
const addSegmentBtn = document.getElementById('addSegment');
const segmentsListEl = document.getElementById('segmentsList');

// Audio state
let spinAudio = null, spinAudioUrl = null;
let endAudio = null, endAudioUrl = null;

// Default sounds (can be replaced via file inputs)
try {
  spinAudio = new Audio('./baraban_1995_hq.mp3');
  spinAudio.loop = true;
  spinAudio.volume = 0.7;
} catch (_) {}
try {
  endAudio = new Audio('./pole_letter_wrong.mp3');
  endAudio.loop = false;
  endAudio.volume = 1.0;
} catch (_) {}

const audioState = { unlocked: false };
async function unlockAudioPlayback() {
  if (audioState.unlocked) return;
  try {
    if (!spinAudio) {
      spinAudio = new Audio('./baraban_1995_hq.mp3');
      spinAudio.loop = true;
      spinAudio.volume = 0.7;
    }
    const prevVol = spinAudio.volume;
    spinAudio.volume = 0.0001;
    await spinAudio.play();
    spinAudio.pause();
    spinAudio.currentTime = 0;
    spinAudio.volume = prevVol;
    audioState.unlocked = true;
    console.log('[ring] audio unlocked');
  } catch (e) {
    console.warn('[ring] audio unlock failed', e);
  }
}

// Model
let segments = [
  'Степан', 'Саша', 'Бота', 'Никита', 'Алексей', 'Ренат',
  'Настя', 'Кирилл', 'Андрей', 'Медет', 'Федор'
];

const colors = [
  '#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#f97316',
  '#06b6d4', '#84cc16', '#eab308', '#22c55e', '#dc2626', '#6366f1'
];

const size = canvas.width; // square
const radius = size / 2;
const center = { x: radius, y: radius };

let currentAngle = 0; // radians, 0 points to the right
let isSpinning = false;
let lastFrameTime = 0;
let angularVelocity = 0; // rad/s, signed
let deceleration = 0; // rad/s^2, positive magnitude

// Drag state
let isDragging = false;
let dragUnwrappedStart = 0;
let dragUnwrappedNow = 0;
let lastWrappedAngle = 0;
let wheelStartAngle = 0;
let samples = []; // {t, ang} in unwrapped radians

function drawWheel(angle) {
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.rotate(angle);

  const slice = (Math.PI * 2) / segments.length;

  for (let i = 0; i < segments.length; i++) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius - 6, i * slice, (i + 1) * slice);
    ctx.closePath();
    ctx.fillStyle = colors[i % colors.length];
    ctx.fill();

    ctx.save();
    ctx.rotate(i * slice + slice / 2);
    ctx.translate(radius * 0.65, 0);
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 20px system-ui, -apple-system, Segoe UI, Roboto, Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(segments[i]), 0, 0);
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(0, 0, 36, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#e5e7eb';
  ctx.stroke();

  ctx.restore();
}

function getCurrentIndex(angle) {
  if (segments.length === 0) return -1;
  const slice = (Math.PI * 2) / segments.length;
  // world pointer is at -90deg; find wheel-local angle
  const local = normalizeAngle(-Math.PI / 2 - angle);
  return Math.floor(local / slice);
}

function updateResult(angle) {
  if (segments.length === 0) {
    resultSpan.textContent = '—';
    removeBtn.disabled = true;
    return;
  }
  const idx = getCurrentIndex(angle);
  const value = segments[idx];
  resultSpan.textContent = String(value);
  removeBtn.disabled = isSpinning || segments.length <= 1;
}

function normalizeAngle(a) {
  const twoPi = Math.PI * 2;
  a = a % twoPi;
  return a >= 0 ? a : a + twoPi;
}

function animate(time) {
  if (!isSpinning) return;
  if (!lastFrameTime) lastFrameTime = time;
  const dt = (time - lastFrameTime) / 1000;
  lastFrameTime = time;

  const sign = Math.sign(angularVelocity);
  if (sign === 0) {
    stopSpin();
    return;
  }
  angularVelocity -= sign * deceleration * dt;
  if (Math.sign(angularVelocity) !== sign) {
    stopSpin();
    return;
  }

  currentAngle += angularVelocity * dt;
  drawWheel(currentAngle);
  updateResult(currentAngle);
  requestAnimationFrame(animate);
}

function stopSpin() {
  isSpinning = false;
  angularVelocity = 0;
  deceleration = 0;
  drawWheel(currentAngle);
  updateResult(currentAngle);
  stopSpinSound();
  playEndSound();
}

function getPointerAngleUnwrapped(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;
  const dx = x - center.x;
  const dy = y - center.y;
  const wrapped = Math.atan2(dy, dx);
  let delta = wrapped - lastWrappedAngle;
  const twoPi = Math.PI * 2;
  if (delta > Math.PI) delta -= twoPi;
  if (delta < -Math.PI) delta += twoPi;
  lastWrappedAngle = wrapped;
  dragUnwrappedNow += delta;
  return dragUnwrappedNow;
}

function onPointerDown(e) {
  unlockAudioPlayback();
  e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  isDragging = true;
  isSpinning = false;
  angularVelocity = 0;
  deceleration = 0;
  samples = [];

  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;
  lastWrappedAngle = Math.atan2(y - center.y, x - center.x);
  dragUnwrappedNow = 0;
  dragUnwrappedStart = 0;
  wheelStartAngle = currentAngle;

  samples.push({ t: performance.now(), ang: 0 });
}

function onPointerMove(e) {
  if (!isDragging) return;
  const unwrapped = getPointerAngleUnwrapped(e);
  currentAngle = wheelStartAngle + (unwrapped - dragUnwrappedStart);
  drawWheel(currentAngle);
  updateResult(currentAngle);
  const now = performance.now();
  samples.push({ t: now, ang: unwrapped });
  const cutoff = now - 160;
  while (samples.length > 2 && samples[0].t < cutoff) samples.shift();
}

function onPointerUp(e) {
  if (!isDragging) return;
  isDragging = false;
  canvas.releasePointerCapture(e.pointerId);

  const n = samples.length;
  if (n >= 2) {
    const first = samples[0];
    const last = samples[n - 1];
    const dt = (last.t - first.t) / 1000;
    let v0 = dt > 0 ? (last.ang - first.ang) / dt : 0;
    const maxSpeed = 12;
    if (v0 > maxSpeed) v0 = maxSpeed;
    if (v0 < -maxSpeed) v0 = -maxSpeed;

    if (Math.abs(v0) < 0.4) {
      stopSpin();
      return;
    }

    angularVelocity = v0;
    const speed = Math.min(Math.abs(v0), maxSpeed);
    const duration = 1 + 4 * (speed / maxSpeed);
    deceleration = Math.abs(v0) / duration;
    isSpinning = true;
    lastFrameTime = 0;
    playSpinSound();
    requestAnimationFrame(animate);
  } else {
    stopSpin();
  }
}

// Audio wiring
spinAudioInput.addEventListener('change', () => {
  const f = spinAudioInput.files && spinAudioInput.files[0];
  if (!f) return;
  if (spinAudioUrl) URL.revokeObjectURL(spinAudioUrl);
  spinAudioUrl = URL.createObjectURL(f);
  spinAudio = new Audio(spinAudioUrl);
  spinAudio.loop = true;
  spinAudio.volume = 0.7;
});

endAudioInput.addEventListener('change', () => {
  const f = endAudioInput.files && endAudioInput.files[0];
  if (!f) return;
  if (endAudioUrl) URL.revokeObjectURL(endAudioUrl);
  endAudioUrl = URL.createObjectURL(f);
  endAudio = new Audio(endAudioUrl);
  endAudio.loop = false;
  endAudio.volume = 1.0;
});

function playSpinSound() {
  if (!spinAudio) return;
  try {
    spinAudio.currentTime = 0;
    spinAudio.play();
  } catch (_) {}
}
function stopSpinSound() {
  if (!spinAudio) return;
  try { spinAudio.pause(); } catch (_) {}
}
function playEndSound() {
  if (!endAudio) return;
  try {
    endAudio.currentTime = 0;
    endAudio.play();
  } catch (_) {}
}

// Remove current segment
removeBtn.addEventListener('click', () => {
  if (isSpinning || segments.length <= 1) return;
  const index = getCurrentIndex(currentAngle);
  segments.splice(index, 1);
  renderSegmentsList();
  drawWheel(currentAngle);
  updateResult(currentAngle);
});

// Add segment UI
addSegmentBtn.addEventListener('click', () => {
  const val = (newSegmentInput.value || '').trim();
  if (!val) return;
  segments.push(val);
  newSegmentInput.value = '';
  renderSegmentsList();
  drawWheel(currentAngle);
  updateResult(currentAngle);
});

function renderSegmentsList() {
  segmentsListEl.innerHTML = '';
  segments.forEach((s, i) => {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = String(s);
    const btn = document.createElement('button');
    btn.textContent = '×';
    btn.title = 'Удалить';
    btn.addEventListener('click', () => {
      if (isSpinning) return;
      if (segments.length <= 1) return;
      segments.splice(i, 1);
      renderSegmentsList();
      drawWheel(currentAngle);
      updateResult(currentAngle);
    });
    tag.appendChild(btn);
    segmentsListEl.appendChild(tag);
  });
}

// Events
canvas.addEventListener('pointerdown', onPointerDown);
canvas.addEventListener('pointermove', onPointerMove);
canvas.addEventListener('pointerup', onPointerUp);
canvas.addEventListener('pointercancel', onPointerUp);

// initial render
drawWheel(currentAngle);
updateResult(currentAngle);
renderSegmentsList(); 