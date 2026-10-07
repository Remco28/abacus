import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clack, pitchSalience, ringTime } from '../src/clack.ts';

const RATE = 48000;
// A sound that keeps repeating at one period is heard as a note. The first
// synthesized clicks did exactly that (salience about 0.85, ringing for 45 to
// 70 ms) and sounded like a xylophone rather than beads, so these hold the line.
for (const kind of ['bead', 'bar'] as const) {
  test(`a ${kind} contact is a click, not a note`, () => {
    for (let take = 0; take < 6; take++) {
      const samples = clack(kind, RATE);
      assert.ok(samples.every(Number.isFinite), 'every sample is a number');
      assert.ok(Math.max(...samples.map(Math.abs)) <= 1.0001, 'normalized to a peak of 1');
      const salience = pitchSalience(samples, RATE);
      assert.ok(salience < .4, `no audible pitch (salience ${salience.toFixed(2)})`);
      const ring = ringTime(samples, RATE);
      assert.ok(ring < (kind === 'bar' ? 25 : 12), `dies away quickly (${ring.toFixed(1)} ms)`);
    }
  });
}

test('the measure itself hears a pitch when there is one', () => {
  const tone = Float32Array.from({ length: RATE * .03 }, (_, i) => Math.exp(-i / RATE / .011) * Math.sin(2 * Math.PI * 2350 * i / RATE));
  assert.ok(pitchSalience(tone, RATE) > .7, 'a ringing 2350 Hz tone reads as pitched');
});
