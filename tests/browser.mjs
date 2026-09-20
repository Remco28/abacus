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
  await evaluate('document.querySelector("#motion").click(); window.originalQuery = navigator.permissions.query.bind(navigator.permissions); navigator.permissions.query = async () => ({state:"denied"}); document.querySelector("#motion").click()');
  await pause(100);
  assert.match(await evaluate('document.querySelector("#motion-status").textContent'), /Brave.*Motion sensors/, 'blocked sensor guidance');
  assert.equal(await evaluate('document.querySelector("#motion").getAttribute("aria-pressed")'), 'false');
  await evaluate('navigator.permissions.query = window.originalQuery; window.blockMotion = e => e.stopImmediatePropagation(); window.addEventListener("devicemotion", window.blockMotion, true); document.querySelector("#motion").click()');
  await pause(6300);
  assert.match(await evaluate('document.querySelector("#motion-status").textContent'), /blocked or unavailable/, 'no-data timeout');
  await evaluate('window.removeEventListener("devicemotion", window.blockMotion, true); document.querySelector("#close-settings").click(); document.querySelector("#decimal").focus()');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  assert.equal(await evaluate('document.querySelector("#decimal").value'), '5', 'keyboard decimal slider');
  await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'landscape has no horizontal overflow');
  assert.equal(await evaluate('document.documentElement.scrollHeight <= innerHeight'), true, 'landscape fits screen');
  assert.equal(await evaluate('document.querySelector("#board").getBoundingClientRect().height > innerHeight * .7'), true, 'landscape mostly board');
  assert.deepEqual(errors, [], 'no browser exceptions');
  console.log('PASS: multi-touch, decimal hold-to-drag on touch/mouse, accidental gesture lockout, cancellation/relocking, keyboard, persistence, welcome, shake, motion guidance, landscape, no runtime errors.');
} finally { ws.close(); }
