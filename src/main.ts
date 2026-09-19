import './style.css';
import { COLUMNS, SIZE, UPPER, LOWER, createBoard, digit, formatValue, placeName, moveBead, step, ShakeDetector, type Column } from './model';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const svg = document.getElementById('board') as unknown as SVGSVGElement;
svg.setAttribute('preserveAspectRatio', 'none');
let board = createBoard();
let ones = 3, sound = true;
let audio: AudioContext | undefined;
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
  if (saved) { restore(saved); sound = saved.sound !== false; $('target').setAttribute('value', typeof saved.target === 'string' ? saved.target : ''); }
} catch { /* Storage can be unavailable in private browsing. */ }
const history: Saved[] = [];
function remember() { history.push(snapshot()); if (history.length > 50) history.shift(); ($('undo') as HTMLButtonElement).disabled = false; }
function save() {
  try { localStorage.setItem('soroban-v1', JSON.stringify({ ...snapshot(), sound, target: ($('target') as HTMLInputElement).value })); } catch { /* The board still works without persistence. */ }
}
function unlockSound() {
  if (!sound) return;
  try { audio ??= new AudioContext(); void audio.resume().catch(() => {}); } catch { /* Some browsers have no audio device. */ }
}
function clickSound(strength = 100) {
  if (!sound || !audio || audio.state !== 'running' || performance.now() - lastSound < 45) return;
  lastSound = performance.now();
  const oscillator = audio.createOscillator(), gain = audio.createGain();
  oscillator.type = 'triangle';
  oscillator.frequency.setValueAtTime(420 + Math.min(strength, 400) * .5, audio.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(160, audio.currentTime + .035);
  gain.gain.setValueAtTime(.035, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(.0001, audio.currentTime + .065);
  oscillator.connect(gain); gain.connect(audio.destination);
  oscillator.start(); oscillator.stop(audio.currentTime + .07);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
}
function soundLabel() { $('sound').setAttribute('aria-pressed', String(sound)); $('sound').innerHTML = `♪ <span>Sound ${sound ? 'on' : 'off'}</span>`; }
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
const unit = element('path', { d: 'M-5,0 L5,0 L0,6Z', class: 'unit-marker' });
function labels() {
  $('labels').innerHTML = '';
  $('decimal').innerHTML = '';
  for (let i = 0; i < COLUMNS; i++) {
    const button = document.createElement('button');
    button.className = i === ones ? 'selected' : '';
    button.innerHTML = `${placeName(ones - i)}<small>${10 ** (ones - i) >= 1 ? (10 ** (ones - i)).toLocaleString('en-US') : (10 ** (ones - i)).toFixed(i - ones)}</small>`;
    button.setAttribute('aria-label', `${placeName(ones - i)}. Set this rod as ones`);
    button.setAttribute('aria-pressed', String(i === ones));
    button.onclick = () => setOnes(i);
    $('labels').appendChild(button);
    const option = document.createElement('option'); option.value = String(i); option.textContent = `${i + 1} from left`; option.selected = i === ones;
    $('decimal').appendChild(option);
  }
  unit.setAttribute('transform', `translate(${20 + (ones + .5) * 560 / COLUMNS} 124)`);
}
function setOnes(i: number) { if (i === ones) return; cancelPointers(); remember(); ones = i; labels(); render(); save(); status(`Column ${i + 1} is now ones. The beads have stayed in place.`); }
$('decimal').onchange = () => setOnes(Number(($('decimal') as HTMLSelectElement).value));
$('target').oninput = save;
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
type Pointer = { col: number; deck: 'upper' | 'lower'; index: number; offset: number; start: number; moved: boolean; y: number; time: number; el: Element };
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
    e.preventDefault(); if (!pointers.size) remember();
    const b = board[col][deck][index], y = coords(e);
    pointers.set(e.pointerId, { col, deck, index, offset: y - b.y, start: y, moved: false, y: b.y, time: performance.now(), el });
    b.held = true; b.v = 0; el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('keydown', event => {
    const e = event as KeyboardEvent;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cancelPointers(); remember(); toggle(col, deck, index); }
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
  beads.forEach((other, i) => { if (i !== p.index && Math.abs(other.y - before[i]) > .1) { other.v = b.v * .45; clickSound(Math.abs(b.v)); } });
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
    clickSound();
  }
  save();
}
svg.addEventListener('pointerup', endPointer);
svg.addEventListener('pointercancel', endPointer);
svg.addEventListener('lostpointercapture', endPointer);
function reset(shaken = false) { cancelPointers(); remember(); board = createBoard(); render(); save(); clickSound(); status(shaken ? 'Three shakes. A fresh start. Undo will bring your number back.' : 'Board cleared. A fresh start.'); }
$('reset').onclick = () => reset();
$('undo').onclick = () => { const saved = history.pop(); if (!saved) return; cancelPointers(); restore(saved); labels(); render(); save(); ($('undo') as HTMLButtonElement).disabled = history.length === 0; status('Last change undone.'); };
let previous = performance.now(), accumulator = 0, lastSave = previous;
function frame(now: number) {
  accumulator += Math.min((now - previous) / 1000, .05); previous = now;
  while (accumulator >= 1 / 120) {
    for (const c of board) {
      const impact = Math.max(step(c.upper, UPPER.min, UPPER.max, 1 / 120), step(c.lower, LOWER.min, LOWER.max, 1 / 120));
      if (impact > 70) clickSound(impact);
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
function onMotion(event: DeviceMotionEvent) {
  if (!motionEnabled || document.hidden) return;
  const raw = event.acceleration;
  let values: number[];
  if (raw && raw.x !== null && raw.y !== null && raw.z !== null) values = [raw.x, raw.y, raw.z];
  else {
    const a = event.accelerationIncludingGravity;
    if (!a || a.x === null || a.y === null || a.z === null) return;
    const axes = [a.x, a.y, a.z];
    gravity ??= [...axes];
    values = axes.map((v, i) => { gravity![i] = .85 * gravity![i] + .15 * v; return v - gravity![i]; });
  }
  if (!values.every(Number.isFinite)) return;
  if (!motionReceived) { motionReceived = true; clearTimeout(motionTimer); status('Shake is ready. Three distinct shakes within two seconds will clear the board.'); }
  if (detector.sample(Math.hypot(...values), performance.now())) reset(true);
}
function motionLabel() { $('motion').setAttribute('aria-pressed', String(motionEnabled)); $('motion').innerHTML = `⌁ <span>${motionEnabled ? 'Shake on' : 'Enable shake'}</span>`; }
$('motion').onclick = async () => {
  if (motionEnabled) { motionEnabled = false; window.removeEventListener('devicemotion', onMotion); clearTimeout(motionTimer); motionLabel(); status('Shake reset is off.'); return; }
  if (!window.isSecureContext || typeof DeviceMotionEvent === 'undefined') { status('Motion is unavailable here. On your phone, open this app over HTTPS. Clear board always works.'); return; }
  try {
    const Motion = DeviceMotionEvent as typeof DeviceMotionEvent & { requestPermission?: () => Promise<string> };
    if (Motion.requestPermission && await Motion.requestPermission() !== 'granted') { status('Motion permission was not granted. You can still use Clear board.'); return; }
    motionEnabled = true; motionReceived = false; gravity = undefined; detector = new ShakeDetector(); motionLabel();
    window.addEventListener('devicemotion', onMotion);
    status('Waiting for your phone’s motion sensor…');
    motionTimer = setTimeout(() => { if (!motionReceived && motionEnabled) { motionEnabled = false; window.removeEventListener('devicemotion', onMotion); motionLabel(); status('No motion data received. Check your browser’s motion permissions, or use Clear board.'); } }, 6000);
  } catch { status('Motion access could not be enabled. Check your browser permissions and try again.'); }
};
const dialog = $('help-dialog') as HTMLDialogElement;
$('help').onclick = () => dialog.showModal();
$('close-help').onclick = () => dialog.close();
dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } });
labels(); render(); requestAnimationFrame(frame);
if ('serviceWorker' in navigator && import.meta.url.includes('/assets/')) navigator.serviceWorker.register('/sw.js').catch(() => {});
