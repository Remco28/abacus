// The sound of a bead meeting something, built as raw samples.
//
// A bead click is not a note. Two hard beads meeting make a very short,
// broadband crack with no pitch you could hum, and the bar or the frame adds a
// duller knock underneath. What makes a click sound like a xylophone instead is
// ringing: any resonance that lasts more than a few of its own cycles is heard
// as a pitch. So every component here is shaped noise or a sub-cycle thump, and
// nothing is allowed to ring — every band dies away within a few
// milliseconds.

export type Contact = 'bead' | 'bar';

/** One band of filtered noise: centre frequency, width, loudness, decay time. */
type Band = { f: number; q: number; gain: number; decay: number };
type Voice = { length: number; bands: Band[]; thump: number; second: number };

export const VOICES: Record<Contact, Voice> = {
  // Bead on bead: a bright, dry crack, plus the faint second tick of the bead
  // it struck, a fraction of a millisecond later.
  bead: { length: .025, bands: [{ f: 3400, q: .9, gain: 1, decay: .0016 }, { f: 7000, q: 1.2, gain: .6, decay: .0012 }], thump: 0, second: .45 },
  // Bead on bar or frame: lower and woodier, with a soft thud from the heavier
  // body it hit. The thud fades within one of its own cycles, so it adds
  // weight without adding a note.
  bar: { length: .04, bands: [{ f: 1100, q: .7, gain: 1, decay: .0025 }, { f: 2800, q: .9, gain: .7, decay: .0015 }], thump: .45, second: 0 },
};

/** A second-order band-pass (RBJ cookbook, constant 0 dB peak). */
function bandPass(input: Float32Array, rate: number, f: number, q: number): Float32Array {
  const w = 2 * Math.PI * f / rate, alpha = Math.sin(w) / (2 * q), cos = Math.cos(w), a0 = 1 + alpha;
  const b0 = alpha / a0, b2 = -alpha / a0, a1 = -2 * cos / a0, a2 = (1 - alpha) / a0;
  const out = new Float32Array(input.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x = input[i], y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y; out[i] = y;
  }
  return out;
}

/** An impact envelope: a 0.15 ms rise, then exponential decay. */
const strike = (t: number, decay: number) => t < 0 ? 0 : Math.min(1, t / .00015) * Math.exp(-t / decay);

/** One take of a contact, normalized to a peak of 1. `rand` makes each take its own. */
export function clack(kind: Contact, rate: number, rand: () => number = Math.random): Float32Array {
  const voice = VOICES[kind];
  const n = Math.ceil(rate * voice.length);
  const out = new Float32Array(n);
  const noise = Float32Array.from({ length: n }, () => rand() * 2 - 1);
  const second = .0008 + rand() * .0008;
  for (const band of voice.bands) {
    const excited = noise.map((v, i) => {
      const t = i / rate;
      return v * (strike(t, band.decay) + voice.second * strike(t - second, band.decay * .75));
    });
    const shaped = bandPass(excited, rate, band.f * (.93 + rand() * .14), band.q);
    for (let i = 0; i < n; i++) out[i] += band.gain * shaped[i];
  }
  if (voice.thump) for (let i = 0; i < n; i++) {
    const t = i / rate;
    out[i] += voice.thump * Math.min(1, t / .0005) * Math.exp(-t / .004) * Math.sin(2 * Math.PI * 140 * t);
  }
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  for (let i = 0; i < n; i++) out[i] /= peak || 1;
  return out;
}

/**
 * How strongly a sound repeats at one period between 0.15 and 6 ms — the range
 * where a repeat is heard as a pitch. Near 1 is a note; a click should be low.
 */
export function pitchSalience(samples: Float32Array, rate: number): number {
  let energy = 0;
  for (const v of samples) energy += v * v;
  const at = (lag: number) => {
    let sum = 0;
    for (let i = lag; i < samples.length; i++) sum += samples[i] * samples[i - lag];
    return sum / energy;
  };
  // Any sound looks like itself a moment later, so only a return after the
  // correlation has first fallen away counts as a repeat.
  let lag = 1;
  while (lag < rate * .006 && at(lag) > 0) lag++;
  let best = 0;
  for (lag = Math.max(lag, Math.floor(rate * .00015)); lag <= Math.ceil(rate * .006); lag++) best = Math.max(best, at(lag));
  return best;
}

/** Milliseconds until the sound has fallen below 1% of its peak for good. */
export function ringTime(samples: Float32Array, rate: number): number {
  for (let i = samples.length - 1; i >= 0; i--) if (Math.abs(samples[i]) > .01) return i / rate * 1000;
  return 0;
}
