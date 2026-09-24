import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addMove, subMove, movesFor, answerOf, runningTotals, generate, generateSet, sheetSize, problemLines, describe, fitsStep,
  MOVE_STEPS, MUL_STEPS, DIV_STEPS, MOVE_STEP_COUNT, MUL_STEP_COUNT, DIV_STEP_COUNT, moveStepLabel, mulStepLabel, divStepLabel, fitsDivision,
  CAPACITY, MULTI_ROW, PLACES, TEST_ONES, SIGN, type Operation,
} from '../src/problems';

// A small deterministic generator, so a failing case can be reproduced by seed.
const seeded = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const digits = (n: number) => String(n).length;
const levels = (move: number, mul: number, div = 1) => ({ move, mul, div });

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
  assert.deepEqual(movesFor('mul', [12, 3]), []); // Multiplying is not a complement move.
});

test('answers and running totals come out of the operands', () => {
  assert.equal(answerOf('add', [8, 7, 4]), 19);
  assert.equal(answerOf('sub', [23, 7]), 16);
  assert.equal(answerOf('mul', [23, 47]), 1081);
  assert.equal(answerOf('div', [1081, 23]), 47);
  assert.equal(answerOf('div', [25, 4]), 6.25, 'the arithmetic helper can describe non-exact division too');
  assert.deepEqual(runningTotals('sub', [23, 7, 5]), [23, 16, 11]);
  // Only adding and taking away have steps, so a partial product is not a NaN.
  assert.deepEqual(runningTotals('mul', [23, 47]), []);
});

test('every rung of the adding and taking away ladder produces problems that belong on it', () => {
  for (let rung = 1; rung <= MOVE_STEP_COUNT; rung++) {
    const step = MOVE_STEPS[rung - 1];
    for (const op of ['add', 'sub'] as const) {
      for (let i = 0; i < 40; i++) {
        const problem = generate([op], levels(rung, 1), seeded(i * 31 + rung * 7 + op.charCodeAt(0)));
        assert.equal(problem.op, op);
        assert.equal(problem.answer, answerOf(op, problem.operands));
        assert.ok(problem.answer > 0 && problem.answer <= CAPACITY, `${describe(problem)} leaves the board`);
        assert.ok(fitsStep(op, problem.operands, step), `${describe(problem)} does not belong on ${step.name}`);
        const moves = movesFor(op, problem.operands);
        assert.ok(moves.length, `${describe(problem)} has no moves`);
        if (step.teaches) assert.ok(moves.includes(step.teaches), `${describe(problem)} never makes a ${step.teaches} move that ${step.name} teaches`);
        assert.ok(moves.every((move) => step.allows.includes(move)), `${describe(problem)} goes past what ${step.name} teaches`);
        assert.ok(problem.operands.length >= step.rows[0] && problem.operands.length <= step.rows[1], `${describe(problem)} has the wrong number of rows for ${step.name}`);
        if (step.rows[0] === MULTI_ROW) assert.equal(problem.operands.length, MULTI_ROW, `${describe(problem)} should be a full column`);
        // Subtrahends stay inside the rung's width; the number they are taken
        // from is wider by nature, because it has to cover them.
        const tail = op === 'sub' ? problem.operands.slice(1) : problem.operands;
        for (const n of tail) {
          assert.ok(digits(n) >= step.width[0] && digits(n) <= step.width[1], `${describe(problem)} is wider than ${step.name} allows`);
        }
        if (op === 'sub') {
          assert.ok(runningTotals('sub', problem.operands).every((total) => total >= 0), `${describe(problem)} goes below zero`);
        }
      }
    }
  }
});

test('every rung of the multiplying ladder uses the widths it names', () => {
  for (let rung = 1; rung <= MUL_STEP_COUNT; rung++) {
    const spec = MUL_STEPS[rung - 1];
    for (let i = 0; i < 40; i++) {
      const problem = generate(['mul'], levels(1, rung), seeded(i * 17 + rung));
      assert.equal(problem.op, 'mul');
      assert.equal(problem.answer, problem.operands[0] * problem.operands[1]);
      assert.ok(problem.answer > 0 && problem.answer <= CAPACITY, `${describe(problem)} leaves the board`);
      assert.ok(digits(problem.operands[0]) >= digits(spec.factor[0]) && digits(problem.operands[0]) <= digits(spec.factor[1]), `${describe(problem)} is the wrong shape for ${spec.name}`);
      assert.ok(digits(problem.operands[1]) >= digits(spec.other[0]) && digits(problem.operands[1]) <= digits(spec.other[1]), `${describe(problem)} is the wrong shape for ${spec.name}`);
    }
  }
});

