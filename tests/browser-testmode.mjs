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
  assert.equal(await evaluate('document.querySelector("#div-level").options.length'), 6, 'division runs to six exact-quotient rungs');
  assert.equal(await evaluate('document.querySelector("#div-level-row").hidden'), true, 'division rung stays tucked away until selected');
  assert.equal(await evaluate('document.querySelector("#mul-level-row").hidden'), true, 'the multiplying ladder is out of the way until multiplication is on');
  await click('#op-mul');
  await click('#op-div');
  await click('#op-add');
  assert.deepEqual(await evaluate('[...document.querySelectorAll("#op-add,#op-sub,#op-mul,#op-div")].map(b=>b.getAttribute("aria-pressed"))'), ['false', 'false', 'true', 'true'], 'operations select independently');
  assert.equal(await evaluate('document.querySelector("#mul-level-row").hidden'), false, 'the multiplying ladder appears with multiplication');
  assert.equal(await evaluate('document.querySelector("#div-level-row").hidden'), false, 'the division ladder appears with division');
  assert.equal(await evaluate('document.querySelector("#move-level-row").hidden'), true, 'and the adding ladder steps aside');
  await click('#op-mul'); // Leave division alone so the next generated item is guaranteed to be a division.
  await click('#test-mode');
  assert.equal(await text('#test-mode'), 'On', 'test mode reports itself on');
  const savedProblem = JSON.parse(await evaluate('localStorage.getItem("soroban-v1")')).test.problem;
  const divisionLines = savedProblem.operands;
  assert.equal(savedProblem.op, 'div', 'the practice generator produced division');
  assert.equal(divisionLines.length, 2, 'division asks for two operands');
  assert.equal(divisionLines[0] % divisionLines[1], 0, 'generated division problems have no remainder');
  assert.equal(divisionLines[0] / divisionLines[1], savedProblem.answer, 'saved quotient matches exact division');
  await click('#close-settings');
  await click('#problem');
  assert.deepEqual(await lines(), [`${divisionLines[0]}`, `÷ ${divisionLines[1]}`], 'division is shown as dividend divided by divisor');
  await click('#close-problem');
  const valueBeforeTutorial = await text('#value');
  await click('#settings');
  await click('#open-tutorial');
  assert.equal(await evaluate('document.querySelector("#tutorial-dialog").open'), true, 'tutorial opens from settings');
  assert.equal(await evaluate('document.querySelector("#settings-dialog").open'), false, 'tutorial replaces settings');
  assert.deepEqual(await evaluate('[...document.querySelectorAll(".tutorial-operation")].map(b=>b.textContent.trim().split(" ")[0])'), ['Add', 'Subtract', 'Multiply', 'Divide'], 'all four visual lessons are selectable');
  assert.equal(await evaluate('document.querySelectorAll(".lesson-bead").length'), 15, 'the lesson shows a separate three-rod abacus');
  const tutorialLayout = await evaluate('(()=>{const d=document.querySelector("#tutorial-dialog"),b=document.querySelector(".lesson-bead"),r=document.querySelector(".lesson-abacus");return {dialogWidth:d.clientWidth,dialogScrollWidth:d.scrollWidth,beadWidth:b.getBoundingClientRect().width,beadHeight:b.getBoundingClientRect().height,rackRight:r.getBoundingClientRect().right,contentRight:document.querySelector("#tutorial-content").getBoundingClientRect().right}})()');
  assert.ok(tutorialLayout.dialogScrollWidth <= tutorialLayout.dialogWidth + 1, `tutorial fits without horizontal scrolling on a phone: ${JSON.stringify(tutorialLayout)}`);
  assert.ok(tutorialLayout.beadWidth >= 40 && tutorialLayout.beadHeight >= 40, `lesson beads are touch-sized: ${JSON.stringify(tutorialLayout)}`);
  assert.ok(tutorialLayout.rackRight <= tutorialLayout.contentRight + 1, `mini-abacus stays inside the tutorial content: ${JSON.stringify(tutorialLayout)}`);
  await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 568, deviceScaleFactor: 1, mobile: true });
  const narrowTutorialLayout = await evaluate('(()=>{const d=document.querySelector("#tutorial-dialog"),b=document.querySelector(".lesson-bead"),r=document.querySelector(".lesson-abacus");return {dialogWidth:d.clientWidth,dialogScrollWidth:d.scrollWidth,beadWidth:b.getBoundingClientRect().width,beadHeight:b.getBoundingClientRect().height,rackRight:r.getBoundingClientRect().right,contentRight:document.querySelector("#tutorial-content").getBoundingClientRect().right}})()');
  assert.ok(narrowTutorialLayout.dialogScrollWidth <= narrowTutorialLayout.dialogWidth + 1, `tutorial fits a narrow phone: ${JSON.stringify(narrowTutorialLayout)}`);
  assert.ok(narrowTutorialLayout.beadWidth >= 40 && narrowTutorialLayout.beadHeight >= 40, `beads remain touch-sized on a narrow phone: ${JSON.stringify(narrowTutorialLayout)}`);
  assert.ok(narrowTutorialLayout.rackRight <= narrowTutorialLayout.contentRight + 1, `mini-abacus fits a narrow phone: ${JSON.stringify(narrowTutorialLayout)}`);
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate('document.querySelectorAll(".tutorial-lesson-nav .lesson-number").length'), 3, 'addition has a numbered path of three visual lessons');
  await click('.tutorial-operation:last-child');
  assert.equal(await text('.lesson-title'), 'Share 12 ÷ 3 equally', 'division starts with the learner’s exact question');
  assert.match(await text('.lesson-story'), /Take away groups of 3, count each group/, 'the lesson explains what division means');
  assert.match(await text('.lesson-board-role'), /remainder/, 'it explains the bead board tracks what remains');
  await click('.lesson-show');
  assert.equal(await evaluate('document.querySelector(".lesson-digits").textContent'), '009', 'Show reveals one deliberate division step, not a timed number animation');
  assert.match(await text('.lesson-step-action'), /one group of 3/, 'the division step says what to do');
  assert.match(await text('.lesson-step-why'), /12 becomes 9/, 'the division step explains why');
  await click('.lesson-show');
  assert.equal(await evaluate('document.querySelector(".lesson-digits").textContent'), '006', 'Show advances only when asked');
  await click('.tutorial-operation:nth-child(3)');
  assert.equal(await evaluate('document.querySelectorAll(".tutorial-lesson-nav .lesson-number").length'), 3, 'multiplication has a numbered path of three lessons');
  await click('.tutorial-lesson-nav .lesson-number:last-child');
  assert.equal(await text('.lesson-title'), 'Multiply 46 × 13', 'a worked multi-digit multiplication lesson is available');
  assert.match(await text('.lesson-story'), /Split 13 into 10 \+ 3/, 'the lesson introduces place-value chunks');
  assert.match(await text('.lesson-board-role'), /product accumulated/, 'the board is identified as the running partial product');
  await click('.lesson-show');
  assert.equal(await evaluate('document.querySelector(".lesson-digits").textContent'), '460', 'the first partial product is 46 × 10');
  await click('.lesson-show');
  assert.equal(await evaluate('document.querySelector(".lesson-digits").textContent'), '506', 'the next step adds one group of 46');
  await click('.tutorial-operation:first-child');
  await click('.tutorial-lesson-nav .lesson-number:first-child');
  assert.equal(await evaluate('document.querySelector(".lesson-equation").getAttribute("aria-label")'), '4 + 3 = ?', 'the learner can browse directly to an earlier challenge');
  assert.match(await text('.lesson-story'), /running total/, 'addition explains what the board retains');
  assert.equal(await text('.lesson-next'), 'Try it yourself', 'practice is offered after the worked explanation');
  await click('.lesson-show');
  assert.match(await text('.lesson-step-action'), /Add 3/, 'worked steps include concrete actions');
  await click('.lesson-next');
  assert.equal(await evaluate('document.querySelector(".lesson-digits").textContent'), '004', 'try-it resets the board to the problem start');
  await evaluate('[...document.querySelectorAll(".lesson-bead")].find(b=>b.dataset.rod==="2"&&b.dataset.deck==="upper").click()');
  await evaluate('[...document.querySelectorAll(".lesson-bead")].find(b=>b.dataset.rod==="2"&&b.dataset.deck==="lower"&&b.dataset.index==="3").click()');
  await evaluate('[...document.querySelectorAll(".lesson-bead")].find(b=>b.dataset.rod==="2"&&b.dataset.deck==="lower"&&b.dataset.index==="2").click()');
  assert.equal(await evaluate('document.querySelector(".lesson-digits").textContent'), '007', 'the learner reproduces the taught bead move');
  assert.equal(await text('.lesson-next'), 'Complete lesson', 'a correct final partial result can complete the lesson');
  await click('.lesson-next');
  assert.equal(await text('.lesson-title'), 'Make a ten', 'a correct step advances to the next lesson');
  assert.deepEqual(await evaluate('JSON.parse(localStorage.getItem("soroban-tutorial-v2")).done'), ['add:0'], 'completed lesson progress is saved');
  await click('.tutorial-operation:last-child');
  await click('.tutorial-lesson-nav .lesson-number:last-child');
  assert.equal(await text('.lesson-title'), 'Divide 900 ÷ 36', 'the longer-division worked example is selectable');
  await click('.lesson-show');
  assert.equal(await evaluate('document.querySelector(".lesson-digits").textContent'), '200', 'the first subtraction chunk removes 700 from 900');
  assert.match(await text('.lesson-step-action'), /700 part of 720/, 'long division breaks the first group chunk into hundreds');
  await click('.lesson-show');
  assert.equal(await evaluate('document.querySelector(".lesson-digits").textContent'), '180', 'the next chunk removes the remaining 20');
  assert.match(await text('.lesson-step-why'), /900 − 700 − 20 = 180/, 'the partial remainder is explained in place-value chunks');
  await click('.lesson-next');
  await click('.lesson-next');
  assert.match(await text('.lesson-step-why'), /board shows 900/, 'an incorrect remainder check gives useful feedback');
  await evaluate('[...document.querySelectorAll(".lesson-bead")].find(b=>b.dataset.rod==="0"&&b.dataset.deck==="upper").click()');
  await evaluate('[...document.querySelectorAll(".lesson-bead")].find(b=>b.dataset.rod==="0"&&b.dataset.deck==="lower"&&b.dataset.index==="2").click()');
  assert.equal(await evaluate('document.querySelector(".lesson-digits").textContent'), '200', 'subtracting 700 leaves 200');
  await click('.lesson-next');
  assert.equal(await evaluate('document.querySelector(".lesson-step-counter").textContent'), 'Your turn · step 2 of 3', 'checking 200 unlocks the tens subtraction');
  await evaluate('[...document.querySelectorAll(".lesson-bead")].find(b=>b.dataset.rod==="0"&&b.dataset.deck==="lower"&&b.dataset.index==="1").click()');
  await evaluate('[...document.querySelectorAll(".lesson-bead")].find(b=>b.dataset.rod==="1"&&b.dataset.deck==="upper").click()');
  await evaluate('[...document.querySelectorAll(".lesson-bead")].find(b=>b.dataset.rod==="1"&&b.dataset.deck==="lower"&&b.dataset.index==="2").click()');
  await click('.lesson-count-move');
  assert.equal(await evaluate('document.querySelector(".lesson-digits").textContent'), '180', 'the learner subtracts the remaining 20 from 200');
  assert.equal(await text('.lesson-next'), 'Next step', 'a correct partial remainder offers the next chunk');
  await click('.lesson-next');
  assert.equal(await evaluate('document.querySelector(".lesson-step-counter").textContent'), 'Your turn · step 3 of 3', 'the counted 20 groups advance division to its final chunk');
  assert.match(await text('.lesson-step-action'), /36 × 5 = 180/, 'the final chunk subtracts five more groups');
  assert.match(await text('.lesson-step-why'), /Beads show the remainder/, 'the division lesson explains what the beads and quotient track');
  assert.equal(await evaluate('document.querySelector(".lesson-show").hidden'), true, 'the worked-answer control is unavailable during try-it');
  await click('#close-tutorial');
  assert.equal(await text('#value'), valueBeforeTutorial, 'tutorial practice does not alter the real board');
  await click('#settings');
  await click('#op-mul');
  await click('#op-div');
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
  const answered = (lines) => lines.reduce((sum, line, i) => sum + (i ? Number(line.replace(/^[+−×÷]\s*/, '')) : Number(line)), 0);

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
  console.log('PASS: test mode normalizes and holds the decimal, reads the problem in a dialog, judges clear/keep/reveal, accepts and rejects answers, restores the decimal, and persists; exact division generation works; tutorial lessons explain place-value steps, show 46 × 13 and 900 ÷ 36 as worked examples, and support bead practice; worksheets are rung-sized, numbered, unique, checkable, persistent, print two-up, and leave the board alone.');
} finally {
  ws.close();
}
