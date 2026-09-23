// Practice-mode problems, and the bead-movement classifier they rest on.
//
// Test mode normalizes the decimal marker to the default ones column, which
// leaves four integer places and a ceiling of 9999. Every answer has to fit
// that, and a subtraction must never pass through a negative running total,
// because the board cannot show a negative number.
//
// Difficulty follows the classical soroban order rather than digit count:
// direct movements, then the 5-complements (Small Friends), then the
// 10-complements (Big Friends), then a carry onto a rod that needs both
// (Double Combination), then multi-row drills. Multiplication is the times
// table plus bookkeeping, so it tiers by operand width on the same levels.

export const PLACES = 4;
export const CAPACITY = 10 ** PLACES - 1; // 9999, with the decimal on the default ones column
export const TEST_ONES = 3;
export const MULTI_ROW = 10;

export type Operation = 'add' | 'sub' | 'mul';
export type Move = 'direct' | 'small' | 'big' | 'double';
export type Level = 1 | 2 | 3 | 4 | 5;
export type Problem = { op: Operation; operands: number[]; answer: number };
export type Beads = { up: 0 | 1; low: number };

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
 * it is not counted twice: on the single-digit levels this is exactly one move
 * per step, which is what the levels constrain.
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

/** The running total after each step, which subtraction must keep at zero or above. */
export function runningTotals(op: Operation, operands: number[]): number[] {
  return operands.map((_, i) => answerOf(op, operands.slice(0, i + 1)));
}

export function problemLines(problem: Problem): string[] {
  return problem.operands.map((n, i) => (i ? `${SIGN[problem.op]} ${n}` : String(n)));
}

export function describe(problem: Problem): string {
  return problemLines(problem).join(' ');
}

const REQUIRED: Record<Level, Move> = { 1: 'direct', 2: 'small', 3: 'big', 4: 'double', 5: 'direct' };
const ALLOWED: Record<Level, Move[]> = {
  1: ['direct'],
  2: ['direct', 'small'],
  3: ['direct', 'small', 'big'],
  4: ['direct', 'small', 'big', 'double'],
  5: ['direct', 'small', 'big', 'double'],
};

// Multiplication is bookkeeping on top of the times table, so each level is a
// wider pair of operands. 99 x 99 = 9801 is the last width that fits the board.
const MUL_WIDTH: Record<Level, { a: [number, number]; b: [number, number] }> = {
  1: { a: [2, 9], b: [2, 9] },
  2: { a: [2, 9], b: [10, 99] },
  3: { a: [2, 9], b: [100, 999] },
  4: { a: [10, 99], b: [10, 99] },
  5: { a: [20, 99], b: [20, 99] },
};

const LEVEL_NAMES: Record<Level, { move: string; multiply: string }> = {
  1: { move: 'direct', multiply: '1×1' },
  2: { move: 'small friends', multiply: '1×2' },
  3: { move: 'big friends', multiply: '1×3' },
  4: { move: 'double combination', multiply: '2×2' },
  5: { move: 'multi-row', multiply: '2×2 hard' },
};

export function levelLabel(level: Level): string {
  return `${level} · ${LEVEL_NAMES[level].move} · ${LEVEL_NAMES[level].multiply}`;
}

export const LEVELS: Level[] = [1, 2, 3, 4, 5];

const randInt = (rand: () => number, min: number, max: number): number => min + Math.floor(rand() * (max - min + 1));
const pick = <T>(rand: () => number, list: T[]): T => list[Math.min(list.length - 1, Math.floor(rand() * list.length))];

/** Addend options that keep every move inside the level, from a running total. */
function nextAddends(op: Operation, total: number, allowed: Move[]): number[] {
  const options: number[] = [];
  for (let a = 1; a <= 9; a++) {
    if (op === 'add' && total + a > CAPACITY) continue;
    if (op === 'sub' && total - a < 0) continue;
    const move = op === 'add' ? addMove(total % 10, a) : subMove(total % 10, a);
    if (allowed.includes(move)) options.push(a);
  }
  return options;
}

/** Fill a short drill out to `rows` steps while every move stays in the level. */
function extend(op: Operation, operands: number[], level: Level, rows: number, rand: () => number): number[] {
  const allowed = ALLOWED[level];
  let total = answerOf(op, operands);
  while (operands.length < rows) {
    const options = nextAddends(op, total, allowed);
    if (!options.length) break;
    const a = pick(rand, options);
    operands.push(a);
    total = op === 'add' ? total + a : total - a;
  }
  return operands;
}