test('exact division rungs generate whole quotients within the named ranges', () => {
  for (let rung = 1; rung <= DIV_STEP_COUNT; rung++) {
    const step = DIV_STEPS[rung - 1];
    for (let i = 0; i < 60; i++) {
      const problem = generate(['div'], levels(1, 1, rung), seeded(i * 43 + rung * 11));
      const [dividend, divisor] = problem.operands;
      assert.equal(problem.op, 'div');
      assert.equal(problem.answer, dividend / divisor);
      assert.ok(Number.isInteger(problem.answer), `${describe(problem)} should have a whole quotient`);
      assert.ok(dividend <= CAPACITY, `${describe(problem)} leaves the board`);
      assert.ok(fitsDivision(problem.operands, rung), `${describe(problem)} does not belong on ${step.name}`);
    }
  }
  assert.equal(fitsDivision([25, 4], 1), false, 'remainders are not introduced');
  assert.equal(fitsDivision([24, 4], 1), true);
  assert.equal(fitsDivision([999_999, 0], 1), false, 'zero cannot be a divisor');
  assert.equal(fitsDivision([999_999, 1000], 1), false, 'divisors cannot exceed board capacity');
  assert.equal(fitsDivision([998_001, 999], DIV_STEP_COUNT), true, 'large exact divisions fit the six-rod range');
  assert.match(divStepLabel(999), /three-digit divisors/, 'rungs clamp at the last division skill');
  for (const rung of [0, -3, 999]) {
    const problem = generate(['div'], levels(1, 1, rung), seeded(rung + 6));
    assert.ok(Number.isInteger(problem.answer) && problem.answer > 0 && problem.answer <= CAPACITY, describe(problem));
    assert.ok(fitsDivision(problem.operands, rung), `${describe(problem)} stays within the clamped division rung`);
  }
});

test('the top of each ladder is the hardest thing six rods hold', () => {
  assert.equal(TEST_ONES, PLACES - 1, 'no rod is spent on fractions while testing');
  assert.equal(CAPACITY, 999999, 'six rods of whole numbers');
  assert.equal(MOVE_STEPS[MOVE_STEP_COUNT - 1].rows[0], MULTI_ROW, 'the last rung is the exam column');
  assert.equal(MUL_STEPS[MUL_STEP_COUNT - 1].name.replace(/ /g, ''), '3×3', 'three digits by three digits is the top');
  assert.ok(999 * 999 <= CAPACITY, 'a three-digit product fits');
  assert.ok(1000 * 1000 > CAPACITY, 'but four digits do not');
});

test('generation stays inside the operations that were asked for', () => {
  const seen = new Set<Operation>();
  for (let i = 0; i < 90; i++) seen.add(generate(['add', 'mul', 'div'], levels(2, 2, 2), seeded(i + 99)).op);
  assert.deepEqual([...seen].sort(), ['add', 'div', 'mul']);
  const four = new Set<Operation>();
  for (let i = 0; i < 140; i++) four.add(generate(['add', 'sub', 'mul', 'div'], levels(2, 2, 2), seeded(i + 500)).op);
  assert.deepEqual([...four].sort(), ['add', 'div', 'mul', 'sub']);
  assert.equal(generate([], levels(1, 1), seeded(1)).op, 'add'); // No selection still gives a problem.
});

test('an out-of-range rung falls back to one that exists', () => {
  for (const rung of [0, -3, 999]) {
    const problem = generate(['add'], levels(rung, rung), seeded(rung + 5));
    assert.ok(problem.answer > 0 && problem.answer <= CAPACITY, describe(problem));
  }
  assert.match(moveStepLabel(999), /ten rows/, 'a rung number past the end means the last one');
  assert.match(mulStepLabel(0), /^1 · 1 × 1$/, 'and below the start means the first');
  assert.match(divStepLabel(0), /^1 · one-digit groups$/, 'division also clamps to its first rung');
});

test('a sheet never repeats a problem and stays on its rung', () => {
  for (let rung = 1; rung <= MOVE_STEP_COUNT; rung++) {
    for (const op of ['add', 'sub'] as const) {
      const step = MOVE_STEPS[rung - 1];
      const sheet = generateSet([op], levels(rung, 1), seeded(rung * 977 + op.charCodeAt(0)));
      assert.ok(sheet.length > 0, `${step.name} produced an empty sheet`);
      assert.ok(sheet.length <= sheetSize([op], levels(rung, 1)), `${step.name} overfilled its sheet`);
      assert.equal(new Set(sheet.map(describe)).size, sheet.length, `${step.name} wrote the same problem twice`);
      for (const problem of sheet) {
        assert.equal(problem.op, op);
        assert.ok(fitsStep(op, problem.operands, step), `${describe(problem)} does not belong on ${step.name}`);
      }
    }
  }
  for (let rung = 1; rung <= DIV_STEP_COUNT; rung++) {
    const sheet = generateSet(['div'], levels(1, 1, rung), seeded(rung * 251));
    assert.ok(sheet.length > 0, `${DIV_STEPS[rung - 1].name} produced an empty sheet`);
    assert.equal(new Set(sheet.map(describe)).size, sheet.length, `${DIV_STEPS[rung - 1].name} wrote the same problem twice`);
    for (const problem of sheet) {
      assert.equal(problem.op, 'div');
      assert.ok(fitsDivision(problem.operands, rung), `${describe(problem)} does not belong on ${DIV_STEPS[rung - 1].name}`);
    }
  }
  for (let rung = 1; rung <= MUL_STEP_COUNT; rung++) {
    const spec = MUL_STEPS[rung - 1];
    const sheet = generateSet(['mul'], levels(1, rung), seeded(rung * 131));
    assert.ok(sheet.length > 0, `${spec.name} produced an empty sheet`);
    assert.equal(new Set(sheet.map(describe)).size, sheet.length, `${spec.name} wrote the same problem twice`);
    for (const problem of sheet) {
      assert.equal(problem.op, 'mul');
      assert.equal(problem.answer, problem.operands[0] * problem.operands[1]);
    }
  }
});

