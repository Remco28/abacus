// Practice mode, driven through the real UI so that every assertion is something
// a learner could actually do. Same CDP shape as browser.mjs. Storage is never
// seeded: the running app saves on pagehide, which overwrites anything written
// before a reload, and injecting at document-start did not fire reliably.
// Run against a browser started by agent-browser:
// node tests/browser-testmode.mjs <CDP HTTP endpoint> [app URL]
import assert from 'node:assert/strict';
const endpoint = process.argv[2] || 'http://127.0.0.1:9222';
const appUrl = process.argv[3];
const pages = await (await fetch(endpoint + '/json/list')).json();
const page = pages.find((p) => p.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));
let id = 0;
const pending = new Map();
const errors = [];
ws.addEventListener('message', ({ data }) => {
  const msg = JSON.parse(data);
  if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails);
  if (msg.id) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(msg.error) : p.resolve(msg.result); }
});
const send = (method, params = {}) => new Promise((resolve, reject) => { pending.set(++id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const text = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)}).textContent`);
const shown = (selector) => evaluate(`!document.querySelector(${JSON.stringify(selector)}).hidden`);
const click = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
const action = (label) => evaluate(`[...document.querySelectorAll("#problem-actions button")].find(b=>b.textContent===${JSON.stringify(label)}).click()`);
const lines = () => evaluate('[...document.querySelectorAll("#problem-lines .line")].map(d=>d.textContent)');

try {
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Page.navigate', { url: appUrl });
  await pause(900);
  await evaluate('document.querySelector("#welcome-dialog").open && document.querySelector("#start").click()');
  await pause(200);

  // Move the decimal off the default first, so normalize-and-restore is visible.
  await click('#decimal-lock');
  await evaluate('document.querySelector("#decimal").focus()');
  for (let i = 0; i < 1; i++) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  }
  assert.equal(await evaluate('document.querySelector("#decimal").value'), '4', 'free play can move the decimal');
  assert.equal(await text('#value'), '0.0', 'the tally follows the decimal in free play');

  // Configure before enabling, which is the order the settings allow.
  await click('#settings');
  assert.equal(await evaluate('document.querySelector("#move-level").options.length'), 11, 'adding and taking away runs to eleven rungs');
  assert.match(await evaluate('document.querySelector("#move-level").options[2].textContent'), /small friends, one digit/, 'rungs are named for the move they teach, smallest first');
  assert.equal(await evaluate('document.querySelector("#mul-level").options.length'), 6, 'multiplying runs to six');
  assert.equal(await evaluate('document.querySelector("#mul-level-row").hidden'), true, 'the multiplying ladder is out of the way until multiplication is on');
  await click('#op-mul');
  await click('#op-add');
  assert.deepEqual(await evaluate('[...document.querySelectorAll("#op-add,#op-sub,#op-mul")].map(b=>b.getAttribute("aria-pressed"))'), ['false', 'false', 'true'], 'operations select independently');
  assert.equal(await evaluate('document.querySelector("#mul-level-row").hidden'), false, 'the multiplying ladder appears with multiplication');
  assert.equal(await evaluate('document.querySelector("#move-level-row").hidden'), true, 'and the adding ladder steps aside');
  await click('#test-mode');
  assert.equal(await text('#test-mode'), 'On', 'test mode reports itself on');
  await click('#close-settings');

  assert.equal(await shown('#problem'), true, 'the Problem control appears');
  assert.equal(await shown('#submit'), true, 'the Submit control appears');
  assert.equal(await shown('#decimal-lock'), false, 'the lock button leaves the readout row while testing');
  assert.equal(await shown('#value'), true, 'the tally stays visible, as in free play');
  assert.equal(await text('#value'), '0', 'test mode spends no rod on fractions');

  // The row has to hold Problem, Submit, Clear and Settings on a phone.
  const box = await evaluate('(()=>{const c=document.querySelector(".controls").getBoundingClientRect();const i=document.querySelector("#value").getBoundingClientRect();return {controlsRight:c.right,valueRight:i.right,inner:innerWidth}})()');
  assert.ok(box.controlsRight <= box.inner && box.valueRight <= box.controlsRight, `test-mode readout row stays on screen: ${JSON.stringify(box)}`);

  // Try to move the decimal while testing. Aim at a position that would show
  // decimals, or the check would pass even with the freeze broken.
  await evaluate('const d=document.querySelector("#decimal");d.value="3";d.dispatchEvent(new Event("input"));document.querySelector("#decimal").focus()');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await pause(80);
  assert.equal(await text('#value'), '0', 'the decimal stays where test mode put it');

  // Read the problem, then close it to solve.
  await click('#problem');
  assert.equal(await evaluate('document.querySelector("#problem-dialog").open'), true, 'the problem opens in a dialog');
  const first = (await lines())[1].replace('×', '').trim();
  assert.match((await lines())[0], /^\d+$/, 'the first line is the multiplicand');
  assert.match((await lines())[1], /^× \d+$/, 'the second line is the multiplier');
  assert.equal(await evaluate('document.querySelectorAll("#problem-lines .rule").length'), 0, 'no answer rule is drawn before there is an answer to write under it');
  assert.equal(await evaluate('document.querySelectorAll("#problem-lines .line").length'), 2, 'and no line waits blank under the last number');
  await click('#close-problem');
  assert.equal(await evaluate('document.querySelector("#problem-dialog").open'), false, 'closing hides the numbers again');

  // An empty board is wrong, and a wrong answer offers all three ways out.
  await click('#submit');
  assert.equal(await text('#problem-heading'), 'Not quite', 'an empty board is not the answer');
  assert.equal(await text('#problem-note'), 'Your board shows 0.', 'the verdict quotes the board');
  assert.deepEqual(await evaluate('[...document.querySelectorAll("#problem-actions button")].map(b=>b.textContent)'), ['Clear board', 'Keep board', 'Reveal answer'], 'a wrong answer offers all three ways out');

  // Reveal restates the problem and its answer, and the arithmetic has to agree.
  await action('Reveal answer');
  const revealed = await lines();
  const total = (await text('#problem-lines .total')).match(/^= (\d+)$/);
  assert.ok(total, `reveal writes the total under the rule: ${await text('#problem-lines .total')}`);
  assert.equal(await evaluate('document.querySelectorAll("#problem-lines .rule").length'), 1, 'the rule arrives with the total');
  assert.equal(Number(revealed[0]) * Number(revealed[1].replace('×', '').trim()), Number(total[1]), 'the stated answer is the product');
  assert.equal(revealed[1].replace('×', '').trim(), first, 'the revealed problem is the one that was asked');

  // Next problem clears the verdict and asks a fresh one.
  await action('Next problem');
  assert.equal(await text('#problem-heading'), 'Problem', 'a new problem resets the verdict');
  const next = await evaluate('[...document.querySelectorAll("#problem-lines .line")].map(d=>Number(d.textContent.replace("×","").trim()))');
  assert.equal(next.length, 2, 'multiplication asks two operands');
  const answer = next[0] * next[1];
  await click('#close-problem');

  // Build the answer on the beads, the way a learner would.
  const boardBox = await evaluate('(()=>{const r=document.querySelector("#board").getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()');
  const at = (col, y, id) => ({ x: boardBox.x + (20 + (col + .5) * 560 / 6) / 600 * boardBox.width, y: boardBox.y + y / 390 * boardBox.height, id, radiusX: 5, radiusY: 5, force: 1 });
  const tap = async (col, y, id) => {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at(col, y, id)] });
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await pause(90);
  };
  let tapId = 1;
  // While testing the ones column is the last rod, so place 10^k at 5 - k.
  for (let k = 0; k < 6; k++) {
    const digit = Math.floor(answer / 10 ** k) % 10;
    const col = 5 - k;
    if (!digit) continue;
    if (digit >= 5) await tap(col, 28, tapId++);
    const rest = digit % 5;
    if (rest) await tap(col, 246 + (rest - 1) * 36, tapId++);
  }
  assert.equal(await text('#value'), `${answer}`, 'the board holds the answer');

  await click('#submit');
  assert.equal(await text('#problem-heading'), 'Correct', 'the answer is accepted');
  assert.deepEqual(await lines(), [`${next[0]}`, `× ${next[1]}`], 'the verdict leaves the column itself alone');
  assert.equal(await text('#problem-lines .total'), `= ${answer}`, 'and writes the total once, under the rule');
  assert.equal(await shown('#problem-note'), false, 'no empty line is left where the prose was');

  // The problem and the board both outlive a reload.
  await send('Page.reload');
  await pause(900);
  assert.equal(await shown('#problem'), true, 'test mode persists');
  assert.equal(await text('#value'), `${answer}`, 'the board persists');
  await click('#problem');
  assert.deepEqual(await lines(), [`${next[0]}`, `× ${next[1]}`], 'the same problem is still on the desk');
  await click('#close-problem');

  // Marking your place. Only a column has a middle to lose, so multiplying
  // never offers it, and the mark outlives a reload along with the problem.
  await click('#settings');
  await click('#op-add');
  await click('#op-mul');
  await evaluate('const s=document.querySelector("#move-level");s.value="9";s.dispatchEvent(new Event("change"))');
  await click('#close-settings');
  await click('#problem');
  const column = await lines();
  assert.equal(column.length, 5, 'a five-row column is on the desk');
  assert.equal(await evaluate('document.querySelectorAll("#problem-lines .line.marked").length'), 0, 'nothing is marked to begin with');
  assert.equal(await evaluate('document.querySelector("#problem-step").hidden'), true, 'and no place is claimed');
  await click('#problem-lines .line:nth-child(3)');
  assert.equal(await text('#problem-lines .line.marked'), column[2], 'the tapped line is the marked one');
  assert.equal(await text('#problem-step'), 'Line 3 of 5', 'and it is named as a line of the column');
  await send('Page.reload');
  await pause(900);
  await click('#problem');
  assert.equal(await text('#problem-lines .line.marked'), column[2], 'the mark survives a reload');
  assert.equal(await text('#problem-step'), 'Line 3 of 5', 'and comes back with its count');
  await click('#problem-lines .line.marked');
  assert.equal(await evaluate('document.querySelectorAll("#problem-lines .line.marked").length'), 0, 'tapping the marked line again gives the place up');
  assert.equal(await evaluate('document.querySelector("#problem-step").hidden'), true, 'and the count goes with it');
  await click('#close-problem');

  // Leaving test mode gives the readout and the decimal back.
  await click('#settings');
  assert.equal(await text('#test-mode'), 'On', 'settings reports test mode as on');
  await click('#test-mode');
  assert.equal(await text('#test-mode'), 'Off', 'settings reports test mode as off again');
  await click('#close-settings');
  assert.equal(await shown('#problem'), false, 'leaving test mode takes the controls away');
  assert.equal(await shown('#decimal-lock'), true, 'and gives the decimal lock back');
  assert.equal(await evaluate('document.querySelector("#decimal").value'), '4', 'the decimal is back where it was');
  // The same beads read by a different place value, and the freeze is lifted.
  await evaluate('const d=document.querySelector("#decimal");d.value="5";d.dispatchEvent(new Event("input"))');
  assert.equal(await text('#value'), `${answer}`, 'the decimal moves again outside test mode');

  // The worksheet. A sheet is for a soroban you are holding, so it has to work
  // with test mode off and leave the board exactly where it found it.
  const boardBefore = await text('#value');
  await click('#settings');
  await evaluate('const s=document.querySelector("#move-level");s.value="1";s.dispatchEvent(new Event("change"))');
  await click('#worksheet');
  assert.equal(await evaluate('document.querySelector("#worksheet-dialog").open'), true, 'a sheet opens from settings');
  assert.equal(await evaluate('document.querySelector("#settings-dialog").open'), false, 'and settings steps aside');
  assert.match(await text('#sheet-note'), /^8 problems at 1 · direct, one digit/, 'the sheet names its rung and the short length that rung can fill');

  const sheet = () => evaluate('[...document.querySelectorAll("#sheet-lines .sheet-item")].map(li=>({index:li.querySelector(".sheet-index").textContent,lines:[...li.querySelectorAll(".sheet-line")].map(s=>s.textContent),total:li.querySelector(".sheet-total")?.textContent??null}))');
  const answered = (lines) => lines.reduce((sum, line, i) => sum + (i ? Number(line.replace(/^[+−×]\s*/, '')) : Number(line)), 0);

  let rows = await sheet();
  assert.equal(rows.length, 8, 'a sheet is sized to its rung');
  assert.deepEqual(rows.map((r) => r.index), ['1', '2', '3', '4', '5', '6', '7', '8'], 'and it is numbered');
  assert.equal(new Set(rows.map((r) => r.lines.join(' '))).size, rows.length, 'no problem is written twice');
  assert.ok(rows.every((r) => r.lines.length === 2), 'a two-row rung asks two-row problems');
  assert.ok(rows.every((r) => r.total === null), 'and no answer is given away');
  assert.equal(await evaluate('getComputedStyle(document.querySelector("#sheet-lines .sheet-problem")).textAlign'), 'right', 'places line up, as they must on paper');

  // Checking is one problem at a time, and tapping again puts the answer back.
  await evaluate('document.querySelectorAll("#sheet-lines .sheet-item")[2].querySelector(".sheet-problem").click()');
  rows = await sheet();
  assert.deepEqual(rows.map((r) => r.total !== null), [false, false, true, false, false, false, false, false], 'one tap checks one problem');
  assert.equal(Number(rows[2].total.match(/^= (\d+)$/)[1]), answered(rows[2].lines), 'the answer is the sum of its own lines');
  await evaluate('document.querySelectorAll("#sheet-lines .sheet-item")[2].querySelector(".sheet-problem").click()');
  assert.ok((await sheet()).every((r) => r.total === null), 'a second tap puts the answer away');

  // The sheet and its checked problem outlive a reload, which is the point of a
  // sheet: you put the phone down and pick it up again an hour later.
  await evaluate('document.querySelectorAll("#sheet-lines .sheet-item")[4].querySelector(".sheet-problem").click()');
  const checked = (await sheet())[4];
  await send('Page.reload');
  await pause(900);
  await click('#settings');
  await click('#worksheet');
  rows = await sheet();
  assert.equal(rows.length, 8, 'the same sheet comes back');
  assert.deepEqual(rows[4], checked, 'with the problem you checked still checked');

  // Changing a rung gives a sheet to match, rather than a stale one.
  await click('#close-sheet');
  await click('#settings');
  await evaluate('const s=document.querySelector("#move-level");s.value="11";s.dispatchEvent(new Event("change"))');
  await click('#worksheet');
  rows = await sheet();
  assert.equal(rows.length, 20, 'the top of the ladder asks for a longer sheet');
  assert.equal(new Set(rows.map((r) => r.lines.join(' '))).size, rows.length, 'and still does not repeat itself');

  // Paper. Two columns, and the board and its chrome left off the page.
  await send('Emulation.setEmulatedMedia', { media: 'print' });
  assert.equal(await evaluate('getComputedStyle(document.querySelector("main")).display'), 'none', 'printing leaves the board off the page');
  assert.equal(await evaluate('getComputedStyle(document.querySelector("#sheet-lines")).columnCount'), '2', 'and sets the sheet in two columns');
  assert.equal(await evaluate('getComputedStyle(document.querySelector("#sheet-actions")).display'), 'none', 'with no buttons on the paper');
  await send('Emulation.setEmulatedMedia', { media: '' });

  assert.equal(await text('#value'), boardBefore, 'nothing about a sheet has touched the board');
  await click('#close-sheet');

  assert.deepEqual(errors, [], `no browser exceptions: ${JSON.stringify(errors[0] ?? null)}`);
  console.log('PASS: test mode normalizes and holds the decimal, reads the problem in a dialog, judges clear/keep/reveal, accepts and rejects answers, restores the decimal, and persists; a worksheet is sized to its rung, numbered, never repeated, checked one problem at a time, saved, laid out two-up for paper, and leaves the board alone.');
} finally {
  ws.close();
}
