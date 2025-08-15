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

// Preload default sounds via blob URLs to bypass CSP issues in iframe
async function preloadDefaultAudio() {
  try {
    console.log('[ring] preload start');
    const [spinRes, endRes] = await Promise.all([
      fetch('./baraban_1995_hq.mp3'),
      fetch('./pole_letter_wrong.mp3')
    ]);
    console.log('[ring] fetch status', spinRes.status, endRes.status);
    if (!spinRes.ok || !endRes.ok) throw new Error('Default audio fetch failed');
    const [spinBlob, endBlob] = await Promise.all([spinRes.blob(), endRes.blob()]);
    console.log('[ring] blobs', spinBlob.size, endBlob.size);

    if (spinAudioUrl) URL.revokeObjectURL(spinAudioUrl);
    spinAudioUrl = URL.createObjectURL(spinBlob);
    spinAudio = new Audio(spinAudioUrl);
    spinAudio.loop = true;
    spinAudio.volume = 0.7;
    spinAudio.addEventListener('error', (e) => console.warn('[ring] spin audio error', e));

    if (endAudioUrl) URL.revokeObjectURL(endAudioUrl);
    endAudioUrl = URL.createObjectURL(endBlob);
    endAudio = new Audio(endAudioUrl);
    endAudio.loop = false;
    endAudio.volume = 1.0;
    endAudio.addEventListener('error', (e) => console.warn('[ring] end audio error', e));

    console.log('[ring] default audio preloaded', { spinSrc: spinAudio.src.length, endSrc: endAudio.src.length });
  } catch (e) {
    console.warn('[ring] default audio preload failed', e);
  }
}
preloadDefaultAudio();

const audioState = { unlocked: false };
async function unlockAudioPlayback() {
  if (audioState.unlocked) return;
  try {
    if (!spinAudio) {
      await preloadDefaultAudio();
    }
    if (!spinAudio) return;
    const prevVol = spinAudio.volume;
    spinAudio.muted = true;
    await spinAudio.play();
    spinAudio.pause();
    spinAudio.currentTime = 0;
    spinAudio.muted = false;
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
  '#1f2a80', '#ffffff', '#1f2a80', '#ffffff', '#1f2a80', '#ffffff',
  '#1f2a80', '#ffffff', '#1f2a80', '#ffffff', '#1f2a80', '#ffffff'
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
    // High-contrast text: white on blue, dark on white
    const wedgeColor = colors[i % colors.length].toLowerCase();
    ctx.fillStyle = wedgeColor === '#1f2a80' ? '#ffffff' : '#111827';
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
  // Zoom focus on the pointer area for 5s
  try {
    const wrap = document.querySelector('.wheel-wrap');
    wrap?.classList.add('zoomed');
    setTimeout(() => wrap?.classList.remove('zoomed'), 5000); // keep zoom for 5s
  } catch(_) {}
  stopSpinSound();
  setTimeout(() => playEndSound(), 0);
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

    if (Math.abs(v0) < 0.25) {
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
const spinVol = document.getElementById('spinVolume');
const endVol = document.getElementById('endVolume');
const spinVolLabel = document.getElementById('spinVolLabel');
const endVolLabel = document.getElementById('endVolLabel');
const spinLoadedLabel = document.getElementById('spinLoaded');
const endLoadedLabel = document.getElementById('endLoaded');

spinAudioInput.addEventListener('change', () => {
  const f = spinAudioInput.files && spinAudioInput.files[0];
  if (!f) return;
  if (spinAudioUrl) URL.revokeObjectURL(spinAudioUrl);
  spinAudioUrl = URL.createObjectURL(f);
  spinAudio = new Audio(spinAudioUrl);
  spinAudio.loop = true;
  spinAudio.volume = (Number(spinVol?.value ?? 70) / 100);
  if (spinLoadedLabel) spinLoadedLabel.textContent = f.name || 'custom file';
});

endAudioInput.addEventListener('change', () => {
  const f = endAudioInput.files && endAudioInput.files[0];
  if (!f) return;
  if (endAudioUrl) URL.revokeObjectURL(endAudioUrl);
  endAudioUrl = URL.createObjectURL(f);
  endAudio = new Audio(endAudioUrl);
  endAudio.loop = false;
  endAudio.volume = (Number(endVol?.value ?? 20) / 100);
  if (endLoadedLabel) endLoadedLabel.textContent = f.name || 'custom file';
});

spinVol?.addEventListener('input', () => {
  const v = Number(spinVol.value); spinVolLabel.textContent = `${v}%`;
  if (spinAudio) spinAudio.volume = v / 100;
});
endVol?.addEventListener('input', () => {
  const v = Number(endVol.value); endVolLabel.textContent = `${v}%`;
  if (endAudio) endAudio.volume = v / 100;
});

async function ensureLoaded(a) {
  if (!a) return false;
  if (a.readyState >= 2) return true;
  try {
    await new Promise((res, rej) => {
      const onReady = () => { cleanup(); res(true); };
      const onErr = (e) => { cleanup(); rej(e); };
      const cleanup = () => {
        a.removeEventListener('canplay', onReady);
        a.removeEventListener('canplaythrough', onReady);
        a.removeEventListener('error', onErr);
      };
      a.addEventListener('canplay', onReady, { once: true });
      a.addEventListener('canplaythrough', onReady, { once: true });
      a.addEventListener('error', onErr, { once: true });
      try { a.load(); } catch (_) {}
    });
    return true;
  } catch (e) {
    console.warn('[ring] audio load failed', e);
    return false;
  }
}

async function playSpinSound() {
  if (!spinAudio) { console.warn('[ring] spinAudio missing'); return; }
  try {
    const ok = await ensureLoaded(spinAudio);
    console.log('[ring] playSpinSound ensureLoaded', ok, spinAudio.src);
    spinAudio.currentTime = 0;
    await spinAudio.play();
    console.log('[ring] spin playing');
  } catch (e) { console.warn('[ring] playSpinSound failed', e); }
}
function stopSpinSound() {
  if (!spinAudio) return;
  try { spinAudio.pause(); } catch (e) { console.warn('[ring] stopSpinSound pause failed', e); }
}
async function playEndSound() {
  if (!endAudio) { console.warn('[ring] endAudio missing'); return; }
  try {
    const ok = await ensureLoaded(endAudio);
    console.log('[ring] playEndSound ensureLoaded', ok, endAudio.src);
    endAudio.currentTime = 0;
    await endAudio.play();
    console.log('[ring] end playing');
  } catch (e) { console.warn('[ring] playEndSound failed', e); }
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