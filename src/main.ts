import './style.css';
import { COLUMNS, SIZE, UPPER, LOWER, createBoard, digit, formatValue, placeName, moveBead, step, ShakeDetector } from './model';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const svg = document.getElementById('board') as unknown as SVGSVGElement;
svg.setAttribute('preserveAspectRatio', 'none');
let board = createBoard();
let ones = 3, sound = true;
let audio: AudioContext | undefined;
let contactBuffer: AudioBuffer | undefined;
let lastSound = 0;
const status = (message: string) => { $('status').textContent = message; };
type Saved = { positions: number[][]; ones: number };
const snapshot = (): Saved => ({ positions: board.map(c => [...c.upper, ...c.lower].map(b => b.y)), ones });
function restore(saved: Saved) {
  board = createBoard();
  if (!Number.isInteger(saved.ones) || saved.ones < 0 || saved.ones >= COLUMNS || saved.positions?.length !== COLUMNS) return;
  for (let c = 0; c < COLUMNS; c++) {
    const p = saved.positions[c];
    if (!Array.isArray(p) || p.length !== 5 || p.some(v => !Number.isFinite(v))) return;
    if (p[0] < UPPER.min - .1 || p[0] > UPPER.max + .1 || p[1] < LOWER.min - .1 || p[4] > LOWER.max + .1 || p.slice(2).some((v, i) => v - p[i + 1] < SIZE - .1)) return;
  }
  ones = saved.ones;
  board.forEach((c, i) => [...c.upper, ...c.lower].forEach((b, j) => b.y = saved.positions[i][j]));
}
try {
  const saved = JSON.parse(localStorage.getItem('soroban-v1') || 'null');
  if (saved) { restore(saved); sound = saved.sound !== false; }
} catch { /* Storage can be unavailable in private browsing. */ }
function save() {
  try { localStorage.setItem('soroban-v1', JSON.stringify({ ...snapshot(), sound })); } catch { /* The board still works without persistence. */ }
}
function unlockSound() {
  if (!sound) return;
  try { audio ??= new AudioContext(); void audio.resume().catch(() => {}); } catch { /* Some browsers have no audio device. */ }
}
function clickSound(strength = 100) {
  if (!sound || !audio || audio.state !== 'running' || performance.now() - lastSound < 100) return;
  lastSound = performance.now();
  // Damped noise gives a dry contact without a pitched sweep or sliding tone.
  if (!contactBuffer) {
    contactBuffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * .045), audio.sampleRate);
    const data = contactBuffer.getChannelData(0);
    let low = 0;
    for (let i = 0; i < data.length; i++) {
      const t = i / audio.sampleRate;
      low = .65 * low + .35 * (Math.random() * 2 - 1);
      data[i] = low * Math.exp(-t * 145) * Math.min(1, t / .001);
    }
  }
  const source = audio.createBufferSource(), gain = audio.createGain();
  source.buffer = contactBuffer; source.playbackRate.value = .92 + Math.random() * .16;
  gain.gain.value = .12 + Math.min(strength, 400) / 400 * .12;
  source.connect(gain); gain.connect(audio.destination); source.start();
  source.onended = () => { source.disconnect(); gain.disconnect(); };
}
function soundLabel() { $('sound').setAttribute('aria-pressed', String(sound)); $('sound').textContent = sound ? 'On' : 'Off'; }
soundLabel();
document.addEventListener('pointerdown', unlockSound, { passive: true });
document.addEventListener('keydown', unlockSound);
$('sound').onclick = () => { sound = !sound; unlockSound(); soundLabel(); save(); if (sound) clickSound(); };

