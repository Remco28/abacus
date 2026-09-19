export const COLUMNS = 6;
export const SIZE = 36;
export const UPPER = { min: 28, max: 100 };
export const LOWER = { min: 168, max: 354 };
export type Bead = { y: number; v: number; held: boolean };
export type Column = { upper: Bead[]; lower: Bead[] };
const bead = (y: number): Bead => ({ y, v: 0, held: false });
export function createBoard(): Column[] {
  return Array.from({ length: COLUMNS }, () => ({ upper: [bead(UPPER.min)], lower: Array.from({ length: 4 }, (_, i) => bead(LOWER.max - (3 - i) * SIZE)) }));
}
export function digit(c: Column): number {
  let n = Math.abs(c.upper[0].y - UPPER.max) < 5 ? 5 : 0;
  for (let i = 0; i < 4; i++) {
    if (Math.abs(c.lower[i].y - (LOWER.min + i * SIZE)) < 5) n++;
    else break;
  }
  return n;
}
export function formatValue(digits: number[], ones: number): string {
  const whole = digits.slice(0, ones + 1).join('').replace(/^0+(?=\d)/, '');
  const fraction = digits.slice(ones + 1).join('');
  return whole + (fraction ? '.' + fraction : '');
}
export function placeName(exponent: number): string {
  return ({ '-5': 'Hundred-thousandths', '-4': 'Ten-thousandths', '-3': 'Thousandths', '-2': 'Hundredths', '-1': 'Tenths', '0': 'Ones', '1': 'Tens', '2': 'Hundreds', '3': 'Thousands', '4': 'Ten thousands', '5': 'Hundred thousands' } as Record<string, string>)[exponent];
}
// Equal-mass, one-dimensional rigid bodies. Constraints keep beads on their rods.
// Repeated projection handles stacks; low restitution and drag dissipate energy.
export function step(beads: Bead[], min: number, max: number, dt: number): number {
  let impact = 0;
  for (const b of beads) {
    if (b.held) continue;
    b.v *= Math.exp(-16 * dt);
    if (Math.abs(b.v) < 1) b.v = 0;
    b.y += b.v * dt;
  }
  for (let pass = 0; pass < 16; pass++) {
    for (const b of beads) {
      if (b.y < min || b.y > max) {
        impact = Math.max(impact, Math.abs(b.v));
        b.y = Math.max(min, Math.min(max, b.y));
        b.v *= -0.04;
      }
    }
    for (let i = 1; i < beads.length; i++) {
      const a = beads[i - 1], b = beads[i];
      const overlap = SIZE - (b.y - a.y);
      if (overlap <= 0) continue;
      const wa = a.held ? 0 : 1, wb = b.held ? 0 : 1;
      if (wa + wb === 0) { b.y = a.y + SIZE; continue; }
      a.y -= overlap * wa / (wa + wb);
      b.y += overlap * wb / (wa + wb);
      const relative = a.v - b.v;
      if (relative > 0) {
        impact = Math.max(impact, relative);
        const impulse = relative * 1.04 / (wa + wb);
        a.v -= impulse * wa;
        b.v += impulse * wb;
      }
    }
  }
  return impact;
}
export function moveBead(beads: Bead[], index: number, y: number, min: number, max: number) {
  // A dragged bead pushes its contiguous neighbors instead of crossing them.
  beads[index].y = Math.max(min + index * SIZE, Math.min(max - (beads.length - 1 - index) * SIZE, y));
  for (let i = index - 1; i >= 0; i--) beads[i].y = Math.min(beads[i].y, beads[i + 1].y - SIZE);
  for (let i = index + 1; i < beads.length; i++) beads[i].y = Math.max(beads[i].y, beads[i - 1].y + SIZE);
}
export class ShakeDetector {
  peaks: number[] = [];
  armed = true;
  cooldownUntil = 0;
  last = -Infinity;
  sample(magnitude: number, now: number): boolean {
    if (magnitude < 8) this.armed = true;
    if (now < this.cooldownUntil || magnitude < 16 || !this.armed || now - this.last < 180) return false;
    this.armed = false;
    this.last = now;
    this.peaks = this.peaks.filter(t => now - t <= 2000);
    this.peaks.push(now);
    if (this.peaks.length < 3) return false;
    this.peaks = [];
    this.cooldownUntil = now + 1800;
    return true;
  }
}