test('a sheet is sized to its rung, and the tightest rung just comes up short', () => {
  // Rung one is the smallest space on either ladder. Even there a sheet must
  // fill without repeating, which is the whole reason it asks for so few.
  const tightest = sheetSize(['add'], levels(1, 1));
  assert.ok(tightest >= 5, `the smallest sheet is still worth printing: ${tightest}`);
  const sheet = generateSet(['add'], levels(1, 1), seeded(7));
  assert.equal(sheet.length, tightest, 'the tightest rung fills its own sheet');
  assert.equal(new Set(sheet.map(describe)).size, sheet.length, 'and still does not repeat');
  // The bottom of a ladder asks for less than the top, on both ladders.
  assert.ok(sheetSize(['add'], levels(MOVE_STEP_COUNT, 1)) > tightest, 'the exam rungs ask for a longer sheet');
  assert.ok(sheetSize(['mul'], levels(1, MUL_STEP_COUNT)) > sheetSize(['mul'], levels(1, 1)), 'multiplying widens the same way');
});

test('a mixed sheet is only as long as its shortest rung can fill', () => {
  const both = sheetSize(['add', 'mul'], levels(MOVE_STEP_COUNT, MUL_STEP_COUNT));
  assert.equal(both, Math.min(MOVE_STEPS[MOVE_STEP_COUNT - 1].sheet, MUL_STEPS[MUL_STEP_COUNT - 1].sheet), 'the tightest rung decides');
  assert.equal(sheetSize(['div'], levels(1, 1, DIV_STEP_COUNT)), DIV_STEPS[DIV_STEP_COUNT - 1].sheet, 'division sheets follow their own rung size');
  const divisionSheet = generateSet(['div'], levels(1, 1, 1), seeded(78));
  assert.ok(divisionSheet.every((problem) => problem.op === 'div' && problem.operands[0] / problem.operands[1] === problem.answer), 'division sheets contain exact divisions');
  assert.equal(sheetSize([], levels(1, 1)), MOVE_STEPS[0].sheet, 'no selection still asks for a sheet');
  const sheet = generateSet(['add', 'mul'], levels(2, 1), seeded(3));
  assert.ok(sheet.every((problem) => problem.op === 'add' || problem.op === 'mul'), 'a mixed sheet draws from what was chosen');
  const withDivision = generateSet(['add', 'div'], levels(1, 1, 1), seeded(42));
  assert.ok(withDivision.every((problem) => problem.op === 'add' || problem.op === 'div'), 'mixed division sheets draw only selected operations');
  assert.ok(withDivision.filter((problem) => problem.op === 'div').every((problem) => problem.operands[0] / problem.operands[1] === problem.answer), 'mixed sheets preserve exact quotients');
});

test('a problem reads like the written column', () => {
  const add = { op: 'add' as const, operands: [847, 296, 61], answer: 1204 };
  const sub = { op: 'sub' as const, operands: [23, 7], answer: 16 };
  const div = { op: 'div' as const, operands: [24, 4], answer: 6 };
  assert.deepEqual(problemLines(add), ['847', `${SIGN.add} 296`, `${SIGN.add} 61`]);
  assert.deepEqual(problemLines(sub), ['23', `${SIGN.sub} 7`]);
  assert.deepEqual(problemLines(div), ['24', `${SIGN.div} 4`]);
  assert.equal(describe(sub), `23 ${SIGN.sub} 7`);
});

test('every rung of both ladders has a label', () => {
  for (let rung = 1; rung <= MOVE_STEP_COUNT; rung++) {
    assert.ok(moveStepLabel(rung).includes(MOVE_STEPS[rung - 1].name), moveStepLabel(rung));
  }
  for (let rung = 1; rung <= MUL_STEP_COUNT; rung++) {
    assert.ok(mulStepLabel(rung).includes(MUL_STEPS[rung - 1].name), mulStepLabel(rung));
  }
  for (let rung = 1; rung <= DIV_STEP_COUNT; rung++) {
    assert.ok(divStepLabel(rung).includes(DIV_STEPS[rung - 1].name), divStepLabel(rung));
  }
});
