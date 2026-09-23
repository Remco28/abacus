// Practice-mode problems, and the bead-movement classifier they rest on.
//
// Test mode puts the decimal marker on the last column and freezes it there, so
// the board spends nothing on fractions: six rods of whole numbers, ceiling
// 999999. Every answer has to fit that, and a subtraction must never pass
// through a negative running total, because the board cannot show one.
//
// Difficulty follows the classical soroban order rather than digit count:
// direct movements, then the 5-complements (Small Friends), then the
// 10-complements (Big Friends), then a carry onto a rod that needs both
// (Double Combination), then rows. Each rung below adds exactly one thing to
// the one before it, because skipping a rung is what strands a learner.

import { COLUMNS } from './model';

// The decimal sits on the last column while testing, so every rod carries a
// whole number and nothing is spent on fraction places.
export const PLACES = COLUMNS;
export const TEST_ONES = COLUMNS - 1;
export const CAPACITY = 10 ** PLACES - 1; // 999999, the most six rods can show
export const MULTI_ROW = 10;

export type Operation = 'add' | 'sub' | 'mul';
export type Move = 'direct' | 'small' | 'big' | 'double';
export type Problem = { op: Operation; operands: number[]; answer: number };
export type Beads = { up: 0 | 1; low: number };
/** Which rung of each ladder is selected. Both are 1-based. */
export type Levels = { move: number; mul: number };

export const SIGN: Record<Operation, string> = { add: '+', sub: '−', mul: '×' };

/** A rod's digit as the beads that show it. One digit, one bead state. */
export const beads = (digit: number): Beads => ({ up: digit >= 5 ? 1 : 0, low: digit % 5 });

/** Adding `a` by putting beads up, with none taken back. */
function canPlaceOnly(digit: number, a: number): boolean {
  if (digit + a > 9) return false;
  const { up, low } = beads(digit);
  return up + (a >= 5 ? 1 : 0) <= 1 && low + (a % 5) <= 4;
}

/** Subtracting `s` with removals only, with no bead put back. */
function canLiftOnly(digit: number, s: number): boolean {
  const { up, low } = beads(digit);
  if (s <= low) return true;
  return s >= 5 && up === 1 && low >= s - 5;
}

/**
 * The move that adding `a` to a rod showing `digit` requires.
 * `direct` is beads up and nothing else; `small` is the 5-complement, +5 with
 * beads taken back; `big` is the 10-complement, +10 with beads taken back on
 * this rod; `double` is a carry landing on a rod that then needs its own
 * 5-complement.
 */
export function addMove(digit: number, a: number): Move {
  if (digit + a <= 9) return canPlaceOnly(digit, a) ? 'direct' : 'small';
  return canLiftOnly(digit, 10 - a) ? 'big' : 'double';
}

/** The move that subtracting `s` from a rod showing `digit` requires. */
export function subMove(digit: number, s: number): Move {
  if (s <= digit && canLiftOnly(digit, s)) return 'direct';
  // Reached only with the heaven bead up and s below five, where the
  // 5-complement is exactly what is available.
  if (s <= digit) return 'small';
  return canPlaceOnly(digit, 10 - s) ? 'big' : 'double';
}

const digitsOf = (n: number): number[] => {
  const out: number[] = [];
  while (n > 0) {
    out.push(n % 10);
    n = Math.floor(n / 10);
  }
  return out.length ? out : [0];
};

/**
 * The moves a whole problem asks for, one per operand digit on the rod it
 * lands on. A carry or borrow travels as part of the move that caused it, so
 * it is not counted twice: on the single-digit rungs this is exactly one move
 * per step, which is what those rungs constrain.
 */
export function movesFor(op: Operation, operands: number[]): Move[] {
  if (op === 'mul' || operands.length < 2) return [];
  const rods = new Array(PLACES).fill(0);
  digitsOf(operands[0]).forEach((d, i) => {
    if (i < PLACES) rods[i] = d;
  });
  const carry = (from: number, delta: number) => {
    for (let p = from; p < PLACES && delta !== 0; p++) {
      const next = rods[p] + delta;
      if (next >= 0 && next <= 9) {
        rods[p] = next;
        return;
      }
      rods[p] = ((next % 10) + 10) % 10;
      delta = next < 0 ? -1 : Math.floor(next / 10);
    }
  };
  const moves: Move[] = [];
  for (let i = 1; i < operands.length; i++) {
    digitsOf(operands[i]).forEach((d, pos) => {
      if (pos >= PLACES) return;
      moves.push(op === 'add' ? addMove(rods[pos], d) : subMove(rods[pos], d));
      const value = op === 'add' ? rods[pos] + d : rods[pos] - d;
      rods[pos] = ((value % 10) + 10) % 10;
      if (value > 9) carry(pos + 1, 1);
      if (value < 0) carry(pos + 1, -1);
    });
  }
  return moves;
}