const NS = 'http://www.w3.org/2000/svg';
function element(name: string, attrs: Record<string, string | number>, parent: Element = svg) {
  const el = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  parent.appendChild(el); return el;
}
svg.innerHTML = '<defs><filter id="shadow" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="3" stdDeviation="2" flood-color="#354825" flood-opacity=".18"/></filter></defs>';
const nodes: { el: Element; col: number; deck: 'upper' | 'lower'; index: number }[] = [];
for (let col = 0; col < COLUMNS; col++) {
  const x = 20 + (col + .5) * 560 / COLUMNS;
  element('line', { x1: x, x2: x, y1: 12, y2: 374, class: 'rail-shadow' });
  element('line', { x1: x, x2: x, y1: 12, y2: 374, class: 'rod' });
}
element('rect', { x: 10, y: 122, width: 580, height: 24, rx: 5, class: 'count-bar' });
for (let col = 0; col < COLUMNS; col++) {
  const x = 20 + (col + .5) * 560 / COLUMNS;
  if (col % 3 === 0) element('circle', { cx: x, cy: 134, r: 3, class: 'marker' });
  for (const deck of ['upper', 'lower'] as const) {
    for (let index = 0; index < (deck === 'upper' ? 1 : 4); index++) {
      const el = element('g', { class: 'bead', tabindex: 0, role: 'button', 'data-col': col, 'data-deck': deck, 'data-index': index });
      element('rect', { x: -42, y: -20, width: 84, height: 40, fill: 'transparent' }, el);
      element('path', { d: 'M-28,-16 L28,-16 Q33,-16 36,-10 L41,0 L36,10 Q33,16 28,16 L-28,16 Q-33,16 -36,10 L-41,0 L-36,-10 Q-33,-16 -28,-16Z', class: 'bead-face' }, el);
      element('path', { d: 'M-25,-11 L25,-11', class: 'shine' }, el);
      element('path', { d: 'M-5,0 L5,0', class: 'notch' }, el);
      nodes.push({ el, col, deck, index });
    }
  }
}
function labels() {
  $('labels').innerHTML = '';
  for (let i = 0; i < COLUMNS; i++) {
    const button = document.createElement('button');
    button.className = i === ones ? 'selected' : '';
    button.innerHTML = `${placeName(ones - i)}<small>${10 ** (ones - i) >= 1 ? (10 ** (ones - i)).toLocaleString('en-US') : (10 ** (ones - i)).toFixed(i - ones)}</small>`;
    button.setAttribute('aria-label', `${placeName(ones - i)}. Set this rod as ones`);
    button.setAttribute('aria-pressed', String(i === ones));
    button.onclick = () => setOnes(i);
    $('labels').appendChild(button);
  }
  ($('decimal') as HTMLInputElement).value = String(ones);
  $('decimal').setAttribute('aria-valuetext', `Ones at column ${ones + 1} from left; ${COLUMNS - ones - 1} decimal places`);
}
function setOnes(i: number) { if (i === ones) return; cancelPointers(); ones = i; labels(); render(); save(); status(`Column ${i + 1} is now ones.`); }
$('decimal').oninput = () => setOnes(Number(($('decimal') as HTMLInputElement).value));
let lastDigits = '';
function render() {
  const values = board.map(digit);
  for (const { el, col, deck, index } of nodes) {
    const b = board[col][deck][index];
    const active = deck === 'upper' ? values[col] >= 5 : index < values[col] % 5;
    el.setAttribute('transform', `translate(${20 + (col + .5) * 560 / COLUMNS} ${b.y})`);
    el.setAttribute('class', `bead${active ? ' active' : ''}${b.held ? ' held' : ''}`);
    el.setAttribute('aria-pressed', String(active));
    el.setAttribute('aria-label', `${placeName(ones - col)}, ${deck === 'upper' ? 'five bead' : 'one bead ' + (index + 1)}, ${active ? 'counted' : 'not counted'}`);
  }
  const key = values.join('') + ':' + ones;
  if (key !== lastDigits) {
    $('value').textContent = formatValue(values, ones);
    $('digits').innerHTML = values.map((v, i) => `<span class="${v ? 'active' : ''}">${v}${i === ones && i < COLUMNS - 1 ? '<b class="point">.</b>' : ''}</span>`).join('');
    lastDigits = key;
  }
}
type Pointer = { col: number; deck: 'upper' | 'lower'; index: number; offset: number; start: number; moved: boolean; y: number; time: number; el: Element; contacts: Set<number> };
const pointers = new Map<number, Pointer>();
const coords = (e: PointerEvent) => { const rect = svg.getBoundingClientRect(); return (e.clientY - rect.top) * 390 / rect.height; };
function cancelPointers() {
  for (const [id, p] of pointers) { board[p.col][p.deck][p.index].held = false; if (p.el.hasPointerCapture(id)) p.el.releasePointerCapture(id); }
  pointers.clear();
}
function toggle(col: number, deck: 'upper' | 'lower', index: number) {
  const c = board[col], beads = c[deck];
  if (deck === 'upper') beads[0].y = digit(c) >= 5 ? UPPER.min : UPPER.max;
  else {
    const active = index < digit(c) % 5;
    if (active) for (let i = index; i < 4; i++) beads[i].y = LOWER.max - (3 - i) * SIZE;
    else for (let i = 0; i <= index; i++) beads[i].y = LOWER.min + i * SIZE;
  }
  beads.forEach(b => b.v = 0); clickSound(); render(); save();
}
for (const node of nodes) {
  const { el, col, deck, index } = node;
  el.addEventListener('pointerdown', event => {
    const e = event as PointerEvent;
    if (e.button !== 0 || [...pointers.values()].some(p => p.col === col && p.deck === deck && p.index === index)) return;
    e.preventDefault();
    const b = board[col][deck][index], y = coords(e);
    pointers.set(e.pointerId, { col, deck, index, offset: y - b.y, start: y, moved: false, y: b.y, time: performance.now(), el, contacts: new Set() });
    b.held = true; b.v = 0; el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('keydown', event => {
    const e = event as KeyboardEvent;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cancelPointers(); toggle(col, deck, index); }
  });
}
svg.addEventListener('pointermove', e => {
  const p = pointers.get(e.pointerId); if (!p) return;
  const y = coords(e), now = performance.now();
  if (Math.abs(y - p.start) > 4) p.moved = true;
  if (!p.moved) return;
  const bounds = p.deck === 'upper' ? UPPER : LOWER;
  const beads = board[p.col][p.deck];
  const before = beads.map(b => b.y);
  moveBead(beads, p.index, y - p.offset, bounds.min, bounds.max);
  const b = beads[p.index];
  b.v = Math.max(-380, Math.min(380, (b.y - p.y) / Math.max(.008, (now - p.time) / 1000)));
  beads.forEach((other, i) => { if (i !== p.index && Math.abs(other.y - before[i]) > .1) {
    other.v = b.v * .45;
    if (!p.contacts.has(i)) { clickSound(Math.abs(b.v)); p.contacts.add(i); }
  } });
  const atStop = b.y <= bounds.min + p.index * SIZE + .1 || b.y >= bounds.max - (beads.length - 1 - p.index) * SIZE - .1;
  if (atStop && !p.contacts.has(-1)) { clickSound(Math.abs(b.v)); p.contacts.add(-1); }
  if (!atStop) p.contacts.delete(-1);
  p.y = b.y; p.time = now;
});
function endPointer(e: PointerEvent) {
  const p = pointers.get(e.pointerId); if (!p) return;
  pointers.delete(e.pointerId);
  const b = board[p.col][p.deck][p.index]; b.held = false;
  if (e.type !== 'pointerup') b.v = 0;
  else if (!p.moved) toggle(p.col, p.deck, p.index);
  else {
    if (performance.now() - p.time > 80) b.v = 0;
    const bounds = p.deck === 'upper' ? UPPER : LOWER;
    const target = p.deck === 'upper' ? UPPER.max : LOWER.min + p.index * SIZE;
    // Contact assistance only within a few pixels of the counting position.
    if (Math.abs(b.y - target) < 9) { moveBead(board[p.col][p.deck], p.index, target, bounds.min, bounds.max); b.v = 0; }
  }
  save();
}
svg.addEventListener('pointerup', endPointer);
svg.addEventListener('pointercancel', endPointer);
svg.addEventListener('lostpointercapture', endPointer);
function reset(shaken = false) { cancelPointers(); board = createBoard(); render(); save(); clickSound(); status(shaken ? 'Three shakes. Board cleared.' : 'Board cleared.'); }
$('reset').onclick = () => reset();
let previous = performance.now(), accumulator = 0, lastSave = previous;
function frame(now: number) {
  accumulator += Math.min((now - previous) / 1000, .05); previous = now;
  while (accumulator >= 1 / 120) {
    for (const c of board) {
      const impact = Math.max(step(c.upper, UPPER.min, UPPER.max, 1 / 120), step(c.lower, LOWER.min, LOWER.max, 1 / 120));
      if (impact > 70 && !pointers.size) clickSound(impact);
    }
    accumulator -= 1 / 120;
  }
  render(); if (now - lastSave > 1200 && !pointers.size) { save(); lastSave = now; }
  requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelPointers(); save(); } });
