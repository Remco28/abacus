// Run against a browser started by agent-browser: node tests/browser.mjs <CDP HTTP endpoint> [app URL]
import assert from 'node:assert/strict';
const endpoint = process.argv[2] || 'http://127.0.0.1:9222';
const pages = await (await fetch(endpoint + '/json/list')).json();
const page = pages.find(p => p.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
let id = 0;
const pending = new Map();
const errors = [];
ws.addEventListener('message', ({ data }) => {
  const msg = JSON.parse(data);
  if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails);
  if (msg.id) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(msg.error) : p.resolve(msg.result); }
});
const send = (method, params = {}) => new Promise((resolve, reject) => { pending.set(++id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  await send('Runtime.enable');
  if (process.argv[3]) { await send('Page.navigate', { url: process.argv[3] }); await pause(1000); }
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate('if(document.querySelector("#welcome-dialog").open) document.querySelector("#start").click()');
  await evaluate('document.querySelector("#reset").click()');
  await evaluate('document.querySelector("#decimal").value="3"; document.querySelector("#decimal").dispatchEvent(new Event("input"))');
  const rect = await evaluate('(()=>{const r=document.querySelector("#board").getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()');
  const point = (col, y, id) => ({ x: rect.x + (20 + (col + .5) * 560 / 6) / 600 * rect.width, y: rect.y + y / 390 * rect.height, id, radiusX: 5, radiusY: 5, force: 1 });
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(3, 354, 1), point(2, 28, 2)] });
  for (let i = 1; i <= 10; i++) { await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(3, 354 - 78 * i / 10, 1), point(2, 28 + 72 * i / 10, 2)] }); await pause(16); }
  await pause(120);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await pause(200);
  assert.equal(await evaluate('document.querySelector("#value").textContent'), '54.00', 'simultaneous touch drags and neighbor pushing');
  // Track taps and label taps stay inert while the decimal control is locked.
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(1, 134, 3)] });
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.equal(await evaluate('document.querySelector("#decimal").value'), '3', 'locked track ignores taps');
  await evaluate('document.querySelector("#labels").firstElementChild.click()');
  assert.equal(await evaluate('document.querySelector("#decimal").value'), '3', 'place labels are read-only');
  await evaluate('document.querySelector("#decimal-lock").click()');
  assert.equal(await evaluate('document.querySelector("#decimal").classList.contains("unlocked")'), true, 'lock button unlocks slider');
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(3, 134, 3)] });
  await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(4, 134, 3)] });
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.equal(await evaluate('document.querySelector("#value").textContent'), '540.0', 'decimal relocation');
  assert.equal(await evaluate('document.querySelector("#decimal").classList.contains("unlocked")'), false, 'release relocks');
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(4, 134, 3)] });
  await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(2, 134, 3)] });
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.equal(await evaluate('document.querySelector("#decimal").value'), '4', 'locked slider ignores next drag');
  const mouseStart = point(4, 134, 3), mouseEnd = point(3, 134, 3);
  await evaluate('document.querySelector("#decimal-lock").click()');
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: mouseStart.x, y: mouseStart.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: mouseEnd.x, y: mouseEnd.y, button: 'left', buttons: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mouseEnd.x, y: mouseEnd.y, button: 'left', clickCount: 1 });
  assert.equal(await evaluate('document.querySelector("#decimal").value'), '3', 'mouse hold and drag works');
  await evaluate('document.querySelector("#decimal-lock").click(); document.querySelector("#decimal").focus()');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  assert.equal(await evaluate('document.querySelector("#decimal").value'), '4', 'keyboard remains accessible');
  await send('Page.reload'); await pause(700);
  assert.equal(await evaluate('document.querySelector("#value").textContent'), '540.0', 'persistence');
  assert.equal(await evaluate('document.querySelector("#welcome-dialog").open'), false, 'welcome stays dismissed');
  // The reckoning bar. A swipe clears the board, and the wave follows the finger
  // rather than waiting for it to arrive, so the beads must already be cleared
  // partway across. Only a full traverse commits: a shorter one springs them
  // back, which is what stops a graze from destroying the number in progress.
  const shown = () => evaluate('document.querySelector("#value").textContent');
  // Raw bead heights, which is the only way to see a spring back that lands close
  // enough to keep the digit but leaves a visible gap in the stack. Compared
  // numerically rather than as strings: the solver converges to rest to within a
  // few 1e-14, and requiring an exact float match turns that into a failure. A
  // bead left out of place is off by whole units, so a small tolerance still
  // catches it without pinning the test to the solver's last bit.
  const beadPlace = () => evaluate('[...document.querySelectorAll("#board .bead")].map(e=>{const t=e.getAttribute("transform");return Number(t.slice(t.indexOf(" ")+1,-1))})');
  const barY = rect.y + 134 / 390 * rect.height;
  const barX = vx => rect.x + vx / 600 * rect.width;
  const barDown = vx => send('Input.dispatchMouseEvent', { type: 'mousePressed', x: barX(vx), y: barY, button: 'left', clickCount: 1, buttons: 1 });
  const barMove = async vx => { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: barX(vx), y: barY, button: 'left', buttons: 1 }); await pause(20); };
  const barUp = vx => send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: barX(vx), y: barY, button: 'left', clickCount: 1, buttons: 0 });
  const held = await shown();
  await barDown(300); await barUp(300); await pause(300);
  assert.equal(await shown(), held, 'a tap on the reckoning bar changes nothing');
  const placeHeld = await beadPlace();
  await barDown(10);
  for (const vx of [60, 120, 180, 240, 300]) await barMove(vx);
  const partway = await shown();
  await barUp(300); await pause(600);
  assert.notEqual(partway, held, 'the beads clear as the finger reaches them, before it lifts');
  assert.equal(await shown(), held, 'a swipe short of the far side springs the beads back');
  const backHome = await beadPlace();
  const drift = Math.max(...backHome.map((y, i) => Math.abs(y - placeHeld[i])));
  assert.ok(drift < 0.05, `and every bead lands back where it started (furthest off by ${drift})`);
  await barDown(10);
  for (const vx of [80, 160, 240, 320, 400, 480, 560, 590]) await barMove(vx);
  await barUp(590); await pause(700);
  const wiped = await shown();
  assert.notEqual(wiped, held, 'a full traverse clears the board');
  // Leave a number on the beads: the motion checks below assert the shakes clear
  // the board, which only means something if there is something to clear.
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(0, 28, 9)] });
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await pause(300);
  assert.notEqual(await shown(), wiped, 'a tap on a bead still counts it after a wipe');
  await send('Browser.grantPermissions', { origin: await evaluate('location.origin'), permissions: ['sensors'] });
  await evaluate('document.querySelector("#settings").click(); document.querySelector("#motion").click()');
  await pause(100);
  for (let i = 0; i < 3; i++) {
    await evaluate('window.dispatchEvent(new DeviceMotionEvent("devicemotion",{acceleration:{x:0,y:0,z:0}}))');
    await pause(220);
    await evaluate('window.dispatchEvent(new DeviceMotionEvent("devicemotion",{acceleration:{x:22,y:0,z:0}}))');
  }
  assert.equal(await evaluate('document.querySelector("#value").textContent'), '0.0', 'three shakes clear board');
  assert.equal(await evaluate('document.querySelector("#motion").getAttribute("aria-pressed")'), 'true', 'motion on only after readings');
  // Refuse sensors through both doors. Chrome now implements requestPermission
  // as well as permissions.query, and the app asks requestPermission first
  // because that is the only one iOS offers, so stubbing the other one alone
  // would let it enable motion and pass this for the wrong reason.
  await evaluate('document.querySelector("#motion").click(); window.originalQuery = navigator.permissions.query.bind(navigator.permissions); window.originalRequest = DeviceMotionEvent.requestPermission; navigator.permissions.query = async () => ({state:"denied"}); DeviceMotionEvent.requestPermission = async () => "denied"; document.querySelector("#motion").click()');
  await pause(100);
  assert.match(await evaluate('document.querySelector("#motion-status").textContent'), /blocked or unavailable/, 'blocked sensor guidance');
  assert.equal(await evaluate('document.querySelector("#motion").getAttribute("aria-pressed")'), 'false');
  // The steps live in a different place on every platform, and the phone is the
  // one that has to find them, so an Android user agent should be told where the
  // per-site Motion sensors permission is and where the global one is.
  await evaluate('Object.defineProperty(navigator, "userAgent", { configurable: true, get: () => "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36" }); document.querySelector("#motion").click()');
  await pause(100);
  const androidHelp = await evaluate('document.querySelector("#motion-status").textContent');
  assert.match(androidHelp, /Permissions → set Motion sensors to Allow/, 'android guidance opens the per-site permission');
  assert.match(androidHelp, /Site settings → Motion sensors/, 'and names the global fallback');
  await evaluate('delete navigator.userAgent');
  await evaluate('navigator.permissions.query = window.originalQuery; window.originalRequest ? (DeviceMotionEvent.requestPermission = window.originalRequest) : delete DeviceMotionEvent.requestPermission; window.blockMotion = e => e.stopImmediatePropagation(); window.addEventListener("devicemotion", window.blockMotion, true); document.querySelector("#motion").click()');
  await pause(6300);
  assert.match(await evaluate('document.querySelector("#motion-status").textContent'), /blocked or unavailable/, 'no-data timeout');
  // Chrome fires devicemotion even when the per-site permission is blocked; the
  // event just carries null axes. Three of those should name the permission and
  // give up, rather than wait out the six seconds for "unavailable". Enabling
  // awaits the permission, so the readings have to come after it, not in the
  // same turn as the click.
  await evaluate('window.removeEventListener("devicemotion", window.blockMotion, true); document.querySelector("#motion").click()');
  await pause(150);
  await evaluate('for (let i = 0; i < 3; i++) window.dispatchEvent(new DeviceMotionEvent("devicemotion", { acceleration: { x: null, y: null, z: null }, accelerationIncludingGravity: { x: null, y: null, z: null } }))');
  await pause(100);
  assert.match(await evaluate('document.querySelector("#motion-status").textContent'), /empty sensor readings/, 'null axes are reported as a blocked permission');
  assert.equal(await evaluate('document.querySelector("#motion").getAttribute("aria-pressed")'), 'false', 'and stop waiting for data that will not come');
  // Opening Settings locks the caret, and a locked caret swallows the arrow keys
  // on purpose, so the keyboard path has to unlock first — which is what the
  // help text says and what the lock button is for.
  await evaluate('window.removeEventListener("devicemotion", window.blockMotion, true); document.querySelector("#close-settings").click(); document.querySelector("#decimal-lock").click(); document.querySelector("#decimal").focus()');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  assert.equal(await evaluate('document.querySelector("#decimal").value'), '5', 'keyboard decimal slider');
  await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'landscape has no horizontal overflow');
  assert.equal(await evaluate('document.documentElement.scrollHeight <= innerHeight'), true, 'landscape fits screen');
  assert.equal(await evaluate('document.querySelector("#board").getBoundingClientRect().height > innerHeight * .7'), true, 'landscape mostly board');
  // The Help steps are longer than everything else in Settings and only a phone
  // needs them, so check the longest of them is reachable on a small screen
  // without sideways scrolling, and that the steps name the settings by name.
  await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 640, deviceScaleFactor: 2, mobile: true });
  // Turn multiplication on too, so both level selects — the widest controls in
  // the dialog, since a select is as wide as its longest rung name — are shown.
  await evaluate('document.querySelector("#settings").click(); document.querySelector("#op-mul").click(); for (const d of document.querySelectorAll("#settings-dialog details")) d.open = true');
  await pause(150);
  const help = await evaluate('(() => { const d = document.querySelector("#settings-dialog"); const last = document.querySelector("#install-help"); d.scrollTop = d.scrollHeight; return { across: d.scrollWidth <= d.clientWidth, bottom: last.getBoundingClientRect().bottom, view: innerHeight }; })()');
  assert.equal(help.across, true, 'expanded help has no horizontal overflow');
  assert.ok(help.bottom <= help.view + 1, `and its last line can be scrolled to (${help.bottom} vs ${help.view})`);
  const helpText = await evaluate('document.querySelector("#settings-dialog").textContent');
  assert.match(helpText, /Permissions → set Motion sensors to Allow/, 'the help names the android per-site permission');
  assert.match(helpText, /Motion & Orientation Access/, 'and the iPhone setting by name');
  assert.deepEqual(errors, [], 'no browser exceptions');
  console.log('PASS: multi-touch, decimal hold-to-drag on touch/mouse, accidental gesture lockout, cancellation/relocking, keyboard, persistence, welcome, shake, per-platform motion guidance, settings help layout, landscape, no runtime errors.');
} finally { ws.close(); }