// Single-digit drills, opened by the move the level is about. Levels 3 and 4 of
// subtraction cannot open this way: a borrow on a lone rod would go negative,
// so those start from a two-digit number and borrow into its tens.
function singleDigit(op: Operation, level: Level, rand: () => number): number[] {
  const required = REQUIRED[level];
  const pairs: Array<[number, number]> = [];
  for (let d = 1; d <= 9; d++) {
    for (let second = 1; second <= 9; second++) {
      if (op === 'add') {
        if (addMove(d, second) === required) pairs.push([d, second]);
      } else if (second <= d && subMove(d, second) === required) {
        pairs.push([d, second]);
      }
    }
  }
  const [first, second] = pick(rand, pairs);
  return extend(op, [first, second], level, 3, rand);
}

function subWithBorrow(level: Level, rand: () => number): number[] {
  const required = REQUIRED[level];
  const pairs: Array<[number, number]> = [];
  for (let tens = 1; tens <= 9; tens++) {
    for (let ones = 0; ones <= 9; ones++) {
      for (let s = ones + 1; s <= 9; s++) {
        if (subMove(ones, s) === required) pairs.push([tens * 10 + ones, s]);
      }
    }
  }
  const [start, s] = pick(rand, pairs);
  return extend('sub', [start, s], level, 3, rand);
}

// The classic exam column: ten numbers, one answer. Addends never exceed three
// digits so the total stays inside the board (10 x 999 = 9990), and a
// subtraction is built from its subtrahends so no step passes through zero.
function multiRow(op: Operation, rand: () => number): number[] {
  if (op === 'add') {
    const operands = [randInt(rand, 100, 999)];
    let total = operands[0];
    while (operands.length < MULTI_ROW) {
      const a = Math.min(randInt(rand, 1, 999), CAPACITY - total);
      if (a < 1) break;
      operands.push(a);
      total += a;
    }
    return operands;
  }
  const parts = Array.from({ length: MULTI_ROW - 1 }, () => randInt(rand, 1, 555));
  const sum = parts.reduce((a, b) => a + b, 0);
  return [Math.min(CAPACITY, sum + randInt(rand, 1, 999)), ...parts];
}

function operandsFor(op: Operation, level: Level, rand: () => number): number[] {
  if (op === 'mul') {
    const { a, b } = MUL_WIDTH[level];
    return [randInt(rand, a[0], a[1]), randInt(rand, b[0], b[1])];
  }
  if (level === 5) return multiRow(op, rand);
  if (op === 'sub' && (level === 3 || level === 4)) return subWithBorrow(level, rand);
  return singleDigit(op, level, rand);
}

// A problem is off the board if its answer leaves the four integer places, if a
// subtraction passes through a negative running total, or if its moves fall
// outside the level that was asked for. The multi-row drill is deliberately
// exempt from the move check: at ten rows every move turns up anyway.
function beyondBoard(problem: Problem, level: Level): boolean {
  if (problem.answer < 0 || problem.answer > CAPACITY) return true;
  if (problem.op === 'sub' && runningTotals('sub', problem.operands).some((t) => t < 0)) return true;
  if (problem.op === 'mul') return false;
  if (problem.operands.length >= MULTI_ROW) return false;
  const moves = movesFor(problem.op, problem.operands);
  if (!moves.length) return true;
  return moves.some((move) => !ALLOWED[level].includes(move)) || !moves.includes(REQUIRED[level]);
}

// Always legal whatever the board holds. Only reached if no attempt satisfies
// the level, which the builders above are written to make impossible.
const SIMPLEST: Record<Operation, Problem> = {
  add: { op: 'add', operands: [2, 3, 1], answer: 6 },
  sub: { op: 'sub', operands: [9, 4, 5], answer: 0 },
  mul: { op: 'mul', operands: [2, 3], answer: 6 },
};

export function generate(ops: Operation[], level: Level, rand: () => number = Math.random): Problem {
  const options = ops.length ? ops : (['add'] as Operation[]);
  for (let attempt = 0; attempt < 60; attempt++) {
    const op = pick(rand, options);
    const operands = operandsFor(op, level, rand);
    const problem: Problem = { op, operands, answer: answerOf(op, operands) };
    if (!beyondBoard(problem, level)) return problem;
  }
  // Before giving up, walk the same builders without randomness: a constant
  // fake random makes the pick deterministic rather than lucky.
  for (let seed = 1; seed <= 20; seed++) {
    const op = options[seed % options.length];
    const operands = operandsFor(op, level, () => (seed % 11) / 11);
    const problem: Problem = { op, operands, answer: answerOf(op, operands) };
    if (!beyondBoard(problem, level)) return problem;
  }
  return SIMPLEST[options[0]];
}
