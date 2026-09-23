import './style.css';
import { COLUMNS, SIZE, UPPER, LOWER, createBoard, digit, formatValue, placeName, moveBead, step, ShakeDetector } from './model';
import { CAPACITY, MOVE_STEP_COUNT, MUL_STEP_COUNT, TEST_ONES, describe as describeProblem, generate, generateSet, moveStepLabel, mulStepLabel, problemLines, type Levels, type Operation, type Problem } from './problems';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const svg = document.getElementById('board') as unknown as SVGSVGElement;
svg.setAttribute('preserveAspectRatio', 'none');
let board = createBoard();
let ones = 3, sound = true;
// Test mode. The problem is read in a dialog and solved on the beads; the
// decimal is normalized to the last rod and then frozen, so all six rods carry
// whole numbers and every answer the generator can ask for fits the board.
type Verdict = 'none' | 'right' | 'wrong' | 'revealed';
// `step` is the line of the problem the learner has marked as their place in
// it, or -1 for nowhere. It lives here rather than on the Problem because it is
// where they got to, not something the generator has any business knowing.
type TestState = { on: boolean; ops: Operation[]; levels: Levels; problem: Problem | null; onesBefore: number; verdict: Verdict; step: number };
let test: TestState = { on: false, ops: ['add'], levels: { move: 1, mul: 1 }, problem: null, onesBefore: 3, verdict: 'none', step: -1 };
// The worksheet: a set of problems for working on a soroban of your own rather
// than the one on screen. It reads the same rungs, but it never touches the
// board, which is what keeps it out from behind test mode.
type SheetState = { config: string; problems: Problem[]; revealed: number[] };
let sheet: SheetState = { config: '', problems: [], revealed: [] };
let decimalFrozen = false;
let audio: AudioContext | undefined;
let contactBuffer: AudioBuffer | undefined;
let lastSound = 0;
const status = (message: string) => { $('status').textContent = message; };
type SavedTest = { on: boolean; ops: Operation[]; levels: Levels; problem: Problem | null; onesBefore: number; step: number };
// A sheet is saved with the rungs it was built from, so changing a rung gives a
// sheet to match rather than a stale one.
type SavedSheet = { config: string; problems: Problem[]; revealed: number[] };
type Saved = { positions: number[][]; ones: number; test?: SavedTest; sheet?: SavedSheet };
// One y per rod, upper bead first and then the four lower ones. A wipe remembers
// the same shape, which is how it puts every bead back where it found it.
const positions = () => board.map(c => [...c.upper, ...c.lower].map(b => b.y));
const snapshot = (): Saved => ({ positions: positions(), ones, sheet: { config: sheet.config, problems: sheet.problems, revealed: [...sheet.revealed] }, test: { on: test.on, ops: [...test.ops], levels: { ...test.levels }, problem: test.problem, onesBefore: test.onesBefore, step: test.step } });
// A rung number is only trusted if its ladder is that long. A declaration, so
// the restore below can call it before the selectors are built.
function rungIn(rung: unknown, count: number): rung is number {
  return Number.isInteger(rung) && (rung as number) >= 1 && (rung as number) <= count;
}
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
  if (saved) { restore(saved); sound = saved.sound !== false; restoreTest(saved.test); restoreSheet(saved.sheet); }
} catch { /* Storage can be unavailable in private browsing. */ }
// True while a tween owns the bead positions. Every save waits for it to settle,
// because a half-travelled bead would fail the restore check on the next load and
// drop the board to empty instead of putting it back. Saves arrive from several
// places — setOnes, pagehide, a bead landing — so the guard belongs here rather
// than at each caller.
let settling = false;
// A save that cannot be written yet is remembered rather than dropped, so a
// change made mid-animation is postponed and never lost. The frame loop flushes
// it once the board is at rest.
let dirty = false;
// Set when something changed the beads outside the animation loop, so a frame
// with no motion left to draw still redraws them.
let needsRender = false;
function save() {
  if (settling) { dirty = true; return; }
  dirty = false;
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
    const button = document.createElement('span');
    button.className = i === ones ? 'selected' : '';
    button.innerHTML = `${placeName(ones - i)}<small>${10 ** (ones - i) >= 1 ? (10 ** (ones - i)).toLocaleString('en-US') : (10 ** (ones - i)).toFixed(i - ones)}</small>`;
    $('labels').appendChild(button);
  }
  ($('decimal') as HTMLInputElement).value = String(ones);
  $('decimal').setAttribute('aria-valuetext', `Ones at column ${ones + 1} from left; ${COLUMNS - ones - 1} decimal places`);
}
function setOnes(i: number) { if (decimalFrozen || i === ones) return; cancelPointers(); ones = i; labels(); render(); save(); }
$('decimal').oninput = () => setOnes(Number(($('decimal') as HTMLInputElement).value));
// The range is only driven directly by keyboard or assistive input — a pointer
// drag owns its own surface below — so this fires once per press rather than
// once per pixel, which is what makes it safe to announce from.
$('decimal').addEventListener('change', () => status(`Column ${ones + 1} is now ones.`));
// Keep the native range for keyboard/assistive input, but own pointer gestures
// so a tap on its track or a brush over its thumb can never change the value.
const decimal = $('decimal') as HTMLInputElement;
const decimalTrack = decimal.parentElement!;
// A separate hit surface prevents native range track taps from bypassing the
// hold on touch browsers. The range remains focusable for keyboard/AT input.
const decimalGesture = document.createElement('div');
decimalGesture.className = 'decimal-gesture';
decimalGesture.setAttribute('aria-hidden', 'true');
decimalTrack.appendChild(decimalGesture);
decimal.setAttribute('aria-label', 'Ones column. Hold the gold caret, then drag to change decimal place. Or use arrow keys.');
let hintTimer: ReturnType<typeof setTimeout> | undefined;
let decimalUnlocked = false;
function decimalHint(message: string) {
  clearTimeout(hintTimer);
  decimalTrack.dataset.hint = message;
  decimalTrack.style.setProperty('--caret-left', `${11.111 + ones * 77.778 / (COLUMNS - 1)}%`);
  hintTimer = setTimeout(() => { delete decimalTrack.dataset.hint; }, 2200);
}
function lockDecimal() { decimalUnlocked = false; decimal.classList.remove('unlocked'); $('decimal-lock').textContent = '🔒'; $('decimal-lock').setAttribute('aria-label', 'Unlock decimal slider'); $('decimal-lock').setAttribute('aria-pressed', 'false'); clearTimeout(hintTimer); delete decimalTrack.dataset.hint; }
function toggleDecimalLock() { if (decimalFrozen) return; decimalUnlocked = !decimalUnlocked; decimal.classList.toggle('unlocked', decimalUnlocked); $('decimal-lock').textContent = decimalUnlocked ? '🔓' : '🔒'; $('decimal-lock').setAttribute('aria-label', decimalUnlocked ? 'Lock decimal slider' : 'Unlock decimal slider'); $('decimal-lock').setAttribute('aria-pressed', String(decimalUnlocked)); if (decimalUnlocked) { decimalHint('Drag the caret'); status('Decimal unlocked. Drag, then tap the lock to secure it.'); } else { status('Decimal position locked.'); } }
($('decimal-lock') as HTMLButtonElement).onclick = toggleDecimalLock;
decimalGesture.addEventListener('pointerdown', e => {
  e.preventDefault();
  if (!decimalUnlocked || e.button !== 0) return;
  decimal.focus({ preventScroll: true });
  decimalGesture.setPointerCapture(e.pointerId);
});
decimalGesture.addEventListener('pointermove', e => {
  e.preventDefault();
  if (!decimalUnlocked) return;
  const r = decimal.getBoundingClientRect();
  setOnes(Math.max(0, Math.min(COLUMNS - 1, Math.round((e.clientX - r.left - 16) / (r.width - 32) * (COLUMNS - 1)))));
  decimalTrack.style.setProperty('--caret-left', `${11.111 + ones * 77.778 / (COLUMNS - 1)}%`);
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) decimalGesture.addEventListener(type, () => {
  // Announced on release rather than on every move, so dragging the caret does
  // not read out each column it passes over.
  if (decimalUnlocked) { lockDecimal(); status(`Column ${ones + 1} is now ones.`); }
});
decimalGesture.addEventListener('click', e => e.preventDefault());
decimalGesture.addEventListener('contextmenu', e => e.preventDefault());
decimal.addEventListener('keydown', e => { if (e.key.startsWith('Arrow') && !decimalUnlocked) e.preventDefault(); });
window.addEventListener('blur', lockDecimal);
window.addEventListener('resize', lockDecimal);
document.addEventListener('visibilitychange', () => { if (document.hidden) lockDecimal(); });
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

// --- The reckoning bar ------------------------------------------------------
// A real soroban is cleared by running a finger along the reckoning bar, pushing
// every bead away from it, and the same swipe works here. That strip is the one
// the decimal-caret surface already covers, and the caret only owns it while it
// is unlocked — the default, and always in test mode — so a locked caret leaves
// the whole bar to the wipe and the two gestures cannot be mistaken for each
// other.
//
// The wave follows the finger instead of waiting for the swipe to finish, so
// there is no delay to feel. Completion is what is gated: lift the finger before
// every column has been swept and the beads spring back, which makes a stray
// graze self-healing rather than destructive.
const REST = (() => { const first = createBoard()[0]; return [...first.upper, ...first.lower].map(b => b.y); })();
const beadAt = (col: number, slot: number) => slot === 0 ? board[col].upper[0] : board[col].lower[slot - 1];
const coordsX = (e: PointerEvent) => { const rect = svg.getBoundingClientRect(); return (e.clientX - rect.left) * 600 / rect.width; };
const columnAtX = (x: number) => Math.max(0, Math.min(COLUMNS - 1, Math.floor((x - 20) / (560 / COLUMNS))));
const easeOut = (t: number) => 1 - (1 - t) ** 3;

const WIPE_DUR = 180, REVERT_DUR = 140, BEAD_STAGGER = 12, COLUMN_STAGGER = 45, ARM_DISTANCE = 8, AT_REST = .5;
type Tween = { col: number; slot: number; from: number; to: number; start: number; dur: number };
type Wipe = { id: number; from: number[][]; reached: Set<number>; last: number; startX: number; startY: number; armed: boolean };
let tweens: Tween[] = [];
let wipe: Wipe | null = null;

// Slots are 0 for the upper bead and 1..4 for the lower ones, the same order
// `positions` and `REST` use. The lower beads leave the bar outwards and each
// travels the same distance, so a staggered column never overlaps in flight.
function pushTween(col: number, slot: number, to: number, delay: number, dur: number) {
  const bead = beadAt(col, slot);
  // Whatever is already queued for this bead goes first: this call is the newest
  // word on where it is going.
  tweens = tweens.filter(t => !(t.col === col && t.slot === slot));
  bead.v = 0;
  settling = true;
  tweens.push({ col, slot, from: bead.y, to, start: performance.now() + delay + (slot ? slot * BEAD_STAGGER : 0), dur });
}

// Sweeping sends a rod's beads to rest. A bead already there has nothing to do,
// so it gets no tween — which also keeps it out of the landing ticks, so sweeping
// a rod that needs no clearing stays quiet.
function tweenColumn(col: number, delay: number, dur: number) {
  for (let slot = 0; slot < 5; slot++) if (Math.abs(REST[slot] - beadAt(col, slot).y) >= AT_REST) pushTween(col, slot, REST[slot], delay, dur);
}

// Bringing a rod back is not the mirror of clearing it, and asking where its
// beads are now is what breaks it. Beads are staggered, so one may not have
// started when the finger lifts; and a bead still sitting on its resting place
// can be shoved off it by a neighbour that is still travelling. What has to come
// back is whatever the sweep was going to move, which is decided by where the
// beads were when the finger landed. Holding a bead that never moved is the
// point rather than a waste: the tween is what stops the physics pushing it off.
function revertColumn(col: number, from: number[]) {
  for (let slot = 0; slot < 5; slot++) if (Math.abs(REST[slot] - from[slot]) >= AT_REST) pushTween(col, slot, from[slot], 0, REVERT_DUR);
}
function setColumn(col: number, to: number[]) {
  for (let slot = 0; slot < 5; slot++) { const bead = beadAt(col, slot); bead.v = 0; bead.y = to[slot]; }
  tweens = tweens.filter(t => t.col !== col);
  // This runs on the aborts, where there may be no motion left to carry the new
  // positions to the screen, so ask the next frame to redraw them.
  needsRender = true;
}
function sweepColumn(col: number, delay: number) {
  if (!wipe || wipe.reached.has(col)) return;
  wipe.reached.add(col);
  tweenColumn(col, delay, WIPE_DUR);
}
function clearWipe() { wipe = null; tweens = []; settling = false; }
function endWipe(commit: boolean, animate = true) {
  if (!wipe) return;
  const w = wipe; wipe = null;
  if (!w.armed) return; // A tap, or a drag that never clearly went sideways.
  // `instant` is for the aborts: a blur or a backgrounded tab can hide the
  // screen mid-gesture, so there would be nobody watching the spring back.
  const instant = !animate;
  if (commit && w.reached.size === COLUMNS) {
    // The columns the finger never reached finish the wave, staggered by how far
    // they are from where it stopped.
    for (let col = 0; col < COLUMNS; col++) {
      if (w.reached.has(col)) continue;
      if (instant) setColumn(col, REST); else tweenColumn(col, Math.abs(col - w.last) * COLUMN_STAGGER, WIPE_DUR);
    }
    save(); // Deferred to the settle while the wave is still running.
    status('Board cleared.');
  } else {
    for (const col of w.reached) { if (instant) setColumn(col, w.from[col]); else revertColumn(col, w.from[col]); }
  }
}
function advanceTweens(now: number) {
  if (!tweens.length) {
    if (settling) { settling = false; save(); }
    return;
  }
  for (const t of tweens) {
    const bead = beadAt(t.col, t.slot);
    bead.v = 0;
    bead.y = now <= t.start ? t.from : t.from + (t.to - t.from) * easeOut(Math.min(1, (now - t.start) / t.dur));
  }
  const done = tweens.filter(t => now > t.start + t.dur);
  if (!done.length) return;
  tweens = tweens.filter(t => now <= t.start + t.dur);
  // One tick per column that actually moved, once its last bead lands.
  for (const col of new Set(done.map(t => t.col))) if (!tweens.some(t => t.col === col)) clickSound(140);
  if (!tweens.length && settling) { settling = false; save(); }
}

// One finger owns the bar at a time, and the caret has first claim on it while
// it is unlocked.
decimalGesture.addEventListener('pointerdown', e => {
  if (decimalUnlocked || e.button !== 0 || pointers.size || wipe) return;
  const x = coordsX(e), y = coords(e);
  wipe = { id: e.pointerId, from: positions(), reached: new Set(), last: columnAtX(x), startX: x, startY: y, armed: false };
  decimalGesture.setPointerCapture(e.pointerId);
});
decimalGesture.addEventListener('pointermove', e => {
  if (!wipe || wipe.id !== e.pointerId) return;
  const x = coordsX(e);
  if (!wipe.armed) {
    // Sideways intent, so a tap or a stray vertical drag on the bar never wipes.
    const dx = Math.abs(x - wipe.startX);
    if (dx < ARM_DISTANCE || dx <= Math.abs(coords(e) - wipe.startY)) return;
    wipe.armed = true;
    sweepColumn(wipe.last, 0);
  }
  const col = columnAtX(x), lo = Math.min(wipe.last, col), hi = Math.max(wipe.last, col);
  for (let c = lo; c <= hi; c++) sweepColumn(c, 0);
  wipe.last = col;
});
decimalGesture.addEventListener('pointerup', e => { if (wipe?.id === e.pointerId) endWipe(true); });
decimalGesture.addEventListener('pointercancel', e => { if (wipe?.id === e.pointerId) endWipe(false, false); });

function reset(shaken = false) { lockDecimal(); cancelPointers(); clearWipe(); board = createBoard(); render(); save(); clickSound(); status(shaken ? 'Three shakes. Board cleared.' : 'Board cleared.'); }
$('reset').onclick = () => reset();
// True when nothing owns the bead positions: no tween is running, no finger is
// down, the last tween has settled, and no bead carries velocity. Integrating
// and redrawing in that state is work for nobody, and on a phone it is the
// difference between an idle screen and one rewriting thirty beads sixty times a
// second. `settling` belongs in here: a tween cleared without finishing still
// has to be settled, or the save it owes would wait for motion that never comes.
const atRest = () => !settling && !tweens.length && !pointers.size && board.every(c => c.upper.every(b => b.v === 0) && c.lower.every(b => b.v === 0));
let previous = performance.now(), accumulator = 0, wasResting = true;
function frame(now: number) {
  const resting = atRest();
  if (resting) accumulator = 0;
  else {
    accumulator += Math.min((now - previous) / 1000, .05);
    while (accumulator >= 1 / 120) {
      for (const c of board) {
        const impact = Math.max(step(c.upper, UPPER.min, UPPER.max, 1 / 120), step(c.lower, LOWER.min, LOWER.max, 1 / 120));
        if (impact > 70 && !pointers.size) clickSound(impact);
      }
      accumulator -= 1 / 120;
    }
    advanceTweens(now);
  }
  previous = now;
  // Where the beads came to rest is worth keeping, so the move from motion to
  // stillness is itself a save. A wipe in progress is deliberately not saved: a
  // half-swept board must not outlive a reload.
  if (!wasResting && resting) dirty = true;
  wasResting = resting;
  if (!resting || needsRender) { render(); needsRender = false; }
  if (dirty && !pointers.size && !wipe && !settling) save();
  requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', () => { if (document.hidden) { endWipe(false, false); cancelPointers(); save(); } });
window.addEventListener('pagehide', save);
window.addEventListener('blur', () => { cancelPointers(); endWipe(false, false); });

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
// --- Test mode --------------------------------------------------------------
// Read the problem in a dialog, solve it on the beads, submit. The numbers are
// hidden while solving, which is what the flash-card drill does and what keeps
// a ten-row column from covering the board it is worked out on.
const problemDialog = $('problem-dialog') as HTMLDialogElement;
const problemLinesBox = $('problem-lines');
const problemHeading = $('problem-heading');
const problemNote = $('problem-note');
const problemStep = $('problem-step');
const problemActions = $('problem-actions');

// What the tally shows, trailing zeros and all, and the number behind it for
// comparing against an answer. The verdict quotes the first, so it reads the
// same as the readout the learner is looking at.
const boardValue = () => formatValue(board.map(digit), ones);
const currentValue = () => Number(boardValue());

// Used by the problem dialog and by the sheet, each with its own action row.
function addAction(label: string, primary: boolean, run: () => void, into: HTMLElement = problemActions) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.className = primary ? 'primary' : '';
  button.onclick = run;
  into.appendChild(button);
}

// Tapping the line you are on marks it, and tapping it again clears the mark,
// so a mark is never something only some other control can undo. It is saved
// with the problem, which is the point: a long column outlives one glance.
function markPlace(row: number) {
  const rows = problemLines(test.problem!).length;
  test.step = test.step === row ? -1 : row;
  renderProblem();
  save();
  status(test.step < 0 ? 'Place cleared.' : `Line ${test.step + 1} of ${rows}.`);
}

function renderProblem() {
  const problem = test.problem;
  problemLinesBox.innerHTML = '';
  problemActions.innerHTML = '';
  if (!problem) return;
  const lines = problemLines(problem);
  const answered = test.verdict === 'right' || test.verdict === 'revealed';
  // A ten-row column needs smaller type or it will not fit a phone dialog.
  problemLinesBox.className = lines.length > 6 ? 'problem-lines wide' : 'problem-lines';
  // Keeping your place is only worth anything in a column: two numbers have no
  // middle to lose, which is why multiplying never offers it.
  const steppable = lines.length > 2;
  lines.forEach((line, i) => {
    // A button, so the line can be reached and read without a pointer.
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'line';
    row.textContent = line;
    if (!steppable) {
      row.tabIndex = -1;
    } else {
      row.classList.add('steppable');
      row.tabIndex = 0;
      row.setAttribute('aria-pressed', String(i === test.step));
      if (i === test.step) row.classList.add('marked');
      row.onclick = () => markPlace(i);
    }
    problemLinesBox.appendChild(row);
  });
  if (answered) {
    // The rule is the line you draw before writing a sum down, so it is only
    // drawn when the total is written under it. Nothing is written under it the
    // rest of the time, and a bare rule reads as a fault.
    const rule = document.createElement('div');
    rule.className = 'rule';
    problemLinesBox.appendChild(rule);
    const total = document.createElement('div');
    total.className = 'total';
    total.textContent = `= ${problem.answer}`;
    problemLinesBox.appendChild(total);
  }
  problemStep.hidden = !steppable || test.step < 0;
  problemStep.textContent = problemStep.hidden ? '' : `Line ${test.step + 1} of ${lines.length}`;
  const note = (text: string) => { problemNote.textContent = text; problemNote.hidden = !text; };
  if (test.verdict === 'right') {
    problemHeading.textContent = 'Correct';
    note('');
    addAction('Next problem', true, nextProblem);
  } else if (test.verdict === 'wrong') {
    problemHeading.textContent = 'Not quite';
    note(`Your board shows ${boardValue()}.`);
    addAction('Clear board', false, () => { problemDialog.close(); reset(); status('Board cleared. Same problem. Submit when it is right.'); });
    addAction('Keep board', false, () => { problemDialog.close(); status('Board kept. Adjust it and submit again.'); });
    addAction('Reveal answer', false, revealAnswer);
  } else if (test.verdict === 'revealed') {
    problemHeading.textContent = 'Answer';
    note('');
    addAction('Next problem', true, nextProblem);
  } else {
    problemHeading.textContent = 'Problem';
    note(`Read it, then close this and work it out on the beads.${steppable ? ' Tap the line you are on to keep your place.' : ''}`);
    addAction('Close', true, () => problemDialog.close());
  }
}

function newProblem() {
  test.problem = generate(test.ops, test.levels);
  test.verdict = 'none';
  test.step = -1;
  renderProblem();
  save();
}

function showProblem() {
  if (!test.problem) test.problem = generate(test.ops, test.levels);
  // Re-reading after a wrong answer keeps the Clear / Keep / Reveal choices,
  // so a second look cannot take the ways out away.
  if (test.verdict !== 'wrong') test.verdict = 'none';
  renderProblem();
  if (!problemDialog.open) problemDialog.showModal();
  status(`Problem: ${describeProblem(test.problem)}`);
}

function nextProblem() {
  newProblem();
  renderProblem();
  status(`Problem: ${describeProblem(test.problem!)}`);
}

function revealAnswer() {
  test.verdict = 'revealed';
  renderProblem();
  status(`The answer is ${test.problem!.answer}.`);
}

function submitAnswer() {
  if (!test.problem) return;
  const shown = currentValue();
  const right = shown === test.problem.answer;
  test.verdict = right ? 'right' : 'wrong';
  clickSound();
  renderProblem();
  if (!problemDialog.open) problemDialog.showModal();
  status(right ? 'Correct.' : `Not yet. Your board shows ${shown}.`);
  save();
}

function setTestMode(on: boolean) {
  test.on = on;
  if (on) {
    test.onesBefore = ones;
    // Normalize first, then freeze. Every test then has all six rods carrying
    // whole numbers, so a rung means the same thing for everyone.
    decimalFrozen = false;
    setOnes(TEST_ONES);
    decimalFrozen = true;
    lockDecimal();
    test.verdict = 'none';
    if (!test.problem) test.problem = generate(test.ops, test.levels);
  } else {
    decimalFrozen = false;
    if (problemDialog.open) problemDialog.close();
    setOnes(test.onesBefore);
  }
  applyTestUi();
  save();
}

function applyTestUi() {
  document.body.classList.toggle('testing', test.on);
  const mode = $('test-mode');
  mode.textContent = test.on ? 'On' : 'Off';
  mode.setAttribute('aria-pressed', String(test.on));
  ($('problem') as HTMLButtonElement).hidden = !test.on;
  ($('submit') as HTMLButtonElement).hidden = !test.on;
  ($('decimal-lock') as HTMLButtonElement).hidden = test.on;
  for (const [id, op] of [['op-add', 'add'], ['op-sub', 'sub'], ['op-mul', 'mul']] as Array<[string, Operation]>) {
    $(id).setAttribute('aria-pressed', String(test.ops.includes(op)));
  }
  // Before the rungs are filled there is nothing to select, which is why the
  // value is set only when the options exist.
  const moveSelect = $('move-level') as HTMLSelectElement;
  const mulSelect = $('mul-level') as HTMLSelectElement;
  if (moveSelect.options.length) moveSelect.value = String(test.levels.move);
  if (mulSelect.options.length) mulSelect.value = String(test.levels.mul);
  // Only the ladders actually in play are on offer.
  ($('move-level-row') as HTMLElement).hidden = !test.ops.some((op) => op !== 'mul');
  ($('mul-level-row') as HTMLElement).hidden = !test.ops.includes('mul');
}

function isProblem(value: unknown): value is Problem {
  const problem = value as Problem | null;
  return !!problem && ['add', 'sub', 'mul'].includes(problem.op) && Array.isArray(problem.operands)
    && problem.operands.length > 1 && problem.operands.every((n) => Number.isInteger(n) && n > 0 && n <= CAPACITY)
    && Number.isInteger(problem.answer) && problem.answer >= 0 && problem.answer <= CAPACITY;
}

function restoreTest(raw: unknown) {
  if (!raw || typeof raw !== 'object') return;
  const saved = raw as Partial<SavedTest>;
  const ops = Array.isArray(saved.ops) ? saved.ops.filter((op): op is Operation => op === 'add' || op === 'sub' || op === 'mul') : [];
  if (ops.length) test.ops = ops;
  const rungs = saved.levels;
  if (rungs) {
    if (rungIn(rungs.move, MOVE_STEP_COUNT)) test.levels.move = rungs.move;
    if (rungIn(rungs.mul, MUL_STEP_COUNT)) test.levels.mul = rungs.mul;
  }
  if (Number.isInteger(saved.onesBefore) && saved.onesBefore! >= 0 && saved.onesBefore! < COLUMNS) test.onesBefore = saved.onesBefore!;
  if (isProblem(saved.problem)) test.problem = saved.problem;
  const rows = test.problem?.operands.length ?? 0;
  if (Number.isInteger(saved.step) && saved.step! >= 0 && saved.step! < rows) test.step = saved.step!;
  if (!saved.on) return;
  test.on = true;
  decimalFrozen = true;
  ones = TEST_ONES;
  if (!test.problem) test.problem = generate(test.ops, test.levels);
  applyTestUi();
}

// Two ladders, because one is not a scale: adding and taking away is graded by
// the bead movement a step needs, and multiplying by the width of its operands.
function fillRungs(id: string, count: number, label: (rung: number) => string): HTMLSelectElement {
  const select = $(id) as HTMLSelectElement;
  for (let rung = 1; rung <= count; rung++) {
    const option = document.createElement('option');
    option.value = String(rung);
    option.textContent = label(rung);
    select.appendChild(option);
  }
  select.value = '1';
  return select;
}
const moveLevel = fillRungs('move-level', MOVE_STEP_COUNT, moveStepLabel);
const mulLevel = fillRungs('mul-level', MUL_STEP_COUNT, mulStepLabel);
moveLevel.onchange = () => { test.levels.move = Number(moveLevel.value); if (test.on) newProblem(); save(); };
mulLevel.onchange = () => { test.levels.mul = Number(mulLevel.value); if (test.on) newProblem(); save(); };
($('test-mode') as HTMLButtonElement).onclick = () => setTestMode(!test.on);
for (const [id, op] of [['op-add', 'add'], ['op-sub', 'sub'], ['op-mul', 'mul']] as Array<[string, Operation]>) {
  ($(id) as HTMLButtonElement).onclick = () => {
    const off = test.ops.includes(op);
    if (off && test.ops.length === 1) { status('Test mode needs at least one operation.'); return; }
    test.ops = off ? test.ops.filter((each) => each !== op) : [...test.ops, op];
    if (test.on) newProblem();
    applyTestUi();
    save();
  };
}
($('problem') as HTMLButtonElement).onclick = showProblem;
($('submit') as HTMLButtonElement).onclick = submitAnswer;
($('close-problem') as HTMLButtonElement).onclick = () => problemDialog.close();
applyTestUi();

const settings = $('settings-dialog') as HTMLDialogElement;
const welcome = $('welcome-dialog') as HTMLDialogElement;
$('settings').onclick = () => { lockDecimal(); cancelPointers(); endWipe(false, false); settings.showModal(); };
$('close-settings').onclick = () => settings.close();
$('show-welcome').onclick = () => { settings.close(); welcome.showModal(); };
$('start').onclick = () => welcome.close();
welcome.addEventListener('close', () => { try { localStorage.setItem('soroban-welcomed', '1'); } catch { /* Optional first-visit memory. */ } });
// --- Worksheet --------------------------------------------------------------
// A sheet of problems to work on a soroban of your own. Nothing here is graded
// and nothing touches the board: the whole point is that you are working
// somewhere else, which is why a sheet needs no test mode to be useful.
const sheetDialog = $('worksheet-dialog') as HTMLDialogElement;
const sheetLines = $('sheet-lines');
const sheetNote = $('sheet-note');
const sheetActions = $('sheet-actions');
// Which rungs a sheet was built from, so changing one gives a sheet to match
// rather than a stale one — and so opening Settings does not throw away a sheet
// you are part-way through.
const configKey = () => {
  const move = test.ops.some((op) => op !== 'mul');
  const mul = test.ops.includes('mul');
  // Only the rungs actually in play, so changing a ladder that is switched off
  // cannot discard a sheet its own settings did not change.
  return `${[...test.ops].sort().join('+')}|${move ? test.levels.move : ''}|${mul ? test.levels.mul : ''}`;
};
const rungNames = () => {
  const names: string[] = [];
  if (test.ops.some((op) => op !== 'mul')) names.push(moveStepLabel(test.levels.move));
  if (test.ops.includes('mul')) names.push(mulStepLabel(test.levels.mul));
  return names.join(' · ');
};

function newSheet() {
  sheet = { config: configKey(), problems: generateSet(test.ops, test.levels), revealed: [] };
  renderSheet();
  save();
}

// One tap checks one problem, and a second tap puts the answer away again, so a
// sheet is never something you cannot un-mark.
function toggleReveal(row: number) {
  const shown = sheet.revealed.includes(row);
  sheet.revealed = shown ? sheet.revealed.filter((each) => each !== row) : [...sheet.revealed, row];
  renderSheet();
  save();
  const answer = sheet.problems[row].answer;
  status(shown ? `Answer ${answer} hidden.` : `Problem ${row + 1} is ${answer}.`);
}

function renderSheet() {
  sheetLines.innerHTML = '';
  sheetActions.innerHTML = '';
  const count = sheet.problems.length;
  sheetNote.textContent = count ? `${count} problems at ${rungNames()}. Tap one to check it.` : '';
  sheet.problems.forEach((problem, row) => {
    const item = document.createElement('li');
    item.className = 'sheet-item';
    // Its own number, so the sheet reads as a numbered list on paper too.
    const index = document.createElement('span');
    index.className = 'sheet-index';
    index.setAttribute('aria-hidden', 'true');
    index.textContent = String(row + 1);
    // A button, so a problem can be reached and checked without a pointer.
    const body = document.createElement('button');
    body.type = 'button';
    body.className = 'sheet-problem';
    for (const line of problemLines(problem)) {
      const text = document.createElement('span');
      text.className = 'sheet-line';
      text.textContent = line;
      body.appendChild(text);
    }
    if (sheet.revealed.includes(row)) {
      const total = document.createElement('span');
      total.className = 'sheet-total';
      total.textContent = `= ${problem.answer}`;
      body.appendChild(total);
    }
    body.onclick = () => toggleReveal(row);
    item.append(index, body);
    sheetLines.appendChild(item);
  });
  if (count) {
    addAction('New sheet', true, newSheet, sheetActions);
    addAction('Print', false, () => window.print(), sheetActions);
  }
}

function openSheet() {
  if (sheet.config !== configKey() || !sheet.problems.length) newSheet();
  else renderSheet();
  settings.close();
  if (!sheetDialog.open) sheetDialog.showModal();
  status(`${sheet.problems.length} problems on the sheet.`);
}

function restoreSheet(raw: unknown) {
  if (!raw || typeof raw !== 'object') return;
  const saved = raw as Partial<SavedSheet>;
  if (typeof saved.config !== 'string' || !Array.isArray(saved.problems) || !saved.problems.length) return;
  if (!saved.problems.every(isProblem)) return;
  sheet.problems = saved.problems;
  sheet.config = saved.config;
  sheet.revealed = Array.isArray(saved.revealed)
    ? saved.revealed.filter((row) => Number.isInteger(row) && row >= 0 && row < saved.problems!.length)
    : [];
}

($('worksheet') as HTMLButtonElement).onclick = openSheet;
($('close-sheet') as HTMLButtonElement).onclick = () => sheetDialog.close();
for (const dialog of [settings, welcome, sheetDialog]) dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } });
try { if (!localStorage.getItem('soroban-welcomed')) welcome.showModal(); } catch { welcome.showModal(); }
labels(); render(); requestAnimationFrame(frame);
if ('serviceWorker' in navigator && import.meta.url.includes('/assets/')) navigator.serviceWorker.register('/sw.js').catch(() => {});
