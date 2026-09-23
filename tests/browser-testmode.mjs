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
const lines = () => evaluate('[...document.querySelectorAll("#problem-lines div")].map(d=>d.textContent)');

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
  assert.equal(await text('#value'), '0.0', 'five one place groups in free play');

  // Configure before enabling, which is the order the settings allow.
  await click('#settings');
  assert.equal(await evaluate('document.querySelector("#level").options.length'), 5, 'five sequenced levels');
  assert.match(await evaluate('document.querySelector("#level").options[2].textContent'), /big friends/, 'levels are named for the skill they teach');
  await click('#op-mul');
  await click('#op-add');
  assert.deepEqual(await evaluate('[...document.querySelectorAll("#op-add,#op-sub,#op-mul")].map(b=>b.getAttribute("aria-pressed"))'), ['false', 'false', 'true'], 'operations select independently');
  await click('#test-mode');
  assert.equal(await text('#test-mode'), 'On', 'test mode reports itself on');
  await click('#close-settings');

  assert.equal(await shown('#problem'), true, 'the Problem control appears');
  assert.equal(await shown('#submit'), true, 'the Submit control appears');
  assert.equal(await shown('#decimal-lock'), false, 'the lock button leaves the readout row while testing');
  assert.equal(await shown('#value'), true, 'the tally stays visible, as in free play');
  assert.equal(await text('#value'), '0.00', 'test mode normalizes the decimal to four whole-number places');

  // The row has to hold Problem, Submit, Clear and Settings on a phone.
  const box = await evaluate('(()=>{const c=document.querySelector(".controls").getBoundingClientRect();const i=document.querySelector("#value").getBoundingClientRect();return {controlsRight:c.right,valueRight:i.right,inner:innerWidth}})()');
  assert.ok(box.controlsRight <= box.inner && box.valueRight <= box.controlsRight, `test-mode readout row stays on screen: ${JSON.stringify(box)}`);

  // Try to move the decimal while testing; the board's formatting must not budge.
  await evaluate('const d=document.querySelector("#decimal");d.value="5";d.dispatchEvent(new Event("input"));document.querySelector("#decimal").focus()');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await pause(80);
  assert.equal(await text('#value'), '0.00', 'the decimal stays where test mode put it');

  // Read the problem, then close it to solve.
  await click('#problem');
  assert.equal(await evaluate('document.querySelector("#problem-dialog").open'), true, 'the problem opens in a dialog');
  const first = (await lines())[1].replace('×', '').trim();
  assert.match((await lines())[0], /^\d+$/, 'the first line is the multiplicand');
  assert.match((await lines())[1], /^× \d+$/, 'the second line is the multiplier');
  await click('#close-problem');
  assert.equal(await evaluate('document.querySelector("#problem-dialog").open'), false, 'closing hides the numbers again');

  // An empty board is wrong, and a wrong answer offers all three ways out.
  await click('#submit');
  assert.equal(await text('#problem-heading'), 'Not quite', 'an empty board is not the answer');
  assert.equal(await text('#problem-note'), 'Your board shows 0.00.', 'the verdict quotes the board');
  assert.deepEqual(await evaluate('[...document.querySelectorAll("#problem-actions button")].map(b=>b.textContent)'), ['Clear board', 'Keep board', 'Reveal answer'], 'a wrong answer offers all three ways out');

  // Reveal restates the problem and its answer, and the arithmetic has to agree.
  await action('Reveal answer');
  const revealed = (await text('#problem-note')).match(/^(\d+) × (\d+) = (\d+)$/);
  assert.ok(revealed, `reveal restates the problem: ${await text('#problem-note')}`);
  assert.equal(Number(revealed[1]) * Number(revealed[2]), Number(revealed[3]), 'the stated answer is the product');
  assert.equal(revealed[2], first, 'the revealed problem is the one that was asked');

  // Next problem clears the verdict and asks a fresh one.
  await action('Next problem');
  assert.equal(await text('#problem-heading'), 'Problem', 'a new problem resets the verdict');
  const next = await evaluate('[...document.querySelectorAll("#problem-lines div")].map(d=>Number(d.textContent.replace("×","").trim()))');
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
  for (let k = 0; k < 4; k++) {
    const digit = Math.floor(answer / 10 ** k) % 10;
    const col = 3 - k;
    if (!digit) continue;
    if (digit >= 5) await tap(col, 28, tapId++);
    const rest = digit % 5;
    if (rest) await tap(col, 246 + (rest - 1) * 36, tapId++);
  }
  assert.equal(await text('#value'), `${answer}.00`, 'the board holds the answer');

  await click('#submit');
  assert.equal(await text('#problem-heading'), 'Correct', 'the answer is accepted');
  assert.equal(await text('#problem-note'), `${next[0]} × ${next[1]} = ${answer}`, 'the verdict restates the sum');

  // The problem and the board both outlive a reload.
  await send('Page.reload');
  await pause(900);
  assert.equal(await shown('#problem'), true, 'test mode persists');
  assert.equal(await text('#value'), `${answer}.00`, 'the board persists');
  await click('#problem');
  assert.deepEqual(await lines(), [`${next[0]}`, `× ${next[1]}`], 'the same problem is still on the desk');
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
  // The same beads read by different place values, and the freeze is lifted.
  await evaluate('const d=document.querySelector("#decimal");d.value="3";d.dispatchEvent(new Event("input"))');
  assert.equal(await text('#value'), `${answer}.00`, 'the decimal moves again outside test mode');

  assert.deepEqual(errors, [], `no browser exceptions: ${JSON.stringify(errors[0] ?? null)}`);
  console.log('PASS: test mode normalizes and holds the decimal, reads the problem in a dialog, judges clear/keep/reveal, accepts and rejects answers, restores the decimal, and persists.');
} finally {
  ws.close();
}