/** The number the board should show when the problem is finished. */
export function answerOf(op: Operation, operands: number[]): number {
  const rest = operands.slice(1).reduce((a, b) => a + b, 0);
  if (op === 'add') return operands[0] + rest;
  if (op === 'sub') return operands[0] - rest;
  return operands[0] * operands[1];
}

/**
 * The running total after each step. Only adding and taking away have steps, so
 * multiplication returns nothing rather than the NaN a partial product would be.
 */
export function runningTotals(op: Operation, operands: number[]): number[] {
  if (op === 'mul') return [];
  return operands.map((_, i) => answerOf(op, operands.slice(0, i + 1)));
}

export function problemLines(problem: Problem): string[] {
  return problem.operands.map((n, i) => (i ? `${SIGN[problem.op]} ${n}` : String(n)));
}

export function describe(problem: Problem): string {
  return problemLines(problem).join(' ');
}

/** One rung of a ladder: what it teaches, and how wide its problems run. */
export type Step = {
  name: string;
  /** The move every problem on this rung must contain, or null for "anything". */
  teaches: Move | null;
  /** Moves allowed anywhere in a problem on this rung. */
  allows: Move[];
  /** Operand width in digits, lowest to highest. */
  width: [number, number];
  /** How many numbers a problem has, lowest to highest. */
  rows: [number, number];
};

const ANY: Move[] = ['direct', 'small', 'big', 'double'];

// Adding and taking away. Each rung introduces one thing: a wider number on a
// rung already learned, then a new move, then more rows to hold your place in.
export const MOVE_STEPS: Step[] = [
  { name: 'direct, one digit', teaches: 'direct', allows: ['direct'], width: [1, 1], rows: [2, 2] },
  { name: 'direct, two digits', teaches: 'direct', allows: ['direct'], width: [2, 2], rows: [2, 2] },
  { name: 'small friends, one digit', teaches: 'small', allows: ['direct', 'small'], width: [1, 1], rows: [2, 3] },
  { name: 'small friends, two digits', teaches: 'small', allows: ['direct', 'small'], width: [2, 2], rows: [2, 3] },
  { name: 'big friends, one digit', teaches: 'big', allows: ['direct', 'small', 'big'], width: [1, 1], rows: [2, 3] },
  { name: 'big friends, two digits', teaches: 'big', allows: ['direct', 'small', 'big'], width: [2, 2], rows: [2, 3] },
  { name: 'double combination, one digit', teaches: 'double', allows: ANY, width: [1, 1], rows: [2, 3] },
  { name: 'double combination, two digits', teaches: 'double', allows: ANY, width: [2, 2], rows: [2, 3] },
  { name: 'mixed moves, five rows', teaches: null, allows: ANY, width: [2, 2], rows: [5, 5] },
  { name: 'ten rows, one to two digits', teaches: null, allows: ANY, width: [1, 2], rows: [MULTI_ROW, MULTI_ROW] },
  { name: 'ten rows, up to four digits', teaches: null, allows: ANY, width: [1, 4], rows: [MULTI_ROW, MULTI_ROW] },
];

// Multiplying is bookkeeping on top of the times table, so its ladder is
// operand width, and the multiplier's width is what adds partial products.
// 999 x 999 = 998001 is the widest that still fits the six rods.
export const MUL_STEPS: { name: string; factor: [number, number]; other: [number, number] }[] = [
  { name: '1 × 1', factor: [2, 9], other: [2, 9] },
  { name: '1 × 2', factor: [2, 9], other: [10, 99] },
  { name: '1 × 3', factor: [2, 9], other: [100, 999] },
  { name: '2 × 2', factor: [10, 99], other: [10, 99] },
  { name: '2 × 3', factor: [10, 99], other: [100, 999] },
  { name: '3 × 3', factor: [100, 999], other: [100, 999] },
];

export const MOVE_STEP_COUNT = MOVE_STEPS.length;
export const MUL_STEP_COUNT = MUL_STEPS.length;

function stepIndex(step: number, count: number): number {
  return Math.min(count, Math.max(1, Math.round(step) || 1)) - 1;
}

// The label names the rung that will actually be generated, so a rung number
// saved past the end of a ladder reads as the last rung rather than as itself.
const rungLabel = (step: number, count: number, names: { name: string }[]): string => {
  const rung = stepIndex(step, count) + 1;
  return `${rung} · ${names[rung - 1].name}`;
};
export const moveStepLabel = (step: number): string => rungLabel(step, MOVE_STEP_COUNT, MOVE_STEPS);
export const mulStepLabel = (step: number): string => rungLabel(step, MUL_STEP_COUNT, MUL_STEPS);

