import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addMove, subMove, movesFor, answerOf, runningTotals, generate, problemLines, describe, levelLabel,
  CAPACITY, MULTI_ROW, LEVELS, SIGN, type Level, type Move, type Operation, type Problem,
} from '../src/problems';

// A small deterministic generator, so a failing case can be reproduced by seed.
const seeded = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

const REQUIRED: Record<number, Move> = { 1: 'direct', 2: 'small', 3: 'big', 4: 'double' };

test('the classifier names the documented complement moves', () => {
  assert.equal(addMove(2, 2), 'direct'); // The beads are simply there.
  assert.equal(addMove(5, 2), 'direct');
  assert.equal(addMove(4, 3), 'small'); // 4 + 3 = -2 + 5
  assert.equal(addMove(8, 7), 'big'); // 8 + 7 = -3 + 10
  assert.equal(addMove(6, 7), 'double'); // +1 -5 +10
  assert.equal(subMove(9, 4), 'direct');
  assert.equal(subMove(6, 2), 'small'); // -2 = +3 - 5
  assert.equal(subMove(1, 2), 'big'); // Borrow ten, place eight.
  assert.equal(subMove(4, 6), 'double');
});

test('a whole problem resolves to the moves its steps need', () => {
  assert.deepEqual(movesFor('add', [4, 3]), ['small']);
  assert.deepEqual(movesFor('add', [8, 7]), ['big']);
  assert.deepEqual(movesFor('add', [6, 7]), ['double']);
  assert.deepEqual(movesFor('add', [2, 2, 3]), ['direct', 'small']);
  assert.deepEqual(movesFor('sub', [6, 2]), ['small']);
  assert.deepEqual(movesFor('sub', [11, 2]), ['big']);
  assert.deepEqual(movesFor('mul', [12, 3]), []); // Multiplication is not a complement move.
});

test('answers and running totals come out of the operands', () => {
  assert.equal(answerOf('add', [8, 7, 4]), 19);
  assert.equal(answerOf('sub', [23, 7]), 16);
  assert.equal(answerOf('mul', [23, 47]), 1081);
  assert.deepEqual(runningTotals('sub', [23, 7, 5]), [23, 16, 11]);
});

test('every level generates problems that use the move it teaches', () => {
  for (const level of LEVELS) {
    for (const op of ['add', 'sub'] as const) {
      for (let i = 0; i < 60; i++) {
        const problem = generate([op], level, seeded(i * 7 + level * 13 + op.charCodeAt(0)));
        assert.ok(problem.answer >= 0 && problem.answer <= CAPACITY, `${describe(problem)} leaves the board`);
        assert.ok(problem.operands.every((n) => Number.isInteger(n) && n > 0));
        assert.ok(problem.operands.length <= MULTI_ROW);
        if (level === 5) continue; // Every move is allowed at ten rows.
        const moves = movesFor(problem.op, problem.operands);
        assert.ok(moves.length, `${describe(problem)} has no moves`);
        assert.ok(moves.includes(REQUIRED[level]), `${describe(problem)} at level ${level} never makes a ${REQUIRED[level]} move`);
        assert.ok(moves.every((m) => m !== 'double' || level === 4), `${describe(problem)} at level ${level} goes past what the level teaches`);
      }
    }
  }
});

test('subtraction never passes through a negative running total', () => {
  for (const level of LEVELS) {
    for (let i = 0; i < 60; i++) {
      const problem = generate(['sub'], level, seeded(i + level * 101));
      assert.ok(runningTotals('sub', problem.operands).every((t) => t >= 0), `${describe(problem)} goes below zero`);
      assert.ok(problem.answer <= CAPACITY);
    }
  }
});

test('the multi-row drill is ten rows that still fit the board', () => {
  for (const op of ['add', 'sub'] as const) {
    for (let i = 0; i < 40; i++) {
      const problem = generate([op], 5, seeded(i + op.charCodeAt(0)));
      assert.equal(problem.operands.length, MULTI_ROW);
      // A subtraction is built from its own subtrahends, so its opening number
      // is the widest thing in the column and can reach four digits. What has
      // to hold is that no operand and no running total leaves the board.
      assert.ok(problem.operands.every((n) => n > 0 && n <= CAPACITY), describe(problem));
      assert.ok(runningTotals(op, problem.operands).every((t) => t >= 0 && t <= CAPACITY), describe(problem));
    }
  }
});

test('multiplication tiers by operand width and stays inside the board', () => {
  const width = (n: number) => String(n).length;
  for (const level of LEVELS) {
    for (let i = 0; i < 60; i++) {
      const problem = generate(['mul'], level, seeded(i * 3 + level));
      assert.equal(problem.op, 'mul');
      assert.equal(problem.answer, problem.operands[0] * problem.operands[1]);
      assert.ok(problem.answer > 0 && problem.answer <= CAPACITY, `${describe(problem)} leaves the board`);
      const [a, b] = problem.operands.map(width);
      if (level === 1) assert.deepEqual([a, b], [1, 1]);
      if (level === 2) assert.deepEqual([a, b], [1, 2]);
      if (level === 3) assert.deepEqual([a, b], [1, 3]);
      if (level === 4) assert.deepEqual([a, b], [2, 2]);
      if (level === 5) assert.ok(problem.operands.every((n) => n >= 20), describe(problem));
    }
  }
});

test('generation stays inside the operations that were asked for', () => {
  const seen = new Set<Operation>();
  for (let i = 0; i < 60; i++) seen.add(generate(['add', 'mul'], 2, seeded(i + 99)).op);
  assert.deepEqual([...seen].sort(), ['add', 'mul']);
  assert.equal(generate([], 1, seeded(1)).op, 'add'); // No selection still gives a problem.
});

test('a problem reads like the written column', () => {
  const add: Problem = { op: 'add', operands: [847, 296, 61], answer: 1204 };
  const sub: Problem = { op: 'sub', operands: [23, 7], answer: 16 };
  assert.deepEqual(problemLines(add), ['847', `${SIGN.add} 296`, `${SIGN.add} 61`]);
  assert.deepEqual(problemLines(sub), ['23', `${SIGN.sub} 7`]);
  assert.equal(describe(sub), `23 ${SIGN.sub} 7`);
});

test('every level names the skill it teaches', () => {
  const names: Record<Level, string> = { 1: 'direct', 2: 'small friends', 3: 'big friends', 4: 'double combination', 5: 'multi-row' };
  for (const level of LEVELS) assert.ok(levelLabel(level).includes(names[level]), levelLabel(level));
});
