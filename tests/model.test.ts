import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBoard, digit, formatValue, moveBead, step, SIZE, LOWER, UPPER, ShakeDetector } from '../src/model';

test('all ten soroban digits count only contiguous beads against the bar', () => {
  for (let n = 0; n <= 9; n++) {
    const c = createBoard()[0];
    if (n >= 5) c.upper[0].y = UPPER.max;
    for (let i = 0; i < n % 5; i++) c.lower[i].y = LOWER.min + i * SIZE;
    assert.equal(digit(c), n);
  }
  const c = createBoard()[0]; c.lower[1].y = LOWER.min + SIZE;
  assert.equal(digit(c), 0);
});
test('moving one bead pushes neighbors without crossing or leaving the frame', () => {
  const { lower } = createBoard()[0];
  moveBead(lower, 3, -100, LOWER.min, LOWER.max);
  assert.deepEqual(lower.map(b => b.y), [168, 204, 240, 276]);
  moveBead(lower, 0, 900, LOWER.min, LOWER.max);
  assert.deepEqual(lower.map(b => b.y), [246, 282, 318, 354]);
});
test('collisions transfer velocity and dissipate energy; beads settle without overlap', () => {
  const { lower } = createBoard()[0];
  lower[0].y = 180; lower[0].v = 380;
  lower[1].y = 218; lower[2].y = 260; lower[3].y = 306;
  let transferred = false;
  for (let i = 0; i < 600; i++) {
    step(lower, LOWER.min, LOWER.max, 1 / 120);
    transferred ||= lower[1].v > 0;
    lower.forEach((b, j) => { assert.ok(b.y >= LOWER.min - .01 && b.y <= LOWER.max + .01); if (j) assert.ok(b.y - lower[j - 1].y >= SIZE - .01); });
  }
  assert.ok(transferred);
  assert.ok(lower.every(b => b.v === 0));
});
test('decimal placement uses exact digit strings, including small fractions', () => {
  assert.equal(formatValue([0, 1, 2, 3, 4, 5], 3), '123.45');
  assert.equal(formatValue([0, 0, 0, 0, 0, 1], 0), '0.00001');
  assert.equal(formatValue([9, 9, 9, 9, 9, 9], 5), '999999');
});
test('shake requires distinct peaks in a two second window, then applies cooldown', () => {
  const d = new ShakeDetector();
  assert.equal(d.sample(20, 0), false);
  assert.equal(d.sample(20, 300), false); // Sustained acceleration is one peak.
  d.sample(0, 400);
  assert.equal(d.sample(20, 600), false);
  d.sample(0, 700);
  assert.equal(d.sample(20, 1000), true);
  d.sample(0, 1100);
  assert.equal(d.sample(20, 1300), false);
  const slow = new ShakeDetector();
  for (const t of [0, 1500, 3000]) { slow.sample(0, t); assert.equal(slow.sample(20, t), false); }
});