const randInt = (rand: () => number, min: number, max: number): number => min + Math.floor(rand() * (max - min + 1));
const pick = <T>(rand: () => number, list: T[]): T => list[Math.min(list.length - 1, Math.floor(rand() * list.length))];

/** Operands for one attempt at a rung, before it is checked. */
function attempt(op: Operation, step: Step, rand: () => number): number[] {
  const rows = randInt(rand, step.rows[0], step.rows[1]);
  const digits = randInt(rand, step.width[0], step.width[1]);
  const lo = 10 ** (digits - 1);
  const hi = 10 ** digits - 1;
  if (op === 'add') return Array.from({ length: rows }, () => randInt(rand, lo, hi));
  // Subtraction is built from its own subtrahends, so the opening number always
  // covers them and no step passes through zero. That makes it the widest thing
  // in the column, which is why it is not held to the rung's width.
  const parts = Array.from({ length: Math.max(1, rows - 1) }, () => randInt(rand, lo, hi));
  const sum = parts.reduce((a, b) => a + b, 0);
  return [Math.min(CAPACITY, sum + randInt(rand, 1, hi)), ...parts];
}

/** Whether a problem really belongs on the rung it was generated for. */
export function fitsStep(op: Operation, operands: number[], step: Step): boolean {
  const answer = answerOf(op, operands);
  if (answer <= 0 || answer > CAPACITY) return false;
  if (op === 'mul') return true; // its width is fixed by construction
  if (op === 'sub' && runningTotals('sub', operands).some((total) => total < 0)) return false;
  const moves = movesFor(op, operands);
  if (!moves.length) return false;
  if (step.teaches && !moves.includes(step.teaches)) return false;
  return moves.every((move) => step.allows.includes(move));
}

// Always legal whatever the board holds, one per skill, for the case where no
// attempt satisfies the rung. The builders above are written to make that
// impossible; this exists so a failure is a simple problem and not a crash.
const LAST_RESORT: Record<Operation, Record<string, number[]>> = {
  add: { direct: [2, 2], small: [4, 3], big: [8, 7], double: [6, 7], mixed: [23, 45, 16] },
  sub: { direct: [9, 4], small: [6, 2], big: [11, 2], double: [14, 6], mixed: [84, 23, 16] },
  mul: { mixed: [12, 12] },
};

function tryProblem(op: Operation, levels: Levels, rand: () => number): Problem | null {
  if (op === 'mul') {
    const spec = MUL_STEPS[stepIndex(levels.mul, MUL_STEP_COUNT)];
    const operands = [randInt(rand, spec.factor[0], spec.factor[1]), randInt(rand, spec.other[0], spec.other[1])];
    const answer = operands[0] * operands[1];
    return answer > 0 && answer <= CAPACITY ? { op, operands, answer } : null;
  }
  const step = MOVE_STEPS[stepIndex(levels.move, MOVE_STEP_COUNT)];
  const operands = attempt(op, step, rand);
  return fitsStep(op, operands, step) ? { op, operands, answer: answerOf(op, operands) } : null;
}

function lastResort(op: Operation, levels: Levels): Problem {
  if (op === 'mul') {
    const spec = MUL_STEPS[stepIndex(levels.mul, MUL_STEP_COUNT)];
    const operands = [Math.floor((spec.factor[0] + spec.factor[1]) / 2), Math.floor((spec.other[0] + spec.other[1]) / 2)];
    return { op, operands, answer: operands[0] * operands[1] };
  }
  const step = MOVE_STEPS[stepIndex(levels.move, MOVE_STEP_COUNT)];
  const operands = LAST_RESORT[op][step.teaches ?? 'mixed'];
  return { op, operands, answer: answerOf(op, operands) };
}

export function generate(ops: Operation[], levels: Levels, rand: () => number = Math.random): Problem {
  const options = ops.length ? ops : (['add'] as Operation[]);
  for (let tries = 0; tries < 80; tries++) {
    const problem = tryProblem(pick(rand, options), levels, rand);
    if (problem) return problem;
  }
  // Before giving up, walk the same builders without randomness: a constant
  // fake random makes the pick deterministic rather than lucky.
  for (let seed = 1; seed <= 30; seed++) {
    const problem = tryProblem(options[seed % options.length], levels, () => (seed % 13) / 13);
    if (problem) return problem;
  }
  return lastResort(options[0], levels);
}