window.addEventListener('pagehide', save);
window.addEventListener('blur', cancelPointers);

let motionEnabled = false, motionReceived = false, motionTimer: ReturnType<typeof setTimeout> | undefined;
let detector = new ShakeDetector();
let gravity: number[] | undefined;
const motionStatus = (message: string) => { $('motion-status').textContent = message; };
const blockedHelp = 'Motion is blocked or unavailable. In Brave on Android, allow Settings → Site settings → Motion sensors for this site, then retry Enable. On iPhone, check Motion & Orientation permission or try Safari.';
function onMotion(event: DeviceMotionEvent) {
  if (!motionEnabled || document.hidden) return;
  const raw = event.acceleration;
  let values: number[];
  if (raw && [raw.x, raw.y, raw.z].every(v => typeof v === 'number' && Number.isFinite(v))) values = [raw.x!, raw.y!, raw.z!];
  else {
    const a = event.accelerationIncludingGravity;
    if (!a || ![a.x, a.y, a.z].every(v => typeof v === 'number' && Number.isFinite(v))) return;
    const axes = [a.x!, a.y!, a.z!];
    gravity ??= [...axes];
    values = axes.map((v, i) => { gravity![i] = .85 * gravity![i] + .15 * v; return v - gravity![i]; });
  }
  if (!values.every(Number.isFinite)) return;
  if (!motionReceived) { motionReceived = true; clearTimeout(motionTimer); motionLabel(); motionStatus('Sensor connected. Three distinct shakes within two seconds will clear the board.'); }
  if (detector.sample(Math.hypot(...values), performance.now())) reset(true);
}
function motionLabel() { $('motion').setAttribute('aria-pressed', String(motionEnabled && motionReceived)); $('motion').textContent = motionEnabled ? (motionReceived ? 'On' : 'Cancel') : 'Enable'; }
$('motion').onclick = async () => {
  if (motionEnabled) { motionEnabled = false; window.removeEventListener('devicemotion', onMotion); clearTimeout(motionTimer); motionLabel(); motionStatus('Shake reset is off.'); return; }
  if (!window.isSecureContext || typeof DeviceMotionEvent === 'undefined') { motionStatus(blockedHelp); return; }
  ($('motion') as HTMLButtonElement).disabled = true;
  try {
    const Motion = DeviceMotionEvent as typeof DeviceMotionEvent & { requestPermission?: () => Promise<string> };
    // Request iOS access immediately inside the click; awaiting other APIs first loses user activation.
    if (Motion.requestPermission && await Motion.requestPermission() !== 'granted') { motionStatus(blockedHelp); return; }
    if (!Motion.requestPermission && navigator.permissions) {
      const permissions = await Promise.all(['accelerometer', 'gyroscope'].map(name => navigator.permissions.query({ name: name as PermissionName }).catch(() => null)));
      if (permissions.some(p => p?.state === 'denied')) { motionStatus(blockedHelp); return; }
    }
    motionEnabled = true; motionReceived = false; gravity = undefined; detector = new ShakeDetector(); motionLabel();
    window.addEventListener('devicemotion', onMotion);
    motionStatus('Waiting for motion data. Move your phone gently to check the connection…');
    motionTimer = setTimeout(() => { if (!motionReceived && motionEnabled) { motionEnabled = false; window.removeEventListener('devicemotion', onMotion); motionLabel(); motionStatus(blockedHelp); } }, 6000);
  } catch { motionStatus(blockedHelp); }
  finally { ($('motion') as HTMLButtonElement).disabled = false; }
};
const settings = $('settings-dialog') as HTMLDialogElement;
const welcome = $('welcome-dialog') as HTMLDialogElement;
$('settings').onclick = () => { cancelPointers(); settings.showModal(); };
$('close-settings').onclick = () => settings.close();
$('show-welcome').onclick = () => { settings.close(); welcome.showModal(); };
$('start').onclick = () => welcome.close();
welcome.addEventListener('close', () => { try { localStorage.setItem('soroban-welcomed', '1'); } catch { /* Optional first-visit memory. */ } });
for (const dialog of [settings, welcome]) dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } });
try { if (!localStorage.getItem('soroban-welcomed')) welcome.showModal(); } catch { welcome.showModal(); }
labels(); render(); requestAnimationFrame(frame);
if ('serviceWorker' in navigator && import.meta.url.includes('/assets/')) navigator.serviceWorker.register('/sw.js').catch(() => {});
